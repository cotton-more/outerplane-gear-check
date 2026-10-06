// Строки героев по вещи с формы («статы + сеты», features/gear/verdict): что она даст герою и есть ли кнопка «Надеть» /
// «Заменить». Их читают «Сейчас на персонажах», карточка вердикта, «Кому надеть?» и режим героя. Здесь же — что надето
// (gearBadges, nextToWear) и старые «где стоит» для вкладки билдов (whereOf, до этапа 6 .x/0085).
import { isArmor, SLOTS } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { scoreBuild, type Row } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import { heldBy, isStats, planFor, replaceOf, type Assembly, type PoolView } from '@/features/gear/pool';
import type { ItemInput } from '@/game/item/item';
import type { Variant } from '@/game/build/variants';
import { formPiece, heroOutcome, type HeroRes } from '@/features/gear/verdict';
import { wearable } from './vs';

export interface CharVs {
  c: Char;
  slot: SlotId;               // слот вещи с формы
  h: HeroRes;                 // исход вещи для героя (features/gear/verdict heroOutcome)
  chain: Omit<Row, 'alt'>;    // цепочка героя («По статам») с отметками вещи
  useful: boolean;            // кнопка «Надеть» / «Заменить»: вещь ему «Надень», «Примерить замену», режим героя или герой
                              // найден по имени («Кому надеть?»)
  replaces: boolean;          // подпись «Заменить»: в её слоте есть надетая или «Надеть» уберёт вещь её слота (planFor)
  asWorn: boolean;            // кнопка есть только из-за режима героя (wear): под ней «Носит в игре — нажми, запишем как надетое»
  stash: boolean;             // кнопка «Отложить для X»: вещь ему «Оставь» или запас (решение владельца 2026-10-06)
}

// replace — запись из «Примерить замену» (TryOn.replace): «Заменить» есть всегда, запись уходит (planPut). wear — режим
// героя («Надето», решение владельца): «Надеть на X» есть всегда — это ввод надетого в игре. any — герой найден по имени
// в «Кому надеть?»: «Надеть» запишет вещь на нём, даже без прироста. h — исход, если уже посчитан (вердикт)
export interface CharVsOpts { replace?: string | null; wear?: boolean; any?: boolean; h?: HeroRes; stash?: boolean }

// строка героя; null — у героя нет билдов или вещь не для его класса
export function charVs(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, opts: CharVsOpts = {}): CharVs | null {
  const hp = view.hero(charId);
  if (!hp || !wearable(ctx, hp.c, item)) return null;
  const h = opts.h ?? heroOutcome(hp, formPiece(item));
  const rep = !!replaceOf(hp.pieces, item.slot, opts.replace);
  const own = rep || h.kind === 'wear';
  const useful = own || !!opts.wear || !!opts.any;
  const wornHere = hp.pieces.some((p) => p.slot === item.slot && hp.wornIds.has(p.id));
  const replaces = useful && (wornHere || !!planFor(ctx, view, charId, item, opts.replace)?.removed.some((p) => p.slot === item.slot));
  const chain = { c: hp.c, b: hp.P.chain, i: 0, ...scoreBuild(ctx, item.grade, hp.c, hp.P.chain, item.subs, itemMains(ctx.idx, item)) };
  return { c: hp.c, slot: item.slot, h, chain, useful, replaces, asWorn: !own && !!opts.wear, stash: !!opts.stash };
}

// «Дальше: {слот}» при вводе надетого (режим героя): слот формы у героя не надет — после «Надеть» форма встанет на
// первый ненадетый слот после него (по кругу: оружие, аксессуар, шлем, броня, перчатки, ботинки). Слот формы надет
// (оценивают замену) или других ненадетых нет — null
export function nextToWear(view: PoolView, charId: string, slot: SlotId): SlotId | null {
  const cp = view.of(charId);
  const on = new Set(cp ? cp.pieces.filter((p) => cp.worn.has(p.id)).map((p) => p.slot) : []);
  if (on.has(slot)) return null;
  const i = SLOTS.findIndex((x) => x.id === slot);
  for (let k = 1; k < SLOTS.length; k++) {
    const next = SLOTS[(i + k) % SLOTS.length].id;
    if (!on.has(next)) return next;
  }
  return null;
}

// «N/6» варианта: вещи, что работают на него, — части связки и подходящие оружие и аксессуар; у «По статам» — все
export const badgeOf = (a: Assembly): number =>
  isStats(a.v) ? a.filled : Object.values(a.roles).filter((r) => r === 'set' || r === 'rec' || r === 'stopgap').length;

// у кого есть вещи: персонаж → сколько из них отмечено надетым (плитка «надето N из 6», как «Надето · N» на вкладке героя).
// Ключи — все герои с вещами (кнопка «Обмен» в списке); число — 0, пока ничего не отмечено
export function gearBadges(view: PoolView): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of Object.keys(view.st.pools)) {
    const cp = view.of(id);
    if (!cp?.pieces.length) continue;
    const ids = new Set(cp.pieces.map((p) => p.id));
    out.set(id, Object.values(view.st.worn?.[id] ?? {}).filter((x) => ids.has(x)).length);
  }
  return out;
}

// где у персонажа стоит запись: собираемые варианты, в выбранной или достижимой сборке которых она есть.
// В настоящем варианте броня не из связки, которой больше некого вытеснять (других вещей её слота в пуле нет), — не
// «засчитано»: прочая в пустой слот — не исход. Нет таких — варианты, которые не собираются («Не собираю» или не
// начат), а пул их сборки держит (held, решение владельца «что держит пул» — (а)): вещь, которую держит только такой
// вариант, — тоже «в нём», а не без строки. «По статам» — никогда: он вещи не держит («Надето», В4). Что пул держит
// (usedIn), это не меняет
export function whereUsed(view: PoolView, charId: string, id: string): Variant[] {
  return whereOf(view, charId, id).builds;
}
// то же и надета ли запись на герое (worn): у надетой «надета» вместо «где стоит», и она не «бездомная» (PoolList)
export interface Where { builds: Variant[]; worn: boolean }
export function whereOf(view: PoolView, charId: string, id: string): Where {
  const cp = view.of(charId);
  if (!cp) return { builds: [], worn: false };
  const alone = (slot: SlotId) => !cp.pieces.some((p) => p.slot === slot && p.id !== id);
  const counts = (v: Variant) => heldBy(cp, v).some((a) => {
    const slot = (Object.keys(a.slots) as SlotId[]).find((sl) => a.slots[sl]?.id === id);
    return !!slot && !(isArmor(slot) && a.roles[slot] === 'filler' && alone(slot));
  });
  const worn = cp.worn.has(id);
  const real = cp.inPlay.filter((v) => !isStats(v) && counts(v));
  if (real.length) return { builds: real, worn };
  return { builds: cp.variants.filter((v) => !isStats(v) && !cp.inPlay.includes(v) && counts(v)), worn };
}
