// Core Fusion (правила владельца 2026-09-30). X — обычный герой, CF — Core Fusion X (fusionOf). «Есть персонаж» — он в
// ростере или у него есть вещи в пуле. В ростере никогда нет X и CF вместе; есть CF — X неактивен: не кандидат вердикта,
// не в «Кому надеть?» и не герой режима «для героя», в списке — рядом с CF с пометкой (Core Fusion X всегда сразу за X).
// Нормализация — при загрузке, переносе v1, импорте кода и пакетных правках ростера: есть оба — остаётся CF; все, у кого
// есть вещи, — в ростере (Р16, normalizeStored).
// Вещи X: у CF пусто — переходят к CF; у CF есть свои — не заменяем и не дополняем, вещи X убраны из его пула (записи,
// которые есть и у других, остаются у других).
// Надетое (worn) идёт за вещами: всё, что было надето на X, надето и на CF; убраны — не надето. Звёзды героя (stars) и N
// (crit) переходят тоже: в игре Core Fusion X сохраняет звёзды обычного героя (owner, 2026-10-11), «переносим всё»
// (owner, 2026-10-12), и эфф из игры (eff, .x/0200-boss Q3: у CF он с «≈» — свой счёт другой), и уровень героя (lv, .x/0205-hero-level: Core Fusion X сохраняет уровень, как звёзды); у второго уже есть свои — остаются они. Закрепление набора (pin) снимается: билды у героев разные
// (stat-sets PLAN Д9), а у ушедшего из ростера данных нет (owner, 2026-10-12). «Вернуть» возвращает всё это (unfuseChar).
import type { Index } from '@/game/data';
import { gc, syncWorn, type GearStore, type Worn } from './gear';
import type { EffCal } from '@/game/stat/eff';

// надетое from — к to вместе с вещами; своё надетое to в том же слоте остаётся (его вещи на нём и были)
function wornTo(worn: GearStore['worn'], from: string, to: string): GearStore['worn'] {
  if (!worn?.[from]) return worn;
  const { [from]: w, ...rest } = worn;
  return { ...rest, [to]: { ...w, ...worn[to] } };
}

type HeroMap<T> = Record<string, T> | undefined;
// значение героя (★, N) from — к to (у to своего нет); запись from убирается в любом случае (to — null: просто убрать),
// пустую карту не держим
export function entryTo<T>(m: HeroMap<T>, from: string, to: string | null): HeroMap<T> {
  if (m?.[from] === undefined) return m;
  const { [from]: v, ...rest } = m;
  const next = to !== null && rest[to] === undefined ? { ...rest, [to]: v } : rest;
  return Object.keys(next).length ? next : undefined;
}
export const starsTo = (stars: GearStore['stars'], from: string, to: string) => entryTo(stars, from, to);
// с запиской, что именно перешло: нужно «Вернуть» (gearStore unfuseChar)
const entryMoved = <T>(m: HeroMap<T>, from: string, to: string): T | undefined =>
  m?.[from] !== undefined && m[to] === undefined ? m[from] : undefined;
// карта героев в хранилище (stars, crit, pin, eff, lv): пустой нет — поля нет
export function withMap<K extends 'stars' | 'crit' | 'pin' | 'eff' | 'lv'>(st: GearStore, key: K, m: GearStore[K]): GearStore {
  if (m === st[key]) return st;
  const { [key]: _, ...rest } = st;
  return (m ? { ...rest, [key]: m } : rest) as GearStore;
}
export const withStars = (st: GearStore, stars: GearStore['stars']): GearStore => withMap(st, 'stars', stars);
// ★, N, эфф и уровень from — к to, pin from снят; что перешло и что снято — для «Вернуть»
interface Carried { stars?: number; crit?: number; pin?: string; eff?: EffCal; lv?: 100 | 120 }
function carry(st: GearStore, from: string, to: string): { st: GearStore; carried: Carried } {
  const carried: Carried = {};
  const stars = entryMoved(st.stars, from, to), crit = entryMoved(st.crit, from, to), pin = st.pin?.[from];
  const eff = entryMoved(st.eff, from, to), lv = entryMoved(st.lv, from, to);
  if (stars !== undefined) carried.stars = stars;
  if (crit !== undefined) carried.crit = crit;
  if (pin !== undefined) carried.pin = pin;
  if (eff !== undefined) carried.eff = eff;
  if (lv !== undefined) carried.lv = lv;
  const next = withMap(withMap(withMap(withMap(withMap(st, 'stars', entryTo(st.stars, from, to)), 'crit', entryTo(st.crit, from, to)), 'pin', entryTo(st.pin, from, null)),
    'eff', entryTo(st.eff, from, to)), 'lv', entryTo(st.lv, from, to));
  return { st: next, carried };
}

