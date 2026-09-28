import { isArmor } from '../data';
import type { Ctx } from './context';
import { evalArmor } from './evalArmor';
import { evalGear } from './evalGear';
import { reforgeGamble } from './gamble';
import { upgradePlan } from './plan';
import { emptyVerdict, type ItemInput, type Verdict } from './verdict';

// gamble: false — без кубика Reforge (до 10 пробных оценок): страница сначала показывает вердикт без него
export function evaluate(ctx: Ctx, item: ItemInput, { gamble = true } = {}): Verdict {
  const res = isArmor(item.slot) ? evalArmor(ctx, item, emptyVerdict()) : evalGear(ctx, item, emptyVerdict());
  res.gamble = gamble ? reforgeGamble(ctx, item, res) : null;
  res.plan = upgradePlan(ctx, item, res);
  return res;
}
