// Списки на панелях ввода: что показывать, в каком порядке и с какими счётчиками.
import type { Index } from '@/game/data';
import type { GearKind, GearSet, Item } from '@/game/data/types';
import { buildsOf, combosWith, epicMains, gearList, gearRef, legendMains, slotMains, uniqChars } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import { NO_MAINS, type ItemMains } from '@/game/item/mains';
import { subWeights } from '@/game/build/score';

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

// Сабстаты, нужные хоть одному билду с этим сетом (в ростере, если он включён): стат → лучший зачёт, 1 или ½.
// im — main брони этого слота: сабстатов, которые он запрещает, в спросе нет.
// Подсвечивает сетку сабстатов. Если на Epic-броне таких статов 0–1, «Оставить» и «Временно» невозможны:
// обоим нужны два полезных стата под один билд.
export function setSubDemand(ctx: Ctx, setId: string, im: ItemMains = NO_MAINS): Map<string, number> {
  const out = new Map<string, number>();
  for (const { c, b } of buildsOf(ctx.idx, (b, c) => ctx.inScope(c) && combosWith(b, setId).length > 0)) {
    for (const [k, w] of subWeights(ctx, b, c, im)) if (w.credit > (out.get(k) ?? 0)) out.set(k, w.credit);
  }
  return out;
}

// Legendary 6★ — из них выбирают предмет по названию или пассивке
export const itemPool = (idx: Index, kind: GearKind): Item[] => idx.ITEMS[kind].filter((i) => i.star === 6 && i.grade === 'unique');

export const itemUsersInScope = (ctx: Ctx, kind: GearKind, item: Item): number =>
  uniqChars(buildsOf(ctx.idx, (b) => gearList(b, kind).some((g) => g.key === item.key)).filter((x) => ctx.inScope(x.c))).length;

// alphabetical, the way the eye searches; items no build needs are dimmed in the sheet but keep their place
export function itemOptions(ctx: Ctx, kind: GearKind, query: string, cls: string): { i: Item; n: number }[] {
  const q = query.trim().toLowerCase();
  return itemPool(ctx.idx, kind)
    .filter((i) => !cls || !i.classLimits.length || i.classLimits.includes(cls))
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.passives.some((p) => p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)))
    .map((i) => ({ i, n: ctx.scoped ? itemUsersInScope(ctx, kind, i) : i.users }))
    .sort((a, b) => a.i.name.localeCompare(b.i.name));
}

// скольким персонажам нужен такой main stat в этом слоте
export const mainDemand = (ctx: Ctx, kind: GearKind, main: string): number =>
  uniqChars(buildsOf(ctx.idx, (b) => slotMains(b, kind).has(main)).filter((x) => ctx.inScope(x.c))).length;

// Варианты main stat оружия или аксессуара — для окна выбора, кнопок оружия и сетки аксессуара:
//   want — нужен: у предмета из списка — его просят билды с этой пассивкой, иначе (Epic, «нет в списке» или
//          пассивку не берут) — он нужен кому-то в этом слоте; n — скольким персонажам, null у «нужен для пассивки»;
//   rare — только у фиксированных копий предмета.
export interface MainOption { key: string; want: boolean; n: number | null; rare: boolean }

export function mainOptions(ctx: Ctx, kind: GearKind, item: Item | undefined, epic: boolean): MainOption[] {
  const { idx } = ctx;
  const mains = item ? [...item.mains, ...item.extraMains] : epic ? epicMains(idx, kind) : legendMains(idx, kind);
  const wanted = new Set(item ? buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === item.key))
    .filter((x) => ctx.inScope(x.c)).flatMap((x) => gearRef(x.b, kind, item.key).mains) : []);
  return mains.map((key) => {
    const n = wanted.size ? null : mainDemand(ctx, kind, key);
    return { key, want: n === null ? wanted.has(key) : n > 0, n, rare: !!item?.extraMains.includes(key) };
  });
}
