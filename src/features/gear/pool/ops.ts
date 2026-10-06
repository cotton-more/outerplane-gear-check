// Пул экипировки, операции с пулом — «Надеть», «Убрать», «Вернуть», «Собираю». Что держит пул — info.ts.
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { EMPTY_GEAR, gc, isWorn, newPiece, syncWorn, today, type GearStore, type Mark, type Piece, type Worn } from '@/features/gear/model/gear';
import type { ItemInput } from '@/game/item/item';
import type { PoolStore } from './base';
import { profileFor } from '@/game/build/profile';
import { numOf } from './base';
import { poolInfo } from './info';
import type { PoolView } from './view';

// Что сделало действие с надетым (данные для «Вернуть» — точечно, не снимок worn: снимок затёр бы выбор, сделанный за
// эти секунды): запись id надета на героя в слот slot; wasWorn — что было надето в этом слоте до (null — ничего);
// removed — убранные записи пула (вещи любого слота, которые пул держал, а после — нет); was — пул героя до: «Вернуть»
// ставит убранные на их прежние места
export interface WearResult { st: GearStore; id: string; slot: SlotId; wasWorn: string | null; removed: Piece[]; was: readonly string[] }
// что сделало «Надеть»: новая запись (id, piece) — в пуле и надета в своём слоте; removed — как в planPut (её
// слота — «Заменить», других — строка «Лишнее убрано»). Отметок «Надеть» не ставит (Р19 ушло, В10)
export interface PutResult extends WearResult { piece: Piece }

const poolPieces = (st: GearStore, charId: string) => (st.pools[charId] ?? []).map((id) => st.pieces[id]).filter((p): p is Piece => !!p);
// надеть id на героя в слот (null — снять): пустое надетое героя и пустое поле не храним, порядок ключей прежний
function setWorn(st: GearStore, charId: string, slot: SlotId, id: string | null): GearStore {
  const { [slot]: _, ...rest } = st.worn?.[charId] ?? {};
  const mine: Worn = id ? { ...st.worn?.[charId], [slot]: id } : rest;
  const { [charId]: _c, ...others } = st.worn ?? {};
  const worn = Object.keys(mine).length ? { ...st.worn, [charId]: mine } : others;
  const next: GearStore = { ...st, worn };
  if (!Object.keys(worn).length) delete next.worn;
  return next;
}

// запись, которую заменяет «Надеть» в режиме героя (planPut replace): есть в его пуле и того же слота, иначе нет
export const replaceOf = (mine: readonly Piece[], slot: SlotId, replace?: string | null): Piece | undefined =>
  replace ? mine.find((p) => p.id === replace && p.slot === slot) : undefined;

// Что сделает «Надеть» piece на персонажа — без записи (им же считать подпись «Заменить» / «Надеть»).
// «Надеть» = надел в игре: новая — в пуле и надета в своём слоте (вместо прежней надетой). removed (В1, PLAN Д7) — всё,
// что вытеснило ЭТО «Надеть», в любом слоте: пул держал запись (features/gear/pool/info: надетое, раскладка, лучшие
// сетов, запас), а с новой надетой — нет. Новую не убирает никогда (она надета). Ставшее ненужным раньше не трогаем:
// строка «больше не нужна» и «Убрать у X». Каждую убранную вернёт «Вернуть» (undoPut). worn — надетое героя (слот → id).
// replace — id записи из «Примерить замену» (решение владельца «заменить в любом случае» — (а)): она уходит всегда.
// Записи нет в его пуле (чужая, уже убранная) или она другого слота — как без replace
export interface PutPlan { removed: Piece[] }
export function planPut(ctx: Ctx, c: Char, mine: readonly Piece[], piece: Piece, worn: Readonly<Worn> = {}, replace?: string | null, pin?: string | null): PutPlan {
  const out = replaceOf(mine, piece.slot, replace);
  const P = profileFor(ctx, c, pin);
  if (!P) return { removed: out ? [out] : [] };
  const rest = out ? mine.filter((p) => p !== out) : mine;
  const ids = new Set(mine.map((p) => p.id));
  const on = Object.values(worn).filter((id): id is string => !!id && ids.has(id));
  const before = poolInfo(P, mine, new Set(on));
  const after = poolInfo(P, [...rest, piece], new Set([...on.filter((id) => id !== worn[piece.slot]), piece.id]));
  return { removed: mine.filter((p) => p === out || (before.why.has(p.id) && !after.why.has(p.id))) };
}

// Что сделает «Надеть» вещи с формы на персонажа — по хранилищу вида пула, без записи: от этого подпись «Заменить» /
// «Надеть» (poolVs). Та же новая запись, что создаст putOn (номер — следующий за seq), его надетое
const seqOf = (st: PoolStore) => st.seq ?? Math.max(0, ...Object.keys(st.pieces).map(numOf));
export function planFor(ctx: Ctx, view: PoolView, charId: string, x: ItemInput, replace?: string | null): PutPlan | null {
  const hp = view.hero(charId);
  if (!hp) return null;
  const { piece } = newPiece({ ...EMPTY_GEAR, seq: seqOf(view.st) }, x, '');
  return planPut(ctx, hp.c, hp.pieces, piece, view.st.worn?.[charId], replace, view.st.pin?.[charId]);
}

