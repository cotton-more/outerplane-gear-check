// Экипировка: вещи персонажа (пул, GEARPOOL). Чистые данные и операции — без React и хранилища; билды собираются
// из пула сами (features/gear/pool), операции «Надеть», «Убрать» — там же. Вещь попадает в пул только из оценки («Надеть» в
// вердикте): сегменты (1–6, один уровень) и «T4» — как на форме; сделал в игре Reforge или Breakthrough — правка в
// шторке вещи (updateIn). Enhance не храним: считаем +10. Пулы независимы (В9): «Надеть» всегда кладёт новую запись;
// старая общая запись (из прежних версий) делится, когда её правят у одного героя.
import type { Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import { subAllowed } from '@/game/item/mains';
import { DROP_LEVEL, MAX_LIT, MAX_SUBS, withinCap, type Subs } from '@/game/item/subs';
import { type Bt, type ItemInput } from '@/game/item/item';


export interface Piece {
  id: string;
  slot: SlotId;
  grade: Grade;
  setId: string | null;
  itemKey: string | null;
  main: string | null;
  unlisted?: boolean;
  yellow: Subs;       // тот же уровень, но не выше 4 (newPiece, updateIn): для хранилища и старой вкладки; сравнение не читает
  lit: Subs;          // уровень сабстата 1…6 — сколько горит в игре (жёлтые и оранжевые вместе); по нему сравнение
  bt: Bt | null;      // Breakthrough; null — не указан (запись тех пор, когда форма его не знала, — в игре может быть любым)
  at: string;         // когда надета или изменена, YYYY-MM-DD
}

export type Mark = 'want' | 'skip'; // «Собираю» / «Не собираю»

// Хранилище v2 (GEARPOOL): вещи — у персонажа. pools — id вещей персонажа в порядке добавления; пулы независимы (В9),
// но старая запись (из прежних версий) может быть в пулах нескольких героев — делится при правке (updateIn). marks — «Собираю» / «Не собираю»: ключ — билд целиком
// (buildKey) или вариант связки (buildKey#подпись, game/build/variants). autoNew — варианты, которые после переноса v1
// собираются сами, а в v1 начаты не были: разовая подсказка в карточке. Незнакомые поля (v1builds — билды v1 как
// были, следующая версия) переносятся как есть. worn — что надето на персонаже: слот → id записи его пула (надетое ⊂
// пул, слот записи = ключ; syncWorn). aim — выбранный билд персонажа: ключ варианта (Variant.key, «По статам» —
// charId/#stats); только у героя с пулом. pinned — закреплённые герои «Не отдавать надетое» (обмен, R3): только с пулом.
// Пустых worn, aim и pinned не храним
export type Worn = Partial<Record<SlotId, string>>;
export interface GearStore {
  v: 2;
  seq: number;                        // счётчик id вещей
  pieces: Record<string, Piece>;
  pools: Record<string, string[]>;
  marks?: Record<string, Mark>;
  autoNew?: string[];
  worn?: Record<string, Worn>;
  aim?: Record<string, string>;
  pinned?: string[];
  [extra: string]: unknown;
}

export const EMPTY_GEAR: GearStore = { v: 2, seq: 0, pieces: {}, pools: {} };
export const today = () => new Date().toISOString().slice(0, 10);

// запись как вход сравнения: уровень сабстата — сколько горит (lit), жёлтые и оранжевые вместе (один уровень)
export const pieceInput = (p: Piece): ItemInput =>
  ({ slot: p.slot, grade: p.grade, setId: p.setId, itemKey: p.itemKey, main: p.main, unlisted: p.unlisted, subs: p.lit });

// у кого есть вещи: персонаж → сколько вещей в пуле (кнопка «Обмен» в списке)
export function gearedChars(st: GearStore): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, ids] of Object.entries(st.pools)) if (ids.length) out.set(id, ids.length);
  return out;
}

// у кого в пуле эта запись
export const holdersOf = (st: GearStore, id: string): string[] => Object.keys(st.pools).filter((c) => st.pools[c].includes(id));

