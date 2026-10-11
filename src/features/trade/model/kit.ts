// Лучший комплект получателя (R6.1; польза — как у лучшей раскладки, MODEL.md §3) из кандидатов — то, что
// приложение собрало бы по его заказу, если бы все кандидаты лежали в его пуле (features/gear/layout bestLayout):
// оружие и аксессуар — по слоту (ранг, потом очки), броня — перебор слотов, максимум V.
// Слоты независимы по пользе и по ничьим (суммы и порядок по слотам), поэтому лучшее по частям = лучшее целиком.
// Отсечение брони точное: в слоте из вещей одного ключа (сет, T4) остаётся лучшая по (очки, цена, потеря, ростер,
// старшинство) — сеты и их ценность у них одни и те же. Мягкий потолок крита (MODEL.md crit) связывает слоты: когда крит
// получателя может дойти до колена с этими кандидатами, работает critKit — как critBest лучшей раскладки.
import type { SlotId } from '@/game/data/types';
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

// The plain search first: a plain best that loses nothing to crit is the best with it too (no kit is worth more than its
// plain V; the plain search settled the ties among the plain maxima). Otherwise, if crit can bind, critKit
export function bestKit(g: Gauge, cands: Cands, fix: Fix = {}): Kit {
  const plain = plainKit(g, cands, fix);
  if (!g.crit || !critMayLose(g.crit, plain.slots) || !g.crit.loss(SLOT_ORDER.flatMap((s) => (plain.slots[s] ? [plain.slots[s]!.item.id] : [])))) return plain;
  return g.crit.binds(idsOf(cands, fix)) ? critKit(g, cands, fix) : plain;
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
// вычетом потери крита (MODEL.md crit): она зависит от всего комплекта сразу
export function keyOf(g: Gauge, slots: Partial<Record<SlotId, Cand>>): KitKey {
  const k = armorKey(g, ARMOR_SLOTS.map((s) => slots[s] ?? null));
  if (g.crit && critMayLose(g.crit, slots)) {
    k.crit = g.crit.loss(SLOT_ORDER.flatMap((s) => (slots[s] ? [slots[s]!.item.id] : [])));
    k.total -= k.crit;
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
  for (const s of SLOT_ORDER) c += slots[s]?.item.chc ?? 0;
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

// every item the search may take: candidates of open slots and the fixed ones
function idsOf(cands: Cands, fix: Fix): string[] {
  const out: string[] = [];
  for (const slot of SLOT_ORDER) {
    if (slot in fix) { const f = fix[slot]; if (f) out.push(f.item.id); continue; }
    for (const c of cands[slot] ?? []) out.push(c.item.id);
  }
  return out;
}

// a dominates b (a comes first in the slot's order, so at least b's points): at least b's points without CHC, no more CHC
// from its main, equal CHC weight or one without CHC substats — the dominance of features/gear/layout critBest (MODEL.md
// crit) — and not worse on the ties after V (R6.1: Legendary, source cost, holder loss, roster, age): V may come out equal
// once the extra CHC is worth nothing, and then b would win on them
const ties = (c: Cand): number[] => [Number(isLegend(c)), -c.cost, -c.loss, -c.rank, -c.item.ord];
function dominates(cr: CritGauge, a: Cand, b: Cand): boolean {
  const fa = cr.facts(a.item.id), fb = cr.facts(b.item.id);
  if (!(fa.non >= fb.non && fa.main <= fb.main + 1e-9 && (fa.w === fb.w || !fa.n || !fb.n))) return false;
  const ta = ties(a), tb = ties(b);
  for (let i = 0; i < ta.length; i++) if (ta[i] !== tb[i]) return ta[i] > tb[i];
  return true;
}
function front(cr: CritGauge, sorted: readonly Cand[]): Cand[] {
  const out: Cand[] = [];
  for (const c of sorted) if (!out.some((a) => dominates(cr, a, c))) out.push(c);
  return out;
}
const byOrder = (better: (a: Cand, z: Cand) => boolean) => (a: Cand, z: Cand) => (better(a, z) ? -1 : better(z, a) ? 1 : 0);

// The kit when crit binds: weapon and accessory — the top-rank candidates' front joins the search (an accessory's CHC
// main and CHC substats change what armor CHC is worth); armor — the front per (set, T4). Branch and bound on the plain
// V (the crit loss only lowers it); every kit is compared by keyOf / cmpKit, so ties follow R6.1 as everywhere
function critKit(g: Gauge, cands: Cands, fix: Fix): Kit {
  const cr = g.crit!;
  const gear = GEAR_SLOTS.map((slot): (Cand | null)[] => {
    if (slot in fix) return [fix[slot] ?? null];
    const list = cands[slot] ?? [];
    if (!list.length) return [null];
    const top = Math.max(...list.map((c) => FIT[c.fit]));
    return front(cr, list.filter((c) => FIT[c.fit] === top).sort(byOrder(betterGear)));
  });
  const opts = ARMOR_SLOTS.map((slot): (Cand | null)[] => {
    if (slot in fix) return [fix[slot] ?? null];
    const byKey = new Map<string, Cand[]>();
    for (const c of cands[slot] ?? []) { const k = `${c.item.set}:${c.item.t4}`; byKey.set(k, [...(byKey.get(k) ?? []), c]); }
    const keep = [...byKey.values()].flatMap((xs) => front(cr, xs.sort(byOrder(betterInSlot))));
    return [...keep.sort((a, z) => z.v - a.v), null];
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
    restMax[i] = restMax[i + 1] + Math.max(0, opts[i][0]?.v ?? 0);
    restFill[i] = restFill[i + 1] + (opts[i].some((c) => !!c) ? 1 : 0);
  }
  const cnt = new Int8Array(S), cnt4 = new Int8Array(S);
  const cur: (Cand | null)[] = [null, null, null, null];
  let best: Kit | null = null;
  let vSum = 0, filled = 0, gearV = 0, gearN = 0;
  let g2: (Cand | null)[] = [null, null];
  const leaf = () => {
    let lin = gearV + vSum;
    for (let s = 0; s < S; s++) if (cnt[s] >= 2) lin += bonus(s, cnt[s], cnt4[s]);
    if (best && lin < best.key.total) return; // the crit loss only lowers V
    const slots: Partial<Record<SlotId, Cand>> = {};
    GEAR_SLOTS.forEach((slot, i) => { const c = g2[i]; if (c) slots[slot] = c; });
    ARMOR_SLOTS.forEach((slot, i) => { const c = cur[i]; if (c) slots[slot] = c; });
    const key = keyOf(g, slots);
    if (!best || cmpKit(key, best.key) > 0) best = { slots, key };
  };
  const hopeless = (i: number): boolean => {
    if (!best) return false;
    const d = gearV + vSum + restMax[i] + setCap - best.key.total || gearN + filled + restFill[i] - best.key.filled;
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
  for (const w of gear[0]) for (const a of gear[1]) {
    g2 = [w, a];
    gearV = (w?.v ?? 0) + (a?.v ?? 0);
    gearN = (w ? 1 : 0) + (a ? 1 : 0);
    walk(0);
  }
  return best!;
}
