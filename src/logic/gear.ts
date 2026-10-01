// Экипировка: вещи персонажа (пул, GEARPOOL). Чистые данные и операции — без React и хранилища; билды собираются
// из пула сами (logic/pool), операции «Надеть», «Убрать» — там же. Вещь попадает в пул только из оценки («Надеть» в
// вердикте): жёлтые сегменты и Breakthrough — как отмечены на форме, оранжевые (Reforge) игрок добавляет потом в
// карточке персонажа, там же правит Breakthrough. Enhance не храним: считаем +10. Одна запись может быть в пулах
// нескольких героев — это одна вещь в инвентаре, правка Reforge и Breakthrough видна у всех.
import { CFG } from '../config';
import type { Grade, SlotId } from '../data/types';
import { DROP_LEVEL, MAX_SUBS, type Subs } from './subs';
import type { ItemInput } from './verdict';

export type Bt = 0 | 1 | 2 | 3 | 4;
export const MAX_LIT = 6;     // сегментов у сабстата в игре
export const REFORGES = CFG.reforges; // попыток Reforge у 6★ (сравнение их не считает — вещи как есть, logic/vs)
export const SINGULARITY = 3; // ещё 3 Reforge у Legendary после Singularity Ascension — их можно отметить

export interface Piece {
  id: string;
  slot: SlotId;
  grade: Grade;
  setId: string | null;
  itemKey: string | null;
  main: string | null;
  unlisted?: boolean;
  yellow: Subs;       // жёлтые сегменты — из оценки, 1…4
  lit: Subs;          // горит всего, жёлтые и оранжевые: yellow…6
  bt: Bt | null;      // Breakthrough; null — не указан (запись тех пор, когда форма его не знала, — в игре может быть любым)
  at: string;         // когда надета или изменена, YYYY-MM-DD
}

export type Mark = 'want' | 'skip'; // «Собираю» / «Не собираю»

// Хранилище v2 (GEARPOOL): вещи — у персонажа. pools — id вещей персонажа в порядке добавления; одна запись может
// быть в пулах нескольких героев (та же вещь в игре). marks — «Собираю» / «Не собираю»: ключ — билд целиком
// (buildKey) или вариант связки (buildKey#подпись, logic/variants). autoNew — варианты, которые после переноса v1
// собираются сами, а в v1 начаты не были: разовая подсказка в карточке. Незнакомые поля (v1builds — билды v1 как
// были, следующая версия) переносятся как есть
export interface GearStore {
  v: 2;
  seq: number;                        // счётчик id вещей
  pieces: Record<string, Piece>;
  pools: Record<string, string[]>;
  marks?: Record<string, Mark>;
  autoNew?: string[];
  [extra: string]: unknown;
}

export const EMPTY_GEAR: GearStore = { v: 2, seq: 0, pieces: {}, pools: {} };
// билд — по имени: номер в списке outerpedia может сдвинуться при обновлении данных
export const buildKey = (charId: string, build: string) => `${charId}/${build}`;
export const today = () => new Date().toISOString().slice(0, 10);

// запись как вход сравнения: уровень сабстата — сколько горит (lit), жёлтые и оранжевые вместе (один уровень)
export const pieceInput = (p: Piece): ItemInput =>
  ({ slot: p.slot, grade: p.grade, setId: p.setId, itemKey: p.itemKey, main: p.main, unlisted: p.unlisted, subs: p.lit });

const orangeOf = (p: Pick<Piece, 'yellow' | 'lit'>) => Object.keys(p.lit).reduce((n, k) => n + (p.lit[k] - (p.yellow[k] ?? 0)), 0);

// сколько Reforge бывает у вещи: 6, у Legendary с Singularity — 9
export const maxReforges = (p: Pick<Piece, 'grade'>): number => REFORGES + (p.grade === 'unique' ? SINGULARITY : 0);

// сколько оранжевых можно отметить: у Epic первый Reforge — 4-й сабстат (с жёлтым), оранжевых на один меньше;
// у Epic без 4-го — ни одного: сначала «+ 4-й»
export const maxOrange = (p: Pick<Piece, 'grade' | 'lit'>): number =>
  p.grade === 'rare' ? (Object.keys(p.lit).length >= MAX_SUBS ? REFORGES - 1 : 0) : maxReforges(p);

