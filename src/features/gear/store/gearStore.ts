// Экипировка в хранилище и в коде копии: чтение с проверкой, перенос v1 и v2 → v3 (GEARPOOL, stat-sets PLAN Д11), старый
// код OGC-GEAR2. Перенос детерминированный: все вещи v1 — в пул персонажа (запись у двух персонажей — в оба пула, без
// копии). Ни одна вещь и ни одна запись пула и надетого не теряются, кроме правила Core Fusion (features/gear/model/fusion):
// у X и у Core Fusion X вещи — вещи X убраны. Все, у кого есть вещи, — в ростер (Р16). Поля прежней модели (LEGACY:
// «Собираю», autoNew, выбранный билд, булавка обмена, билды v1) перенос снимает — их больше никто не читает.
import { GRADES, SLOTS, isArmor, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import { normalizeStored, type Normalized } from '@/features/gear/model/fusion';
import { gc, type GearStore, type Piece, type Worn } from '@/features/gear/model/gear';
import type { Bt } from '@/game/item/item';
import { MAX_SUBS, type Subs, MAX_LIT } from '@/game/item/subs';

// v1: вещи лежали в билдах («персонаж/билд» → слот → id)
interface BuildGearV1 { slots: Partial<Record<SlotId, string>>; at: string }
interface GearStoreV1 { v: 1; seq: number; pieces: Record<string, Piece>; builds: Record<string, BuildGearV1>; [extra: string]: unknown }

// экипировку сохранила более новая версия страницы (v > 3): эта её не понимает — только читает пустой и не пишет,
// иначе первое же «Надеть» стёрло бы всё (PWA может держать старую версию, пока в другой вкладке уже новая)
export const newerGear = (raw: unknown): boolean =>
  !!raw && typeof raw === 'object' && typeof (raw as { v?: unknown }).v === 'number' && (raw as { v: number }).v > 3;

// поля прежней модели (v2 и v1): перенос в v3 их снимает (stat-sets PLAN Д11)
const LEGACY = ['marks', 'autoNew', 'aim', 'pinned', 'v1builds'] as const;
const withoutLegacy = <T extends object>(r: T): T =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !(LEGACY as readonly string[]).includes(k))) as T;

// вещи: неверные значения отбрасываем; незнакомые сеты и поля оставляем (данные могли временно их потерять,
// следующая версия могла добавить своё) — страница их просто не покажет
function restorePieces(raw: unknown, idx: Index): Record<string, Piece> {
  const pieces: Record<string, Piece> = {};
  for (const [id, x] of Object.entries((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>)) {
    const p = (x ?? {}) as Partial<Piece>;
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
  return pieces;
}
// счётчик id: не меньше номера любой вещи. Только целые до 2^53: id «pInfinity» (или seq: Infinity) дал бы
// seq = Infinity, а seq: 1e16 — seq + 1 === seq: следующие новые вещи получили бы один id и затёрли бы друг друга
const finite = (n: unknown): number => (typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : 0);
const seqOf = (r: { seq?: unknown }, pieces: Record<string, Piece>) =>
  Math.max(finite(r.seq), ...Object.keys(pieces).map((id) => finite(Number(id.slice(1)))));

// v1 — прежняя проверка без изменений: слот не тот — вещь из билда долой; вещь ни в одном билде — долой
function restoreV1(r: Partial<GearStoreV1>, idx: Index): GearStoreV1 {
  const pieces = restorePieces(r.pieces, idx);
  const builds: Record<string, BuildGearV1> = {};
  for (const [key, x] of Object.entries(r.builds ?? {})) {
    const b = x as Partial<BuildGearV1>;
    const slots: BuildGearV1['slots'] = {};
    for (const [slot, id] of Object.entries(b.slots ?? {})) {
      if (typeof id === 'string' && pieces[id]?.slot === slot) slots[slot as SlotId] = id;
    }
    if (Object.keys(slots).length) builds[key] = { ...(x as object), slots, at: typeof b.at === 'string' ? b.at : '' };
  }
  const used = new Set(Object.values(builds).flatMap((b) => Object.values(b.slots)));
  const kept = Object.fromEntries(Object.entries(pieces).filter(([id]) => used.has(id)));
  return { ...r, v: 1, seq: seqOf(r, kept), pieces: kept, builds };
}

// перенос v1 → v3. Ростер и Core Fusion (features/gear/model/fusion normalizeStored)
function migrateV1(v1: GearStoreV1, idx: Index, roster: readonly string[]): Loaded {
  // надетого и закрепления в v1 нет: такие поля (не из v1) не переносим — их никто не проверял
  const { builds, v: _, worn: _w, pin: _n, ...rest } = withoutLegacy(v1);
  const pools: Record<string, string[]> = {};
  for (const k of Object.keys(builds).sort()) {
    // ключ v1 — «персонаж/билд»; без «/» весь ключ — персонаж (indexOf −1 обрезал бы у id последнюю цифру)
    const cut = k.indexOf('/');
    const charId = cut < 0 ? k : k.slice(0, cut);
    const pool = (pools[charId] ??= []);
    for (const id of Object.values(builds[k].slots)) if (id && !pool.includes(id)) pool.push(id);
  }
  return normalizeStored(idx, roster, gc({ ...rest, v: 3, seq: v1.seq, pieces: v1.pieces, pools }));
}

// пул в хранилище — массив id. Испорченный пул не выбрасываем целиком: gc стёр бы вещи, которых нет в других пулах.
// Одна строка — пул из одной вещи; объект (например, слоты v1 { helmet: 'p1' }) — его значения; прочее — пусто
const poolIds = (x: unknown): unknown[] =>
  Array.isArray(x) ? x : typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x) : [];

// надетое и закрепление из сырых данных: только строки, слот — из данных; что надето не из пула героя или не в
// своём слоте и герои без пула — отбросит gc (syncWorn). Отброшенное — «прочитано не целиком» (readsWhole)
const record = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {});
function restoreWorn(raw: unknown): Record<string, Worn> {
  const out: Record<string, Worn> = {};
  for (const [c, w] of Object.entries(record(raw))) {
    const slots = Object.entries(record(w)).filter(([slot, id]) => typeof id === 'string' && SLOTS.some((s) => s.id === slot));
    if (slots.length) out[c] = Object.fromEntries(slots);
  }
  return out;
}
// закрепление (MODEL.md §6) — герой → ключ, только строки; ключ, которого больше нет в данных, переносит или снимает
// с сообщением разбор хранилища (stored, fixPins)
const restorePin = (raw: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(raw)).filter((e): e is [string, string] => typeof e[1] === 'string'));

