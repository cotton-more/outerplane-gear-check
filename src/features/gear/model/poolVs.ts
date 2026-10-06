// Строки героев по вещи с формы («статы + сеты», features/gear/verdict): что она даст герою и есть ли кнопка «Надеть» /
// «Заменить». Их читают «Сейчас на персонажах», карточка вердикта, «Кому надеть?» и режим героя.. Здесь же — что надето
// (gearBadges, nextToWear).
import { SLOTS } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { scoreBuild, type Row } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import { planFor, replaceOf, type PoolView } from '@/features/gear/pool';
import type { ItemInput } from '@/game/item/item';
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
