// Экипировка: что надето на персонажа в каждом билде. Чистые данные и операции — без React и хранилища.
// Вещь попадает в билд только из оценки («Надеть» в вердикте): жёлтые сегменты — как отмечены на форме,
// оранжевые (Reforge) и Breakthrough игрок добавляет потом в карточке персонажа. Enhance не храним: считаем +10.
// Одна вещь может стоять в нескольких билдах одного персонажа — это ссылка на одну запись, правка меняет все.
import { CFG } from '../config';
import { GRADES, SLOTS, isArmor, type Index } from '../data';
import type { Grade, SlotId } from '../data/types';
import { MAX_SUBS, type Subs } from './subs';
import type { ItemInput } from './verdict';

export type Bt = 0 | 1 | 2 | 3 | 4;
export const MAX_LIT = 6;     // сегментов у сабстата в игре
export const REFORGES = CFG.reforges; // попыток Reforge у 6★; впереди сравнение считает только их
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

// у кого что-то надето: персонаж → сколько вещей в самом собранном его билде (плитка «6/6», меню «Экипировка · N»)
export function gearedChars(st: GearStore): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, b] of Object.entries(st.builds)) {
    const id = k.slice(0, k.indexOf('/')), n = Object.keys(b.slots).length;
    if (n > (out.get(id) ?? 0)) out.set(id, n);
  }
  return out;
}

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

// надеть на персонажа: та же вещь уже стоит в этом слоте другого его билда — ставим ту же запись (одна вещь — одна
// запись, как «Взять из»: правка Reforge и Breakthrough видна везде), иначе — новую
export function equipOn(st: GearStore, charId: string, key: string, item: ItemInput, at = today()): { store: GearStore; piece: Piece; old: Piece | null; shared: string | null } {
  const twin = Object.entries(st.builds).find(([k, b]) => {
    const p = k !== key && k.startsWith(charId + '/') ? st.pieces[b.slots[item.slot] ?? ''] : undefined;
    return p && samePiece(item, p);
  });
  if (!twin) return { ...equip(st, key, item, at), shared: null };
  const id = twin[1].slots[item.slot]!;
  const oldId = st.builds[key]?.slots[item.slot];
  return { store: share(st, key, item.slot, id, at), piece: st.pieces[id], old: oldId ? st.pieces[oldId] ?? null : null, shared: twin[0] };
}

// Та же вещь уже на другом персонаже: в игре вещь носит один герой, а номера вещи у нас нет — узнаём по тому, что без
// Transistone не меняется (samePiece). Спрашиваем «это шлем Rin?», молча не переносим: у Epic с тремя сабстатами по
// одному жёлтому совпадения нередки. Стоит и у этого персонажа (другой билд) — не спрашиваем: equipOn поставит её же.
export interface Twin { piece: Piece; keys: string[] } // keys — билды другого персонажа, где она стоит
export function twinElsewhere(st: GearStore, charId: string, item: ItemInput): Twin | null {
  const same = Object.values(st.pieces).filter((p) => samePiece(item, p));
  if (same.some((p) => usedIn(st, p.id).some((k) => k.startsWith(charId + '/')))) return null;
  for (const p of same) {
    const keys = usedIn(st, p.id).filter((k) => st.builds[k].slots[p.slot] === p.id);
    if (keys.length) return { piece: p, keys };
  }
  return null;
}

// «Перенести»: та же запись (с Reforge и Breakthrough) — в этот билд, у прежнего персонажа слот освобождается
export function moveTo(st: GearStore, twin: Twin, key: string, at = today()): { store: GearStore; piece: Piece; old: Piece | null } {
  const slot = twin.piece.slot;
  const oldId = st.builds[key]?.slots[slot];
  const old = oldId && oldId !== twin.piece.id ? st.pieces[oldId] ?? null : null;
  let next = setSlot(st, key, slot, twin.piece.id, at);
  for (const k of twin.keys) if (k !== key) next = setSlot(next, k, slot, null, at);
  return { store: next, piece: twin.piece, old };
}