export interface FusionFix {
  base: string;
  fusion: string;
  kind: 'moved' | 'removed' | 'none'; // вещи X перешли к CF / убраны / у X вещей не было
  ids: string[];                      // вещи X, которые перешли или убраны
  stars?: number;                     // ★ X, которые перешли к CF
  crit?: number;                      // N X, который перешёл к CF
  eff?: EffCal;                       // эфф X из игры, который перешёл к CF
  lv?: 100 | 120;                     // уровень X, который перешёл к CF
  pin?: string;                       // закрепление X, которое снято
}

const exists = (roster: ReadonlySet<string>, pools: GearStore['pools'], id: string) => roster.has(id) || !!pools[id]?.length;

// Неактивный герой пары (X ↔ Core Fusion X): если есть Core Fusion — неактивен X (приоритет CF);
// если есть только X — неактивен Core Fusion X. Второй неактивен: не кандидат вердикта, не в «Кому надеть?»
// и не герой режима «для героя», в списке — рядом с активным с пометкой (Core Fusion X всегда сразу за X).
export function replacedX(idx: Index, roster: Iterable<string>, pools: GearStore['pools']): Map<string, string> {
  const r = new Set(roster);
  const off = new Map<string, string>();
  for (const [base, fusion] of Object.entries(idx.FUSED)) {
    if (exists(r, pools, fusion)) {
      off.set(base, fusion);
    } else if (exists(r, pools, base)) {
      off.set(fusion, base);
    }
  }
  return off;
}

// есть и X, и CF — в ростере только CF (на месте X, если X был в ростере), вещи X — по правилу выше
export function normalizeFusion(idx: Index, roster: readonly string[], st: GearStore): { roster: string[]; st: GearStore; fixes: FusionFix[] } {
  let list = [...roster];
  let cur = st;
  let pools = st.pools;
  let worn = st.worn;
  const fixes: FusionFix[] = [];
  for (const [base, fusion] of Object.entries(idx.FUSED)) {
    const r = new Set(list);
    if (!exists(r, pools, base) || !exists(r, pools, fusion)) continue;
    if (r.has(base)) list = r.has(fusion) ? list.filter((id) => id !== base) : list.map((id) => (id === base ? fusion : id));
    const ids = pools[base] ?? [];
    const c = carry(cur, base, fusion);
    cur = c.st;
    const star = c.carried;
    if (!ids.length) { fixes.push({ base, fusion, kind: 'none', ids: [], ...star }); continue; }
    const { [base]: _, ...rest } = pools;
    const kind = pools[fusion]?.length ? 'removed' : 'moved';
    pools = kind === 'moved' ? { ...rest, [fusion]: ids } : rest;
    if (kind === 'moved') worn = wornTo(worn, base, fusion);
    fixes.push({ base, fusion, kind, ids, ...star });
  }
  if (!fixes.length || (pools === st.pools && cur === st)) return { roster: list, st, fixes };
  return { roster: list, st: gc({ ...cur, pools, ...(worn ? { worn } : {}) }), fixes };
}

