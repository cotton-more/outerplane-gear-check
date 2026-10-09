// Вещь и персонаж: может ли он её надеть (wearable), подходит ли билду (fit) и очки в целых тысячных (milli) —
// общая валюта «Обмена вещами» и «Надето». Ценность вещи считает профиль (game/build/profile).
import { isArmor } from '@/game/data';
import type { Build, Char, GearKind } from '@/game/data/types';
import { combosWith, gearList, slotMains } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { milli, type Milli } from '@/game/build/points';

export { milli, type Milli };

// Очки целыми тысячными (R2.2 «Обмена вещами»): сравнение без дробного шума, округление — один раз. Заметный выигрыш —
// хотя бы на 1 очк. (R6.2): так решают «Обмен вещами» (trade) и «Переодеть» («Надето», worn/wearing)
export const THRESHOLD: Milli = milli(1);

// может ли персонаж надеть вещь: у оружия и аксессуара из списка бывает класс (classLimits) — как в вердикте (evalGear).
// Нельзя — вещь ему не кандидат нигде: ни в билде, ни в «По статам», ни в режиме героя (fit — «нет»,
//  — вердикт её не оценивает)
export function wearable(ctx: Ctx, c: Char, item: Pick<ItemInput, 'slot' | 'itemKey'>): boolean {
  if (isArmor(item.slot) || !item.itemKey) return true;
  const limits = ctx.idx.ITEM[item.slot as GearKind][item.itemKey]?.classLimits;
  return !limits?.length || limits.includes(c.class);
}

// подходит ли вещь этому билду персонажа c: броня — сет есть в связках; Legendary с пассивкой — предмет из списка с
// нужным main; остальное (Epic, «нет в списке», предмет из списка с другим main) — временная, если main этому билду
// нужен. Не для класса c (wearable) — «нет». Сабстаты не нужны — годится и записанная вещь (Piece)
export type Fit = 'no' | 'rec' | 'stopgap';
export function fit(ctx: Ctx, c: Char, b: Build, item: Pick<ItemInput, 'slot' | 'grade' | 'setId' | 'itemKey' | 'main'>): Fit {
  if (isArmor(item.slot)) return item.setId && combosWith(b, item.setId).length ? 'rec' : 'no';
  if (!wearable(ctx, c, item)) return 'no';
  const kind = item.slot as GearKind;
  const g = item.grade === 'unique' && item.itemKey ? gearList(b, kind).find((r) => r.key === item.itemKey) : undefined;
  if (g && (!g.mains.length || (item.main != null && g.mains.includes(item.main)))) return 'rec';
  // предмет из списка, но main не тот, — как любая временная: подходит, если этот main в слоте билд просит (как в вердикте)
  return ctx.settings.stage === 'grow' && item.main != null && slotMains(b, kind).has(item.main) ? 'stopgap' : 'no';
}

