// Данные для вкладки «Надето», шторки «Билд для X» и экрана «Переодеть» (шаг 4 «Надето»). Только данные — ключи, числа, вещи;
// подписи делает интерфейс. Сборки и бонусы — не новый расчёт: раскладка надетого — assembleFixed (pool), бонусы — bonusRows,
// ценность и выигрыш — как у исхода вещи (outcomeOf: итог после замены против надетого, делённый на цену вытесненного),
// «не хватает» и «бонус только на T4» — те же функции, что у карточки билда (BuildGear).
//   - Надетое героя — st.worn[c.id] (записи его пула). Билд героя — aimOf (выбранный или по правилу на лету).
//   - Совет «лучше из своих» считается по сборке, а не парой «вещь против вещи» (vs.against не видит сетов): надетое с
//     заменой слота на вещь раскладки билда из вещей героя против надетого.
//   - Две записи с одинаковым содержимым в игре одна и та же вещь: «надеть» одну вместо другой — не действие.
import { isArmor, SLOTS } from '../data';
import type { ArmorSlot, Char, SetPiece, SlotId } from '../data/types';
import { t4Only } from './builds';
import type { Ctx } from './context';
import { aimOf, type AimShown, type AimWhy } from './aim';
import { pieceInput, type GearStore, type Piece } from './gear';
import { itemMains } from './mains';
import {
  assembleFixed, entriesFor, isStats, LOST_MIN, lostBonusValue, markOfVariant, rowKey, undoWear, wearFromPool,
  type Assembly, type CharPool, type Entry, type WearResult,
} from './pool';
import { subWeights } from './score';
import { bonusRows, bonusWeights, type BonusRow } from './setBonus';
import type { Variant } from './variants';
import { against, MARGIN } from './vs';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
const SLOT_IDS: SlotId[] = SLOTS.map((s) => s.id);

// --------------------------------------------------------------------------- общее: «не хватает» и T4 (и BuildGear)

// слоты брони, которые раскладка отдаёт не под часть связки: куда искать недостающее
export const freeSlots = (a: Pick<Assembly, 'roles'>): ArmorSlot[] => ARMOR.filter((slot) => a.roles[slot] !== 'set');

// «Не хватает»: часть связки, ещё нужно need вещей её сета (в слоты slots; t4 — часть с бонусом только на T4). По достижимой
// сборке (CharPool.reach): что уже есть в пуле, не просим, даже если раскладка ради статов его не взяла
export interface MissingPart { set: string; n: number; have: number; need: number; slots: ArmorSlot[]; t4: boolean }
export function missingParts(ctx: Pick<Ctx, 'idx'>, reach: Pick<Assembly, 'missing' | 'roles'>): MissingPart[] {
  const slots = freeSlots(reach);
  return reach.missing.map((m) => ({ set: m.set, n: m.n, have: m.have, need: m.n - m.have, slots, t4: t4Only(ctx.idx.SET[m.set], m.n) }));
}

// часть связки с бонусом только на T4, а его нет: «Speed — 1 из 2 · бонус ×2 только на T4»
export interface T4Part { set: string; n: number; k: number }
export function t4Parts(ctx: Pick<Ctx, 'idx'>, a: Pick<Assembly, 'v' | 'slots' | 'bonuses'>): T4Part[] {
  const cnt = (set: string) => ARMOR.filter((slot) => a.slots[slot]?.setId === set).length;
  return (a.v.b.sets[0] ?? [])
    .filter((p) => t4Only(ctx.idx.SET[p.set], p.n) && !a.bonuses.some((r) => r.set === p.set && r.n >= p.n))
    .map((p) => ({ set: p.set, n: p.n, k: Math.min(cnt(p.set), p.n) }));
}

// --------------------------------------------------------------------------- общее: надетое и вещи

// надетое героя: слот → запись его пула
function wornPieces(st: Pick<GearStore, 'worn'>, c: Char, cp: Pick<CharPool, 'pieces'>): Partial<Record<SlotId, Piece>> {
  const out: Partial<Record<SlotId, Piece>> = {};
  for (const [slot, id] of Object.entries(st.worn?.[c.id] ?? {}) as [SlotId, string][]) {
    const p = cp.pieces.find((x) => x.id === id);
    if (p) out[slot] = p;
  }
  return out;
}

// та же вещь по содержимому: слот, предмет, сет, main, Breakthrough, сегменты
const stuff = (p: Piece): string =>
  JSON.stringify([p.slot, p.grade, p.setId, p.itemKey, p.main, p.bt, Object.entries(p.lit).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0))]);
