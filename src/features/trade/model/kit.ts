// Лучший комплект получателя (R6.1, порядок R2.5) из кандидатов — то, что приложение собрало бы по его мерилу, если бы
// все кандидаты лежали в его пуле (features/gear/pool search): оружие и аксессуар — по слоту (сетов нет), броня — перебор слотов.
// Слоты независимы по пользе и по ничьим (суммы и порядок по слотам), поэтому лучшее по частям = лучшее целиком.
// Отсечение брони точное: в слоте из вещей одного ключа (сет, T4) остаётся лучшая по (очки, цена, потеря, ростер,
// старшинство) — сеты и бонусы у них одни и те же.
import type { SlotId } from '@/game/data/types';
import { ARMOR_SLOTS, cmpKit, GEAR_SLOTS, SLOT_ORDER, type Cand, type Cands, type Fit, type Gauge, type Kit, type KitKey } from './model';

const FIT: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };
const EMPTY = Number.POSITIVE_INFINITY; // ранг и номер пустого слота — после любых вещей

// вещь a лучше z в одном слоте при тех же сетах: очки, цена источника, потеря держателя, ростер, старшинство
const betterInSlot = (a: Cand, z: Cand) =>
  a.v !== z.v ? a.v > z.v : a.cost !== z.cost ? a.cost < z.cost : a.loss !== z.loss ? a.loss < z.loss
    : a.rank !== z.rank ? a.rank < z.rank : a.item.ord < z.item.ord;
// оружие и аксессуар: сначала рекомендованность (R2.4)
const betterGear = (a: Cand, z: Cand) => (FIT[a.fit] !== FIT[z.fit] ? FIT[a.fit] > FIT[z.fit] : betterInSlot(a, z));

// fix — слоты, заданные заранее (порог, этап 2): вещь или null (слот пуст)
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

