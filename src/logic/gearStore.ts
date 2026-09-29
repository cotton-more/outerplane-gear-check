// Экипировка в хранилище и в коде копии: чтение с проверкой, перенос v1 → v2 (GEARPOOL), код OGC-GEAR2.
// Перенос детерминированный: все вещи v1 — в пул персонажа (запись у двух персонажей — в оба пула, без копии),
// билды v1 с вещами — «Собираю». Ни одна вещь и ни одно поле не теряются: билды v1 как были — в v1builds (не читается).
import { GRADES, SLOTS, isArmor, type Index } from '../data';
import type { Grade, SlotId } from '../data/types';
import { makeCtx } from './context';
import { buildKey, gc, MAX_LIT, type Bt, type GearStore, type Mark, type Piece } from './gear';
import { isStats, play } from './pool';
import { MAX_SUBS, type Subs } from './subs';

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
const seqOf = (r: { seq?: unknown }, pieces: Record<string, Piece>) =>
  Math.max(typeof r.seq === 'number' ? r.seq : 0, ...Object.keys(pieces).map((id) => Number(id.slice(1)) || 0));

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
const MIGRATE_SETTINGS = { rosterOnly: false, fodder: true, stage: 'grow' as const, lv120: false, quirks: true };

// перенос v1 → v2
export function migrateV1(v1: GearStoreV1, idx: Index): GearStore {
  const { builds, v: _, ...rest } = v1;
  const pools: Record<string, string[]> = {};
  const marks: Record<string, Mark> = {};
  for (const k of Object.keys(builds).sort()) {
    const charId = k.slice(0, k.indexOf('/'));
    const pool = (pools[charId] ??= []);
    for (const id of Object.values(builds[k].slots)) if (id && !pool.includes(id)) pool.push(id);
    const c = idx.CHAR[charId];
    if (c?.builds.some((b) => buildKey(c.id, b.name) === k)) marks[k] = 'want';
  }
  const ctx = makeCtx(idx, MIGRATE_SETTINGS, new Set());
  const autoNew: string[] = [];
  for (const [charId, ids] of Object.entries(pools)) {
    const c = idx.CHAR[charId];
    if (!c) continue;
    const p = play(ctx, c, ids.map((id) => v1.pieces[id]), { marks });
    for (const v of p.inPlay) if (!isStats(v) && !builds[v.parentKey]) autoNew.push(v.key);
  }
  return gc({ ...rest, v: 2, seq: v1.seq, pieces: v1.pieces, pools, marks, ...(autoNew.length ? { autoNew } : {}), v1builds: builds });
}

// v2: пулы — массивы строк, id только существующих вещей, без повторов; отметки — 'want' / 'skip'
function restoreV2(r: Partial<GearStore>, idx: Index): GearStore {
  const pieces = restorePieces(r.pieces, idx);
  const pools: Record<string, string[]> = {};
  for (const [id, x] of Object.entries((r.pools && typeof r.pools === 'object' ? r.pools : {}) as Record<string, unknown>)) {
    if (!Array.isArray(x)) continue;
    const ids = [...new Set(x.filter((pid): pid is string => typeof pid === 'string' && !!pieces[pid]))];
    if (ids.length) pools[id] = ids;
  }
  const marks = Object.fromEntries(Object.entries((r.marks && typeof r.marks === 'object' ? r.marks : {}) as Record<string, unknown>)
    .filter(([, m]) => m === 'want' || m === 'skip')) as Record<string, Mark>;
  const autoNew = Array.isArray(r.autoNew) ? r.autoNew.filter((k): k is string => typeof k === 'string') : [];
  const { marks: _m, autoNew: _a, ...rest } = r;
  return gc({
    ...rest, v: 2, seq: seqOf(r, pieces), pieces, pools,
    ...(Object.keys(marks).length ? { marks } : {}), ...(autoNew.length ? { autoNew } : {}),
  });
}

// Core Fusion X заменяет X (решение владельца): вещи есть у обоих (перенос v1, импорт кода, старая запись) —
// вещи X переходят к Core Fusion X (те же записи), пул X убран. «Собираю» X не переносим: билды другие
export function mergeFused(st: GearStore, idx: Index): GearStore {
  let pools = st.pools;
  for (const [base, fusion] of Object.entries(idx.FUSED)) {
    if (!pools[base]?.length || !pools[fusion]?.length) continue;
    const { [base]: moved, ...rest } = pools;
    pools = { ...rest, [fusion]: [...pools[fusion], ...moved.filter((id) => !pools[fusion].includes(id))] };
  }
  return pools === st.pools ? st : { ...st, pools };
}

// из хранилища: v1 — проверка v1 и перенос; v2 — проверка; иначе (мусор, более новая версия) — пусто
export function restoreGear(raw: unknown, idx: Index): GearStore {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const r = raw as { v?: unknown };
  if (r.v === 1) return mergeFused(migrateV1(restoreV1(raw as Partial<GearStoreV1>, idx), idx), idx);
  if (r.v === 2) return mergeFused(restoreV2(raw as Partial<GearStore>, idx), idx);
  return EMPTY;
}
const EMPTY: GearStore = { v: 2, seq: 0, pieces: {}, pools: {} };

// резервная копия кодом: браузер могут очистить, а переносить между устройствами иначе нечем.
// OGC-GEAR1 (v1) читается и переносится; код новее (OGC-GEAR3…, внутри v > 2) — 'newer'
const PREFIX = 'OGC-GEAR';
export const encodeGear = (st: GearStore): string =>
  `${PREFIX}2 ` + btoa(unescape(encodeURIComponent(JSON.stringify(st)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function decodeGear(text: string, idx: Index): GearStore | 'newer' | null {
  const m = /^OGC-GEAR(\d+)\s+([\s\S]+)$/.exec(text.trim());
  if (!m) return null;
  if (Number(m[1]) > 2) return 'newer';
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(m[2].replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')))));
    if (newerGear(raw)) return 'newer';
    const st = restoreGear(raw, idx);
    return Object.keys(st.pieces).length ? st : null;
  } catch {
    return null;
  }
}

// Core Fusion X попал в ростер, а у X есть вещи: они переходят к Core Fusion X. moved — что перешло (для «Вернуть»)
export function fuseChar(st: GearStore, base: string, fusion: string): { st: GearStore; moved: string[]; had: string[] } {
  const moved = st.pools[base] ?? [];
  if (!moved.length) return { st, moved: [], had: st.pools[fusion] ?? [] };
  const had = st.pools[fusion] ?? [];
  const { [base]: _, ...rest } = st.pools;
  return { st: { ...st, pools: { ...rest, [fusion]: [...had, ...moved.filter((id) => !had.includes(id))] } }, moved, had };
}
// «Вернуть»: вещи — снова у X, у Core Fusion X — то, что было; X успели дать что-то своё — не трогаем
export function unfuseChar(st: GearStore, base: string, fusion: string, r: { moved: string[]; had: string[] }): GearStore {
  if (!r.moved.length || st.pools[base]?.length) return st;
  const pool = (st.pools[fusion] ?? []).filter((id) => r.had.includes(id) || !r.moved.includes(id));
  return gc({ ...st, pools: { ...st.pools, [base]: r.moved.filter((id) => st.pieces[id]), [fusion]: pool } });
}
