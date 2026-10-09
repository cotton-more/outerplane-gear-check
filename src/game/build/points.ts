// Очки вещи для героя — единица ценности «статов + сетов» (.x/0085 FORMULA §1): вес места стата в цепочке × засчитывается
// (1, ½, 0 у flat) × сегменты, не больше 6. Места — как у subWeights (связка делит место, разрыв занимает место, стат,
// закрытый main, места не занимает), но засчитывается каждое место, а не первые четыре. Main очков не даёт.
// Reforge и Enhance не прогнозируются: вещь считается такой, как введена.
import { CFG } from '@/game/config';
import type { Build, Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { itemMains, NO_MAINS, type ItemMains } from '@/game/item/mains';
import { MAX_LIT } from '@/game/item/subs';
import { subWeights, type SubWeight } from './score';

// Points as whole thousandths: comparison without fractional noise (6 points as a sum of shares can come out 5.999999999999999), rounding is done
// once. The shared currency of thresholds (a good piece, «Обмен вещами», «Надето»)
export type Milli = number;
export const milli = (points: number): Milli => Math.round(points * 1000);
// the piece's points are enough for the «good» threshold (CFG.goodPoints; exactly 6 passes)
export const goodPoints = (points: number): boolean => milli(points) >= milli(CFG.goodPoints);

// вес места (0 — первое): 1; 0,8; 0,65; 0,5; 0,4; 0,32; 0,26; 0,2; дальше 0,2
export const weightOfPlace = (place: number): number => CFG.tierWeights[Math.min(place, CFG.tierWeights.length - 1)];

export const pointWeights = (ctx: Ctx, c: Char, chain: Build, im: ItemMains = NO_MAINS): Map<string, SubWeight> =>
  subWeights(ctx, chain, c, im, true);

// веса цепочки под строки main вещи — один раз на (ctx, цепочка, main): у слота брони их всего несколько
const wMemo = new WeakMap<Ctx, WeakMap<Build, Map<string, Map<string, SubWeight>>>>();
const mainsKey = (im: ItemMains) => im.lines.join('|') + '#' + [...im.blocked].sort().join(',');
function weightsFor(ctx: Ctx, c: Char, chain: Build, item: ItemInput): Map<string, SubWeight> {
  let byChain = wMemo.get(ctx);
  if (!byChain) wMemo.set(ctx, (byChain = new WeakMap()));
  let byMain = byChain.get(chain);
  if (!byMain) byChain.set(chain, (byMain = new Map()));
  const im = itemMains(ctx.idx, item);
  const k = c.id + '@' + mainsKey(im); // база flat — своя у героя: цепочка одна, а персонажи разные (закрепление, этап 6)
  let W = byMain.get(k);
  if (!W) byMain.set(k, (W = pointWeights(ctx, c, chain, im)));
  return W;
}

// вклад сабстата: место (1 — первое; null — стата нет в цепочке), вес места, засчитывается, сегменты (не больше 6)
export interface SubPoints { key: string; seg: number; place: number | null; weight: number; credit: number; pts: number }

export function pointsBreakdown(ctx: Ctx, c: Char, chain: Build, item: ItemInput): SubPoints[] {
  const W = weightsFor(ctx, c, chain, item);
  return Object.entries(item.subs).map(([key, s]) => {
    const w = W.get(key);
    const seg = Math.min(MAX_LIT, s);
    if (!w) return { key, seg, place: null, weight: 0, credit: 0, pts: 0 };
    const weight = weightOfPlace(w.tier);
    return { key, seg, place: w.tier + 1, weight, credit: w.credit, pts: weight * w.credit * seg };
  });
}

export const pointsOf = (ctx: Ctx, c: Char, chain: Build, item: ItemInput): number =>
  pointsBreakdown(ctx, c, chain, item).reduce((n, x) => n + x.pts, 0);
