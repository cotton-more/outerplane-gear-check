import { isArmor } from '../data';
import type { Ctx } from './context';
import { evalArmor } from './evalArmor';
import { evalGear } from './evalGear';
import { upgradePlan } from './plan';
import { emptyVerdict, type ItemInput, type Verdict } from './verdict';

export function evaluate(ctx: Ctx, item: ItemInput): Verdict {
  const res = isArmor(item.slot) ? evalArmor(ctx, item, emptyVerdict()) : evalGear(ctx, item, emptyVerdict());
  res.plan = upgradePlan(ctx, item, res);
  return res;
}
