// Экипировка в хранилище и в коде копии: чтение с проверкой, перенос v1 → v2 (GEARPOOL), код OGC-GEAR2.
// Перенос детерминированный: все вещи v1 — в пул персонажа (запись у двух персонажей — в оба пула, без копии),
// билды v1 с вещами — «Собираю». Ни одна вещь и ни одно поле не теряются (билды v1 как были — в v1builds, не читается),
// кроме правила Core Fusion (features/gear/model/fusion): у X и у Core Fusion X вещи — вещи X убраны. Все, у кого есть вещи, — в ростер (Р16).
import { GRADES, SLOTS, isArmor, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { normalizeStored, type Normalized } from '@/features/gear/model/fusion';
import { gc, setPinned, type GearStore, type Mark, type Piece, type Worn } from '@/features/gear/model/gear';
import type { Bt } from '@/game/item/item';
import { buildKey } from '@/game/build/variants';
import { heroOpts, isStats, play } from '@/features/gear/pool';
import { MAX_SUBS, type Subs, MAX_LIT } from '@/game/item/subs';

// v1: вещи лежали в билдах («персонаж/билд» → слот → id)
interface BuildGearV1 { slots: Partial<Record<SlotId, string>>; at: string }
interface GearStoreV1 { v: 1; seq: number; pieces: Record<string, Piece>; builds: Record<string, BuildGearV1>; [extra: string]: unknown }

// экипировку сохранила более новая версия страницы (v > 2): эта её не понимает — только читает пустой и не пишет,
// иначе первое же «Надеть» стёрло бы всё (PWA может держать старую версию, пока в другой вкладке уже новая)
export const newerGear = (raw: unknown): boolean =>
  !!raw && typeof raw === 'object' && typeof (raw as { v?: unknown }).v === 'number' && (raw as { v: number }).v > 2;

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

// для подсказки «теперь собирается сам»: какие варианты собираются после переноса. Настройки — по умолчанию
// (от них зависит только «временная» у оружия в «Развитии»)
const MIGRATE_SETTINGS = { rosterOnly: false, stage: 'grow' as const, lv120: false, quirks: true };

// перенос v1 → v2. Ростер и Core Fusion (features/gear/model/fusion normalizeStored) — до подсказки autoNew: она — по итоговым пулам
// (находка 16)
function migrateV1(v1: GearStoreV1, idx: Index, roster: readonly string[]): Loaded {
  // надетого и выбранного билда в v1 нет: такие поля (не из v1) не переносим — их никто не проверял
  const { builds, v: _, worn: _w, aim: _g, pinned: _p, ...rest } = v1;
  const pools: Record<string, string[]> = {};
  const marks: Record<string, Mark> = {};
  for (const k of Object.keys(builds).sort()) {
    // ключ v1 — «персонаж/билд»; без «/» весь ключ — персонаж (indexOf −1 обрезал бы у id последнюю цифру)
    const cut = k.indexOf('/');
    const charId = cut < 0 ? k : k.slice(0, cut);
    const pool = (pools[charId] ??= []);
    for (const id of Object.values(builds[k].slots)) if (id && !pool.includes(id)) pool.push(id);
    const c = idx.CHAR[charId];
    if (c?.builds.some((b) => buildKey(c.id, b.name) === k)) marks[k] = 'want';
  }
  const n = normalizeStored(idx, roster, gc({ ...rest, v: 2, seq: v1.seq, pieces: v1.pieces, pools, marks, v1builds: builds }));
  const ctx = makeCtx(idx, MIGRATE_SETTINGS, new Set());
  const autoNew: string[] = [];
  for (const [charId, ids] of Object.entries(n.st.pools)) {
    const c = idx.CHAR[charId];
    if (!c) continue;
    // надетого у v1 нет (worn вырезан выше) — heroOpts ради одного правила с видом пула
    const p = play(ctx, c, ids.map((id) => n.st.pieces[id]), { ...heroOpts(n.st, charId), marks });
    for (const v of p.inPlay) if (!isStats(v) && !builds[v.parentKey]) autoNew.push(v.key);
  }
  return { ...n, st: autoNew.length ? { ...n.st, autoNew } : n.st };
}

// пул в хранилище — массив id. Испорченный пул не выбрасываем целиком: gc стёр бы вещи, которых нет в других пулах.
// Одна строка — пул из одной вещи; объект (например, слоты v1 { helmet: 'p1' }) — его значения; прочее — пусто
const poolIds = (x: unknown): unknown[] =>
  Array.isArray(x) ? x : typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x) : [];

// надетое и выбранный билд из сырых данных: только строки, слот — из данных; что надето не из пула героя или не в
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
// закреплённые (R3.3): не массив — отметок нет; не строки и повторы — долой; герои без пула — уберёт gc (syncWorn)
const restorePinned = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((c): c is string => typeof c === 'string'))] : [];
const restoreAim = (raw: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(record(raw)).filter((e): e is [string, string] => typeof e[1] === 'string'));

