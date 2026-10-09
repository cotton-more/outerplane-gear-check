// Ценность раскладки героя и его лучшая раскладка из пула (.x/0085 FORMULA §3). V = очки всех вещей + ценность сетов
// брони — одной функцией по раскладке целиком. Оружие и аксессуар решает сначала ранг (рекомендованная > временная >
// не из билдов), потом очки; броню — полный перебор (по вещи или пусто на слот), максимум V.
import { isArmor } from '@/game/data';
import type { ArmorSlot, GearKind, SlotId } from '@/game/data/types';
import { pointsOf } from '@/game/build/points';
import type { Profile } from '@/game/build/profile';
import { scoreBuild, tempOk } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import { setValue, type SetValue } from '@/game/set/setValue';
import { pieceInput, type Piece } from './model/gear';
import { fit, milli, THRESHOLD, wearable, type Fit } from './model/vs';
import { EPS, NEWEST, numOf } from './pool/base';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
const GEAR: GearKind[] = ['weapon', 'accessory'];
const ALL: SlotId[] = [...GEAR, ...ARMOR];
export const RANK: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };

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
  v: number;
  ptsSum: number;
  setSum: number;
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
  return { v: ptsSum + setSum, ptsSum, setSum, ptsBySlot, sets, halves, effHalves, rank, filled };
}

type Ranked = Pick<LayoutValue, 'rank' | 'v' | 'effHalves'>;
// §3 п. 3: a лучше z — выше ранг оружия или аксессуара; или при том же ранге V больше хотя бы на 1 очко (в тысячных);
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
// лучшая вещь на (сет, T4 или нет). При равной V — больше заполненных слотов, потом больше Legendary (Q7), потом более старые записи
export function bestLayout(P: Profile, pool: readonly Piece[], opts: LayoutOpts = {}): { layout: Layout; value: LayoutValue } {
  const { prune = true, eligible } = opts;
  const cands = pool.filter((p) => wearable(P.ctx, P.c, p) && (!eligible || eligible(p)));
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
