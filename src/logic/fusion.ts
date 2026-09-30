// Core Fusion (правила владельца 2026-09-30). X — обычный герой, CF — Core Fusion X (fusionOf). «Есть персонаж» — он в
// ростере или у него есть вещи в пуле. В ростере никогда нет X и CF вместе; есть CF — X неактивен: не кандидат вердикта,
// не в «Кому надеть?» и примерке, в списке — сразу за CF с пометкой.
// Нормализация — при загрузке, переносе v1, импорте кода и пакетных правках ростера: есть оба — остаётся CF; все, у кого
// есть вещи, — в ростере (Р16, normalizeStored).
// Вещи X: у CF пусто — переходят к CF; у CF есть свои — не заменяем и не дополняем, вещи X убраны из его пула (записи,
// которые есть и у других, остаются у других). «Собираю» не переносится: билды у героев разные.
import type { Index } from '../data';
import { gc, type GearStore } from './gear';

export interface FusionFix {
  base: string;
  fusion: string;
  kind: 'moved' | 'removed' | 'none'; // вещи X перешли к CF / убраны / у X вещей не было
  ids: string[];                      // вещи X, которые перешли или убраны
}

const exists = (roster: ReadonlySet<string>, pools: GearStore['pools'], id: string) => roster.has(id) || !!pools[id]?.length;

// X, которого заменил его Core Fusion: X → CF (CF есть — в ростере или с вещами)
export function replacedX(idx: Index, roster: Iterable<string>, pools: GearStore['pools']): Map<string, string> {
  const r = new Set(roster);
  const off = new Map<string, string>();
  for (const [base, fusion] of Object.entries(idx.FUSED)) if (exists(r, pools, fusion)) off.set(base, fusion);
  return off;
}

// есть и X, и CF — в ростере только CF (на месте X, если X был в ростере), вещи X — по правилу выше
export function normalizeFusion(idx: Index, roster: readonly string[], st: GearStore): { roster: string[]; st: GearStore; fixes: FusionFix[] } {
  let list = [...roster];
  let pools = st.pools;
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
    fixes.push({ base, fusion, kind, ids });
  }
  if (!fixes.length) return { roster: list, st, fixes };
  // подсказка «теперь собирается сам» у X без вещей не нужна (находка 16)
  const autoNew = st.autoNew?.filter((k) => !fixes.some((f) => k.startsWith(f.base + '/')));
  const { autoNew: _a, ...rest } = st;
  const next = { ...rest, pools, ...(autoNew?.length ? { autoNew } : {}) };
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

// окно перехода (звезда, «Надеть», примерка): «Да, Core Fusion X» или «Да, X». to — кого выбрали, from — второй из пары;
// в ростере — только to (на месте from), вещи from — к to. moved / had — для «Вернуть» (gearStore unfuseChar)
export interface Switch { to: string; from: string; roster: string[]; st: GearStore; moved: string[]; had: string[] }
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
  return { to, from, roster: list, st: { ...st, pools: { ...rest, [to]: [...had, ...moved.filter((id) => !had.includes(id))] } }, moved, had };
}