// «Reforge N из M»: обычно из 6; у Legendary после Singularity (больше 6) — из 9
export function reforgeScale(p: Piece): { done: number; of: number } {
  const done = reforgesDone(p);
  return { done, of: done > REFORGES ? maxReforges(p) : REFORGES };
}

// сколько Reforge уже сделано: каждый добавляет ровно один сегмент (у Epic первый — 4-й сабстат, его сегмент жёлтый)
export function reforgesDone(p: Piece): number {
  const fourth = p.grade === 'rare' && Object.keys(p.lit).length >= MAX_SUBS ? 1 : 0;
  return Math.min(maxReforges(p), orangeOf(p) + fourth);
}

// одна и та же основа: слот, грейд, сет или предмет, main (в игре не меняются)
const sameBase = (a: ItemInput, p: Piece): boolean =>
  a.slot === p.slot && a.grade === p.grade && a.main === p.main
  && (a.setId ?? null) === p.setId && (a.itemKey ?? null) === p.itemKey && !!a.unlisted === !!p.unlisted;

// та же вещь: та же основа, те же статы и уровни ровно как у записи (lit — один уровень, жёлтые и оранжевые вместе).
// Breakthrough не сравниваем. Зовёт только окно «Это шлем Rin?» (App, уходит в шаге 10): «Уже есть» и «дома» нет —
// в Оценку вводят новую вещь из инвентаря, точная копия записи — другая вещь (решение владельца 2026-10-01)
export function samePiece(a: ItemInput, p: Piece): boolean {
  if (!sameBase(a, p)) return false;
  const ka = Object.keys(a.subs), kp = Object.keys(p.lit);
  return ka.length === kp.length && ka.every((k) => a.subs[k] === p.lit[k]);
}

// у кого есть вещи: персонаж → сколько вещей в пуле (фильтр «с экипировкой», меню «Экипировка · N»)
export function gearedChars(st: GearStore): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, ids] of Object.entries(st.pools)) if (ids.length) out.set(id, ids.length);
  return out;
}

// у кого в пуле эта запись
export const holdersOf = (st: GearStore, id: string): string[] => Object.keys(st.pools).filter((c) => st.pools[c].includes(id));

// вещи, которых нет ни в одном пуле, из хранилища убираем; пустые пулы — тоже
export function gc(st: GearStore): GearStore {
  const pools = Object.fromEntries(Object.entries(st.pools).filter(([, ids]) => ids.length));
  const used = new Set(Object.values(pools).flat());
  const pieces = Object.fromEntries(Object.entries(st.pieces).filter(([id]) => used.has(id)));
  return { ...st, pieces, pools };
}

// Р16: сняли звезду с героя, у которого есть вещи, и сказали «Да, убрать» — его пул, отметки «Собираю» и подсказки
// autoNew уходят; записи, которые есть и у других, остаются у них (gc). Dropped — всё, что ушло, для «Вернуть»
export interface Dropped { charId: string; ids: string[]; pieces: Record<string, Piece>; marks: Record<string, Mark>; autoNew: string[]; at: number }
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
  };
  return { st: next, dropped };
}
// «Вернуть» после dropChar: записи, пул на прежнем месте, отметки и подсказки — как были. За эти секунды герою успели
// дать что-то новое — оно остаётся после прежних; отметку успели поставить заново — её не трогаем
export function undoDrop(st: GearStore, d: Dropped): GearStore {
  const pieces = { ...d.pieces, ...st.pieces };
  const pool = [...d.ids.filter((id) => pieces[id]), ...(st.pools[d.charId] ?? []).filter((id) => !d.ids.includes(id))];
  const entries = Object.entries(st.pools).filter(([c]) => c !== d.charId);
  if (pool.length) entries.splice(Math.min(Math.max(d.at, 0), entries.length), 0, [d.charId, pool]);
  const marks = { ...d.marks, ...st.marks };
  const autoNew = [...(st.autoNew ?? []), ...d.autoNew.filter((k) => !st.autoNew?.includes(k))];
  const { marks: _m, autoNew: _a, ...rest } = st;
  return {
    ...rest, pieces, pools: Object.fromEntries(entries),
    ...(st.marks || Object.keys(d.marks).length ? { marks } : {}), ...(autoNew.length ? { autoNew } : {}),
  };
}