// v2 и v3: пулы — массивы строк, id только существующих вещей, без повторов; надетое и закрепление — restoreWorn /
// restorePin; поля прежней модели (LEGACY) у v2 — снимаем
function restoreV3(r: Partial<GearStore>, idx: Index): GearStore {
  const pieces = restorePieces(r.pieces, idx);
  const pools: Record<string, string[]> = {};
  for (const [id, x] of Object.entries((r.pools && typeof r.pools === 'object' ? r.pools : {}) as Record<string, unknown>)) {
    const ids = [...new Set(poolIds(x).filter((pid): pid is string => typeof pid === 'string' && !!pieces[pid]))];
    if (ids.length) pools[id] = ids;
  }
  const worn = restoreWorn(r.worn), pin = restorePin(r.pin);
  const { worn: _w, pin: _n, ...rest } = withoutLegacy(r);
  return gc({
    ...rest, v: 3, seq: seqOf(r, pieces), pieces, pools,
    ...(Object.keys(worn).length ? { worn } : {}), ...(Object.keys(pin).length ? { pin } : {}),
  });
}

// из хранилища или кода: v1 — проверка v1 и перенос; v2 и v3 — проверка (у v2 — без полей прежней модели); иначе (мусор, более новая версия) — пусто.
// Затем ростер и Core Fusion (features/gear/model/fusion normalizeStored): все с вещами — в ростер, есть X и Core Fusion X — остаётся
// Core Fusion; fixes и added — что поменялось (запись и сообщение после загрузки, импорт)
export type Loaded = Normalized;
export function loadGear(raw: unknown, idx: Index, roster: readonly string[]): Loaded {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { v?: unknown };
  if (r.v === 1) return migrateV1(restoreV1(r as Partial<GearStoreV1>, idx), idx, roster);
  return normalizeStored(idx, roster, r.v === 2 || r.v === 3 ? restoreV3(r as Partial<GearStore>, idx) : EMPTY);
}
// Р17: чтение ничего не отбросило — запись нормализации при загрузке не сотрёт того, что эта версия не поняла (саб не из
// данных — старая закэшированная PWA с прежним снимком или поле новой версии). Всё из сырых данных есть в прочитанном как
// было; дописанное (значения по умолчанию) — не потеря, как и счётчик seq выше и пустые пулы. Поля прежней модели
// (LEGACY) — не потеря: перенос снимает их нарочно, иначе нормализацию никогда бы не записали и перенос шёл бы при
// каждой загрузке (stat-sets IMPACT §8). v1 — сверка с проверкой v1. Нет данных — нечего терять; мусор — теряется
export function readsWhole(raw: unknown, idx: Index): boolean {
  if (raw == null) return true;
  const r = (typeof raw === 'object' ? raw : {}) as { v?: unknown; seq?: unknown };
  if (r.v === 1) {
    const read = restoreV1(r as Partial<GearStoreV1>, idx);
    return covers({ ...r, seq: read.seq }, read);
  }
  if (r.v !== 2 && r.v !== 3) return false;
  const read = restoreV3(r as Partial<GearStore>, idx);
  return covers({ ...withoutLegacy(r), v: 3, seq: read.seq }, read);
}
const empty = (x: unknown) => (Array.isArray(x) ? !x.length : !!x && typeof x === 'object' && !Object.keys(x).length);
function covers(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => covers(x, b[i]));
  if (!a || typeof a !== 'object' || !b || typeof b !== 'object' || Array.isArray(b)) return false;
  const o = b as Record<string, unknown>;
  return Object.entries(a).every(([k, v]) => (k in o ? covers(v, o[k]) : empty(v)));
}
// хранилище без сообщений нормализации; decodeGear — код копии целиком. Страница берёт loadGear и readGearCode (нужен
// ростер и что поменяла нормализация), эти два — короткий путь для тестов
export const restoreGear = (raw: unknown, idx: Index, roster: readonly string[] = []): GearStore => loadGear(raw, idx, roster).st;
const EMPTY: GearStore = { v: 3, seq: 0, pieces: {}, pools: {} };
// хранилище прежней модели (v1, v2) с вещами: игрок жил с выбором билда — разовое сообщение о переносе (features/gear/store/stored)
export const oldModel = (raw: unknown): boolean => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { v?: unknown; pieces?: unknown };
  return (r.v === 1 || r.v === 2) && Object.keys(record(r.pieces)).length > 0;
};
// the old v2 store carried «Собираю / Не собираю» marks, «Не отдавать надетое» or a chosen build (aim) — the upgrade notice then
// adds a sentence that they were cleared. v1 never had marks (the v1 → v2 step made them up), so it never counts
export const oldMarks = (raw: unknown): boolean => {
  const r = record(raw);
  if (r.v !== 2) return false;
  return Object.keys(record(r.marks)).length > 0 || Object.keys(record(r.aim)).length > 0
    || (Array.isArray(r.pinned) && r.pinned.length > 0);
};

