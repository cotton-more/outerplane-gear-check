// Лучший комплект получателя (R6.1; польза — как у лучшей раскладки, MODEL.md §3) из кандидатов — то, что
// приложение собрало бы по его заказу, если бы все кандидаты лежали в его пуле (features/gear/layout bestLayout):
// оружие и аксессуар — по слоту (ранг, потом очки), броня — перебор слотов, максимум V.
// Слоты независимы по пользе и по ничьим (суммы и порядок по слотам), поэтому лучшее по частям = лучшее целиком.
// Отсечение брони точное: в слоте из вещей одного ключа (сет, T4) остаётся лучшая по (очки, цена, потеря, ростер,
// старшинство) — сеты и их ценность у них одни и те же. Мягкий потолок крита (MODEL.md §12 item 6) связывает слоты: когда крит
// получателя может дойти до колена с этими кандидатами, работает critKit — как critBest лучшей раскладки.
import type { SlotId } from '@/game/data/types';
import { LAMBDA, SPD_MILLI, type GoalTerm } from './goal';
import { ARMOR_SLOTS, cmpKit, GEAR_SLOTS, isLegend, SLOT_ORDER, type Cand, type Cands, type CritGauge, type Fit, type Gauge, type Kit, type KitKey } from './model';

// only a recommended item outranks points (its passive); a stopgap and the rest — by points (owner 2026-10-10)
export const FIT: Record<Fit, number> = { rec: 1, stopgap: 0, no: 0 };
const EMPTY = Number.POSITIVE_INFINITY; // ранг и номер пустого слота — после любых вещей

// вещь a лучше z в одном слоте при тех же сетах: очки, Legendary (Q7), цена источника, потеря держателя, ростер, старшинство
const betterInSlot = (a: Cand, z: Cand) =>
  a.v !== z.v ? a.v > z.v : isLegend(a) !== isLegend(z) ? isLegend(a) : a.cost !== z.cost ? a.cost < z.cost : a.loss !== z.loss ? a.loss < z.loss
    : a.rank !== z.rank ? a.rank < z.rank : a.item.ord < z.item.ord;
// оружие и аксессуар: сначала ранг (MODEL.md §3 item 2)
const betterGear = (a: Cand, z: Cand) => (FIT[a.fit] !== FIT[z.fit] ? FIT[a.fit] > FIT[z.fit] : betterInSlot(a, z));

// fix — слоты, заданные заранее (порог): вещь или null (слот пуст)
export type Fix = Partial<Record<SlotId, Cand | null>>;

// the goal terms of a gauge (MODEL.md §13): the EFF goal (E3) and the SPD goal (E4)
const termsOf = (g: Gauge): GoalTerm[] => [g.goal, g.spd].filter((x): x is NonNullable<typeof x> => !!x);

// The plain search first: a plain best that loses nothing to crit nor to the goals is the best with them too (no kit is
// worth more than its plain V; the plain search settled the ties among the plain maxima). Otherwise the plain best already
// loses, so crit or a goal binds: a goal out of reach turns linear, the rest — critKit
export function bestKit(g: Gauge, cands: Cands, fix: Fix = {}): Kit {
  const plain = plainKit(g, cands, fix);
  const ids = () => SLOT_ORDER.flatMap((s) => (plain.slots[s] ? [plain.slots[s]!.item.id] : []));
  const critFree = !g.crit || !critMayLose(g.crit, plain.slots) || !g.crit.loss(ids());
  const terms = termsOf(g);
  if (critFree && terms.every((x) => !x.loss(ids()))) return plain;
  const far = terms.filter((x) => outOfReach(x, cands, fix));
  if (far.length) return linearKit(g, far, cands, fix);
  return critKit(g, cands, fix);
}

