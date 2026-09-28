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

// та же вещь с точностью до сегментов: от этого зависит, какие 4-е вообще могут выпасть (кубик)
export const sameDice = (a: ItemInput, b: ItemInput): boolean =>
  a.slot === b.slot && a.grade === b.grade && a.setId === b.setId && a.itemKey === b.itemKey && a.main === b.main
  && !!a.unlisted === !!b.unlisted && Object.keys(a.subs).sort().join() === Object.keys(b.subs).sort().join();

// Пока кубик досчитывается (App: useDeferredValue), на экране вердикт без него (quick). Вещь та же с точностью до
// сегментов (сабстат 2 → 3) и вердикт тот же — берём кубик прежней оценки (prev — для prevItem): иначе строка карточки на
// долю секунды менялась бы с кубика на первую причину («Even the best option…») и обратно. Досчитается — заменит
export function withPendingDice(ctx: Ctx, item: ItemInput, quick: Verdict, prevItem: ItemInput, prev: Verdict): Verdict {
  if (!prev.gamble || prev.v !== quick.v || !sameDice(item, prevItem)) return quick;
  const res = { ...quick, gamble: prev.gamble };
  return { ...res, plan: upgradePlan(ctx, item, res) };
}
