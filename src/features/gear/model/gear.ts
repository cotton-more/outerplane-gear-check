// Экипировка: вещи персонажа (пул, GEARPOOL). Чистые данные и операции — без React и хранилища; билды собираются
// из пула сами (features/gear/pool), операции «Надеть», «Убрать» — там же. Вещь попадает в пул только из оценки («Надеть» в
// вердикте): сегменты (1–6, один уровень) и «T4» — как на форме; сделал в игре Reforge или Breakthrough — правка в
// шторке вещи (updateIn). Enhance не храним: считаем +10. Пулы независимы (В9): «Надеть» всегда кладёт новую запись;
// старая общая запись (из прежних версий) делится, когда её правят у одного героя.
import { SLOTS, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import { subAllowed } from '@/game/item/mains';
import { CRIT_NEED, pinOf, pinOptions } from '@/game/build/profile';
import { comboSig } from '@/game/build/variants';
import { DROP_LEVEL, MAX_LIT, MAX_SUBS, withinCap, type Subs } from '@/game/item/subs';
import { type Bt, type ItemInput } from '@/game/item/item';
import type { EffCal } from '@/game/stat/eff';


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

// Хранилище v3 (GEARPOOL, stat-sets PLAN Д11): вещи — у персонажа. pools — id вещей персонажа в порядке добавления; пулы
// независимы (В9), но старая запись (из прежних версий) может быть в пулах нескольких героев — делится при правке
// (updateIn). Незнакомые поля переносятся как есть. worn — что надето на персонаже: слот → id записи его пула (надетое ⊂
// пул, слот записи = ключ; syncWorn). pin — закреплённый набор героя (MODEL.md §6): ключ pinKey
// («герой/билд#подпись»); от пула не зависит — герой из ростера может закрепить набор до первой вещи. Пустых worn и pin
// не храним. crit — the hero's N, how much crit the hero needs (MODEL.md §12 item 1): an integer 0…100, no record — 100;
// like pin, it doesn't depend on the pool and Core Fusion doesn't move it. Поля v2 — «Собираю» (marks), autoNew, выбранный билд (aim), булавка обмена (pinned), билды v1 (v1builds) —
// снимает перенос (features/gear/store/gearStore)
export type Worn = Partial<Record<SlotId, string>>;
export interface GearStore {
  v: 3;
  seq: number;                        // счётчик id вещей
  pieces: Record<string, Piece>;
  pools: Record<string, string[]>;
  worn?: Record<string, Worn>;
  pin?: Record<string, string>;
  crit?: Record<string, number>;
  // hero → in-game ★1…6 (transcend); no entry — not set. Doesn't depend on the pool; Core Fusion moves it X → CF with
  // the pieces, the game keeps the stars (owner, Z7) — unlike pin and N
  stars?: Record<string, number>;
  // hero → the stat-screen EFF the player typed and the app's EFF at that moment (.x/0200-boss Q3, game/stat/eff
  // effShown): the card shows the app's EFF × typed / at. No entry — not typed. Like crit and stars: doesn't depend on the
  // pool, Core Fusion moves it X → CF (shown with «≈» there: CF's own count differs)
  eff?: Record<string, EffCal>;
  // hero → the white-stat level marked on the card, 100 or 120 (.x/0205-hero-level); no entry — the settings default
  // (lv120). Doesn't depend on the pool; Core Fusion moves it X → CF like the stars (in the game Core Fusion X keeps the
  // hero's level as it keeps the stars)
  lv?: Record<string, 100 | 120>;
  // parked pieces (MODEL.md §5, .x/0200-boss E2b Q2–Q3): taken off in a trade and given to nobody — they stay in the pool
  // of the hero they came off, not worn, locked in the game, until someone wears them. Ids in the order parked; park ⊂
  // pooled and not worn (syncWorn). The verdict, reserves, material and the batch see a pool without them (activePieces);
  // the trade offers them first. No field — nothing parked
  park?: string[];
  [extra: string]: unknown;
}

export const EMPTY_GEAR: GearStore = { v: 3, seq: 0, pieces: {}, pools: {} };
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

// parked ids of a store (MODEL.md §5)
export const parkedOf = (st: { park?: readonly string[] }): Set<string> => new Set(st.park ?? []);
// a hero's pool as the verdict sees it (MODEL.md §5, .x/0200-boss E2b O2): parked pieces left out — never a Breakthrough
// target, feed, reserve or the bar a new piece is held against; but — a piece the caller is about to wear (wearFromPool)
type PoolsOf = { pieces: Readonly<Record<string, Piece>>; pools: Readonly<Record<string, readonly string[]>>; park?: readonly string[] };
export function activePieces(st: PoolsOf, charId: string, but?: string): Piece[] {
  const park = parkedOf(st);
  return (st.pools[charId] ?? []).filter((id) => id === but || !park.has(id)).map((id) => st.pieces[id]).filter((p): p is Piece => !!p);
}
// «Ещё» → «Припаркованные» (.x/0204-parked-list): parked pieces by the hero whose pool holds them — heroes in `order`
// (the roster's), the rest after them; a hero's pieces in slot order. A record two heroes share is under both
export interface ParkedGroup { hero: string; pieces: Piece[] }
export function parkedGroups(st: GearStore, order: readonly string[]): ParkedGroup[] {
  const park = parkedOf(st);
  if (!park.size) return [];
  const heroes = [...order.filter((c) => st.pools[c]), ...Object.keys(st.pools).filter((c) => !order.includes(c))];
  return heroes.map((hero) => ({
    hero,
    pieces: SLOTS.flatMap(({ id: slot }) => st.pools[hero].filter((id) => park.has(id)).map((id) => st.pieces[id]).filter((p) => p?.slot === slot)),
  })).filter((g) => g.pieces.length);
}
export const parkedCount = (st: GearStore): number => parkedGroups(st, []).reduce((n, g) => n + g.pieces.length, 0);

// park pieces (they must sit in a pool and be worn by nobody — syncWorn drops the rest); nothing new — the same store
export function parkIn(st: GearStore, ids: readonly string[]): GearStore {
  const park = [...(st.park ?? [])];
  for (const id of ids) if (!park.includes(id)) park.push(id);
  return park.length === (st.park?.length ?? 0) ? st : syncWorn({ ...st, park });
}

// вещи, которых нет ни в одном пуле, из хранилища убираем; пустые пулы — тоже; затем надетое — по пулам (syncWorn)
export function gc(st: GearStore): GearStore {
  const pools = Object.fromEntries(Object.entries(st.pools).filter(([, ids]) => ids.length));
  const used = new Set(Object.values(pools).flat());
  const pieces = Object.fromEntries(Object.entries(st.pieces).filter(([id]) => used.has(id)));
  return syncWorn({ ...st, pieces, pools });
}

// надетое ⊂ пул: из worn — записи не из пула героя, со слотом не того типа, герои без пула и пустые. Ничего не убрано —
// то же хранилище; поле опустело — убираем его (пустых не храним). Then park: only pooled pieces nobody wears (syncPark)
export function syncWorn(st: GearStore): GearStore {
  return syncPark(syncWornOnly(st));
}
// park ⊂ pooled, not worn, no repeats: a parked piece someone now wears is not parked any more (the mark goes, Q3); a piece
// that left every pool is gone. Nothing dropped — the same store; empty — no field
function syncPark(st: GearStore): GearStore {
  if (!st.park) return st;
  const pooled = new Set(Object.values(st.pools).flat());
  const worn = new Set(Object.values(st.worn ?? {}).flatMap((w) => Object.values(w ?? {})));
  const park = [...new Set(st.park)].filter((id) => typeof id === 'string' && pooled.has(id) && !worn.has(id) && !!st.pieces[id]);
  if (park.length === st.park.length && park.length) return st;
  const { park: _, ...rest } = st;
  return park.length ? { ...rest, park } : rest as GearStore;
}
function syncWornOnly(st: GearStore): GearStore {
  if (!st.worn) return st;
  let cut = false;
  const worn: Record<string, Worn> = {};
  for (const [c, w] of Object.entries(st.worn)) {
    const pool = st.pools[c] ?? [];
    const all = Object.entries(w ?? {});
    const kept = all.filter(([slot, id]) => typeof id === 'string' && pool.includes(id) && st.pieces[id]?.slot === slot);
    if (kept.length !== all.length || !kept.length) cut = true;
    if (kept.length) worn[c] = Object.fromEntries(kept);
  }
  if (!cut) return st;
  const next = { ...st };
  if (Object.keys(worn).length) next.worn = worn; else delete next.worn;
  return next;
}

// надета ли запись на этом герое (для «Вернуть» после «Убрать у X»)
export const isWorn = (st: GearStore, charId: string, p: Pick<Piece, 'id' | 'slot'>): boolean => st.worn?.[charId]?.[p.slot] === p.id;

// Р16: сняли звезду с героя, у которого есть вещи, и сказали «Да, убрать» — его пул, надетое и закрепление уходят; записи,
// которые есть и у других, остаются у них (gc). Dropped — всё, что ушло, для «Вернуть»
export interface Dropped {
  charId: string; ids: string[]; pieces: Record<string, Piece>; at: number;
  worn?: Worn; pin?: string; crit?: number; stars?: number; eff?: EffCal; lv?: 100 | 120; park?: string[];
}
export function dropChar(st: GearStore, charId: string): { st: GearStore; dropped: Dropped } {
  const ids = st.pools[charId] ?? [];
  const { [charId]: _, ...pools } = st.pools;
  const { pin: _p, crit: _c, stars: _s, eff: _e, lv: _l, ...rest } = st;
  const { [charId]: myPin, ...pin } = st.pin ?? {};
  const { [charId]: myCrit, ...crit } = st.crit ?? {};
  const { [charId]: myStars, ...stars } = st.stars ?? {};
  const { [charId]: myEff, ...eff } = st.eff ?? {};
  const { [charId]: myLv, ...lv } = st.lv ?? {};
  const next = gc({
    ...rest, pools, ...(Object.keys(pin).length ? { pin } : {}), ...(Object.keys(crit).length ? { crit } : {}),
    ...(Object.keys(stars).length ? { stars } : {}), ...(Object.keys(eff).length ? { eff } : {}),
    ...(Object.keys(lv).length ? { lv } : {}),
  });
  const parked = ids.filter((id) => st.park?.includes(id) && !next.park?.includes(id));
  const dropped: Dropped = {
    charId, ids,
    ...(parked.length ? { park: parked } : {}),
    pieces: Object.fromEntries(ids.filter((id) => !next.pieces[id] && st.pieces[id]).map((id) => [id, st.pieces[id]])),
    at: Object.keys(st.pools).indexOf(charId),
    ...(st.worn?.[charId] ? { worn: st.worn[charId] } : {}),
    ...(myPin !== undefined ? { pin: myPin } : {}),
    ...(myCrit !== undefined ? { crit: myCrit } : {}),
    ...(myStars !== undefined ? { stars: myStars } : {}),
    ...(myEff !== undefined ? { eff: myEff } : {}),
    ...(myLv !== undefined ? { lv: myLv } : {}),
  };
  return { st: next, dropped };
}
// «Вернуть» после dropChar: записи, пул на прежнем месте, надетое и закрепление — как были. За эти секунды герою успели
// дать что-то новое — оно остаётся после прежних; надетое в слоте, закрепление или N успели выбрать заново — их не трогаем
export function undoDrop(st: GearStore, d: Dropped): GearStore {
  const pieces = { ...d.pieces, ...st.pieces };
  const pool = [...d.ids.filter((id) => pieces[id]), ...(st.pools[d.charId] ?? []).filter((id) => !d.ids.includes(id))];
  const entries = Object.entries(st.pools).filter(([c]) => c !== d.charId);
  if (pool.length) entries.splice(Math.min(Math.max(d.at, 0), entries.length), 0, [d.charId, pool]);
  const worn = d.worn ? { ...st.worn, [d.charId]: { ...d.worn, ...st.worn?.[d.charId] } } : st.worn;
  const pin = d.pin !== undefined ? { ...st.pin, [d.charId]: st.pin?.[d.charId] ?? d.pin } : st.pin;
  const crit = d.crit !== undefined ? { ...st.crit, [d.charId]: st.crit?.[d.charId] ?? d.crit } : st.crit;
  const stars = d.stars !== undefined ? { ...st.stars, [d.charId]: st.stars?.[d.charId] ?? d.stars } : st.stars;
  const eff = d.eff !== undefined ? { ...st.eff, [d.charId]: st.eff?.[d.charId] ?? d.eff } : st.eff;
  const lv = d.lv !== undefined ? { ...st.lv, [d.charId]: st.lv?.[d.charId] ?? d.lv } : st.lv;
  const park = d.park ? [...(st.park ?? []), ...d.park.filter((id) => !st.park?.includes(id))] : st.park;
  return syncWorn({
    ...st, pieces, pools: Object.fromEntries(entries), ...(worn ? { worn } : {}), ...(pin ? { pin } : {}), ...(crit ? { crit } : {}),
    ...(stars ? { stars } : {}), ...(eff ? { eff } : {}), ...(lv ? { lv } : {}), ...(park ? { park } : {}),
  });
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
  if (st.park?.includes(id)) next.park = [...st.park, nid]; // the copy is the same parked piece of this hero
  return { st: syncWorn(next), id: nid };
}

// только для тестов: записи прежней правки (bt 1–3, оранжевые) и прямые патчи; в приложении правка — updateIn
export function updatePiece(st: GearStore, id: string, patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>, at = today()): GearStore {
  const p = st.pieces[id];
  return p ? { ...st, pieces: { ...st.pieces, [id]: { ...p, ...patch, at } } } : st;
}

// Закрепить набор (key — profile pinKey) или снять (null — «По статам»). was — что стояло, для «Вернуть». Ничего не
// поменялось — то же хранилище
export interface PinResult { st: GearStore; was: string | null; now: string | null }
export function setPin(st: GearStore, charId: string, key: string | null): PinResult {
  const was = st.pin?.[charId] ?? null;
  if (was === key) return { st, was, now: key };
  const { [charId]: _, ...rest } = st.pin ?? {};
  const pin = key === null ? rest : { ...rest, [charId]: key };
  const next: GearStore = { ...st, pin };
  if (!Object.keys(pin).length) delete next.pin;
  return { st: next, was, now: key };
}
// «Вернуть»: только если стоит то, что записано этим действием
export const undoPin = (st: GearStore, charId: string, r: Pick<PinResult, 'was' | 'now'>): GearStore =>
  ((st.pin?.[charId] ?? null) === r.now ? setPin(st, charId, r.was).st : st);

// the hero's N — how much crit the hero needs (MODEL.md §12 item 1); no record — CRIT_NEED
export { CRIT_NEED };
export const critNeed = (st: Pick<GearStore, 'crit'>, charId: string): number => st.crit?.[charId] ?? CRIT_NEED;
// set N (an integer 0…100; null or CRIT_NEED — «Сбросить», the record goes). Nothing changed — the same store
export function setCrit(st: GearStore, charId: string, n: number | null): GearStore {
  const v = n === null ? CRIT_NEED : Math.max(0, Math.min(CRIT_NEED, Math.round(n)));
  if (critNeed(st, charId) === v) return st;
  const { [charId]: _, ...rest } = st.crit ?? {};
  const crit = v === CRIT_NEED ? rest : { ...rest, [charId]: v };
  const next: GearStore = { ...st, crit };
  if (!Object.keys(crit).length) delete next.crit;
  return next;
}

// the hero's in-game ★ (transcend, 1…6); null — not set: no crit from stars is counted (MODEL.md §12 item 2)
export const STARS = 6;
export const starOf = (st: Pick<GearStore, 'stars'>, charId: string): number | null => st.stars?.[charId] ?? null;
// set the stars (an integer 1…6; null removes the record). Anything else or nothing changed — the same store
export function setStars(st: GearStore, charId: string, n: number | null): GearStore {
  if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= STARS)) return st;
  if (starOf(st, charId) === n) return st;
  const { [charId]: _, ...rest } = st.stars ?? {};
  const stars = n === null ? rest : { ...rest, [charId]: n };
  const next: GearStore = { ...st, stars };
  if (!Object.keys(stars).length) delete next.stars;
  return next;
}