const same = (a: Piece, b: Piece): boolean => a.id === b.id || stuff(a) === stuff(b);

const entryMap = (ctx: Ctx, c: Char, v: Variant, cp: Pick<CharPool, 'pieces'>): Map<string, Entry> =>
  new Map(entriesFor(ctx, c, v, cp.pieces).map((e) => [e.id!, e]));
const entriesOf = (m: ReadonlyMap<string, Entry>, worn: Partial<Record<SlotId, Piece>>): Entry[] =>
  Object.values(worn).map((p) => m.get(p.id)).filter((e): e is Entry => !!e);

const combo = (v: Variant | null) => v?.b.sets[0] ?? [];
const variantOf = (cp: Pick<CharPool, 'variants'>, key: string): Variant | null => cp.variants.find((v) => v.key === key) ?? null;
// сколько вещей сета в броне и бонусы по ним — не зависят от билда
const armorOf = (worn: Partial<Record<SlotId, Piece>>): Piece[] => ARMOR.map((s) => worn[s]).filter((p): p is Piece => !!p);
const countSet = (armor: readonly { setId: string | null }[], set: string): number => armor.filter((p) => p.setId === set).length;
const progressOf = (armor: readonly { setId: string | null }[], parts: readonly SetPiece[]): number =>
  parts.reduce((n, p) => n + Math.min(countSet(armor, p.set), p.n), 0);
// бонус части связки включён (как в aim): активная строка её сета не меньше n
const enabled = (rows: readonly BonusRow[], p: SetPiece): boolean => rows.some((r) => r.set === p.set && r.n >= p.n);

// --------------------------------------------------------------------------- вкладка «Надето»

export interface WornToken { key: string; lit: number; credit: number } // credit — как засчитывается стат в цепочке билда: 1, ½, 0
export interface WornAdvice {
  piece: Piece;                // вещь раскладки билда из вещей героя
  delta: number | null;        // выигрыш итога к цене вытесненного (outcomeOf); у пустого слота — null
  up: boolean;                 // «▲»: delta не меньше MARGIN (у оружия и аксессуара — ещё рекомендованная вместо нерекомендованной)
  setOn: SetPiece[];           // части связки, бонус которых с ней включится
  gained: BonusRow[];
  lost: BonusRow[];
}
export interface WornSlot { slot: SlotId; piece: Piece | null; tokens: WornToken[]; advice: WornAdvice | null }
export interface WornView {
  aim: AimShown;               // билд героя (aimOf)
  variant: Variant | null;     // его вариант; null — у героя нет билдов (и «По статам» не из чего собрать)
  count: number;               // надето слотов из 6
  slots: WornSlot[];           // все 6, порядок — SLOTS
  bonuses: BonusRow[];         // бонусы надетых сетов
  set: { k: number; n: number } | null; // «сет k из n» связки билда по надетому; null — у билда связки нет («По статам»)
  t4: T4Part[];                // части связки с бонусом только на T4, пока его нет
  pool: number;                // вещей в пуле героя: «Вещи Valentine · N»
}

export function wornView(ctx: Ctx, c: Char, st: GearStore, cp: CharPool): WornView {
  const aim = aimOf(c, st, cp);
  const variant = variantOf(cp, aim.key);
  const worn = wornPieces(st, c, cp);
  const armor = armorOf(worn);
  const bonuses = bonusRows(ctx.idx.SET, armor);
  const base = { aim, variant, count: Object.keys(worn).length, bonuses, pool: cp.pieces.length };
  if (!variant) {
    return { ...base, slots: SLOTS.map(({ id }) => ({ slot: id, piece: worn[id] ?? null, tokens: tokensOf(ctx, c, null, worn[id]), advice: null })), set: null, t4: [] };
  }
  const em = entryMap(ctx, c, variant, cp);
  const before = assembleFixed(ctx, c, variant, entriesOf(em, worn));
  const layout = cp.asm.get(variant.key)!;
  const parts = combo(variant);
  const slots = SLOTS.map(({ id }): WornSlot => {
    const p = worn[id] ?? null;
    return { slot: id, piece: p, tokens: tokensOf(ctx, c, variant, p), advice: adviceFor(ctx, c, variant, em, worn, before, layout.slots[id]?.piece ?? null, id) };
  });
  return { ...base, slots, set: parts.length ? { k: progressOf(armor, parts), n: parts.reduce((n, p) => n + p.n, 0) } : null, t4: t4Parts(ctx, before) };
}

