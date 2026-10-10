// Лучший комплект получателя (R6.1; польза — как у лучшей раскладки, MODEL.md §3) из кандидатов — то, что
// приложение собрало бы по его заказу, если бы все кандидаты лежали в его пуле (features/gear/layout bestLayout):
// оружие и аксессуар — по слоту (ранг, потом очки), броня — перебор слотов, максимум V.
// Слоты независимы по пользе и по ничьим (суммы и порядок по слотам), поэтому лучшее по частям = лучшее целиком.
// Отсечение брони точное: в слоте из вещей одного ключа (сет, T4) остаётся лучшая по (очки, цена, потеря, ростер,
// старшинство) — сеты и их ценность у них одни и те же.
import type { SlotId } from '@/game/data/types';
import { ARMOR_SLOTS, cmpKit, GEAR_SLOTS, isLegend, type Cand, type Cands, type Fit, type Gauge, type Kit, type KitKey } from './model';

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

export function bestKit(g: Gauge, cands: Cands, fix: Fix = {}): Kit {
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
  return { rank: 0, total, pts, halves, eff, filled, legends, cost, loss, ranks, ords };
}

// ключ всего комплекта (польза MODEL.md §3 + ничьи R6.1) — для сравнения комплектов везде (порог, команда, дыры)
export function keyOf(g: Gauge, slots: Partial<Record<SlotId, Cand>>): KitKey {
  const k = armorKey(g, ARMOR_SLOTS.map((s) => slots[s] ?? null));
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

