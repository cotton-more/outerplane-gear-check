// «Показать героя» (.x/0060-share-code SPEC 3): код героя из того, что показывает «Надето» (надетое и закреплённый набор,
// .x/0085 PLAN Д9), и обратно — маленькое хранилище для карточки показа: пул = надетое, всё надето, закрепление — по
// отпечатку. Набора отправителя в данных смотрящего нет — карточка без него. Хранилище смотрящего не трогаем.
import type { Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { encodeHero, pinKeyOf, type HeroShare } from '@/features/gear/store/heroCode';

// pieces — вещи героя (пул), pin — ключ его закрепления
export function shareCodeOf(c: Char, st: GearStore, pieces: readonly Piece[], pin: string | null): string | null {
  const worn: Partial<Record<SlotId, Piece>> = {};
  for (const [slot, id] of Object.entries(st.worn?.[c.id] ?? {}) as [SlotId, string][]) {
    const p = pieces.find((x) => x.id === id);
    if (p) worn[slot] = p;
  }
  if (!Object.keys(worn).length) return null;
  return encodeHero(c.id, worn, pin);
}

export function shownStore(idx: Index, s: HeroShare): GearStore {
  const pieces: Record<string, Piece> = {}, worn: Worn = {};
  let n = 0;
  for (const [slot, body] of Object.entries(s.slots) as [SlotId, NonNullable<HeroShare['slots'][SlotId]>][]) {
    const id = 'p' + ++n;
    pieces[id] = { ...body, id, at: '' } as Piece;
    worn[slot] = id;
  }
  const key = pinKeyOf(idx, s.heroId, s.pin);
  const ids = Object.keys(pieces);
  return {
    v: 3, seq: n, pieces, pools: ids.length ? { [s.heroId]: ids } : {},
    ...(ids.length ? { worn: { [s.heroId]: worn } } : {}),
    ...(key ? { pin: { [s.heroId]: key } } : {}),
  };
}