// A goal out of reach (MODEL.md §13; Laplace, Sterope; an SPD target too far): no kit gets to the target, so the goal is the
// shortfall alone, a − Σ b − Σ r — a sum over the slots and the sets (an SPD term has no surplus part at all). Then the search
// is the usual one (plain, or critKit for crit and a goal in reach) with each candidate worth v + b and each set + r: the
// same order of kits, V' shifted by a
function outOfReach(goal: GoalTerm, cands: Cands, fix: Fix): boolean {
  let most = 0;
  for (const slot of SLOT_ORDER) {
    if (slot in fix) { const f = fix[slot]; most += f ? goal.b(f.item.id) : 0; continue; }
    most += Math.max(0, ...(cands[slot] ?? []).map((c) => goal.b(c.item.id)));
  }
  return goal.a - most - goal.rMax > 0;
}
function linearKit(g: Gauge, far: readonly GoalTerm[], cands: Cands, fix: Fix): Kit {
  const bs = (id: string) => far.reduce((s, x) => s + x.b(id), 0);
  const orig = new Map<Cand, Cand>();
  const adj = (c: Cand): Cand => { const x = { ...c, v: c.v + bs(c.item.id) }; orig.set(x, c); return x; };
  const lin: Gauge = {
    ...g,
    ...(g.goal && far.includes(g.goal) ? { goal: undefined } : {}),
    ...(g.spd && far.includes(g.spd) ? { spd: undefined } : {}),
    bonus: (set, n, n4) => { const b = g.bonus(set, n, n4); return { ...b, v: b.v + far.reduce((s, x) => s + x.r(set, n, n4), 0) }; },
    ...(g.crit ? { crit: { ...g.crit, facts: (id: string) => { const f = g.crit!.facts(id); return { ...f, non: f.non + bs(id) }; } } } : {}),
  };
  const c2: Cands = Object.fromEntries(Object.entries(cands).map(([s, xs]) => [s, xs!.map(adj)]));
  const f2: Fix = Object.fromEntries(Object.entries(fix).map(([s, x]) => [s, x ? adj(x) : null]));
  const k = bestKit(lin, c2, f2);
  const slots: Partial<Record<SlotId, Cand>> = {};
  for (const s of SLOT_ORDER) { const x = k.slots[s]; if (x) slots[s] = orig.get(x)!; }
  return { slots, key: keyOf(g, slots) };
}

function plainKit(g: Gauge, cands: Cands, fix: Fix): Kit {
  const slots: Partial<Record<SlotId, Cand>> = {};
  for (const slot of GEAR_SLOTS) {
    if (slot in fix) { const f = fix[slot]; if (f) slots[slot] = f; continue; }
    let best: Cand | null = null;
    for (const c of cands[slot] ?? []) if (!best || betterGear(c, best)) best = c;
    if (best) slots[slot] = best;
  }
  const arm = bestArmor(g, cands, fix);
  ARMOR_SLOTS.forEach((slot, i) => { const c = arm[i]; if (c) slots[slot] = c; });
  return { slots, key: keyOf(g, slots) };
}

// кандидаты слота брони после отсечения: пусто + лучшая вещь на ключ (сет, T4)
function armorOptions(cands: Cands, fix: Fix, slot: SlotId): (Cand | null)[] {
  if (slot in fix) return [fix[slot] ?? null];
  const best = new Map<string, Cand>();
  for (const c of cands[slot] ?? []) {
    const k = `${c.item.set}:${c.item.t4}`;
    const b = best.get(k);
    if (!b || betterInSlot(c, b)) best.set(k, c);
  }
  return [null, ...best.values()];
}