// Р16: вещи есть только у героев ростера. Загрузка, перенос v1, импорт кода, пакетные правки ростера: каждый, у кого есть
// вещи, — в ростер, затем правило Core Fusion. Одна чистая функция над {ростер, хранилище}. Core Fusion считается первым:
// «есть персонаж» у него — в ростере или с вещами, так что итог тот же, что «сначала в ростер», а Core Fusion встаёт на
// место X. После него у X при Core Fusion вещей нет — добавленные в ростер конфликта не создают. added — кого добавили
// (только герои из данных: незнакомый id не показать и не убрать звездой — его пул лежит, как лежал). cleared — героев
// не в ростере, чьи pin, N, ★, эфф и уровень убраны (owner 2026-10-12: убрал героя из ростера — его данных нет; X при Core Fusion отдал
// ★ и N ему, а pin снят — у X тоже ничего), незнакомый id — как лежал
export interface Normalized { roster: string[]; st: GearStore; fixes: FusionFix[]; added: string[]; cleared: string[] }
export function normalizeStored(idx: Index, roster: readonly string[], st: GearStore): Normalized {
  const n = normalizeFusion(idx, roster, st);
  const added = Object.keys(n.st.pools).filter((id) => idx.CHAR[id] && n.st.pools[id].length && !n.roster.includes(id));
  const list = added.length ? [...n.roster, ...added] : n.roster;
  const { st: next, cleared } = clearOutside(idx, list, n.st);
  return { ...n, st: next, roster: list, added, cleared };
}
// pin, N, ★, эфф из игры и уровень только у героев ростера (незнакомый id — как лежал)
function clearOutside(idx: Index, roster: readonly string[], st: GearStore): { st: GearStore; cleared: string[] } {
  const own = new Set(roster);
  const keep = (id: string) => !idx.CHAR[id] || own.has(id);
  const cleared = new Set<string>();
  const part = <T>(m: Record<string, T> | undefined) => {
    if (!m) return m;
    const out = Object.fromEntries(Object.entries(m).filter(([id]) => keep(id) || !cleared.add(id)));
    return Object.keys(out).length === Object.keys(m).length ? m : out;
  };
  const pin = part(st.pin), crit = part(st.crit), stars = part(st.stars), eff = part(st.eff), lv = part(st.lv);
  if (!cleared.size) return { st, cleared: [] };
  const { pin: _p, crit: _c, stars: _s, eff: _e, lv: _l, ...rest } = st;
  const has = <T>(m: Record<string, T> | undefined) => (m && Object.keys(m).length ? m : undefined);
  const next: GearStore = { ...rest };
  if (has(pin)) next.pin = pin;
  if (has(crit)) next.crit = crit;
  if (has(stars)) next.stars = stars;
  if (has(eff)) next.eff = eff;
  if (has(lv)) next.lv = lv;
  return { st: next, cleared: [...cleared] };
}
// нормализация что-то поменяла — хранилище пора переписать (Р17)
export const changed = (n: Pick<Normalized, 'fixes' | 'added'>) => n.fixes.length > 0 || n.added.length > 0;

// окно перехода (звезда, «Надеть», оценка для героя): «Да, Core Fusion X» или «Да, X». to — кого выбрали, from — второй из пары;
// в ростере — только to (на месте from), вещи from — к to, надетое from — тоже (wornTo). moved / had / worn (надетое
// from до перехода) — для «Вернуть» (gearStore unfuseChar)
export interface Switch extends Carried { to: string; from: string; roster: string[]; st: GearStore; moved: string[]; had: string[]; worn?: Worn }
export function switchFusion(idx: Index, roster: readonly string[], st: GearStore, to: string): Switch | null {
  const from = idx.CHAR[to]?.fusionOf ?? idx.FUSED[to];
  if (!from) return null;
  const list = roster.includes(from)
    ? (roster.includes(to) ? roster.filter((id) => id !== from) : roster.map((id) => (id === from ? to : id)))
    : roster.includes(to) ? [...roster] : [...roster, to];
  const moved = st.pools[from] ?? [];
  const had = st.pools[to] ?? [];
  const { st: base, carried: star } = carry(st, from, to);
  if (!moved.length) return { to, from, roster: list, st: base, moved, had, ...star };
  const { [from]: _, ...rest } = st.pools;
  const pools = { ...rest, [to]: [...had, ...moved.filter((id) => !had.includes(id))] };
  const worn = wornTo(st.worn, from, to);
  const next = syncWorn({ ...base, pools, ...(worn ? { worn } : {}) });
  return { to, from, roster: list, st: next, moved, had, ...(st.worn?.[from] ? { worn: st.worn[from] } : {}), ...star };
}

// будет ли окно перехода у героя (звезда, «Надеть», оценка для героя): второй из пары есть — в ростере или с вещами. Его id
export function gateOf(idx: Index, roster: ReadonlySet<string>, pools: GearStore['pools'], to: string): string | null {
  const from = idx.CHAR[to]?.fusionOf ?? idx.FUSED[to];
  return from && exists(roster, pools, from) ? from : null;
}

// хранилище, на котором «Надеть» на героя сделает putOn: после «Да» в окне перехода — вещи второго уже у него: строка и
// кнопка — по нему. Окна не будет или вещи не переходят — то же хранилище
export function storeFor(idx: Index, roster: ReadonlySet<string>, st: GearStore, to: string): GearStore {
  return gateOf(idx, roster, st.pools, to) ? switchFusion(idx, [...roster], st, to)?.st ?? st : st;
}
