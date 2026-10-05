// Ценность вещи для билда и сравнение пары вещей в одном слоте — основа сборки из пула (features/gear/pool) и раздела
// «Сейчас на персонажах», штампа по вещам персонажей (features/gear/model/stamp). Ценность вещи для билда — полезные сегменты с весом
// места в цепочке, как есть (Н3): вещи сравниваются такими, какие они сейчас, Reforge впереди нигде не считаем —
// его делают в игре, а сегменты записи правят в приложении. Уровень записи — сколько горит (gear pieceInput, lit).
import { isArmor } from '@/game/data';
import type { Build, Char, GearKind } from '@/game/data/types';
import { CFG } from '@/game/config';
import { combosWith, gearList, slotMains } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import { pieceInput, type Piece } from './gear';
import { MAX_LIT } from '@/game/item/subs';
import { itemMains } from '@/game/item/mains';
import { scoreBuild, subWeights, type Row } from '@/game/build/score';
import type { Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';

// Вещь против одной вещи в том же слоте (против того, что стоит в сборке, features/gear/pool)
export interface Pair {
  kind: 'up' | 'eq' | 'down';    // только по этой паре
  delta: number | null;          // (новый − надетый) / надетый, по полезным сегментам
  gained: { key: string; place: number }[]; // места цепочки, которые новый закрывает, а надетый — нет
  lost: { key: string; place: number }[];
  chains: { worn: Omit<Row, 'alt'>; next: Omit<Row, 'alt'> } | null;
  material: boolean;             // та же вещь, что надетая не на T4: годится ей на Breakthrough
  passive: boolean;              // оружие/аксессуар: у надетого другая пассивка — решает не только ролл
  // оружие/аксессуар: решила пассивка, а не сегменты — rec: новая рекомендованная против нерекомендованной (лучше),
  // stopgap: новая временная, а надета рекомендованная (хуже). Тогда чип — словом, процент — строкой с причиной
  why: 'rec' | 'stopgap' | null;
  wornEmpty: boolean;            // у надетой нет ни одного полезного сегмента: процент бессмыслен (деление на ноль)
  // «хуже», хотя мест новая не теряет: у надетой больше сегментов — стат, где она впереди сильнее всего
  ahead: { key: string; worn: number; next: number } | null;
}

// чем показать разницу: процент; «×N», когда больше +200% (иначе «+92250%» у почти пустой надетой); «полезных нет»
export type VsFigure = { kind: 'pct' | 'times'; n: number } | { kind: 'empty' };
export function vsFigure(vs: Pick<Pair, 'delta' | 'wornEmpty'>): VsFigure | null {
  if (vs.wornEmpty) return { kind: 'empty' };
  if (vs.delta == null) return null;
  const pct = Math.round(vs.delta * 100);
  return pct > 200 ? { kind: 'times', n: Math.round(vs.delta + 1) } : { kind: 'pct', n: pct };
}

// Очки целыми тысячными (R2.2 «Обмена вещами»): сравнение без дробного шума, округление — один раз. Заметный выигрыш —
// хотя бы на 1 очк. (R6.2): так решают «Обмен вещами» (trade) и «Переодеть» («Надето», worn/wearing)
export type Milli = number;
export const milli = (points: number): Milli => Math.round(points * 1000);
export const THRESHOLD: Milli = milli(1);
export const MARGIN = 0.1;

// полезные сегменты вещи для билда: вес места × засчитывается (1, ½, 0) × уровень сабстата (как есть).
// segs — сколько сегментов у каждого полезного стата (для строки «у надетой больше сегментов»)
function value(ctx: Ctx, c: Char, b: Build, item: ItemInput): { v: number; cover: Map<number, string>; segs: Map<string, number> } {
  const W = subWeights(ctx, b, c, itemMains(ctx.idx, item));
  let v = 0;
  const cover = new Map<number, string>();
  const segs = new Map<string, number>();
  for (const [k, seg] of Object.entries(item.subs)) {
    const w = W.get(k);
    if (!w || !w.credit) continue;
    segs.set(k, Math.min(MAX_LIT, seg));
    v += CFG.tierWeights[Math.min(w.tier, CFG.tierWeights.length - 1)] * w.credit * segs.get(k)!;
    if (!cover.has(w.tier)) cover.set(w.tier, k);
  }
  return { v, cover, segs };
}

// «Слабее всех» в блоке билда: ценность надетой вещи (как в сравнении) и каких статов на ней не хватает — первые места
// цепочки, которые засчитываются целиком и которых на вещи нет (DEF и DEF% — из пары берём %)
export const pieceValue = (ctx: Ctx, c: Char, b: Build, p: Piece): number => value(ctx, c, b, pieceInput(p)).v;
export function lookFor(ctx: Ctx, c: Char, b: Build, p: Piece, max = 2): string[] {
  const W = subWeights(ctx, b, c, itemMains(ctx.idx, pieceInput(p)));
  const have = new Set(Object.keys(p.lit));
  const out: string[] = [];
  for (const [k] of [...W].filter(([, x]) => x.credit >= 1).sort((a, z) => a[1].tier - z[1].tier || Number(z[0].endsWith('%')) - Number(a[0].endsWith('%')))) {
    const axis = k.replace(/%$/, '');
    // на вещи уже есть этот стат; flat, когда на ней его % или % уже в списке, — лишний
    if (have.has(k) || have.has(axis + '%') || out.some((x) => x.replace(/%$/, '') === axis)) continue;
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

// ценность вещи с формы — как в сравнении
export const itemValue = (ctx: Ctx, c: Char, b: Build, item: ItemInput): number => value(ctx, c, b, item).v;

// может ли персонаж надеть вещь: у оружия и аксессуара из списка бывает класс (classLimits) — как в вердикте (evalGear).
// Нельзя — вещь ему не кандидат нигде: ни в билде, ни в «По статам», ни в режиме героя, и билд она не начинает (fit — «нет»,
// сборка её не видит — pool entriesFor, исхода нет — pool outcomeFor)
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

const rowOf = (ctx: Ctx, c: Char, b: Build, item: ItemInput, subs: Subs): Omit<Row, 'alt'> =>
  ({ c, b, i: c.builds.indexOf(b), ...scoreBuild(ctx, item.grade, c, b, subs, itemMains(ctx.idx, item)) });

// Новая против одной вещи в том же слоте билда (без сетов): на сколько лучше по полезным сегментам, какие места
// цепочки она закрывает и теряет, решила ли пассивка (why), материал ли она надетой. kind — только по этой паре,
// ahead — для «хуже»
export function against(ctx: Ctx, c: Char, b: Build, item: ItemInput, worn: Piece, f: Fit = fit(ctx, c, b, item)): Pair {
  const wi = pieceInput(worn);
  const X = value(ctx, c, b, item);
  const E = value(ctx, c, b, wi);
  const delta = (X.v - E.v) / Math.max(E.v, 0.01);
  let kind: Pair['kind'] = delta >= MARGIN ? 'up' : delta <= -MARGIN ? 'down' : 'eq';
  let why: Pair['why'] = null;
  if (!isArmor(item.slot)) {
    const wf = fit(ctx, c, b, wi);
    if (f === 'stopgap' && wf === 'rec') { kind = 'down'; why = 'stopgap'; }
    else if (f === 'rec' && wf !== 'rec') { kind = 'up'; why = 'rec'; }
  }
  const place = (cover: Map<number, string>, other: Map<number, string>) =>
    [...cover].filter(([p]) => !other.has(p)).map(([p, k]) => ({ key: k, place: p + 1 })).sort((a, z) => a.place - z.place);
  const sameType = isArmor(item.slot)
    ? worn.setId === item.setId && worn.grade === item.grade
    : !!item.itemKey && worn.itemKey === item.itemKey;
  const lost = place(E.cover, X.cover);
  const ahead = kind === 'down' && !why && !lost.length
    ? [...E.segs].map(([k, w]) => ({ key: k, worn: w, next: X.segs.get(k) ?? 0 })).filter((x) => x.worn > x.next)
      .sort((a, z) => z.worn - z.next - (a.worn - a.next))[0] ?? null
    : null;
  return {
    kind, delta, why, wornEmpty: E.v === 0 && X.v > 0, ahead,
    gained: place(X.cover, E.cover), lost,
    chains: { worn: rowOf(ctx, c, b, wi, wi.subs), next: rowOf(ctx, c, b, item, item.subs) },
    material: sameType && worn.bt !== null && worn.bt < 4,
    passive: !isArmor(item.slot) && !!worn.itemKey && !!item.itemKey && worn.itemKey !== item.itemKey,
  };
}
