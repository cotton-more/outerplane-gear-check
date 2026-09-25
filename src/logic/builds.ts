// Запросы по билдам outerpedia: кто носит сет, кто берёт предмет, какой main просят в слоте.
import type { Index } from '../data';
import type { Build, Char, Combo, GearKind, GearRef } from '../data/types';

export interface BuildRef { c: Char; b: Build; i: number }

export function buildsOf(idx: Index, pred: (b: Build, c: Char) => unknown): BuildRef[] {
  const out: BuildRef[] = [];
  for (const c of idx.D.chars) c.builds.forEach((b, i) => { if (pred(b, c)) out.push({ c, b, i }); });
  return out;
}

export const combosWith = (b: Build, setId: string): Combo[] => b.sets.filter((combo) => combo.some((p) => p.set === setId));
export const comboText = (idx: Index, combo: Combo): string =>
  combo.map((p) => `${idx.SET[p.set] ? idx.SET[p.set].short : p.set} ×${p.n}`).join(' + ');
export const gearList = (b: Build, kind: GearKind): GearRef[] => (kind === 'weapon' ? b.weapons : b.amulets);
export const gearRef = (b: Build, kind: GearKind, key: string): GearRef => gearList(b, kind).find((g) => g.key === key) || { key, mains: [] };
export const slotMains = (b: Build, kind: GearKind): Set<string> => new Set(gearList(b, kind).flatMap((g) => g.mains));
export const uniqChars = (list: { c: Char }[]): Char[] => [...new Map(list.map((x) => [x.c.id, x.c])).values()];

// main stat, которые бывают у 6★ Epic в этом слоте (Steel Sword / Steel Necklace и им подобные)
export function epicMains(idx: Index, kind: GearKind): string[] {
  const out: string[] = [];
  for (const i of idx.ITEMS[kind]) if (i.grade === 'rare' && i.star === 6) for (const m of [...i.mains, ...i.extraMains]) if (!out.includes(m)) out.push(m);
  return out;
}

// main stat, которые бывают у 6★ Legendary в этом слоте — выбор для предмета, которого нет в списке
export function legendMains(idx: Index, kind: GearKind): string[] {
  const out: string[] = [];
  for (const i of idx.ITEMS[kind]) if (i.grade === 'unique' && i.star === 6) for (const m of i.mains) if (!out.includes(m)) out.push(m);
  return out;
}