// вещи, которых нет ни в одном пуле, из хранилища убираем; пустые пулы — тоже; затем надетое — по пулам (syncWorn)
export function gc(st: GearStore): GearStore {
  const pools = Object.fromEntries(Object.entries(st.pools).filter(([, ids]) => ids.length));
  const used = new Set(Object.values(pools).flat());
  const pieces = Object.fromEntries(Object.entries(st.pieces).filter(([id]) => used.has(id)));
  return syncWorn({ ...st, pieces, pools });
}

// надетое ⊂ пул: из worn — записи не из пула героя, со слотом не того типа, герои без пула и пустые; из aim и pinned —
// герои без пула. Ничего не убрано — то же хранилище; поле опустело — убираем его (пустых не храним)
export function syncWorn(st: GearStore): GearStore {
  if (!st.worn && !st.aim && !st.pinned) return st;
  let cut = false;
  const worn: Record<string, Worn> = {};
  for (const [c, w] of Object.entries(st.worn ?? {})) {
    const pool = st.pools[c] ?? [];
    const all = Object.entries(w ?? {});
    const kept = all.filter(([slot, id]) => typeof id === 'string' && pool.includes(id) && st.pieces[id]?.slot === slot);
    if (kept.length !== all.length || !kept.length) cut = true;
    if (kept.length) worn[c] = Object.fromEntries(kept);
  }
  const aim = Object.fromEntries(Object.entries(st.aim ?? {}).filter(([c]) => st.pools[c]?.length));
  if (Object.keys(aim).length !== Object.keys(st.aim ?? {}).length) cut = true;
  const pinned = (st.pinned ?? []).filter((c) => st.pools[c]?.length);
  if (st.pinned && pinned.length !== st.pinned.length) cut = true;
  if (!cut) return st;
  const next = { ...st };
  if (st.worn) { if (Object.keys(worn).length) next.worn = worn; else delete next.worn; }
  if (st.aim) { if (Object.keys(aim).length) next.aim = aim; else delete next.aim; }
  if (st.pinned) { if (pinned.length) next.pinned = pinned; else delete next.pinned; }
  return next;
}

// «Не отдавать надетое» (обмен, R3): отметка на герое целиком, только у героя с вещами (R3.4)
export const isPinned = (st: GearStore, charId: string): boolean => !!st.pinned?.includes(charId);
// поставить или снять; у героя без пула и когда уже так — то же хранилище
export function setPinned(st: GearStore, charId: string, on: boolean): GearStore {
  if (isPinned(st, charId) === on || (on && !st.pools[charId]?.length)) return st;
  const pinned = on ? [...(st.pinned ?? []), charId] : st.pinned!.filter((c) => c !== charId);
  const { pinned: _, ...rest } = st;
  return pinned.length ? { ...rest, pinned } : rest as GearStore;
}
// строка «Закреплены» (R3.6): в порядке ростера
export const pinnedOf = (st: GearStore, roster: readonly string[]): string[] => roster.filter((c) => isPinned(st, c));
// надета ли запись на этом герое (для «Вернуть» после «Убрать у X»)
export const isWorn = (st: GearStore, charId: string, p: Pick<Piece, 'id' | 'slot'>): boolean => st.worn?.[charId]?.[p.slot] === p.id;