// Перебор брони с ветвями и границами (IMPL-NOTES п. 3): граница пользы — независимые верхние оценки hard, live, soft,
// очков и заполненных слотов; ветка отбрасывается, только если граница строго хуже лучшего (ничьи решают R6.1).
// Бонусы сетов в границе — наибольшие возможные на четырёх слотах, без допущения, что бонус растёт с числом вещей
function bestArmor(g: Gauge, cands: Cands, fix: Fix): (Cand | null)[] {
  const opts = ARMOR_SLOTS.map((slot) => armorOptions(cands, fix, slot).sort((a, z) => (z?.v ?? -1) - (a?.v ?? -1)));
  const sets = new Map<string, number>();
  for (const o of opts) for (const c of o) if (c?.item.set && !sets.has(c.item.set)) sets.set(c.item.set, sets.size);
  const S = sets.size;
  const memo = new Float64Array(S * 25).fill(NaN), tops = new Int8Array(S * 25);
  const bonus = (s: number, n: number, n4: number) => {
    const i = s * 25 + n * 5 + n4;
    if (Number.isNaN(memo[i])) { const b = g.bonus([...sets.keys()][s], n, n4); memo[i] = b.v; tops[i] = b.top; }
    return i;
  };
  // наибольшие бонусы: одного сета на 2, 3, 4 вещах — граница бонусов на четырёх слотах
  let b2 = 0, b3 = 0, b4 = 0;
  for (let s = 0; s < S; s++) for (let n4 = 0; n4 <= 4; n4++) {
    if (n4 <= 2) b2 = Math.max(b2, memo[bonus(s, 2, n4)]);
    if (n4 <= 3) b3 = Math.max(b3, memo[bonus(s, 3, n4)]);
    b4 = Math.max(b4, memo[bonus(s, 4, n4)]);
  }
  const bonusCap = Math.max(0, b4, b3, 2 * b2);
  const parts = g.parts.map((p) => ({ s: sets.get(p.set) ?? -1, n: p.n, conv: p.conv }));
  const hardRoom = parts.filter((p) => !p.conv).reduce((n, p) => n + p.n, 0);
  const softRoom = parts.filter((p) => p.conv).reduce((n, p) => n + p.n - 1, 0);
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

  const use = (): { hard: number; live: number; soft: number } => {
    let hard = 0, live = 0, soft = 0;
    for (const p of parts) {
      const k = p.s < 0 ? 0 : cnt[p.s];
      if (p.conv) soft += Math.min(k, p.n - 1);
      else {
        hard += Math.min(k, p.n);
        if (k >= 2 && tops[bonus(p.s, k, cnt4[p.s])] >= p.n) live++;
      }
    }
    return { hard, live, soft };
  };
  const leaf = () => {
    let total = vSum;
    for (let s = 0; s < S; s++) if (cnt[s] >= 2) total += memo[bonus(s, cnt[s], cnt4[s])];
    const u = use();
    if (best) {
      const d = u.hard - best.hard || u.live - best.live || u.soft - best.soft || total - best.total || filled - best.filled;
      if (d < 0) return;
      if (d === 0) {
        const k = armorKey(g, cur);
        if (cmpKit(k, best) <= 0) return;
        best = k; top = [...cur]; return;
      }
    }
    best = armorKey(g, cur); top = [...cur];
  };
  // граница: может ли ветка с i заполненными слотами догнать лучший
  const hopeless = (i: number): boolean => {
    if (!best) return false;
    const left = 4 - i;
    let hard = 0, soft = 0, live = 0, hardGap = 0, softGap = 0;
    for (const p of parts) {
      const k = p.s < 0 ? 0 : cnt[p.s];
      if (p.conv) { soft += Math.min(k, p.n - 1); softGap += Math.max(0, p.n - 1 - k); }
      else { hard += Math.min(k, p.n); hardGap += Math.max(0, p.n - k); if (k + left >= p.n) live++; }
    }
    const hardUB = hard + Math.min(left, hardGap, hardRoom), softUB = soft + Math.min(left, softGap, softRoom);
    const totalUB = vSum + restMax[i] + bonusCap, fillUB = filled + restFill[i];
    const d = hardUB - best.hard || live - best.live || softUB - best.soft || totalUB - best.total || fillUB - best.filled;
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

// ключ брони: связка, бонусы сетов, очки, ничьи
function armorKey(g: Gauge, arm: readonly (Cand | null)[]): KitKey {
  const n = new Map<string, number>(), n4 = new Map<string, number>();
  let total = 0, filled = 0, cost = 0, loss = 0;
  const ranks: number[] = [], ords: number[] = [];
  for (const c of arm) {
    if (!c) { ranks.push(EMPTY); ords.push(EMPTY); continue; }
    total += c.v; filled++; cost += c.cost; loss += c.loss;
    ranks.push(c.rank); ords.push(c.item.ord);
    const s = c.item.set;
    if (s) { n.set(s, (n.get(s) ?? 0) + 1); if (c.item.t4) n4.set(s, (n4.get(s) ?? 0) + 1); }
  }
  const top = new Map<string, number>();
  for (const [s, k] of n) {
    if (k < 2) continue;
    const b = g.bonus(s, k, n4.get(s) ?? 0);
    total += b.v;
    top.set(s, b.top);
  }
  let hard = 0, live = 0, soft = 0;
  for (const p of g.parts) {
    const k = n.get(p.set) ?? 0;
    if (p.conv) soft += Math.min(k, p.n - 1);
    else { hard += Math.min(k, p.n); if ((top.get(p.set) ?? 0) >= p.n) live++; }
  }
  return { hard, live, soft, rec: 0, stop: 0, total, filled, cost, loss, ranks, ords };
}

// ключ всего комплекта (R2.5 + ничьи R6.1) — для сравнения комплектов везде (порог, команда, дыры)
export function keyOf(g: Gauge, slots: Partial<Record<SlotId, Cand>>): KitKey {
  const k = armorKey(g, ARMOR_SLOTS.map((s) => slots[s] ?? null));
  const ranks: number[] = [], ords: number[] = [];
  let rec = 0, stop = 0;
  for (const slot of GEAR_SLOTS) {
    const c = slots[slot];
    ranks.push(c ? c.rank : EMPTY); ords.push(c ? c.item.ord : EMPTY);
    if (!c) continue;
    if (c.fit === 'rec') rec++; else if (c.fit === 'stopgap') stop++;
    k.total += c.v; k.filled++; k.cost += c.cost; k.loss += c.loss;
  }
  return { ...k, rec, stop, ranks: [...ranks, ...k.ranks], ords: [...ords, ...k.ords] };
}

export const kitSlots = (k: Kit): SlotId[] => SLOT_ORDER.filter((s) => !!k.slots[s]);
