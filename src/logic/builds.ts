// Запросы по билдам outerpedia: кто носит сет, кто берёт предмет, какой main просят в слоте.
import type { Index } from '../data';
import type { Build, Char, Combo, GearKind, GearRef, GearSet } from '../data/types';

export interface BuildRef { c: Char; b: Build; i: number }

export function buildsOf(idx: Index, pred: (b: Build, c: Char) => unknown): BuildRef[] {
  const out: BuildRef[] = [];
  for (const c of idx.D.chars) c.builds.forEach((b, i) => { if (pred(b, c)) out.push({ c, b, i }); });
  return out;
}

export const combosWith = (b: Build, setId: string): Combo[] => b.sets.filter((combo) => combo.some((p) => p.set === setId));
// бонус этой части связки (сет ×2 или ×4) есть только на T4: на T0 у ×2 Speed и Penetration его нет вовсе
// (в игре у них нет строки 2P до T4; ×4 — 25% на T0 против 13 + 12 на T4, то есть на любом уровне)
export const t4Only = (set: GearSet | undefined, n: number): boolean =>
  !!set && (n >= 4 ? set.p4base === null && set.p4 !== null : set.p2base === null && set.p2 !== null);
// в собираемой связке билда часть этого сета — только на T4 (Speed ×2 в Immunity ×2 + Speed ×2): сколько штук.
// Собираемая — та, что собрана (count — броня билда по сетам, уже с новой вещью), иначе где вещей больше, при равенстве
// первая. У Pen ×4 | Pen ×2 + Atk ×2 с четырьмя Pen собирают Pen ×4 — там бонус на любом уровне
export function t4Part(idx: Index, b: Build, setId: string, count: Readonly<Record<string, number>>): number | null {
  const have = (cb: Combo) => cb.reduce((n, p) => n + Math.min(count[p.set] ?? 0, p.n), 0);
  const combo = b.sets.find((cb) => cb.every((p) => (count[p.set] ?? 0) >= p.n))
    ?? b.sets.reduce<Combo | null>((best, cb) => (!best || have(cb) > have(best) ? cb : best), null);
  const part = combo?.find((p) => p.set === setId);
  return part && t4Only(idx.SET[setId], part.n) ? part.n : null;
}
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