// старая резервная копия кодом (JSON): OGC-GEAR1 (v1) и OGC-GEAR2 (v2) читаются и переносятся; номер больше — код копии
// (features/roster/backup), здесь 'newer'. Страница такой код больше не пишет: encodeGear — для тестов
const PREFIX = 'OGC-GEAR';
export const encodeGear = (st: GearStore): string =>
  `${PREFIX}2 ` + btoa(unescape(encodeURIComponent(JSON.stringify(st)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// код → то, что в нём записано (проверит loadGear); 'newer' — код новее; null — не код
export function readGearCode(text: string): unknown {
  // пробел после префикса не обязателен: «OGC-GEAR1eyJ…» читался и до v2 (код объекта начинается с буквы)
  const m = /^OGC-GEAR(\d+)\s*([\s\S]+)$/.exec(text.trim());
  if (!m) return null;
  if (Number(m[1]) > 2) return 'newer';
  try {
    const raw: unknown = JSON.parse(decodeURIComponent(escape(atob(m[2].replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')))));
    return newerGear(raw) ? 'newer' : raw ?? null;
  } catch {
    return null;
  }
}
export function decodeGear(text: string, idx: Index): GearStore | 'newer' | null {
  const raw = readGearCode(text);
  if (raw === null || raw === 'newer') return raw;
  const st = restoreGear(raw, idx);
  return Object.keys(st.pieces).length ? st : null;
}

// «Вернуть» перехода (features/gear/model/fusion switchFusion): вещи — снова у base, у fusion — то, что было; base успели дать что-то своё — не трогаем.
// Надетое base: в слоте, где на fusion надета одна из ушедших к base вещей, — она (выбор за эти секунды); в остальных —
// r.worn (надетое base до перехода), если эта вещь снова в его пуле. Надетое fusion не трогаем: его вещи (свои, новые,
// копия общей записи после правки) остаются у него; надетое из ушедших — снято (gc). Закрепление не переходило
export function unfuseChar(st: GearStore, base: string, fusion: string, r: { moved: string[]; had: string[]; worn?: Worn }): GearStore {
  if (!r.moved.length || st.pools[base]?.length) return st;
  const pool = (st.pools[fusion] ?? []).filter((id) => r.had.includes(id) || !r.moved.includes(id));
  const own = st.worn?.[fusion] ?? {};
  const back = Object.entries(own).filter(([, id]) => id && r.moved.includes(id) && !r.had.includes(id));
  const w: Worn = { ...r.worn, ...Object.fromEntries(back) };
  const worn = Object.keys(w).length ? { ...st.worn, [base]: w } : st.worn;
  return gc({ ...st, pools: { ...st.pools, [base]: r.moved.filter((id) => st.pieces[id]), [fusion]: pool }, ...(worn ? { worn } : {}) });
}