// Перебор брони с ветвями и границами: граница — очки уже взятых + наибольшие очки оставшихся слотов + наибольшая
// ценность сетов на четырёх слотах (без допущения, что ценность растёт с числом вещей) и заполненность. Ветка
// отбрасывается, только если граница строго хуже лучшего (ничьи решают R6.1)
function bestArmor(g: Gauge, cands: Cands, fix: Fix): (Cand | null)[] {
  const opts = ARMOR_SLOTS.map((slot) => armorOptions(cands, fix, slot).sort((a, z) => (z?.v ?? -1) - (a?.v ?? -1)));
  const sets = new Map<string, number>();
  for (const o of opts) for (const c of o) if (c?.item.set && !sets.has(c.item.set)) sets.set(c.item.set, sets.size);
  const names = [...sets.keys()];
  const S = sets.size;
  const memo = new Float64Array(S * 25).fill(NaN);
  const bonus = (s: number, n: number, n4: number) => {
    const i = s * 25 + n * 5 + n4;
    if (Number.isNaN(memo[i])) memo[i] = g.bonus(names[s], n, n4).v;
    return memo[i];
  };
  // наибольшая ценность одного сета на 2, 3, 4 вещах — граница сетов на четырёх слотах
  let b2 = 0, b3 = 0, b4 = 0;
  for (let s = 0; s < S; s++) for (let n4 = 0; n4 <= 4; n4++) {
    if (n4 <= 2) b2 = Math.max(b2, bonus(s, 2, n4));
    if (n4 <= 3) b3 = Math.max(b3, bonus(s, 3, n4));
    b4 = Math.max(b4, bonus(s, 4, n4));
  }
  const setCap = Math.max(0, b4, b3, 2 * b2);
  // наибольшие очки вещи в оставшихся слотах (опции отсортированы по очкам)
  const restMax = [0, 0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) restMax[i] = restMax[i + 1] + Math.max(0, opts[i][0]?.v ?? 0);
  const restFill = [0, 0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) restFill[i] = restFill[i + 1] + (opts[i].some((c) => !!c) ? 1 : 0);

  const cnt = new Int8Array(S), cnt4 = new Int8Array(S);
  const cur: (Cand | null)[] = [null, null, null, null];
  let top: (Cand | null)[] = [null, null, null, null];
  let best: KitKey | null = null;
  let vSum = 0, filled = 0;

  const leaf = () => {
    let total = vSum;
    for (let s = 0; s < S; s++) if (cnt[s] >= 2) total += bonus(s, cnt[s], cnt4[s]);
    if (best) {
      const d = total - best.total || filled - best.filled;
      if (d < 0) return;
      if (d === 0) {
        const k = armorKey(g, cur);
        if (cmpKit(k, best) <= 0) return;
        best = k; top = [...cur]; return;
      }
    }
    best = armorKey(g, cur); top = [...cur];
  };
  const hopeless = (i: number): boolean => {
    if (!best) return false;
    const d = vSum + restMax[i] + setCap - best.total || filled + restFill[i] - best.filled;
    return d < 0;
  };
  const walk = (i: number) => {
    if (i === 4) { leaf(); return; }
    if (hopeless(i)) return;
    for (const c of opts[i]) {
      cur[i] = c;
      const s = c?.item.set ? sets.get(c.item.set)! : -1;
      if (c) { vSum += c.v; filled++; if (s >= 0) { cnt[s]++; if (c.item.t4) cnt4[s]++; } }
      walk(i + 1);
      if (c) { vSum -= c.v; filled--; if (s >= 0) { cnt[s]--; if (c.item.t4) cnt4[s]--; } }
    }
    cur[i] = null;
  };
  walk(0);
  return top;
}

// ключ брони: очки, ценность сетов, половины, ничьи
function armorKey(g: Gauge, arm: readonly (Cand | null)[]): KitKey {
  const n = new Map<string, number>(), n4 = new Map<string, number>();
  let pts = 0, filled = 0, cost = 0, loss = 0, legends = 0;
  const ranks: number[] = [], ords: number[] = [];
  for (const c of arm) {
    if (!c) { ranks.push(EMPTY); ords.push(EMPTY); continue; }
    pts += c.v; filled++; cost += c.cost; loss += c.loss; legends += Number(isLegend(c));
    ranks.push(c.rank); ords.push(c.item.ord);
    const s = c.item.set;
    if (s) { n.set(s, (n.get(s) ?? 0) + 1); if (c.item.t4) n4.set(s, (n4.get(s) ?? 0) + 1); }
  }
  let total = pts, halves = 0, eff = 0;
  for (const [s, k] of n) {
    if (k < 2) continue;
    const b = g.bonus(s, k, n4.get(s) ?? 0);
    total += b.v; halves += b.halves; eff += b.eff;
  }
  return { rank: 0, total, pts, halves, eff, filled, crit: 0, legends, cost, loss, ranks, ords };
}