// v2: пулы — массивы строк, id только существующих вещей, без повторов; отметки — 'want' / 'skip'; надетое и билд —
// restoreWorn / restoreAim
function restoreV2(r: Partial<GearStore>, idx: Index): GearStore {
  const pieces = restorePieces(r.pieces, idx);
  const pools: Record<string, string[]> = {};
  for (const [id, x] of Object.entries((r.pools && typeof r.pools === 'object' ? r.pools : {}) as Record<string, unknown>)) {
    const ids = [...new Set(poolIds(x).filter((pid): pid is string => typeof pid === 'string' && !!pieces[pid]))];
    if (ids.length) pools[id] = ids;
  }
  const marks = Object.fromEntries(Object.entries((r.marks && typeof r.marks === 'object' ? r.marks : {}) as Record<string, unknown>)
    .filter(([, m]) => m === 'want' || m === 'skip')) as Record<string, Mark>;
  const autoNew = Array.isArray(r.autoNew) ? r.autoNew.filter((k): k is string => typeof k === 'string') : [];
  const worn = restoreWorn(r.worn), aim = restoreAim(r.aim), pinned = restorePinned(r.pinned);
  const { marks: _m, autoNew: _a, worn: _w, aim: _g, pinned: _p, ...rest } = r;
  return gc({
    ...rest, v: 2, seq: seqOf(r, pieces), pieces, pools,
    ...(Object.keys(marks).length ? { marks } : {}), ...(autoNew.length ? { autoNew } : {}),
    ...(Object.keys(worn).length ? { worn } : {}), ...(Object.keys(aim).length ? { aim } : {}),
    ...(pinned.length ? { pinned } : {}),
  });
}

// из хранилища или кода: v1 — проверка v1 и перенос; v2 — проверка; иначе (мусор, более новая версия) — пусто.
// Затем ростер и Core Fusion (features/gear/model/fusion normalizeStored): все с вещами — в ростер, есть X и Core Fusion X — остаётся
// Core Fusion; fixes и added — что поменялось (запись и сообщение после загрузки, импорт)
export type Loaded = Normalized;
export function loadGear(raw: unknown, idx: Index, roster: readonly string[]): Loaded {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { v?: unknown };
  if (r.v === 1) return migrateV1(restoreV1(r as Partial<GearStoreV1>, idx), idx, roster);
  return normalizeStored(idx, roster, r.v === 2 ? restoreV2(r as Partial<GearStore>, idx) : EMPTY);
}
// Р17: чтение ничего не отбросило — запись нормализации при загрузке не сотрёт того, что эта версия не поняла (саб не из
// данных — старая закэшированная PWA с прежним снимком, отметка или поле новой версии). Всё из сырых данных есть в
// прочитанном как было; дописанное (значения по умолчанию) — не потеря, как и счётчик seq выше и пустые пулы и отметки.
// v1 — сверка с проверкой v1 (сам перенос ничего не теряет: v1builds). Нет данных — нечего терять; мусор — теряется
export function readsWhole(raw: unknown, idx: Index): boolean {
  if (raw == null) return true;
  const r = (typeof raw === 'object' ? raw : {}) as { v?: unknown; seq?: unknown };
  const read = r.v === 1 ? restoreV1(r as Partial<GearStoreV1>, idx) : r.v === 2 ? restoreV2(r as Partial<GearStore>, idx) : null;
  return !!read && covers({ ...r, seq: read.seq }, read);
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
const EMPTY: GearStore = { v: 2, seq: 0, pieces: {}, pools: {} };

// резервная копия кодом: браузер могут очистить, а переносить между устройствами иначе нечем.
// OGC-GEAR1 (v1) читается и переносится; код новее (OGC-GEAR3…, внутри v > 2) — 'newer'
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
// копия общей записи после правки) остаются у него; надетое из ушедших — снято (gc). Выбранного билда у base нет —
// он не переходил, а без пула не хранится. Закрепление base (r.pin) — снова у base; fusion, закреплённый только
// переходом (r.pinTo нет), — снят
export function unfuseChar(st: GearStore, base: string, fusion: string, r: { moved: string[]; had: string[]; worn?: Worn; pin?: boolean; pinTo?: boolean }): GearStore {
  if (!r.moved.length || st.pools[base]?.length) return st;
  const pool = (st.pools[fusion] ?? []).filter((id) => r.had.includes(id) || !r.moved.includes(id));
  const own = st.worn?.[fusion] ?? {};
  const back = Object.entries(own).filter(([, id]) => id && r.moved.includes(id) && !r.had.includes(id));
  const w: Worn = { ...r.worn, ...Object.fromEntries(back) };
  const worn = Object.keys(w).length ? { ...st.worn, [base]: w } : st.worn;
  const next = gc({ ...st, pools: { ...st.pools, [base]: r.moved.filter((id) => st.pieces[id]), [fusion]: pool }, ...(worn ? { worn } : {}) });
  return r.pin ? setPinned(setPinned(next, base, true), fusion, !!r.pinTo) : next;
}