// Р16: сняли звезду с героя, у которого есть вещи, и сказали «Да, убрать» — его пул, отметки «Собираю», подсказки
// autoNew, надетое и выбранный билд уходят; записи, которые есть и у других, остаются у них (gc). Dropped — всё, что
// ушло, для «Вернуть»
export interface Dropped {
  charId: string; ids: string[]; pieces: Record<string, Piece>; marks: Record<string, Mark>; autoNew: string[]; at: number;
  worn?: Worn; aim?: string; pinned?: boolean;
}
const ofChar = (charId: string, key: string) => key.startsWith(charId + '/');
export function dropChar(st: GearStore, charId: string): { st: GearStore; dropped: Dropped } {
  const ids = st.pools[charId] ?? [];
  const { [charId]: _, ...pools } = st.pools;
  const marks = Object.fromEntries(Object.entries(st.marks ?? {}).filter(([k]) => !ofChar(charId, k)));
  const autoNew = (st.autoNew ?? []).filter((k) => !ofChar(charId, k));
  const { marks: _m, autoNew: _a, ...rest } = st;
  const next = gc({ ...rest, pools, ...(st.marks ? { marks } : {}), ...(autoNew.length ? { autoNew } : {}) });
  const dropped: Dropped = {
    charId, ids,
    pieces: Object.fromEntries(ids.filter((id) => !next.pieces[id] && st.pieces[id]).map((id) => [id, st.pieces[id]])),
    marks: Object.fromEntries(Object.entries(st.marks ?? {}).filter(([k]) => ofChar(charId, k))),
    autoNew: (st.autoNew ?? []).filter((k) => ofChar(charId, k)),
    at: Object.keys(st.pools).indexOf(charId),
    ...(st.worn?.[charId] ? { worn: st.worn[charId] } : {}), ...(st.aim?.[charId] !== undefined ? { aim: st.aim[charId] } : {}),
    ...(isPinned(st, charId) ? { pinned: true } : {}),
  };
  return { st: next, dropped };
}
// «Вернуть» после dropChar: записи, пул на прежнем месте, отметки, подсказки, надетое, выбранный билд и закрепление — как были. За
// эти секунды герою успели дать что-то новое — оно остаётся после прежних; отметку, надетое в слоте или билд успели
// выбрать заново — их не трогаем
export function undoDrop(st: GearStore, d: Dropped): GearStore {
  const pieces = { ...d.pieces, ...st.pieces };
  const pool = [...d.ids.filter((id) => pieces[id]), ...(st.pools[d.charId] ?? []).filter((id) => !d.ids.includes(id))];
  const entries = Object.entries(st.pools).filter(([c]) => c !== d.charId);
  if (pool.length) entries.splice(Math.min(Math.max(d.at, 0), entries.length), 0, [d.charId, pool]);
  const marks = { ...d.marks, ...st.marks };
  const autoNew = [...(st.autoNew ?? []), ...d.autoNew.filter((k) => !st.autoNew?.includes(k))];
  const { marks: _m, autoNew: _a, ...rest } = st;
  const worn = d.worn ? { ...st.worn, [d.charId]: { ...d.worn, ...st.worn?.[d.charId] } } : st.worn;
  const aim = d.aim !== undefined ? { ...st.aim, [d.charId]: st.aim?.[d.charId] ?? d.aim } : st.aim;
  const back = syncWorn({
    ...rest, pieces, pools: Object.fromEntries(entries),
    ...(st.marks || Object.keys(d.marks).length ? { marks } : {}), ...(autoNew.length ? { autoNew } : {}),
    ...(worn ? { worn } : {}), ...(aim ? { aim } : {}),
  });
  return d.pinned ? setPinned(back, d.charId, true) : back;
}

// новая запись вещи с формы: уровень (lit) и Breakthrough — как на форме (поля нет — не указан). yellow — тот же
// уровень, но не выше четырёх: хранилище читает жёлтые только 1…4 (gearStore restorePieces), а старая вкладка читает
// yellow и lit
export const yellowOf = (lit: Subs): Subs => Object.fromEntries(Object.entries(lit).map(([k, n]) => [k, Math.min(n, DROP_LEVEL)]));
export function newPiece(st: GearStore, item: ItemInput, at = today()): { st: GearStore; piece: Piece } {
  const id = 'p' + (st.seq + 1);
  const lit = { ...item.subs };
  const yellow = yellowOf(lit);
  const piece: Piece = {
    id, slot: item.slot, grade: item.grade, setId: item.setId ?? null, itemKey: item.itemKey ?? null, main: item.main ?? null,
    ...(item.unlisted ? { unlisted: true } : {}), yellow, lit, bt: item.bt ?? null, at,
  };
  return { st: { ...st, seq: st.seq + 1, pieces: { ...st.pieces, [id]: piece } }, piece };
}