// ключ всего комплекта (польза MODEL.md §3 + ничьи R6.1) — для сравнения комплектов везде (порог, команда, дыры). V — за
// вычетом потери крита (MODEL.md §12 item 6): она зависит от всего комплекта сразу
export function keyOf(g: Gauge, slots: Partial<Record<SlotId, Cand>>): KitKey {
  const k = armorKey(g, ARMOR_SLOTS.map((s) => slots[s] ?? null));
  if (g.crit && critMayLose(g.crit, slots)) {
    k.crit = g.crit.loss(SLOT_ORDER.flatMap((s) => (slots[s] ? [slots[s]!.item.id] : [])));
    k.total -= k.crit;
  }
  // the goals (MODEL.md §13): the shortfall's penalty (and for EFF the points of EFF above the target) — the whole kit at once
  const terms = termsOf(g);
  if (terms.length) {
    const ids = SLOT_ORDER.flatMap((s) => (slots[s] ? [slots[s]!.item.id] : []));
    k.goal = terms.reduce((s, x) => s + x.loss(ids), 0);
    k.total -= k.goal;
  }
  const ranks: number[] = [], ords: number[] = [];
  let rank = 0;
  for (const slot of GEAR_SLOTS) {
    const c = slots[slot];
    ranks.push(c ? c.rank : EMPTY); ords.push(c ? c.item.ord : EMPTY);
    if (!c) continue;
    rank += FIT[c.fit];
    k.total += c.v; k.pts += c.v; k.filled++; k.legends += Number(isLegend(c)); k.cost += c.cost; k.loss += c.loss;
  }
  return { ...k, rank, ranks: [...ranks, ...k.ranks], ords: [...ords, ...k.ords] };
}


// ----------------------------------------------------------------------------------------------- мягкий потолок крита

// the quick bound (CritGauge): most kits stay under the knee and lose nothing — no call, no allocation
function critMayLose(cr: CritGauge, slots: Partial<Record<SlotId, Cand>>): boolean {
  let c = cr.own;
  for (const s of SLOT_ORDER) c += slots[s]?.item.chc ?? 0; // an empty slot adds nothing
  if (c > cr.knee) return true;
  if (c + cr.rowsMax <= cr.knee) return false; // no kit's set rows could make it
  for (let i = 0; i < ARMOR_SLOTS.length; i++) {
    const set = slots[ARMOR_SLOTS[i]]?.item.set;
    if (!set) continue;
    let first = true, more = false;
    for (let j = 0; j < ARMOR_SLOTS.length; j++) {
      if (j === i || slots[ARMOR_SLOTS[j]]?.item.set !== set) continue;
      if (j < i) first = false; else more = true;
    }
    if (first && more && (c += cr.setMax(set)) > cr.knee) return true;
  }
  return false;
}

