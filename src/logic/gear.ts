// Экипировка: что надето на персонажа в каждом билде. Чистые данные и операции — без React и хранилища.
// Вещь попадает в билд только из оценки («Надеть» в вердикте): жёлтые сегменты — как отмечены на форме,
// оранжевые (Reforge) и Breakthrough игрок добавляет потом в карточке персонажа. Enhance не храним: считаем +10.
// Одна вещь может стоять в нескольких билдах одного персонажа — это ссылка на одну запись, правка меняет все.
import { GRADES, SLOTS, isArmor, type Index } from '../data';
import type { Grade, SlotId } from '../data/types';
import { MAX_SUBS, type Subs } from './subs';
import type { ItemInput } from './verdict';

export type Bt = 0 | 1 | 2 | 3 | 4;
export const MAX_LIT = 6;     // сегментов у сабстата в игре
export const REFORGES = 6;    // попыток Reforge у 6★ (Singularity не учитываем)

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
  bt: Bt | null;      // Breakthrough; null — не указан (вещь надета из оценки, а в игре она может быть уже прокачана)
  at: string;         // когда надета или изменена, YYYY-MM-DD
}

export interface BuildGear { slots: Partial<Record<SlotId, string>>; at: string } // слот → id вещи
export interface GearStore {
  v: 1;
  seq: number;                        // счётчик id вещей
  pieces: Record<string, Piece>;
  builds: Record<string, BuildGear>;  // ключ — buildKey(персонаж, билд)
}

export const EMPTY_GEAR: GearStore = { v: 1, seq: 0, pieces: {}, builds: {} };
// билд — по имени: номер в списке outerpedia может сдвинуться при обновлении данных
export const buildKey = (charId: string, build: string) => `${charId}/${build}`;
export const today = () => new Date().toISOString().slice(0, 10);

export const pieceInput = (p: Piece): ItemInput =>
  ({ slot: p.slot, grade: p.grade, setId: p.setId, itemKey: p.itemKey, main: p.main, unlisted: p.unlisted, subs: p.yellow });

// сколько Reforge уже сделано: каждый добавляет ровно один сегмент (у Epic первый — 4-й сабстат, его сегмент жёлтый)
export function reforgesDone(p: Piece): number {
  const orange = Object.keys(p.lit).reduce((n, k) => n + (p.lit[k] - (p.yellow[k] ?? 0)), 0);
  const fourth = p.grade === 'rare' && Object.keys(p.lit).length >= MAX_SUBS ? 1 : 0;
  return Math.min(REFORGES, orange + fourth);
}

// та же вещь: слот, грейд, сет или предмет, main и жёлтые сегменты в игре не меняются без Transistone
export function samePiece(a: ItemInput, p: Piece): boolean {
  if (a.slot !== p.slot || a.grade !== p.grade || a.main !== p.main) return false;
  if ((a.setId ?? null) !== p.setId || (a.itemKey ?? null) !== p.itemKey || !!a.unlisted !== !!p.unlisted) return false;
  const ka = Object.keys(a.subs), kp = Object.keys(p.yellow);
  return ka.length === kp.length && ka.every((k) => a.subs[k] === p.yellow[k]);
}

// где вещь стоит: ключи билдов, в которых она в каком-то слоте
export const usedIn = (st: GearStore, id: string): string[] =>
  Object.entries(st.builds).filter(([, b]) => Object.values(b.slots).includes(id)).map(([k]) => k);

// вещи, на которые больше не ссылается ни один билд, из хранилища убираем
function gc(st: GearStore): GearStore {
  const used = new Set(Object.values(st.builds).flatMap((b) => Object.values(b.slots)));
  const pieces = Object.fromEntries(Object.entries(st.pieces).filter(([id]) => used.has(id)));
  const builds = Object.fromEntries(Object.entries(st.builds).filter(([, b]) => Object.keys(b.slots).length));
  return { ...st, pieces, builds };
}

function setSlot(st: GearStore, key: string, slot: SlotId, id: string | null, at: string): GearStore {
  const cur = st.builds[key]?.slots ?? {};
  const slots = { ...cur };
  if (id) slots[slot] = id; else delete slots[slot];
  return gc({ ...st, builds: { ...st.builds, [key]: { slots, at } } });
}

// надеть вещь с формы оценки в билд; старая из этого слота остаётся в других билдах, где она стоит
export function equip(st: GearStore, key: string, item: ItemInput, at = today()): { store: GearStore; piece: Piece; old: Piece | null } {
  const id = 'p' + (st.seq + 1);
  const subs = { ...item.subs };
  const piece: Piece = {
    id, slot: item.slot, grade: item.grade, setId: item.setId ?? null, itemKey: item.itemKey ?? null, main: item.main ?? null,
    ...(item.unlisted ? { unlisted: true } : {}), yellow: subs, lit: { ...subs }, bt: null, at,
  };
  const oldId = st.builds[key]?.slots[item.slot];
  const old = oldId ? st.pieces[oldId] ?? null : null;
  const next = setSlot({ ...st, seq: st.seq + 1, pieces: { ...st.pieces, [id]: piece } }, key, item.slot, id, at);
  return { store: next, piece, old };
}

// «Вернуть» после «Надеть»: только этот слот этого билда — как было (старую вещь — обратно, даже если её убрал gc).
// Другие правки за эти секунды остаются; слот успели поменять ещё раз — не трогаем
export function undoEquip(st: GearStore, key: string, slot: SlotId, piece: Piece, old: Piece | null, at = today()): GearStore {
  if (st.builds[key]?.slots[slot] !== piece.id) return st;
  const back = old ? { ...st, pieces: { ...st.pieces, [old.id]: st.pieces[old.id] ?? old } } : st;
  return setSlot(back, key, slot, old?.id ?? null, at);
}

