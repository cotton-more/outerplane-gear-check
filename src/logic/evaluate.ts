import { isArmor } from '../data';
import type { Ctx } from './context';
import { evalArmor } from './evalArmor';
import { evalGear } from './evalGear';
import { emptyVerdict, type ItemInput, type Verdict } from './verdict';

export function evaluate(ctx: Ctx, item: ItemInput): Verdict {
  return isArmor(item.slot) ? evalArmor(ctx, item, emptyVerdict()) : evalGear(ctx, item, emptyVerdict());
}