// the hero's white-stat level marked on the card (100 or 120); null — not marked: the settings default applies
export const levelOf = (st: Pick<GearStore, 'lv'>, charId: string): 100 | 120 | null => st.lv?.[charId] ?? null;
// mark the level (100 or 120; null removes the mark — back to the default). Anything else or nothing changed — the same store
export function setLevel(st: GearStore, charId: string, v: 100 | 120 | null): GearStore {
  if (v !== null && v !== 100 && v !== 120) return st;
  if (levelOf(st, charId) === v) return st;
  const { [charId]: _, ...rest } = st.lv ?? {};
  const lv = v === null ? rest : { ...rest, [charId]: v };
  const next: GearStore = { ...st, lv };
  if (!Object.keys(lv).length) delete next.lv;
  return next;
}

// the typed stat-screen EFF (.x/0200-boss Q3): typed — what the game shows, at — the app's EFF then; null — not typed
export const EFF_MAX = 9999;
export const effCal = (st: Pick<GearStore, 'eff'>, charId: string): EffCal | null => st.eff?.[charId] ?? null;
// store it (typed and at — integers 1…EFF_MAX) or drop it (null — «Сбросить»). Anything else or nothing changed — the same store
const okEff = (n: number) => Number.isInteger(n) && n >= 1 && n <= EFF_MAX;
export function setEff(st: GearStore, charId: string, cal: EffCal | null): GearStore {
  if (cal !== null && !(okEff(cal.typed) && okEff(cal.at))) return st;
  const was = effCal(st, charId);
  if (was === cal || (was && cal && was.typed === cal.typed && was.at === cal.at)) return st;
  const { [charId]: _, ...rest } = st.eff ?? {};
  const eff = cal === null ? rest : { ...rest, [charId]: { typed: cal.typed, at: cal.at } };
  const next: GearStore = { ...st, eff };
  if (!Object.keys(eff).length) delete next.eff;
  return next;
}