// Надеть вещь на персонажа (и в режиме героя, и из вердикта): всегда новая запись, даже если у него (или у другого)
// такая же — в Оценку вводят новую вещь из инвентаря (решение владельца 2026-10-01), пулы независимы (В9); она же —
// надетая его слота. Лишнее вытеснит planPut. replace — «Примерить замену» (planPut): эта запись уходит всегда
export function putOn(ctx: Ctx, st: GearStore, charId: string, x: ItemInput, opts: { at?: string; replace?: string | null } = {}): PutResult {
  const c = ctx.idx.CHAR[charId];
  const mine = poolPieces(st, charId);
  const was = st.pools[charId] ?? [];
  const made = newPiece(st, x, opts.at ?? today());
  const { piece } = made;
  const { removed } = c ? planPut(ctx, c, mine, piece, st.worn?.[charId], opts.replace, st.pin?.[charId]) : { removed: [] };
  const gone = new Set(removed.map((p) => p.id));
  const pool = [...was.filter((id) => !gone.has(id)), piece.id];
  const next = gc(setWorn({ ...made.st, pools: { ...made.st.pools, [charId]: pool } }, charId, piece.slot, piece.id));
  return { st: next, id: piece.id, slot: piece.slot, wasWorn: st.worn?.[charId]?.[piece.slot] ?? null, piece, removed, was };
}

// «Отложить для Caren» (решение владельца 2026-10-06): вердикт «Оставь» или запас — вещь в пул героя без отметки «надета»,
// с датой: потом вердикт сравнивает новые вещи с ней и может назвать её материалом. Ничего не убирает. «Вернуть» — undoPut
export function stashOn(st: GearStore, charId: string, x: ItemInput, at = today()): PutResult {
  const was = st.pools[charId] ?? [];
  const made = newPiece(st, x, at);
  const next = { ...made.st, pools: { ...made.st.pools, [charId]: [...was, made.piece.id] } };
  return { st: next, id: made.piece.id, slot: made.piece.slot, wasWorn: st.worn?.[charId]?.[made.piece.slot] ?? null, piece: made.piece, removed: [], was };
}

// «Вернуть» точечно: убранные — обратно (записи, даже если gc их стёр) и на прежние места в пуле (за той вещью, за
// которой стояли до действия); в слоте — снова прежняя надетая, если там всё ещё r.id (иначе слот за эти секунды
// поменяли — не трогаем). pool — пул героя, от которого возвращать
function restoreWear(st: GearStore, charId: string, r: WearResult, pool: string[]): GearStore {
  const pieces = { ...st.pieces };
  for (const p of r.removed) pieces[p.id] ??= p;
  const back = new Set(r.removed.map((p) => p.id).filter((id) => !pool.includes(id)));
  for (const id of r.was.filter((x) => back.has(x))) {
    const i = r.was.indexOf(id);
    const after = r.was.slice(0, i).reverse().find((x) => pool.includes(x));
    pool.splice(after === undefined ? 0 : pool.indexOf(after) + 1, 0, id);
  }
  const next: GearStore = { ...st, pieces, pools: { ...st.pools, [charId]: pool } };
  return gc(st.worn?.[charId]?.[r.slot] === r.id ? setWorn(next, charId, r.slot, r.wasWorn) : next);
}

// «Вернуть» после «Надеть»: вещь — из пула, убранные и надетое её слота — как до «Надеть» (restoreWear): пул байт в
// байт как был, если между ними его не трогали. Её там уже нет (успели убрать) — ничего не трогаем
export function undoPut(st: GearStore, charId: string, r: PutResult): GearStore {
  if (!st.pools[charId]?.includes(r.id)) return st;
  return restoreWear(st, charId, r, st.pools[charId].filter((id) => id !== r.id));
}