// «Вернуть» после «Перенести»: этот слот — как было, а вещь — обратно туда, откуда её взяли (если там не занято).
// Там всюду успели занять — не трогаем, как undoEquip: иначе вещь не вернулась бы никуда и gc стёр бы её запись
export function undoMove(st: GearStore, key: string, twin: Twin, old: Piece | null, at = today()): GearStore {
  const slot = twin.piece.slot;
  if (st.builds[key]?.slots[slot] !== twin.piece.id) return st;
  if (twin.keys.every((k) => st.builds[k]?.slots[slot])) return st;
  let next = undoEquip(st, key, slot, twin.piece, old, at);
  next = { ...next, pieces: { ...next.pieces, [twin.piece.id]: st.pieces[twin.piece.id] } };
  for (const k of twin.keys) if (!next.builds[k]?.slots[slot]) next = setSlot(next, k, slot, twin.piece.id, at);
  return gc(next);
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

// билды персонажа, которых больше нет в данных (outerpedia переименовала билд): вещи в них лежат, но страница их не
// показывает — карточка персонажа предлагает перенести их в один из нынешних билдов
export const orphanBuilds = (st: GearStore, charId: string, names: readonly string[]): { key: string; name: string; n: number }[] =>
  Object.entries(st.builds)
    .filter(([k]) => k.startsWith(charId + '/') && !names.includes(k.slice(charId.length + 1)))
    .map(([k, b]) => ({ key: k, name: k.slice(charId.length + 1), n: Object.keys(b.slots).length }));

// «Перенести в этот билд»: вещи прежнего билда встают в пустые слоты этого; занятые слоты не трогаем — те вещи
// остаются в прежнем, и блок покажет, сколько их там ещё
export function moveBuild(st: GearStore, from: string, to: string, at = today()): GearStore {
  const src = st.builds[from]?.slots ?? {};
  const dst = { ...(st.builds[to]?.slots ?? {}) };
  const rest: BuildGear['slots'] = {};
  for (const [slot, id] of Object.entries(src) as [SlotId, string][]) {
    if (dst[slot]) rest[slot] = id; else dst[slot] = id;
  }
  return gc({ ...st, builds: { ...st.builds, [to]: { ...st.builds[to], slots: dst, at }, [from]: { ...st.builds[from], slots: rest, at } } });
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

// экипировку сохранила более новая версия страницы (v > 1): эта её не понимает — только читает пустой и не пишет,
// иначе первое же «Надеть» стёрло бы всё (PWA может держать старую версию, пока в другой вкладке уже новая)
export const newerGear = (raw: unknown): boolean =>
  !!raw && typeof raw === 'object' && typeof (raw as { v?: unknown }).v === 'number' && (raw as { v: number }).v > 1;

// из хранилища: неверные значения отбрасываем; вещи и билды незнакомых персонажей и сетов оставляем (данные могли
// временно потерять их при обновлении), просто страница их не покажет. Незнакомые поля (их добавит следующая версия
// той же v: 1) переносим как есть — запись этой страницей их не стирает
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
      if (!idx.SUB[k] || typeof v !== 'number' || !Number.isFinite(v)) continue;
      const y = Math.max(1, Math.min(4, Math.round(v)));
      const raw = Number(p.lit?.[k] ?? y);
      const l = Math.max(y, Math.min(MAX_LIT, Math.round(Number.isFinite(raw) ? raw : y)));
      yellow[k] = y; lit[k] = l;
      if (Object.keys(yellow).length >= MAX_SUBS) break;
    }
    const bt = typeof p.bt === 'number' && p.bt >= 0 && p.bt <= 4 ? (Math.round(p.bt) as Bt) : null;
    const armor = isArmor(p.slot as SlotId);
    pieces[id] = {
      ...(x as object),
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
    if (Object.keys(slots).length) builds[key] = { ...(x as object), slots, at: typeof b.at === 'string' ? b.at : '' };
  }
  const seq = Math.max(typeof r.seq === 'number' ? r.seq : 0, ...Object.keys(pieces).map((id) => Number(id.slice(1)) || 0));
  return gc({ ...r, v: 1, seq, pieces, builds });
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
