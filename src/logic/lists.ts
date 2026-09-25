// Списки на панелях ввода: что показывать, в каком порядке и с какими счётчиками.
import type { Index } from '../data';
import type { Char, GearKind, GearSet, Item } from '../data/types';
import { buildsOf, combosWith, gearList, slotMains, uniqChars } from './builds';
import type { Ctx } from './context';

// скольким персонажам (в ростере, если он включён) нужен сет
export const setUsersInScope = (ctx: Ctx, setId: string): number =>
  uniqChars(buildsOf(ctx.idx, (b) => combosWith(b, setId).length).filter((x) => ctx.inScope(x.c))).length;

export function setOptions(ctx: Ctx): { live: { set: GearSet; n: number }[]; dead: GearSet[] } {
  const { D } = ctx.idx;
  const live = D.sets.filter((x) => x.users > 0)
    .map((set) => ({ set, n: ctx.scoped ? setUsersInScope(ctx, set.id) : set.users }))
    .sort((a, b) => b.n - a.n || b.set.users - a.set.users);
  return { live, dead: D.sets.filter((x) => x.users === 0) };
}

// Legendary 6★ — из них выбирают предмет по названию или пассивке
export const itemPool = (idx: Index, kind: GearKind): Item[] => idx.ITEMS[kind].filter((i) => i.star === 6 && i.grade === 'unique');

export const itemUsersInScope = (ctx: Ctx, kind: GearKind, item: Item): number =>
  uniqChars(buildsOf(ctx.idx, (b) => gearList(b, kind).some((g) => g.key === item.key)).filter((x) => ctx.inScope(x.c))).length;

export function itemOptions(ctx: Ctx, kind: GearKind, query: string, cls: string): { i: Item; n: number }[] {
  const q = query.trim().toLowerCase();
  return itemPool(ctx.idx, kind)
    .filter((i) => !cls || !i.classLimits.length || i.classLimits.includes(cls))
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.passives.some((p) => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)))
    .map((i) => ({ i, n: ctx.scoped ? itemUsersInScope(ctx, kind, i) : i.users }))
    .sort((a, b) => Number(b.i.users > 0) - Number(a.i.users > 0) || b.n - a.n || a.i.name.localeCompare(b.i.name));
}

// скольким персонажам нужен такой main stat в этом слоте
export const mainDemand = (ctx: Ctx, kind: GearKind, main: string): number =>
  uniqChars(buildsOf(ctx.idx, (b) => slotMains(b, kind).has(main)).filter((x) => ctx.inScope(x.c))).length;

export interface CharFilter {
  cq: string;      // поиск по имени
  cel: string;     // стихия
  ccl: string;     // класс
  cOwned: boolean; // только мои
  cAll: boolean;   // и без билдов
}

export function charMatches(c: Char, f: CharFilter, roster: ReadonlySet<string>): boolean {
  const q = f.cq.trim().toLowerCase();
  if (q && !(c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.nick || '').toLowerCase().includes(q))) return false;
  if (f.cel && c.element !== f.cel) return false;
  if (f.ccl && c.class !== f.ccl) return false;
  if (f.cOwned && !roster.has(c.id)) return false;
  if (!f.cAll && !c.builds.length && !q) return false;
  return true;
}
