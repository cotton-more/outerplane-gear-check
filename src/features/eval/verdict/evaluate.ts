import { isArmor } from '@/game/data';
import type { Ctx } from '@/game/context';
import { evalArmor } from './evalArmor';
import { evalGear } from './evalGear';
import { upgradePlan } from './upgrade';
import { emptyVerdict, type ItemInput, type Verdict } from './verdict';

// Вердикт — как вещь подходит героям сейчас, по введённым сегментам: Reforge впереди не гадаем (решение владельца
// 2026-10-01) — после Reforge в игре вещь вводят заново
export function evaluate(ctx: Ctx, item: ItemInput): Verdict {
  const res = isArmor(item.slot) ? evalArmor(ctx, item, emptyVerdict()) : evalGear(ctx, item, emptyVerdict());
  res.plan = upgradePlan(ctx, item, res);
  return res;
}
