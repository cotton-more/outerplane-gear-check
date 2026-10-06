// Пул экипировки, «По статам» — вариант без связки, по цепочке большинства билдов персонажа. Обзор и решения — index.ts.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Variant } from '@/game/build/variants';
import { itemValue, wearable } from '@/features/gear/model/vs';
import { EPS } from './base';
import { defaultChain } from '@/game/build/profile';

// «По статам»: вариант без связки с цепочкой, которая у большинства билдов персонажа (при равенстве — первого)
export const STATS = '#stats';
export const isStats = (v: Variant): boolean => v.key.endsWith('/' + STATS);
const statMemo = new WeakMap<Char, Variant>();
// Р13: у вещи есть полезные герою статы — она чего-то стоит в его «По статам» (иначе её там нет и при явном выборе).
// Не для его класса — нет
export function statsUseful(ctx: Ctx, c: Char, x: ItemInput): boolean {
  const v = statVariant(c);
  return !!v && wearable(ctx, c, x) && itemValue(ctx, c, v.b, x) > EPS;
}

export function statVariant(c: Char): Variant | null {
  if (!c.builds.length) return null;
  const hit = statMemo.get(c);
  if (hit) return hit;
  const parent = defaultChain(c)!;
  const key = `${c.id}/${STATS}`;
  const v: Variant = { key, name: STATS, parent, parentKey: key, b: { ...parent, name: STATS, sets: [[]] }, sig: null };
  statMemo.set(c, v);
  return v;
}
