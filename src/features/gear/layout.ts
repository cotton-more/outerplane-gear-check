// Ценность раскладки героя и его лучшая раскладка из пула (MODEL.md §3). V = очки всех вещей + ценность сетов
// брони − то, что CHC-сабстаты теряют у мягкого потолка крита (MODEL.md crit) — одной функцией по раскладке целиком.
// Оружие и аксессуар решает сначала ранг (рекомендованная > временная > не из билдов), потом очки; броню — полный перебор
// (по вещи или пусто на слот), максимум V.
import { isArmor } from '@/game/data';
import type { ArmorSlot, GearKind, SlotId } from '@/game/data/types';
import { pointsOf, subWeightOn } from '@/game/build/points';
import type { Profile } from '@/game/build/profile';
import { scoreBuild, tempOk } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import { MAX_LIT } from '@/game/item/subs';
import { bonusRows } from '@/game/set/setBonus';
import { setValue, type SetValue } from '@/game/set/setValue';
import { CRIT_KNEE, critLoss, type CritSegs } from '@/game/stat/curve';
import { mainsStat, ownStat, rowsStat } from '@/game/stat/total';
import { pieceInput, type Piece } from './model/gear';
import { fit, milli, THRESHOLD, wearable, type Fit } from './model/vs';
import { EPS, NEWEST, numOf } from './pool/base';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
const GEAR: GearKind[] = ['weapon', 'accessory'];
const ALL: SlotId[] = [...GEAR, ...ARMOR];
// Only a recommended item outranks points: its passive is worth more than substats. A stopgap and an off-build piece are
// the same rank — points decide (owner 2026-10-10: an Epic stopgap with 2 useful substats took Eternal's off-list
// Legendary Last Hope with the same 2 useful, −2.6 points and a passive the Epic doesn't have)
export const RANK: Record<Fit, number> = { rec: 1, stopgap: 0, no: 0 };

export type Layout = Partial<Record<SlotId, Piece>>;

// вещь с формы входит в раскладку как запись с этим id: она новее всех записанных и при равенстве ничего не вытесняет
export const NEW_ID = 'new';
const ageOf = (p: Piece): number => (p.id === NEW_ID ? NEWEST : numOf(p.id));

// очки и ранг записи — один раз на (профиль, вещь): правка (updateIn) даёт новый объект
const ptsMemo = new WeakMap<Profile, WeakMap<Piece, number>>();
const rankMemo = new WeakMap<Profile, WeakMap<Piece, Fit>>();
function memoOf<T>(m: WeakMap<Profile, WeakMap<Piece, T>>, P: Profile): WeakMap<Piece, T> {
  let x = m.get(P);
  if (!x) m.set(P, (x = new WeakMap()));
  return x;
}

export function piecePoints(P: Profile, p: Piece): number {
  const m = memoOf(ptsMemo, P);
  let r = m.get(p);
  if (r === undefined) m.set(p, (r = pointsOf(P.ctx, P.c, P.chain, pieceInput(p))));
  return r;
}

// Ранг оружия и аксессуара — по любому билду героя (A5): рекомендованная, если её с этим main рекомендует хоть один его
// билд. «Временная» — только с хорошими сабстатами по этому билду (D2), иначе «не из билдов». Броня — сет в цепочке
// «По статам» (в ранг раскладки не входит)
export function gearRank(P: Profile, p: Piece): Fit {
  const m = memoOf(rankMemo, P);
  let r = m.get(p);
  if (r !== undefined) return r;
  const input = pieceInput(p);
  if (isArmor(p.slot)) r = fit(P.ctx, P.c, P.chain, input);
  else {
    r = 'no';
    const im = itemMains(P.ctx.idx, input);
    for (const b of P.c.builds) {
      const f = fit(P.ctx, P.c, b, input);
      if (f === 'rec') { r = 'rec'; break; }
      if (f === 'stopgap' && r === 'no' && tempOk(p.grade, scoreBuild(P.ctx, p.grade, P.c, b, p.lit, im))) r = 'stopgap';
    }
  }
  m.set(p, r);
  return r;
}