// Правка в шторке вещи (Н1): уровни сабстатов 1…6 (lit — новые уровни её статов; стат не меняется — Transistone не
// правка, В-А2), «T4» (4 / 0, у любой вещи), 4-й сабстат у Epic с тремя — с уровнем 1 (add, В-А2). Сумма уровней не растёт
// выше предела (levelCap): такой патч не применяется; уменьшение и «T4» — всегда (старые записи бывают выше предела).
// После правки уровень один: yellow = min(lit, 4), как у newPiece. Правка — только у этого героя (В9): запись есть и у
// других (старая общая) — ему копия (copy-on-write): новая запись (seq + 1) на том же месте его пула, у других —
// прежняя. Пул не чистит (В-А3): ставшее ненужным — «больше не нужна» и «Убрать у X»; «Вернуть» нет — нажатие
// обратимо тем же нажатием. id — запись после правки: шторка идёт за ним; надетая на нём — тоже (worn). Ничего не
// поменялось — то же хранилище.
// 4-й сабстат — только допустимый на этом предмете (mains subAllowed, как на форме) и новый.
// UI ОБЯЗАН снять висящее «Вернуть» соседнего действия при правке (В3: одно на все): undoRemove / undoDrop / undoPut /
// unfuseChar возвращают запись по id, а её поправили или скопировали
export interface PieceEdit { lit?: Subs; bt?: 0 | 4; add?: string }
export function updateIn(idx: Index, st: GearStore, charId: string, id: string, patch: PieceEdit, at = today()): { st: GearStore; id: string } {
  const same = { st, id };
  const p = st.pieces[id];
  if (!p || !st.pools[charId]?.includes(id)) return same;
  const levels = Object.entries(patch.lit ?? {});
  if (levels.some(([k, n]) => !Object.hasOwn(p.lit, k) || !Number.isInteger(n) || n < 1 || n > MAX_LIT)) return same;
  const lit: Subs = { ...p.lit, ...patch.lit };
  if (patch.add !== undefined) {
    if (p.grade !== 'rare' || Object.keys(lit).length !== MAX_SUBS - 1 || Object.hasOwn(lit, patch.add) || !subAllowed(idx, pieceInput(p), patch.add)) return same;
    lit[patch.add] = 1;
  }
  if (!withinCap(p.grade, p.lit, lit)) return same;
  const bt = patch.bt !== undefined && (patch.bt === 0 || patch.bt === 4) ? patch.bt : p.bt;
  const keys = Object.keys(lit);
  if (bt === p.bt && keys.length === Object.keys(p.lit).length && keys.every((k) => lit[k] === p.lit[k])) return same;
  const edited: Piece = { ...p, yellow: yellowOf(lit), lit, bt, at };
  if (holdersOf(st, id).length < 2) return { st: syncWorn({ ...st, pieces: { ...st.pieces, [id]: edited } }), id };
  // копия: номер — следующий за seq; только безопасное целое и свободный id (gearStore seqOf), иначе копия затёрла бы вещь
  const seq = st.seq + 1, nid = 'p' + seq;
  if (!Number.isSafeInteger(seq) || st.pieces[nid]) return same;
  const pool = st.pools[charId].map((x) => (x === id ? nid : x));
  const next: GearStore = { ...st, seq, pieces: { ...st.pieces, [nid]: { ...edited, id: nid } }, pools: { ...st.pools, [charId]: pool } };
  if (isWorn(st, charId, p)) next.worn = { ...st.worn, [charId]: { ...st.worn![charId], [p.slot]: nid } };
  return { st: syncWorn(next), id: nid };
}

// только для тестов: записи прежней правки (bt 1–3, оранжевые) и прямые патчи; в приложении правка — updateIn
export function updatePiece(st: GearStore, id: string, patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>, at = today()): GearStore {
  const p = st.pieces[id];
  return p ? { ...st, pieces: { ...st.pieces, [id]: { ...p, ...patch, at } } } : st;
}