// a dominates b (a comes first in the slot's order, so at least b's points): at least b's points without CHC, no more CHC
// from its main, equal CHC weight or one without CHC substats — the dominance of features/gear/layout critBest (MODEL.md
// §12 item 4) — and not worse on the ties after V (R6.1: Legendary, source cost, holder loss, roster, age): V may come out equal
// once the extra CHC is worth nothing, and then b would win on them
const ties = (c: Cand): number[] => [Number(isLegend(c)), -c.cost, -c.loss, -c.rank, -c.item.ord];
const tiesFirst = (a: Cand, b: Cand): boolean => {
  const ta = ties(a), tb = ties(b);
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return ta[i] > tb[i];
  return true;
};
function critDominates(cr: CritGauge, a: Cand, b: Cand): boolean {
  const fa = cr.facts(a.item.id), fb = cr.facts(b.item.id);
  return fa.non >= fb.non && fa.main <= fb.main + 1e-9 && (fa.w === fb.w || !fa.n || !fb.n) && tiesFirst(a, b);
}
// With a goal (MODEL.md §13) the slot's order by points no longer bounds what the segments are worth, so each stat is
// compared on its own: a's points without its CHC, EFF and SPD segments cover b's, plus what b's extra segments could bring —
// a CHC segment at most its points, an EFF or SPD one its points and the penalty it closes (λ, and the goal's stat moves by
// exactly one segment, no floors); where a has more segments they must be at least as heavy (an extra segment adds between 0
// and its points, the shortfall never grows); the same flat EFF from the main lines (more flat EFF helps below the target and
// pushes the bands above it); flat SPD below b's — the penalty b's extra SPD could close (SPD has no surplus step); no more
// CHC from the main (MODEL.md §12 item 4)
interface Segs { w: number; n: number }
function segsFit(a: Segs, b: Segs, per: number): number | null {
  if (b.n > a.n) return a.n && a.w !== b.w ? null : (b.w + per) * (b.n - a.n) * 1000;
  return b.n && a.w < b.w ? null : 0;
}
function goalDominates(g: Gauge, a: Cand, b: Cand): boolean {
  const ca = g.crit?.facts(a.item.id), cb = g.crit?.facts(b.item.id);
  if (ca && cb && ca.main > cb.main + 1e-9) return false;
  const chc = ca && cb ? segsFit(ca, cb, 0) : 0;
  if (chc === null) return false;
  // the candidates' points (v — with the terms a linear goal folded in) without the segments compared one by one
  let restA = a.v - (ca ? ca.w * ca.n * 1000 : 0), restB = b.v - (cb ? cb.w * cb.n * 1000 : 0), extra = chc;
  for (const x of termsOf(g)) {
    const fa = x.facts(a.item.id), fb = x.facts(b.item.id);
    if (x.kind === 'eff' && fa.flat !== fb.flat) return false;
    const e = segsFit(fa, fb, LAMBDA);
    if (e === null) return false;
    extra += e + (x.kind === 'spd' ? Math.max(0, fb.flat - fa.flat) * SPD_MILLI : 0);
    restA -= fa.w * fa.n * 1000; restB -= fb.w * fb.n * 1000;
  }
  return restA >= restB + extra - 1e-6 && tiesFirst(a, b);
}
const dominates = (g: Gauge, a: Cand, b: Cand): boolean => (termsOf(g).length ? goalDominates(g, a, b) : critDominates(g.crit!, a, b));
function front(g: Gauge, sorted: readonly Cand[]): Cand[] {
  const out: Cand[] = [];
  for (const c of sorted) if (!out.some((a) => dominates(g, a, c))) out.push(c);
  return out;
}
const byOrder = (better: (a: Cand, z: Cand) => boolean) => (a: Cand, z: Cand) => (better(a, z) ? -1 : better(z, a) ? 1 : 0);