// закрепления, которых больше нет в данных (билд переименовали или убрали набор, PLAN Д9): герой → ключ. Героя нет в
// данных — не трогаем (его пул лежит, как лежал)
export function stalePins(idx: Index, st: Pick<GearStore, 'pin'>): Record<string, string> {
  return Object.fromEntries(Object.entries(st.pin ?? {}).filter(([c, key]) => idx.CHAR[c] && !pinOf(idx.CHAR[c], key)));
}

// Устаревшие закрепления (В5 ревью этапа 10): билда с ключа нет, а тот же набор с той же цепочкой есть в другом билде —
// закрепление молча переходит на первый такой (порядок outerpedia); нет — снимается (gone — для сообщения). Цепочку
// пропавшего билда ключ не хранит: если билд пропал целиком, переносим, только когда цепочка у героя одна
export function fixPins(idx: Index, st: GearStore): { st: GearStore; gone: [string, string][] } {
  const gone: [string, string][] = [];
  let next = st;
  for (const [id, key] of Object.entries(stalePins(idx, st))) {
    const c = idx.CHAR[id];
    const sig = key.slice(key.lastIndexOf('#') + 1);
    const name = key.slice(id.length + 1, key.lastIndexOf('#'));
    const had = c.builds.find((b) => b.name === name);
    const chains = new Set(c.builds.map((b) => JSON.stringify(b.subs)));
    const chain = had ? JSON.stringify(had.subs) : chains.size === 1 ? [...chains][0] : null;
    const to = chain === null ? undefined : pinOptions(c).find((p) => comboSig(p.combo) === sig && JSON.stringify(p.build.subs) === chain);
    if (!to) gone.push([id, key]);
    next = setPin(next, id, to ? to.key : null).st;
  }
  return { st: next, gone };
}
