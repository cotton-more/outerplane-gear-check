// Core Fusion (правила владельца 2026-09-30). X — обычный герой, CF — Core Fusion X (fusionOf). «Есть персонаж» — он в
// ростере или у него есть вещи в пуле. В ростере никогда нет X и CF вместе; есть CF — X неактивен: не кандидат вердикта,
// не в «Кому надеть?» и не герой режима «для героя», в списке — рядом с CF с пометкой (Core Fusion X всегда сразу за X).
// Нормализация — при загрузке, переносе v1, импорте кода и пакетных правках ростера: есть оба — остаётся CF; все, у кого
// есть вещи, — в ростере (Р16, normalizeStored).
// Вещи X: у CF пусто — переходят к CF; у CF есть свои — не заменяем и не дополняем, вещи X убраны из его пула (записи,
// которые есть и у других, остаются у других). «Собираю» не переносится: билды у героев разные.
// Надетое (worn) идёт за вещами: всё, что было надето на X, надето и на CF; убраны — не надето. Выбранный билд (aim)
// не переносится — по той же причине, что «Собираю»; у героя без пула его нет (syncWorn).
// Закрепление (обмен, R3.4): CF закреплён, если закреплён X или CF — и при переходе вещей, и при слиянии пулов.
import type { Index } from '@/game/data';
import { gc, syncWorn, type GearStore, type Worn } from './gear';

// надетое from — к to вместе с вещами; своё надетое to в том же слоте остаётся (его вещи на нём и были)
function wornTo(worn: GearStore['worn'], from: string, to: string): GearStore['worn'] {
  if (!worn?.[from]) return worn;
  const { [from]: w, ...rest } = worn;
  return { ...rest, [to]: { ...w, ...worn[to] } };
}

export interface FusionFix {
  base: string;
  fusion: string;
  kind: 'moved' | 'removed' | 'none'; // вещи X перешли к CF / убраны / у X вещей не было
  ids: string[];                      // вещи X, которые перешли или убраны
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
  let pools = st.pools;
  let worn = st.worn;
  const fixes: FusionFix[] = [];
  for (const [base, fusion] of Object.entries(idx.FUSED)) {
    const r = new Set(list);
    if (!exists(r, pools, base) || !exists(r, pools, fusion)) continue;
    if (r.has(base)) list = r.has(fusion) ? list.filter((id) => id !== base) : list.map((id) => (id === base ? fusion : id));
    const ids = pools[base] ?? [];
    if (!ids.length) { fixes.push({ base, fusion, kind: 'none', ids: [] }); continue; }
    const { [base]: _, ...rest } = pools;
    const kind = pools[fusion]?.length ? 'removed' : 'moved';
    pools = kind === 'moved' ? { ...rest, [fusion]: ids } : rest;
    if (kind === 'moved') worn = wornTo(worn, base, fusion);
    fixes.push({ base, fusion, kind, ids });
  }
  if (!fixes.length) return { roster: list, st, fixes };
  // подсказка «теперь собирается сам» у X без вещей не нужна (находка 16)
  const autoNew = st.autoNew?.filter((k) => !fixes.some((f) => k.startsWith(f.base + '/')));
  const { autoNew: _a, ...rest } = st;
  const next = { ...rest, pools, ...(worn ? { worn } : {}), ...(autoNew?.length ? { autoNew } : {}) };
  return { roster: list, st: pools === st.pools && autoNew?.length === st.autoNew?.length ? st : gc(next), fixes };
}

// Р16: вещи есть только у героев ростера. Загрузка, перенос v1, импорт кода, пакетные правки ростера: каждый, у кого есть
// вещи, — в ростер, затем правило Core Fusion. Одна чистая функция над {ростер, хранилище}. Core Fusion считается первым:
// «есть персонаж» у него — в ростере или с вещами, так что итог тот же, что «сначала в ростер», а Core Fusion встаёт на
// место X. После него у X при Core Fusion вещей нет — добавленные в ростер конфликта не создают. added — кого добавили
// (только герои из данных: незнакомый id не показать и не убрать звездой — его пул лежит, как лежал)
export interface Normalized { roster: string[]; st: GearStore; fixes: FusionFix[]; added: string[] }
export function normalizeStored(idx: Index, roster: readonly string[], st: GearStore): Normalized {
  const n = normalizeFusion(idx, roster, st);
  const added = Object.keys(n.st.pools).filter((id) => idx.CHAR[id] && n.st.pools[id].length && !n.roster.includes(id));
  return { ...n, roster: added.length ? [...n.roster, ...added] : n.roster, added };
}
// нормализация что-то поменяла — хранилище пора переписать (Р17)
export const changed = (n: Pick<Normalized, 'fixes' | 'added'>) => n.fixes.length > 0 || n.added.length > 0;

// окно перехода (звезда, «Надеть», оценка для героя): «Да, Core Fusion X» или «Да, X». to — кого выбрали, from — второй из пары;
// в ростере — только to (на месте from), вещи from — к to, надетое from — тоже (wornTo). moved / had / worn (надетое
// from до перехода) — для «Вернуть» (gearStore unfuseChar)
export interface Switch { to: string; from: string; roster: string[]; st: GearStore; moved: string[]; had: string[]; worn?: Worn }
export function switchFusion(idx: Index, roster: readonly string[], st: GearStore, to: string): Switch | null {
  const from = idx.CHAR[to]?.fusionOf ?? idx.FUSED[to];
  if (!from) return null;
  const list = roster.includes(from)
    ? (roster.includes(to) ? roster.filter((id) => id !== from) : roster.map((id) => (id === from ? to : id)))
    : roster.includes(to) ? [...roster] : [...roster, to];
  const moved = st.pools[from] ?? [];
  const had = st.pools[to] ?? [];
  if (!moved.length) return { to, from, roster: list, st, moved, had };
  const { [from]: _, ...rest } = st.pools;
  const pools = { ...rest, [to]: [...had, ...moved.filter((id) => !had.includes(id))] };
  const worn = wornTo(st.worn, from, to);
  const next = syncWorn({ ...st, pools, ...(worn ? { worn } : {}) });
  return { to, from, roster: list, st: next, moved, had, ...(st.worn?.[from] ? { worn: st.worn[from] } : {}) };
}

// будет ли окно перехода у героя (звезда, «Надеть», оценка для героя): второй из пары есть — в ростере или с вещами. Его id
export function gateOf(idx: Index, roster: ReadonlySet<string>, pools: GearStore['pools'], to: string): string | null {
  const from = idx.CHAR[to]?.fusionOf ?? idx.FUSED[to];
  return from && exists(roster, pools, from) ? from : null;
}

// хранилище, на котором «Надеть» на героя сделает putOn: после «Да» в окне перехода — вещи второго уже у него (П9:
// строка и кнопка — по нему). Окна не будет или вещи не переходят — то же хранилище
export function storeFor(idx: Index, roster: ReadonlySet<string>, st: GearStore, to: string): GearStore {
  return gateOf(idx, roster, st.pools, to) ? switchFusion(idx, [...roster], st, to)?.st ?? st : st;
}