export interface LayoutValue {
  v: number;            // ptsSum + setSum − critLoss
  ptsSum: number;
  setSum: number;
  critLoss: number;     // what the CHC substats lose on the crit curve (MODEL.md crit); 0 — no CHC in the chain or under the knee
  chc: number | null;   // the layout's CHC, % (C₀ + substats); null — no CHC in the hero's chain
  ptsBySlot: Partial<Record<SlotId, number>>;
  sets: SetValue[];     // сеты, у которых в раскладке 2+ вещи
  halves: number;
  effHalves: number;    // половины сетов-эффектов
  rank: number;         // Σ рангов оружия и аксессуара; пустой слот — 0
  filled: number;
}

// вещей каждого сета брони в раскладке и сколько из них на T4
function setCounts(layout: Layout): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const slot of ARMOR) {
    const p = layout[slot];
    if (!p?.setId) continue;
    const [n, n4] = m.get(p.setId) ?? [0, 0];
    m.set(p.setId, [n + 1, n4 + (p.bt === 4 ? 1 : 0)]);
  }
  return m;
}

// --- crit soft cap (MODEL.md crit). C₀ — crit that carries no points: the hero (base, class, quirks), CHC main lines at
// +10 by tier, CHC set rows that are on. Substats are laid on the curve from C₀ by their weight on each piece.
export interface PieceCrit { w: number; n: number; main: number } // CHC weight on the item, CHC segments (≤ 6), CHC % from its main lines
const critMemo = new WeakMap<Profile, WeakMap<Piece, PieceCrit>>();
export function pieceCrit(P: Profile, p: Piece): PieceCrit {
  const m = memoOf(critMemo, P);
  let r = m.get(p);
  if (!r) {
    const n = Math.min(MAX_LIT, p.lit.CHC ?? 0);
    m.set(p, (r = { w: n ? subWeightOn(P.ctx, P.c, P.chain, pieceInput(p), 'CHC') : 0, n, main: mainsStat(P.ctx, p, 'CHC') }));
  }
  return r;
}
// the piece's points without its CHC substats
export const nonChc = (P: Profile, p: Piece): number => { const k = pieceCrit(P, p); return piecePoints(P, p) - k.w * k.n; };
const critStep = (P: Profile): number => P.ctx.idx.SUB.CHC?.step ?? 3;
const ownChc = (P: Profile): number => { const o = ownStat(P.ctx, P.c, 'CHC'); return o.base + o.cls + o.quirk; };
// CHC of a set's rows that are on with n pieces, n4 of them at T4 (the bonusRows rule, as setValue)
const rowsMemo = new WeakMap<Profile, Map<string, number>>();
function setChc(P: Profile, set: string, n: number, n4: number): number {
  let m = rowsMemo.get(P);
  if (!m) rowsMemo.set(P, (m = new Map()));
  const key = `${set}:${n}:${n4}`;
  let r = m.get(key);
  if (r === undefined) m.set(key, (r = rowsStat(bonusRows(P.ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 }))), 'CHC')));
  return r;
}
// A set's CHC rows that are on (owner Q-A, 2026-10-11: the set's crit counts by the curve too): a row worth points of its own
// (a stat set, not covered by a half — MODEL.md §2) goes on the curve like substats, at its weight (its points per 3 %);
// a row covered by a half (its price is U, the set as a build choice) or of an effect set carries no points — it is C₀
interface SetCrit { c0: number; segs: CritSegs[]; chc: number }
const setCritMemo = new WeakMap<Profile, Map<string, SetCrit>>();
function setCrit(P: Profile, set: string, n: number, n4: number): SetCrit {
  let m = setCritMemo.get(P);
  if (!m) setCritMemo.set(P, (m = new Map()));
  const key = `${set}:${n}:${n4}`;
  let r = m.get(key);
  if (!r) {
    const sv = setValue(P, set, n, n4);
    const rows = bonusRows(P.ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
    r = { c0: 0, segs: [], chc: 0 };
    rows.forEach((row, i) => {
      if (row.bon.stat !== 'CHC' || row.bon.mode !== 'add') return;
      const pts = sv.rows[i]?.pts ?? 0, k = row.bon.value / critStep(P);
      r!.chc += row.bon.value;
      if (!sv.effect && !sv.rows[i]?.covered && pts > 0 && k > 0) r!.segs.push({ w: pts / k, n: k });
      else r!.c0 += row.bon.value;
    });
    m.set(key, r);
  }
  return r;
}
// what the segments lose on the curve from c0 (≥ 0)
const lossOf = (P: Profile, c0: number, segs: readonly CritSegs[]): number => critLoss(P.need, c0, critStep(P), segs);
// C₀ and the segments of a layout (substats and the set rows that carry points); total — the layout's CHC, %
function critState(P: Profile, layout: Layout): { c0: number; segs: CritSegs[]; total: number } {
  let c0 = ownChc(P), total = 0;
  const segs: CritSegs[] = [];
  for (const slot of ALL) {
    const p = layout[slot];
    if (!p) continue;
    const k = pieceCrit(P, p);
    c0 += k.main;
    total += k.n * critStep(P);
    if (k.n) segs.push({ w: k.w, n: k.n });
  }
  for (const [set, [n, n4]] of setCounts(layout)) {
    if (n < 2) continue;
    const sc = setCrit(P, set, n, n4);
    c0 += sc.c0;
    total += sc.chc - sc.c0;
    segs.push(...sc.segs);
  }
  return { c0, segs, total: c0 + total };
}

// the crit loss of a set of pieces worn together (one per slot) — for trade (features/trade/model/world), which builds kits
// from candidates of many heroes; 0 for a hero without CHC in the chain
export function critLossOf(P: Profile, pieces: readonly Piece[]): number {
  if (!P.critOn) return 0;
  const layout: Layout = {};
  for (const p of pieces) layout[p.slot] = p;
  const st = critState(P, layout);
  return lossOf(P, st.c0, st.segs);
}
// can any kit of these pieces reach the knee (the upper bound of critBinds); no — the crit term is 0 for all of them
export const critCanBind = (P: Profile, pieces: readonly Piece[]): boolean => critBinds(P, pieces, false);
const ownMemo = new WeakMap<Profile, number>();
const ownCached = (P: Profile): number => { let r = ownMemo.get(P); if (r === undefined) ownMemo.set(P, (r = ownChc(P))); return r; };

// The numbers of a quick crit bound for trade's kits (features/trade/model/world): the hero's own crit, the knee, a piece's
// most crit (main + substats), a set's most crit from its rows (at 4 pieces on T4). A kit whose sum stays under the knee
// loses nothing
export interface CritBound { own: number; knee: number; rows: number; piece: (p: Piece) => number; set: (set: string) => number }
export function critBound(P: Profile): CritBound {
  const step = critStep(P);
  const setMax = (set: string) => Math.max(...[2, 3, 4].flatMap((n) => Array.from({ length: n + 1 }, (_, n4) => setChc(P, set, n, n4))));
  return {
    own: ownCached(P),
    knee: Math.max(0, P.need - CRIT_KNEE),
    rows: rowsMaxOf(P, setMax, (set) => Math.max(...[0, 1, 2].map((n4) => setChc(P, set, 2, n4)))),
    piece: (p) => { const k = pieceCrit(P, p); return k.main + k.n * step; },
    set: setMax,
  };
}
// the most crit the set rows of any kit give: one set on 3–4 pieces, or two sets on 2 pieces each (today only the Critical
// Hit set has CHC rows, but two such 2P T4 halves would give 36 > its ×4 T4 30). The same for every hero (rows are data),
// once per dataset
const rowsMaxMemo = new WeakMap<object, number>();
function rowsMaxOf(P: Profile, setMax: (set: string) => number, set2: (set: string) => number): number {
  const D = P.ctx.idx.D;
  let r = rowsMaxMemo.get(D);
  if (r === undefined) {
    const [a = 0, b = 0] = D.sets.map((s) => set2(s.id)).sort((x, z) => z - x);
    rowsMaxMemo.set(D, (r = Math.max(0, a + b, ...D.sets.map((s) => setMax(s.id)))));
  }
  return r;
}

// MODEL.md crit, decision 3 («Отложить»): a piece's points as if it stood in its slot of `layout` — its CHC substats
// valued on the curve where the rest of that layout leaves them; the other substats as usual. A hero without CHC in the
// chain, or a piece without CHC substats — its plain points
export function pointsIn(P: Profile, layout: Layout, p: Piece): number {
  const px = piecePoints(P, p);
  const k = pieceCrit(P, p);
  if (!P.critOn || !k.n || !k.w) return px;
  const { c0, segs } = critState(P, { ...layout, [p.slot]: p });
  const rest = [...segs];
  rest.splice(rest.findIndex((s) => s.w === k.w && s.n === k.n), 1);
  // = points − w·n + (value of all segments − value without its own): the loss its segments add, exactly 0 under the knee
  return px - (lossOf(P, c0, segs) - lossOf(P, c0, rest));
}

export function layoutValue(P: Profile, layout: Layout): LayoutValue {
  const ptsBySlot: Partial<Record<SlotId, number>> = {};
  let ptsSum = 0, rank = 0, filled = 0;
  for (const slot of ALL) {
    const p = layout[slot];
    if (!p) continue;
    const x = piecePoints(P, p);
    ptsBySlot[slot] = x;
    ptsSum += x;
    filled++;
    if (!isArmor(slot)) rank += RANK[gearRank(P, p)];
  }
  const sets: SetValue[] = [];
  let setSum = 0, halves = 0, effHalves = 0;
  for (const [set, [n, n4]] of setCounts(layout)) {
    if (n < 2) continue;
    const s = setValue(P, set, n, n4);
    sets.push(s);
    setSum += s.value;
    halves += s.halves;
    if (s.effect) effHalves += s.halves;
  }
  let critLoss = 0, chc: number | null = null;
  if (P.critOn) {
    const st = critState(P, layout);
    chc = st.total;
    critLoss = lossOf(P, st.c0, st.segs);
  }
  return { v: ptsSum + setSum - critLoss, ptsSum, setSum, critLoss, chc, ptsBySlot, sets, halves, effHalves, rank, filled };
}

type Ranked = Pick<LayoutValue, 'rank' | 'v' | 'effHalves'>;
// MODEL.md §3 item 3: a лучше z — выше ранг оружия или аксессуара; или при том же ранге V больше хотя бы на 1 очко (в тысячных);
// или при том же ранге включается половина сета-эффекта при не меньшем V
// legendOverEpic (owner Q7, 2026-10-09): the layouts differ only by Legendary pieces taking the place of Epic ones — then
// V not lower is enough, no +1: the Legendary's bigger main stat breaks the tie (see epicToLegend)
export function better(a: Ranked, z: Ranked, legendOverEpic = false): boolean {
  if (a.rank !== z.rank) return a.rank > z.rank;
  if (milli(a.v) - milli(z.v) >= (legendOverEpic ? 0 : THRESHOLD)) return true;
  return a.effHalves > z.effHalves && milli(a.v) >= milli(z.v);
}

// every slot where `to` differs from `from` is a Legendary in place of an Epic (and there is at least one such slot):
// the swap that needs no +1 point margin. The same grade comparison is the tie-break of bestLayout
export function epicToLegend(from: Layout, to: Layout): boolean {
  let swaps = 0;
  for (const slot of ALL) {
    const a = from[slot], b = to[slot];
    if (a?.id === b?.id) continue;
    if (a?.grade !== 'rare' || b?.grade !== 'unique') return false;
    swaps++;
  }
  return swaps > 0;
}
// at equal points a Legendary goes before an Epic: its main stat is bigger (the main stat has no points)
const gradeFirst = (a: Piece, z: Piece): number => Number(z.grade === 'unique') - Number(a.grade === 'unique');
function gearBetter(P: Profile, a: Piece, z: Piece): boolean {
  const ra = RANK[gearRank(P, a)], rz = RANK[gearRank(P, z)];
  if (ra !== rz) return ra > rz;
  const pa = piecePoints(P, a), pz = piecePoints(P, z);
  if (Math.abs(pa - pz) > EPS) return pa > pz;
  return gradeFirst(a, z) < 0 || (gradeFirst(a, z) === 0 && ageOf(a) < ageOf(z));
}

export interface LayoutOpts {
  eligible?: (p: Piece) => boolean; // кто может встать: надетые и прошедшие порог (этапы 2–4); по умолчанию — все
  prune?: boolean;                  // false — полное произведение (эталон для тестов)
  armorOnly?: boolean;
}

// Лучшая раскладка пула. Отсечка точная: V = Σ очков + Σ ценностей сетов по (сет, n, n4), поэтому в слоте важна только
// the best piece per (set, T4 or not). At equal V — more filled slots, then more Legendary (Q7), then older records.
// When the hero's crit can reach the knee of the curve with this pool (critBinds), the search takes the crit path instead
export function bestLayout(P: Profile, pool: readonly Piece[], opts: LayoutOpts = {}): { layout: Layout; value: LayoutValue } {
  const cands = pool.filter((p) => wearable(P.ctx, P.c, p) && (!opts.eligible || opts.eligible(p)));
  return critBinds(P, cands, !!opts.armorOnly) ? critBest(P, cands, opts) : linearBest(P, cands, opts);
}

// the old search, exact while V is linear: gear by rank and points, armor best per (set, T4)
function linearBest(P: Profile, cands: readonly Piece[], opts: LayoutOpts): { layout: Layout; value: LayoutValue } {
  const { prune = true } = opts;
  const layout: Layout = {};
  if (!opts.armorOnly) {
    for (const slot of GEAR) {
      let best: Piece | null = null;
      for (const p of cands) if (p.slot === slot && (!best || gearBetter(P, p, best))) best = p;
      if (best) layout[slot] = best;
    }
  }
  const gearPts = GEAR.reduce((n, s) => n + (layout[s] ? piecePoints(P, layout[s]!) : 0), 0);
  const perSlot = ARMOR.map((slot): (Piece | null)[] => {
    const all = cands.filter((p) => p.slot === slot);
    if (!prune) return [null, ...all];
    const best = new Map<string, Piece>();
    for (const p of all) {
      const k = `${p.setId}:${p.bt === 4}`;
      const b = best.get(k);
      const d = b ? piecePoints(P, p) - piecePoints(P, b) : 0;
      if (!b || d > EPS || (Math.abs(d) <= EPS && (gradeFirst(p, b) < 0 || (gradeFirst(p, b) === 0 && ageOf(p) < ageOf(b))))) best.set(k, p);
    }
    return [null, ...best.values()];
  });

  let top: { arm: (Piece | null)[]; v: number; filled: number; legends: number; age: number } | null = null;
  const cur: (Piece | null)[] = [null, null, null, null];
  const cnt = new Map<string, [number, number]>();
  let ptsSum = 0;
  const walk = (i: number) => {
    if (i === ARMOR.length) {
      let v = ptsSum + gearPts;
      for (const [set, [n, n4]] of cnt) if (n >= 2) v += setValue(P, set, n, n4).value;
      const filled = cur.filter(Boolean).length;
      const legends = cur.filter((p) => p?.grade === 'unique').length;
      const age = cur.reduce((s, p) => s + (p ? ageOf(p) : 0), 0);
      if (!top || v > top.v + EPS || (Math.abs(v - top.v) <= EPS && (filled > top.filled || (filled === top.filled
        && (legends > top.legends || (legends === top.legends && age < top.age)))))) {
        top = { arm: [...cur], v, filled, legends, age };
      }
      return;
    }
    for (const p of perSlot[i]) {
      cur[i] = p;
      if (p) {
        ptsSum += piecePoints(P, p);
        if (p.setId) { const [n, n4] = cnt.get(p.setId) ?? [0, 0]; cnt.set(p.setId, [n + 1, n4 + (p.bt === 4 ? 1 : 0)]); }
      }
      walk(i + 1);
      if (p) {
        ptsSum -= piecePoints(P, p);
        if (p.setId) {
          const [n, n4] = cnt.get(p.setId)!;
          if (n === 1) cnt.delete(p.setId);
          else cnt.set(p.setId, [n - 1, n4 - (p.bt === 4 ? 1 : 0)]);
        }
      }
    }
    cur[i] = null;
  };
  walk(0);
  top!.arm.forEach((p, i) => { if (p) layout[ARMOR[i]] = p; });
  return { layout, value: layoutValue(P, layout) };
}

// a set piece in or out of the (n, n4) counts of the walk
function add(cnt: Map<string, [number, number]>, p: Piece, d: 1 | -1) {
  if (!p.setId) return;
  const [n, n4] = cnt.get(p.setId) ?? [0, 0];
  if (n + d === 0) cnt.delete(p.setId);
  else cnt.set(p.setId, [n + d, n4 + d * (p.bt === 4 ? 1 : 0)]);
}

// armor tie-break inside one (set, T4) key: more points, then Legendary, then older
function armorFirst(P: Profile, p: Piece, b: Piece): boolean {
  const d = piecePoints(P, p) - piecePoints(P, b);
  return d > EPS || (Math.abs(d) <= EPS && (gradeFirst(p, b) < 0 || (gradeFirst(p, b) === 0 && ageOf(p) < ageOf(b))));
}

// MODEL.md crit: can any layout of these candidates reach the knee N − 15? An upper bound of the crit: the hero, the
// biggest CHC main in each slot, every CHC set row the pool could switch on, the most CHC segments in each slot. Not —
// f = 1 on the whole run, V is linear and the old search is exact (and the same result as before the crit term)
function critBinds(P: Profile, cands: readonly Piece[], armorOnly: boolean): boolean {
  if (!P.critOn) return false;
  const slots = armorOnly ? ARMOR : ALL;
  let max = ownChc(P);
  for (const slot of slots) {
    let main = 0, n = 0;
    for (const p of cands) if (p.slot === slot) { const k = pieceCrit(P, p); main = Math.max(main, k.main); n = Math.max(n, k.n); }
    max += main + n * critStep(P);
  }
  const bySet = new Map<string, { slots: Set<string>; t4: Set<string> }>();
  for (const p of cands) {
    if (!isArmor(p.slot) || !p.setId) continue;
    const x = bySet.get(p.setId) ?? { slots: new Set(), t4: new Set() };
    x.slots.add(p.slot);
    if (p.bt === 4) x.t4.add(p.slot);
    bySet.set(p.setId, x);
  }
  for (const [set, x] of bySet) {
    let best = 0;
    for (let n = 2; n <= x.slots.size; n++) for (let n4 = 0; n4 <= Math.min(n, x.t4.size); n4++) best = Math.max(best, setChc(P, set, n, n4));
    max += best;
  }
  return max > Math.max(0, P.need - CRIT_KNEE) + EPS;
}

// MODEL.md crit, pruning: a dominates b (same slot; for armor — same set and T4) when it comes first by points (ties: the
// usual order), has at least b's points without CHC, no more CHC from its main, and their CHC weight is equal (or one has
// no CHC substat). Then a layout with a is never worth less than with b: lower C₀ never lowers V, and with one weight the
// extra segments of either piece add between 0 and their linear points
// For armor also not worse on the ties after V (more Legendary, then older): V may come out equal once the extra CHC is worth
// nothing, and then b would win on them. Gear ties go by the list order, where a is first anyway (gear = true)
function dominates(P: Profile, a: Piece, b: Piece, gear = false): boolean {
  const ka = pieceCrit(P, a), kb = pieceCrit(P, b);
  if (!(nonChc(P, a) >= nonChc(P, b) - EPS && ka.main <= kb.main + EPS && (ka.w === kb.w || !ka.n || !kb.n))) return false;
  return gear || gradeFirst(a, b) < 0 || (gradeFirst(a, b) === 0 && ageOf(a) <= ageOf(b));
}
// keep the pieces nobody earlier in the list dominates (the list is in "first by points" order)
function front(P: Profile, sorted: readonly Piece[], gear = false): Piece[] {
  const out: Piece[] = [];
  for (const p of sorted) if (!out.some((a) => dominates(P, a, p, gear))) out.push(p);
  return out;
}

// The search when crit binds. Weapon and accessory: rank still decides first; among the top rank the undominated pieces
// join the search (an accessory's CHC main and a weapon's CHC substats change what armor CHC is worth), in the usual
// order — at equal V the usual pick wins. Armor: per (set, T4) the undominated pieces instead of one. V of each layout
// is layoutValue's: points + sets − crit loss. prune: false — every top-rank gear piece and every armor piece (the oracle)
// With pruning a branch whose plain V can't reach the best so far is cut (points so far + the most points of the slots left +
// the most a layout's sets can be worth): the crit loss only lowers V
function critBest(P: Profile, cands: readonly Piece[], opts: LayoutOpts): { layout: Layout; value: LayoutValue } {
  const { prune = true } = opts;
  const order = (a: Piece, z: Piece) => (gearBetter(P, a, z) ? -1 : gearBetter(P, z, a) ? 1 : 0);
  const gear = GEAR.map((slot): (Piece | null)[] => {
    if (opts.armorOnly) return [null];
    const mine = cands.filter((p) => p.slot === slot);
    if (!mine.length) return [null];
    const r = Math.max(...mine.map((p) => RANK[gearRank(P, p)]));
    const top = mine.filter((p) => RANK[gearRank(P, p)] === r).sort(order);
    return prune ? front(P, top, true) : top;
  });
  const perSlot = ARMOR.map((slot): (Piece | null)[] => {
    const all = cands.filter((p) => p.slot === slot);
    if (!prune) return [null, ...all];
    const byKey = new Map<string, Piece[]>();
    for (const p of all) { const k = `${p.setId}:${p.bt === 4}`; byKey.set(k, [...(byKey.get(k) ?? []), p]); }
    return [null, ...[...byKey.values()].flatMap((xs) => front(P, xs.sort((a, z) => (armorFirst(P, a, z) ? -1 : armorFirst(P, z, a) ? 1 : 0))))];
  });

  const step = critStep(P), own = ownChc(P);
  type Top = { gear: (Piece | null)[]; gi: number[]; arm: (Piece | null)[]; v: number; filled: number; legends: number; age: number };
  let top: Top | null = null;
  const cur: (Piece | null)[] = [null, null, null, null];
  const cnt = new Map<string, [number, number]>();
  let ptsSum = 0, gPts = 0;
  let g: (Piece | null)[] = [null, null], gi = [0, 0];
  // the bound: the most points left per armor slot, the most the sets of four slots can be worth
  const restMax = [0, 0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) restMax[i] = restMax[i + 1] + Math.max(0, ...perSlot[i].map((p) => (p ? piecePoints(P, p) : 0)));
  let b2 = 0, b3 = 0, b4 = 0;
  for (const set of new Set(perSlot.flat().map((p) => p?.setId).filter((x): x is string => !!x))) {
    for (let n4 = 0; n4 <= 4; n4++) {
      if (n4 <= 2) b2 = Math.max(b2, setValue(P, set, 2, n4).value);
      if (n4 <= 3) b3 = Math.max(b3, setValue(P, set, 3, n4).value);
      b4 = Math.max(b4, setValue(P, set, 4, n4).value);
    }
  }
  const setCap = Math.max(0, b4, b3, 2 * b2);
  const leaf = () => {
    let lin = ptsSum;
    for (const p of g) if (p) lin += piecePoints(P, p);
    let c0 = own;
    const segs: CritSegs[] = [];
    for (const [set, [n, n4]] of cnt) {
      if (n < 2) continue;
      lin += setValue(P, set, n, n4).value;
      const sc = setCrit(P, set, n, n4);
      c0 += sc.c0;
      segs.push(...sc.segs);
    }
    if (top && lin < top.v - EPS) return; // the crit loss only lowers V
    for (const p of [...g, ...cur]) {
      if (!p) continue;
      const k = pieceCrit(P, p);
      c0 += k.main;
      if (k.n) segs.push({ w: k.w, n: k.n });
    }
    const v = lin - critLoss(P.need, c0, step, segs);
    const filled = cur.filter(Boolean).length;
    const legends = cur.filter((p) => p?.grade === 'unique').length;
    const age = cur.reduce((s, p) => s + (p ? ageOf(p) : 0), 0);
    const earlier = top && (gi[0] !== top.gi[0] ? gi[0] < top.gi[0] : gi[1] < top.gi[1]);
    const sameGear = top && gi[0] === top.gi[0] && gi[1] === top.gi[1];
    if (!top || v > top.v + EPS || (Math.abs(v - top.v) <= EPS && (earlier || (sameGear && (filled > top.filled || (filled === top.filled
      && (legends > top.legends || (legends === top.legends && age < top.age)))))))) {
      top = { gear: [...g], gi: [...gi], arm: [...cur], v, filled, legends, age };
    }
  };
  const walk = (i: number) => {
    if (i === ARMOR.length) { leaf(); return; }
    if (prune && top && ptsSum + gPts + restMax[i] + setCap < top.v - EPS) return;
    for (const p of perSlot[i]) {
      cur[i] = p;
      if (p) { ptsSum += piecePoints(P, p); add(cnt, p, 1); }
      walk(i + 1);
      if (p) { ptsSum -= piecePoints(P, p); add(cnt, p, -1); }
    }
    cur[i] = null;
  };
  gear[0].forEach((w, i) => gear[1].forEach((a, j) => {
    g = [w, a]; gi = [i, j];
    gPts = (w ? piecePoints(P, w) : 0) + (a ? piecePoints(P, a) : 0);
    walk(0);
  }));
  const layout: Layout = {};
  const best = top as Top | null;
  best!.gear.forEach((p, i) => { if (p) layout[GEAR[i]] = p; });
  best!.arm.forEach((p, i) => { if (p) layout[ARMOR[i]] = p; });
  return { layout, value: layoutValue(P, layout) };
}