// Надеть вещь из пула героя (надел в игре): в её слоте — она, ничего не создаёт. Прежняя надетая слота остаётся в пуле,
// если её держат билды, иначе уходит (как у putOn: removed — для prunedNote и «Вернуть»). Записи нет в его пуле или
// она уже надета — null
export function wearFromPool(ctx: Ctx, st: GearStore, charId: string, id: string): WearResult | null {
  const p = st.pieces[id];
  if (!p || !st.pools[charId]?.includes(id) || isWorn(st, charId, p)) return null;
  const c = ctx.idx.CHAR[charId];
  const old = st.worn?.[charId]?.[p.slot] ?? null;
  // убыть может только прежняя надетая её слота — если пул её больше не держит (features/gear/pool/info)
  const P = c ? profileFor(ctx, c, st.pin?.[charId]) : null;
  const on = new Set([...Object.values({ ...st.worn?.[charId], [p.slot]: id })].filter((x): x is string => !!x));
  const gone = P && old && !poolInfo(P, poolPieces(st, charId), on).why.has(old) ? old : null;
  const was = st.pools[charId];
  const removed = gone ? [st.pieces[gone]] : [];
  const next = gc(setWorn({ ...st, pools: { ...st.pools, [charId]: was.filter((x) => x !== gone) } }, charId, p.slot, id));
  return { st: next, id, slot: p.slot, wasWorn: old, removed, was };
}
// «Вернуть» после wearFromPool: прежняя надетая — снова надета и на своём месте в пуле (restoreWear)
export const undoWear = (st: GearStore, charId: string, r: WearResult): GearStore => restoreWear(st, charId, r, [...(st.pools[charId] ?? [])]);

// «Да, всё надето»: в пуле героя не больше одной вещи на слот (пустые слоты — можно) и на нём ничего не надето — надеть
// всё. Иначе — null. worn — что надето этим (для «Вернуть»)
export interface WearAllResult { st: GearStore; worn: Worn }
export function wearAll(st: GearStore, charId: string): WearAllResult | null {
  const pool = st.pools[charId] ?? [];
  if (!pool.length || Object.keys(st.worn?.[charId] ?? {}).length) return null;
  const worn: Worn = {};
  for (const id of pool) {
    const p = st.pieces[id];
    if (!p) continue;
    if (worn[p.slot]) return null;
    worn[p.slot] = id;
  }
  return { st: syncWorn({ ...st, worn: { ...st.worn, [charId]: worn } }), worn };
}
// «Вернуть» после wearAll: снять только то, что надето им и всё ещё надето (выбор за эти секунды не трогаем)
export function undoWearAll(st: GearStore, charId: string, r: WearAllResult): GearStore {
  let next = st;
  for (const [slot, id] of Object.entries(r.worn) as [SlotId, string][]) if (next.worn?.[charId]?.[slot] === id) next = setWorn(next, charId, slot, null);
  return next;
}

// «Убрать у Caren»: только из её пула; у других запись остаётся. Надетая на ней — больше не надета (gc). undo — «Вернуть»
export function removeFrom(st: GearStore, charId: string, id: string): GearStore {
  if (!st.pools[charId]?.includes(id)) return st;
  return gc({ ...st, pools: { ...st.pools, [charId]: st.pools[charId].filter((x) => x !== id) } });
}
// «Вернуть» после «Убрать»: запись и её место в пулах этих персонажей — обратно (кто уже снова её держит — не трогаем).
// wornBy — на ком из них она была надета (isWorn до «Убрать»): снова надета в своём слоте, если слот за эти секунды не
// заняли. aims — выбранный билд тех, у кого «Убрать» опустошило пул (gc его снял): снова выбран, если за эти секунды
// не выбрали другой. Только это — не снимок worn и aim целиком: он затёр бы выбор, сделанный после «Убрать»
export function undoRemove(st: GearStore, piece: Piece, holders: readonly string[], wornBy: readonly string[] = [], aims: Readonly<Record<string, string>> = {}): GearStore {
  const pools = { ...st.pools };
  for (const c of holders) if (!pools[c]?.includes(piece.id)) pools[c] = [...(pools[c] ?? []), piece.id];
  const next: GearStore = { ...st, pieces: { ...st.pieces, [piece.id]: st.pieces[piece.id] ?? piece }, pools };
  for (const c of wornBy) {
    if (!holders.includes(c) || next.worn?.[c]?.[piece.slot]) continue;
    next.worn = { ...next.worn, [c]: { ...next.worn?.[c], [piece.slot]: piece.id } };
  }
  for (const [c, key] of Object.entries(aims)) if (holders.includes(c) && next.aim?.[c] === undefined) next.aim = { ...next.aim, [c]: key };
  return syncWorn(next);
}
// «Убрать у Caren» вместе с данными для «Вернуть» (снять до записи): надета ли она на ней и, если это последняя вещь,
// её выбранный билд
export function removeUndo(st: GearStore, charId: string, piece: Piece): (x: GearStore) => GearStore {
  const wornBy = isWorn(st, charId, piece) ? [charId] : [];
  const last = st.pools[charId]?.length === 1 && st.pools[charId][0] === piece.id;
  const aim = st.aim?.[charId];
  const aims = last && aim !== undefined ? { [charId]: aim } : {};
  return (x) => undoRemove(x, piece, [charId], wornBy, aims);
}

// «Собираю / Не собираю»: null — снять отметку (вариант собирается сам или нет — по правилам)
export function setMark(st: GearStore, key: string, mark: Mark | null): GearStore {
  const { [key]: _, ...rest } = st.marks ?? {};
  const marks = mark ? { ...rest, [key]: mark } : rest;
  return { ...st, marks };
}