// поставить в слот вещь, которая уже стоит в другом билде этого персонажа («Взять из Speed»)
export const share = (st: GearStore, key: string, slot: SlotId, id: string, at = today()): GearStore =>
  st.pieces[id] ? setSlot(st, key, slot, id, at) : st;

export const unequip = (st: GearStore, key: string, slot: SlotId, at = today()): GearStore => setSlot(st, key, slot, null, at);

export function updatePiece(st: GearStore, id: string, patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>, at = today()): GearStore {
  const p = st.pieces[id];
  return p ? { ...st, pieces: { ...st.pieces, [id]: { ...p, ...patch, at } } } : st;
}

// сегменты в карточке: нажали клетку n (1…6) у стата k. Выше жёлтых — оранжевые (Reforge); повторное нажатие на
// последнюю горящую убирает её. На жёлтых — поправка их числа (опечатка при вводе), оранжевые остаются.
export function tapSegment(p: Piece, k: string, n: number): Pick<Piece, 'yellow' | 'lit'> {
  const y = p.yellow[k] ?? 1, l = p.lit[k] ?? y;
  if (n > y) return { yellow: p.yellow, lit: { ...p.lit, [k]: n === l ? n - 1 : n } };
  return { yellow: { ...p.yellow, [k]: n }, lit: { ...p.lit, [k]: Math.min(MAX_LIT, n + l - y) } };
}

// Transistone сменил стат: новый встаёт на место старого, сегменты (жёлтые и оранжевые) — с ним.
// Стата, который уже есть на вещи, Transistone не даёт — такая замена ничего не меняет (иначе один сабстат пропал бы)
export function replaceStat(p: Piece, from: string, to: string): Pick<Piece, 'yellow' | 'lit'> {
  if (to !== from && to in p.yellow) return { yellow: p.yellow, lit: p.lit };
  const swap = (s: Subs) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k === from ? to : k, v]));
  return { yellow: swap(p.yellow), lit: swap(p.lit) };
}

// 4-й сабстат у Epic после первого Reforge: приходит с одним жёлтым сегментом
export const addFourth = (p: Piece, k: string): Pick<Piece, 'yellow' | 'lit'> => ({ yellow: { ...p.yellow, [k]: 1 }, lit: { ...p.lit, [k]: 1 } });

// из хранилища: всё непонятное отбрасываем; вещи и билды незнакомых персонажей и сетов оставляем (данные могли
// временно потерять их при обновлении), просто страница их не покажет
export function restoreGear(raw: unknown, idx: Index): GearStore {
  if (!raw || typeof raw !== 'object') return EMPTY_GEAR;
  const r = raw as Partial<GearStore>;
  if (r.v !== 1) return EMPTY_GEAR;
  const pieces: Record<string, Piece> = {};
  for (const [id, x] of Object.entries(r.pieces ?? {})) {
    const p = x as Partial<Piece>;
    if (typeof id !== 'string' || !SLOTS.some((s) => s.id === p.slot) || !GRADES.includes(p.grade as Grade)) continue;
    const yellow: Subs = {}, lit: Subs = {};
    for (const [k, v] of Object.entries(p.yellow ?? {})) {
      if (!idx.SUB[k] || typeof v !== 'number') continue;
      const y = Math.max(1, Math.min(4, Math.round(v)));
      const l = Math.max(y, Math.min(MAX_LIT, Math.round(Number(p.lit?.[k] ?? y))));
      yellow[k] = y; lit[k] = l;
      if (Object.keys(yellow).length >= MAX_SUBS) break;
    }
    const bt = typeof p.bt === 'number' && p.bt >= 0 && p.bt <= 4 ? (Math.round(p.bt) as Bt) : null;
    const armor = isArmor(p.slot as SlotId);
    pieces[id] = {
      id, slot: p.slot as SlotId, grade: p.grade as Grade,
      setId: armor && typeof p.setId === 'string' ? p.setId : null,
      itemKey: !armor && typeof p.itemKey === 'string' ? p.itemKey : null,
      main: typeof p.main === 'string' ? p.main : null,
      ...(p.unlisted === true ? { unlisted: true } : {}),
      yellow, lit, bt, at: typeof p.at === 'string' ? p.at : '',
    };
  }
  const builds: Record<string, BuildGear> = {};
  for (const [key, x] of Object.entries(r.builds ?? {})) {
    const b = x as Partial<BuildGear>;
    const slots: BuildGear['slots'] = {};
    for (const [slot, id] of Object.entries(b.slots ?? {})) {
      if (typeof id === 'string' && pieces[id]?.slot === slot) slots[slot as SlotId] = id;
    }
    if (Object.keys(slots).length) builds[key] = { slots, at: typeof b.at === 'string' ? b.at : '' };
  }
  const seq = Math.max(typeof r.seq === 'number' ? r.seq : 0, ...Object.keys(pieces).map((id) => Number(id.slice(1)) || 0));
  return gc({ v: 1, seq, pieces, builds });
}

// резервная копия кодом: браузер могут очистить, а переносить между устройствами иначе нечем
const BACKUP = 'OGC-GEAR1 ';
export const encodeGear = (st: GearStore): string =>
  BACKUP + btoa(unescape(encodeURIComponent(JSON.stringify(st)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeGear(text: string, idx: Index): GearStore | null {
  const s = text.trim();
  if (!s.startsWith(BACKUP.trim())) return null;
  try {
    const b64 = s.slice(BACKUP.trim().length).trim().replace(/-/g, '+').replace(/_/g, '/');
    const st = restoreGear(JSON.parse(decodeURIComponent(escape(atob(b64)))), idx);
    return Object.keys(st.pieces).length ? st : null;
  } catch {
    return null;
  }
}
