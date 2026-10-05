// «Показать героя» (.x/0060-share-code SPEC 3): код героя из того, что показывает «Надето» (надетое и билд героя — aimOf),
// и обратно — маленькое хранилище для карточки показа: пул = надетое, всё надето, билд — по отпечатку. Билд отправителя
// пропал (переименовали, убрали) — выбирается правилом, как у героя без выбора (lost). Хранилище смотрящего не трогаем.
import type { Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import type { CharPool } from '@/features/gear/pool';
import { aimKeyOf, encodeHero, type HeroShare } from '@/features/gear/store/heroCode';
import { aimOf } from './aim';

export function shareCodeOf(c: Char, st: GearStore, cp: CharPool): string | null {
  const worn: Partial<Record<SlotId, Piece>> = {};
  for (const [slot, id] of Object.entries(st.worn?.[c.id] ?? {}) as [SlotId, string][]) {
    const p = cp.pieces.find((x) => x.id === id);
    if (p) worn[slot] = p;
  }
  if (!Object.keys(worn).length) return null;
  return encodeHero(c.id, worn, aimOf(c, st, cp).key);
}

export interface Shown { st: GearStore; lost: boolean }
export function shownStore(idx: Index, s: HeroShare): Shown {
  const pieces: Record<string, Piece> = {}, worn: Worn = {};
  let n = 0;
  for (const [slot, body] of Object.entries(s.slots) as [SlotId, NonNullable<HeroShare['slots'][SlotId]>][]) {
    const id = 'p' + ++n;
    pieces[id] = { ...body, id, at: '' } as Piece;
    worn[slot] = id;
  }
  const key = aimKeyOf(idx, s.heroId, s.build);
  const ids = Object.keys(pieces);
  const st: GearStore = {
    v: 2, seq: n, pieces, pools: ids.length ? { [s.heroId]: ids } : {},
    ...(ids.length ? { worn: { [s.heroId]: worn } } : {}),
    ...(key && ids.length ? { aim: { [s.heroId]: key } } : {}),
  };
  return { st, lost: s.build.kind !== 'none' && key === null && !!idx.CHAR[s.heroId]?.builds.length };
}
