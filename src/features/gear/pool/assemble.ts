// Пул экипировки, сборка — лучшая раскладка варианта из вещей пула (перебор по слотам брони). Обзор и решения — index.ts.
import { isArmor } from '@/game/data';
import type { Char, Combo, SetPiece, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { bonusRows, bonusValue, bonusWeights, convertible, type BonusRow } from '@/game/set/setBonus';
import type { SubWeight } from '@/game/build/score';
import type { ItemInput } from '@/game/item/item';
import type { Variant } from '@/game/build/variants';
import { fit, itemValue, pieceValue, wearable, type Fit } from '@/features/gear/model/vs';
import { ARMOR, GEAR, NEWEST, EPS } from './base';
import { isStats } from './stats';

// вещь в сборке: записанная (piece) или с формы (piece null, id null; Breakthrough — как на форме, ItemInput.bt)
export interface Entry {
  id: string | null;
  piece: Piece | null;
  input: ItemInput;
  slot: SlotId;
  setId: string | null;
  bt: number | null;
  num: number;   // старшинство: номер записи; у вещи с формы — NEWEST
  v: number;     // ценность для варианта (features/gear/model/vs value)
  fit: Fit;
}

export type Role = 'set' | 'surplus' | 'filler' | 'rec' | 'stopgap';

export interface Assembly {
  v: Variant;
  slots: Partial<Record<SlotId, Entry>>;
  roles: Partial<Record<SlotId, Role>>;
  hard: number;         // части связки, которые статом не выразить: Σ min(шт, n)
  live: number;         // …из них дают бонус (Penetration ×2 — только на T4): вещь не с T4 бонус-эффект не отключит
  soft: number;         // части-статы: Σ min(шт, n − 1) — собираются вещь за вещью, последняя — ценностью
  total: number;        // Σ ценности вещей + Σ ценности бонусов (и случайных сетов)
  filled: number;
  older: number;        // Σ старшинства: при равенстве остаётся то, что было
  progress: number;     // Σ min(шт, n) — сколько вещей работает на связку
  need: number;         // Σ n
  complete: SetPiece[]; // собранные части связки (по числу вещей)
  missing: (SetPiece & { have: number })[];
  bonuses: BonusRow[];  // все активные бонусы (и сетов не из связки)
}

// кэш на варианте: веса цепочки для бонусов, переводимость частей, бонусы по (сет, шт, шт на T4)
interface SetInfo { value: number; top: number } // ценность бонусов сета и самая большая активная строка (2, 4; 0 — нет)
export interface VCache { W: Map<string, SubWeight>; conv: Map<string, boolean>; bonus: Map<string, SetInfo> }
const vcache = new WeakMap<Ctx, WeakMap<Variant, VCache>>();
export function vc(ctx: Ctx, c: Char, v: Variant): VCache {
  let m = vcache.get(ctx);
  if (!m) vcache.set(ctx, (m = new WeakMap()));
  let x = m.get(v);
  if (!x) m.set(v, (x = { W: bonusWeights(ctx, c, v.b), conv: new Map(), bonus: new Map() }));
  return x;
}
const isConv = (ctx: Ctx, c: Char, x: VCache, set: string) => {
  let r = x.conv.get(set);
  if (r === undefined) x.conv.set(set, (r = convertible(ctx, c, set)));
  return r;
};
// бонусы одного сета при n вещах, из них n4 на T4
function setInfo(ctx: Ctx, c: Char, x: VCache, set: string, n: number, n4: number): SetInfo {
  const k = `${set}:${n}:${n4}`;
  let r = x.bonus.get(k);
  if (r === undefined) {
    const rows = bonusRows(ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
    r = { value: rows.reduce((s, row) => s + bonusValue(ctx, c, x.W, row), 0), top: Math.max(0, ...rows.map((row) => row.n)) };
    x.bonus.set(k, r);
  }
  return r;
}

// ценность записанной вещи для варианта — один раз на (ctx, вещь, вариант): правка (updateIn) даёт новый объект
const pvMemo = new WeakMap<Ctx, WeakMap<Piece, Map<string, number>>>();
function storedValue(ctx: Ctx, c: Char, v: Variant, p: Piece): number {
  let m = pvMemo.get(ctx);
  if (!m) pvMemo.set(ctx, (m = new WeakMap()));
  let byV = m.get(p);
  if (!byV) m.set(p, (byV = new Map()));
  let r = byV.get(v.key);
  if (r === undefined) byV.set(v.key, (r = pieceValue(ctx, c, v.b, p)));
  return r;
}

// номер записи из id («p12» → 12); не число или не конечное («p1e400») — 0, как у seqOf хранилища (gearStore)
export const numOf = (id: string) => { const n = Number(id.replace(/^\D+/, '')); return Number.isFinite(n) ? n : 0; };
// Вещь не для класса персонажа (vs wearable) — не вещь его сборки: её нет среди кандидатов ни одного варианта
export function entriesFor(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x?: ItemInput | null): Entry[] {
  const out: Entry[] = pieces.filter((p) => wearable(ctx, c, p)).map((p) => ({
    id: p.id, piece: p, input: pieceInput(p), slot: p.slot, setId: p.setId, bt: p.bt, num: numOf(p.id),
    v: storedValue(ctx, c, v, p), fit: fit(ctx, c, v.b, pieceInput(p)),
  }));
  if (x && wearable(ctx, c, x)) out.push({ id: null, piece: null, input: x, slot: x.slot, setId: x.setId, bt: x.bt ?? null, num: NEWEST, v: itemValue(ctx, c, v.b, x), fit: fit(ctx, c, v.b, x) });
  return out;
}

const RANK: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };
export const combo = (v: Variant): Combo => v.b.sets[0] ?? [];

interface Score { hard: number; live: number; soft: number; total: number; filled: number; older: number; progress: number }
// лучше ли a, чем z: hard, live, soft, total, заполненные слоты, старшинство
const better = (a: Score, z: Score) =>
  a.hard !== z.hard ? a.hard > z.hard
    : a.live !== z.live ? a.live > z.live
    : a.soft !== z.soft ? a.soft > z.soft
      : Math.abs(a.total - z.total) > EPS ? a.total > z.total
        : a.filled !== z.filled ? a.filled > z.filled : a.older < z.older;
// достижимая сборка (Р1): больше вещей на связку (Σ min(шт, n)), потом как better
const nearer = (a: Score, z: Score) => (a.progress !== z.progress ? a.progress > z.progress : better(a, z));

// броня: hard, soft и бонусы по сетам четырёх слотов
export function armorScore(ctx: Ctx, c: Char, v: Variant, x: VCache, arm: readonly (Entry | null)[]): Score {
  const n = new Map<string, number>(), n4 = new Map<string, number>();
  let total = 0, filled = 0, older = 0;
  for (const e of arm) {
    if (!e) continue;
    total += e.v; filled++; older += e.num;
    if (e.setId) { n.set(e.setId, (n.get(e.setId) ?? 0) + 1); if (e.bt === 4) n4.set(e.setId, (n4.get(e.setId) ?? 0) + 1); }
  }
  const top = new Map<string, number>();
  for (const [set, k] of n) {
    if (k < 2) continue;
    const info = setInfo(ctx, c, x, set, k, n4.get(set) ?? 0);
    total += info.value;
    top.set(set, info.top);
  }
  let hard = 0, live = 0, soft = 0, progress = 0;
  for (const p of combo(v)) {
    const k = n.get(p.set) ?? 0;
    progress += Math.min(k, p.n);
    if (isConv(ctx, c, x, p.set)) soft += Math.min(k, p.n - 1);
    else { hard += Math.min(k, p.n); if ((top.get(p.set) ?? 0) >= p.n) live++; }
  }
  return { hard, live, soft, total, filled, older, progress };
}

// Лучшая раскладка варианта v из вещей entries. force — эта вещь обязательно в своём слоте (что будет, если надеть).
// Точная: перебор по слотам брони. Отсечение безопасно — в слоте из вещей одного сета с одним «T4 или нет» остаётся
// лучшая по ценности (при равенстве старшая): такие вещи одинаково влияют на связку и бонусы (prune: false — для теста)
export function assemble(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { force?: Entry; prune?: boolean } = {}): Assembly {
  return search(ctx, c, v, entries, opts, false).asm;
}

// Сборка из вещей как есть — по одной на слот (последняя из entries): без перебора и без выбора лучшей. Для надетого героя
// («Надето», features/worn/wearing): те же счёт, бонусы и роли, что у assemble, но раскладку задают вещи, а не поиск
export function assembleFixed(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[]): Assembly {
  const slots: Partial<Record<SlotId, Entry>> = {};
  for (const e of entries) slots[e.slot] = e;
  const s = armorScore(ctx, c, v, vc(ctx, c, v), ARMOR.map((slot) => slots[slot] ?? null));
  const gear = GEAR.map((slot) => slots[slot]).filter((e): e is Entry => !!e);
  return report(ctx, v, slots, {
    ...s, total: s.total + gear.reduce((n, e) => n + e.v, 0), filled: s.filled + gear.length, older: s.older + gear.reduce((n, e) => n + e.num, 0),
  });
}

// Выбранная раскладка и достижимая (Р1): та, где на связку работает больше всего вещей пула — последняя вещь сета-стата
// тоже в счёт, даже если выбранная ради статов её не взяла (Speed ×4 у Caren отдаёт слот Immunity-вещи). По ней —
// «начат» (play, Р14), её вещи пул держит (usedIn). Прогресс не больше, чем у выбранной, — это она же
export function assembleReach(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { prune?: boolean } = {}): { asm: Assembly; reach: Assembly } {
  const r = search(ctx, c, v, entries, opts, true);
  return { asm: r.asm, reach: r.reach ?? r.asm };
}

function search(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { force?: Entry; prune?: boolean }, withReach: boolean): { asm: Assembly; reach: Assembly | null } {
  const { force, prune = true } = opts;
  const x = vc(ctx, c, v);
  const stats = isStats(v);
  const slots: Partial<Record<SlotId, Entry>> = {};
  // оружие и аксессуар: сетов нет — каждый слот сам по себе: рекомендованная > временная > прочее, ценность, старшинство
  let gTotal = 0, gFilled = 0, gOlder = 0;
  for (const slot of GEAR) {
    // вещь с формы не по билду — только в «По статам» и только с полезными ему статами (Р13, допущение (а))
    const cands = force?.slot === slot ? [force] : entries.filter((e) => e.slot === slot && (e.piece || e.fit !== 'no' || (stats && e.v > EPS)));
    let best: Entry | null = null;
    for (const e of cands) {
      if (!best || RANK[e.fit] > RANK[best.fit] || (RANK[e.fit] === RANK[best.fit] && (e.v > best.v + EPS || (Math.abs(e.v - best.v) <= EPS && e.num < best.num)))) best = e;
    }
    if (best) { slots[slot] = best; gTotal += best.v; gFilled++; gOlder += best.num; }
  }
  // броня: кандидаты по слоту (+ пусто)
  const cand = ARMOR.map((slot): (Entry | null)[] => {
    if (force?.slot === slot) return [force];
    const all = entries.filter((e) => e.slot === slot);
    if (!prune) return [null, ...all];
    const best = new Map<string, Entry>();
    for (const e of all) {
      const k = `${e.setId}:${e.bt === 4}`;
      const b = best.get(k);
      if (!b || e.v > b.v + EPS || (Math.abs(e.v - b.v) <= EPS && e.num < b.num)) best.set(k, e);
    }
    return [null, ...best.values()];
  });
  type Top = { arm: (Entry | null)[]; s: Score };
  let top: Top | null = null, near: Top | null = null;
  const cur: (Entry | null)[] = [null, null, null, null];
  const walk = (i: number) => {
    if (i === ARMOR.length) {
      const s = armorScore(ctx, c, v, x, cur);
      if (!top || better(s, top.s)) top = { arm: [...cur], s };
      if (withReach && (!near || nearer(s, near.s))) near = { arm: [...cur], s };
      return;
    }
    for (const e of cand[i]) { cur[i] = e; walk(i + 1); }
  };
  walk(0);
  const out = (t: Top) => {
    const all = { ...slots };
    t.arm.forEach((e, i) => { if (e) all[ARMOR[i]] = e; });
    return report(ctx, v, all, { ...t.s, total: t.s.total + gTotal, filled: t.s.filled + gFilled, older: t.s.older + gOlder });
  };
  const best = top as unknown as Top, reach = near as Top | null;
  const asm = out(best);
  return { asm, reach: reach && reach.s.progress > best.s.progress ? out(reach) : null };
}

function report(ctx: Ctx, v: Variant, slots: Partial<Record<SlotId, Entry>>, s: Score): Assembly {
  const roles: Partial<Record<SlotId, Role>> = {};
  const counted = new Map<string, number>();
  const parts = combo(v);
  for (const slot of [...GEAR, ...ARMOR] as SlotId[]) {
    const e = slots[slot];
    if (!e) continue;
    if (!isArmor(slot)) { roles[slot] = e.fit === 'no' ? 'filler' : e.fit; continue; }
    const part = parts.find((p) => p.set === e.setId);
    if (!part) { roles[slot] = 'filler'; continue; }
    const k = counted.get(part.set) ?? 0;
    roles[slot] = k < part.n ? 'set' : 'surplus';
    counted.set(part.set, k + 1);
  }
  const armor = ARMOR.map((slot) => slots[slot]).filter((e): e is Entry => !!e);
  const cnt = (set: string) => armor.filter((e) => e.setId === set).length;
  return {
    v, slots, roles, ...s,
    progress: parts.reduce((n, p) => n + Math.min(cnt(p.set), p.n), 0),
    need: parts.reduce((n, p) => n + p.n, 0),
    complete: parts.filter((p) => cnt(p.set) >= p.n),
    missing: parts.filter((p) => cnt(p.set) < p.n).map((p) => ({ ...p, have: cnt(p.set) })),
    bonuses: bonusRows(ctx.idx.SET, armor),
  };
}