// новая запись вещи с формы: уровень (lit) и Breakthrough — как на форме (поля нет — не указан). yellow — тот же
// уровень, но не выше четырёх: хранилище читает жёлтые только 1…4 (gearStore restorePieces), а старая вкладка читает
// yellow и lit
export function newPiece(st: GearStore, item: ItemInput, at = today()): { st: GearStore; piece: Piece } {
  const id = 'p' + (st.seq + 1);
  const lit = { ...item.subs };
  const yellow = Object.fromEntries(Object.entries(lit).map(([k, n]) => [k, Math.min(n, DROP_LEVEL)]));
  const piece: Piece = {
    id, slot: item.slot, grade: item.grade, setId: item.setId ?? null, itemKey: item.itemKey ?? null, main: item.main ?? null,
    ...(item.unlisted ? { unlisted: true } : {}), yellow, lit, bt: item.bt ?? null, at,
  };
  return { st: { ...st, seq: st.seq + 1, pieces: { ...st.pieces, [id]: piece } }, piece };
}

export function updatePiece(st: GearStore, id: string, patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>, at = today()): GearStore {
  const p = st.pieces[id];
  return p ? { ...st, pieces: { ...st.pieces, [id]: { ...p, ...patch, at } } } : st;
}

// сегменты в карточке: нажали клетку n (1…6) у стата k. Выше жёлтых — оранжевые (Reforge), но не больше, чем
// Reforge бывает (maxOrange); повторное нажатие на последнюю горящую убирает её. На жёлтых — жёлтых меньше
// (опечатка при вводе), оранжевые остаются.
export function tapSegment(p: Piece, k: string, n: number): Pick<Piece, 'yellow' | 'lit'> {
  const y = p.yellow[k] ?? 1, l = p.lit[k] ?? y;
  if (n > y) {
    if (n <= l) return { yellow: p.yellow, lit: { ...p.lit, [k]: n === l ? n - 1 : n } };
    const room = Math.max(0, maxOrange(p) - orangeOf(p)); // сколько оранжевых ещё можно добавить
    return { yellow: p.yellow, lit: { ...p.lit, [k]: Math.min(n, l + room) } };
  }
  return { yellow: { ...p.yellow, [k]: n }, lit: { ...p.lit, [k]: Math.min(MAX_LIT, n + l - y) } };
}

// Transistone сменил стат: новый встаёт на место старого, сегменты (жёлтые и оранжевые) — с ним.
// Стата, который уже есть на вещи, Transistone не даёт — такая замена ничего не меняет (иначе один сабстат пропал бы)
export function replaceStat(p: Piece, from: string, to: string): Pick<Piece, 'yellow' | 'lit'> {
  if (to !== from && to in p.yellow) return { yellow: p.yellow, lit: p.lit };
  const swap = (s: Subs) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k === from ? to : k, v]));
  return { yellow: swap(p.yellow), lit: swap(p.lit) };
}

// сколько жёлтых у стата: Transistone перебрасывает стат вместе с его жёлтыми (1–3), а при вводе бывает опечатка.
// Оранжевые (Reforge) у стата остаются; больше 6 горящих не бывает
export function setYellow(p: Pick<Piece, 'yellow' | 'lit'>, k: string, n: number): Pick<Piece, 'yellow' | 'lit'> {
  const orange = (p.lit[k] ?? 0) - (p.yellow[k] ?? 0);
  return { yellow: { ...p.yellow, [k]: n }, lit: { ...p.lit, [k]: Math.min(MAX_LIT, n + orange) } };
}

// 4-й сабстат у Epic после первого Reforge: приходит с одним жёлтым сегментом
export const addFourth = (p: Piece, k: string): Pick<Piece, 'yellow' | 'lit'> => ({ yellow: { ...p.yellow, [k]: 1 }, lit: { ...p.lit, [k]: 1 } });