export function tokensOf(ctx: Ctx, c: Char, v: Variant | null, p: Piece | undefined | null): WornToken[] {
  if (!p) return [];
  const W = v ? subWeights(ctx, v.b, c, itemMains(ctx.idx, pieceInput(p))) : null;
  return Object.keys(p.lit).map((key) => ({ key, lit: p.lit[key], credit: W?.get(key)?.credit ?? 0 }));
}

// Совет по слоту: вещь раскладки билда против надетого (по сборке). Пустой слот — вещь раскладки без выигрыша. Нет совета,
// когда вещь та же (или такая же по содержимому), и когда она не лучше: ни выигрыша от MARGIN, ни включённого бонуса сета
function adviceFor(ctx: Ctx, c: Char, v: Variant, em: ReadonlyMap<string, Entry>, worn: Partial<Record<SlotId, Piece>>, before: Assembly, pick: Piece | null, slot: SlotId): WornAdvice | null {
  if (!pick) return null;
  const old = worn[slot];
  if (!old) return { piece: pick, delta: null, up: false, setOn: [], gained: [], lost: [] };
  if (same(old, pick)) return null;
  const entry = em.get(pick.id), out = em.get(old.id);
  if (!entry) return null;
  const after = assembleFixed(ctx, c, v, entriesOf(em, { ...worn, [slot]: pick }));
  const was = new Set(before.bonuses.map(rowKey)), now = new Set(after.bonuses.map(rowKey));
  const gained = after.bonuses.filter((r) => !was.has(rowKey(r)));
  const lost = before.bonuses.filter((r) => !now.has(rowKey(r)));
  // как outcomeOf: итог после замены минус итог до, на цену вытесненного (вещь и чистая убыль бонусов)
  const lostValue = (out?.v ?? 0) + lostBonusValue(ctx, c, bonusWeights(ctx, c, v.b), lost, gained);
  const delta = out || lost.length ? (after.total - before.total) / Math.max(lostValue, LOST_MIN) : null;
  const rec = !isArmor(slot) && against(ctx, c, v.b, pieceInput(pick), old, entry.fit).why === 'rec';
  const up = rec || (delta ?? 0) >= MARGIN;
  const setOn = combo(v).filter((p) => enabled(after.bonuses, p) && !enabled(before.bonuses, p));
  return up || setOn.length ? { piece: pick, delta, up, setOn, gained, lost } : null;
}

// --------------------------------------------------------------------------- шторка «Билд для X»

export interface AimPart {
  part: SetPiece;
  worn: number;      // надето вещей сета (не больше n)
  owned: number;     // в вещах героя — по достижимой сборке (не больше n)
  missing: number;   // n − owned
  t4: boolean;       // бонус этой части есть только на T4
  on: boolean;       // бонус части сейчас включён надетым
}
export interface AimOption {
  key: string;
  variant: Variant;
  stats: boolean;       // «По статам»
  skip: boolean;        // отмечен «Не собираю»
  now: boolean;         // выбран сейчас (aimOf)
  canRedress: boolean;  // можно переодеть: в вещах героя связки больше, чем надето (или полная); у «По статам» — раскладка отличается от надетого
  parts: AimPart[];     // части связки; у «По статам» пусто
  missing: number;      // Σ missing: «не хватает N»
}

// Порядок: выбранный сейчас, потом настоящие билды (можно переодеть, меньше не хватает, как в списке героя), «По статам»,
// «Не собираю» — последними. Одинаковые для игры варианты (dupOf) — один, первый
export function aimOptions(ctx: Ctx, c: Char, st: GearStore, cp: CharPool): AimOption[] {
  const now = aimOf(c, st, cp).key;
  const worn = wornPieces(st, c, cp);
  const armor = armorOf(worn);
  const rows = bonusRows(ctx.idx.SET, armor);
  const out = cp.variants.filter((v) => v.key === now || !(v.dupOf && cp.variants.some((x) => x.key === v.dupOf))).map((v, i) => {
    const stats = isStats(v);
    const reach = cp.reach.get(v.key) ?? cp.asm.get(v.key)!;
    const parts = stats ? [] : combo(v).map((p): AimPart => {
      const owned = Math.min(countSet(ARMOR.map((s) => reach.slots[s]).filter((e): e is Entry => !!e), p.set), p.n);
      return { part: p, worn: Math.min(countSet(armor, p.set), p.n), owned, missing: p.n - owned, t4: t4Only(ctx.idx.SET[p.set], p.n), on: enabled(rows, p) };
    });
    const canRedress = v.key !== now && (stats
      ? Object.entries(cp.asm.get(v.key)!.slots).some(([slot, e]) => !!e?.piece && !(worn[slot as SlotId] && same(worn[slot as SlotId]!, e.piece)))
      : reach.progress > progressOf(armor, combo(v)));
    const option: AimOption = {
      key: v.key, variant: v, stats, skip: !stats && markOfVariant(cp.opts.marks, v) === 'skip',
      now: v.key === now, canRedress, parts, missing: parts.reduce((n, p) => n + p.missing, 0),
    };
    return { option, i };
  });
  const group = (o: AimOption) => (o.now ? 0 : o.skip ? 3 : o.stats ? 2 : 1);
  return out.sort((a, z) =>
    group(a.option) - group(z.option)
    || Number(z.option.canRedress) - Number(a.option.canRedress)
    || a.option.missing - z.option.missing
    || a.i - z.i).map((x) => x.option);
}