// The kit when crit binds: weapon and accessory — the top-rank candidates' front joins the search (an accessory's CHC
// main and CHC substats change what armor CHC is worth); armor — the front per (set, T4). Branch and bound on the plain
// V (the crit loss only lowers it); every kit is compared by keyOf / cmpKit, so ties follow R6.1 as everywhere
function critKit(g: Gauge, cands: Cands, fix: Fix): Kit {
  const terms = termsOf(g);
  const gear = GEAR_SLOTS.map((slot): (Cand | null)[] => {
    if (slot in fix) return [fix[slot] ?? null];
    const list = cands[slot] ?? [];
    if (!list.length) return [null];
    const top = Math.max(...list.map((c) => FIT[c.fit]));
    return front(g, list.filter((c) => FIT[c.fit] === top).sort(byOrder(betterGear)));
  });
  const opts = ARMOR_SLOTS.map((slot): (Cand | null)[] => {
    if (slot in fix) return [fix[slot] ?? null];
    const byKey = new Map<string, Cand[]>();
    for (const c of cands[slot] ?? []) { const k = `${c.item.set}:${c.item.t4}`; byKey.set(k, [...(byKey.get(k) ?? []), c]); }
    const keep = [...byKey.values()].flatMap((xs) => front(g, xs.sort(byOrder(betterInSlot))));
    // with a goal the pieces rich in what the goals count first: a strong kit early cuts more
    const by = (c: Cand) => c.v + terms.reduce((s, x) => s + x.b(c.item.id), 0);
    return [...keep.sort((a, z) => by(z) - by(a)), null];
  });
  const sets = new Map<string, number>();
  for (const o of opts) for (const c of o) if (c?.item.set && !sets.has(c.item.set)) sets.set(c.item.set, sets.size);
  const names = [...sets.keys()];
  const S = sets.size;
  const memo = new Float64Array(S * 25).fill(NaN);
  const bonus = (s: number, n: number, n4: number) => {
    const i = s * 25 + n * 5 + n4;
    if (Number.isNaN(memo[i])) memo[i] = g.bonus(names[s], n, n4).v;
    return memo[i];
  };
  let b2 = 0, b3 = 0, b4 = 0;
  for (let s = 0; s < S; s++) for (let n4 = 0; n4 <= 4; n4++) {
    if (n4 <= 2) b2 = Math.max(b2, bonus(s, 2, n4));
    if (n4 <= 3) b3 = Math.max(b3, bonus(s, 3, n4));
    b4 = Math.max(b4, bonus(s, 4, n4));
  }
  const setCap = Math.max(0, b4, b3, 2 * b2);
  const restMax = [0, 0, 0, 0, 0], restFill = [0, 0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) {
    restMax[i] = restMax[i + 1] + Math.max(0, ...opts[i].map((c) => c?.v ?? 0));
    restFill[i] = restFill[i + 1] + (opts[i].some((c) => !!c) ? 1 : 0);
  }
  // The goals (MODEL.md §13): for every kit V' ≤ points − Σ shortfalls, shortfall = a − Σ b − Σ r (≤ 0 once a target is
  // reached, and the EFF surplus only lowers V'). All are sums over the slots, so a branch is bounded by the smallest of the
  // plain bound and, for every set of goals (masks), its points + their b at their best per slot − their a + the most their
  // rows take off: a branch of kits without EFF or SPD carries the whole penalty (without this nothing is cut for a member far
  // below the target)
  const masks = Array.from({ length: (1 << terms.length) - 1 }, (_, i) => i + 1);
  const unit = (c: Cand | null, m: number): number => (c ? terms.reduce((s, x, k) => s + (m >> k & 1 ? x.b(c.item.id) : 0), 0) : 0);
  const restVU = masks.map((m) => {
    const r = [0, 0, 0, 0, 0];
    for (let i = 3; i >= 0; i--) r[i] = r[i + 1] + Math.max(0, ...opts[i].map((c) => (c ? c.v + unit(c, m) : 0)));
    return r;
  });
  const fixed = masks.map((m) => terms.reduce((s, x, k) => s + (m >> k & 1 ? x.rMax - x.a : 0), 0));
  // the most V' a branch can reach: lin — its plain bound; u — Σ b so far per mask; i — the first armor slot left
  const cap = (lin: number, u: readonly number[], i: number): number => {
    let r = lin;
    for (let j = 0; j < masks.length; j++) r = Math.min(r, lin - restMax[i] + restVU[j][i] + u[j] + fixed[j]);
    return r;
  };
  const cnt = new Int8Array(S), cnt4 = new Int8Array(S);
  const cur: (Cand | null)[] = [null, null, null, null];
  let best: Kit | null = null;
  let vSum = 0, filled = 0, gearV = 0, gearN = 0;
  const uSum = masks.map(() => 0), gearU = masks.map(() => 0);
  const uNow = masks.map(() => 0);
  const uAt = () => { for (let j = 0; j < masks.length; j++) uNow[j] = gearU[j] + uSum[j]; return uNow; };
  let g2: (Cand | null)[] = [null, null];
  const leaf = () => {
    let lin = gearV + vSum;
    for (let s = 0; s < S; s++) if (cnt[s] >= 2) lin += bonus(s, cnt[s], cnt4[s]);
    if (best && cap(lin, uAt(), 4) < best.key.total) return; // the crit loss and the goals only lower V
    const slots: Partial<Record<SlotId, Cand>> = {};
    GEAR_SLOTS.forEach((slot, i) => { const c = g2[i]; if (c) slots[slot] = c; });
    ARMOR_SLOTS.forEach((slot, i) => { const c = cur[i]; if (c) slots[slot] = c; });
    const key = keyOf(g, slots);
    if (!best || cmpKit(key, best.key) > 0) best = { slots, key };
  };
  // The most the sets can be worth once the armor slots left are filled: the sets begun get some of them, at most two new
  // sets get the rest (2 + 2); a T4 piece may come in each slot left. Tighter than setCap — the sets are much of V and the
  // branch already knows which ones it started (memo by the counts)
  const val = (s: number, n: number, n4: number) => (n >= 2 ? bonus(s, Math.min(4, n), Math.min(n4, n, 4)) : 0);
  const fresh = [0, 0, 0, 0, 0]; // the most one new set is worth on k pieces
  for (let k = 2; k <= 4; k++) for (let s = 0; s < S; s++) for (let n4 = 0; n4 <= k; n4++) fresh[k] = Math.max(fresh[k], val(s, k, n4));
  const setsMemo = new Map<string, number>();
  const setUp = (left: number): number => {
    let key = `${left}`;
    for (let s = 0; s < S; s++) if (cnt[s]) key += `|${s}:${cnt[s]}:${cnt4[s]}`;
    let r = setsMemo.get(key);
    if (r !== undefined) return r;
    // best[k] — the most the sets begun are worth with k of the slots left given to them
    let bestK = [0];
    for (let s = 0; s < S; s++) {
      if (!cnt[s]) continue;
      const own = Array.from({ length: left + 1 }, (_, k) => Math.max(...Array.from({ length: k + 1 }, (_, t) => val(s, cnt[s] + k, cnt4[s] + t))));
      const next: number[] = [];
      for (let a = 0; a < bestK.length; a++) for (let k = 0; a + k <= left; k++) next[a + k] = Math.max(next[a + k] ?? -Infinity, bestK[a] + own[k]);
      bestK = next;
    }
    r = 0;
    for (let a = 0; a < bestK.length; a++) {
      if (bestK[a] === undefined) continue;
      const rest = left - a;
      // the new sets: one on any k = 2…rest pieces (a set may be worth less on more), or two on 2 + 2
      const extra = Math.max(0, ...fresh.slice(2, rest + 1), rest >= 4 ? 2 * fresh[2] : 0);
      r = Math.max(r, bestK[a] + extra);
    }
    setsMemo.set(key, r);
    return r;
  };
  const hopeless = (i: number): boolean => {
    if (!best) return false;
    const d = cap(gearV + vSum + restMax[i] + Math.min(setCap, setUp(4 - i)), uAt(), i) - best.key.total || gearN + filled + restFill[i] - best.key.filled;
    return d < 0;
  };
  const walk = (i: number) => {
    if (i === 4) { leaf(); return; }
    if (hopeless(i)) return;
    for (const c of opts[i]) {
      cur[i] = c;
      const s = c?.item.set ? sets.get(c.item.set)! : -1;
      if (c) { vSum += c.v; filled++; for (let j = 0; j < masks.length; j++) uSum[j] += unit(c, masks[j]); if (s >= 0) { cnt[s]++; if (c.item.t4) cnt4[s]++; } }
      walk(i + 1);
      if (c) { vSum -= c.v; filled--; for (let j = 0; j < masks.length; j++) uSum[j] -= unit(c, masks[j]); if (s >= 0) { cnt[s]--; if (c.item.t4) cnt4[s]--; } }
    }
    cur[i] = null;
  };
  for (const w of gear[0]) for (const a of gear[1]) {
    g2 = [w, a];
    for (let j = 0; j < masks.length; j++) gearU[j] = unit(w, masks[j]) + unit(a, masks[j]);
    gearV = (w?.v ?? 0) + (a?.v ?? 0);
    gearN = (w ? 1 : 0) + (a ? 1 : 0);
    walk(0);
  }
  return best!;
}