// --------------------------------------------------------------------------- экран «Переодеть»

export interface RedressPlan {
  v: Variant;
  wear: { piece: Piece; replaces: Piece | null }[];  // «Надень из своих»: вещи раскладки варианта, которые не надеты, по слотам (все 6)
  remove: Piece[];                                   // «Снимешь»: надетое, которое заменят вещи из «wear»
  missing: MissingPart[];                            // «Не хватает» (как у BuildGear)
  on: BonusRow[];                                    // бонусы, которые включатся: после «Надеть все», а сейчас нет
  off: BonusRow[];                                   // и которые выключатся
}

export function redressPlan(ctx: Ctx, c: Char, st: GearStore, cp: CharPool, key: string): RedressPlan | null {
  const v = variantOf(cp, key);
  if (!v) return null;
  const layout = cp.asm.get(key)!;
  const worn = wornPieces(st, c, cp);
  const wear: RedressPlan['wear'] = [], remove: Piece[] = [];
  for (const slot of SLOT_IDS) {
    const to = layout.slots[slot]?.piece ?? null, was = worn[slot] ?? null;
    if (was && to && same(was, to)) continue;
    // «Снимешь» — только надетое, которое заменит раскладка; слот без вещи в раскладке остаётся как есть
    if (to) wear.push({ piece: to, replaces: was });
    if (to && was) remove.push(was);
  }
  const wornRows = bonusRows(ctx.idx.SET, armorOf(worn));
  const was = new Set(wornRows.map(rowKey)), will = new Set(layout.bonuses.map(rowKey));
  return {
    v, wear, remove, missing: missingParts(ctx, cp.reach.get(key) ?? layout),
    on: layout.bonuses.filter((r) => !was.has(rowKey(r))), off: wornRows.filter((r) => !will.has(rowKey(r))),
  };
}

// «Надеть все N» на экране «Переодеть»: вещи по очереди (каждая — wearFromPool: прежняя надетая слота уходит, если её не
// держит билд). Не надето ничего — null. results — по порядку, для «Вернуть» (undoWearMany — с конца)
export interface WearManyResult { st: GearStore; results: WearResult[] }
export function wearMany(ctx: Ctx, st: GearStore, charId: string, ids: readonly string[]): WearManyResult | null {
  const results: WearResult[] = [];
  let cur = st;
  for (const id of ids) {
    const r = wearFromPool(ctx, cur, charId, id);
    if (!r) continue;
    results.push(r);
    cur = r.st;
  }
  return results.length ? { st: cur, results } : null;
}
export const undoWearMany = (st: GearStore, charId: string, r: Pick<WearManyResult, 'results'>): GearStore =>
  [...r.results].reverse().reduce((x, one) => undoWear(x, charId, one), st);

// --------------------------------------------------------------------------- причина выбора билда («Билды героев»)

// Что показать как причину выбора по правилу: «first» честно читается «вещей билдов нет» только когда у выбранного билда
// в вещах героя нет ни одной вещи его сетов; иначе ничья с вещами — «tie». Ключ сохранён игроком — null
export type Reason = AimWhy | { kind: 'tie' };
export function reasonOf(cp: Pick<CharPool, 'asm'>, aim: AimShown): Reason | null {
  const w = aim.why;
  if (!w) return null;
  if (w.kind === 'first' && (cp.asm.get(aim.key)?.progress ?? 0) > 0) return { kind: 'tie' };
  return w;
}
