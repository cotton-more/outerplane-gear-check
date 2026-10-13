// The most SPD a member could get from the trade (.x/0200-boss E4; MODEL.md §13 item 12, Q5: «the member's fastest kit from
// the candidates»): `spdReach` over the pieces of his own candidates (`candidates`, all slots) — so what the timeline calls
// out of reach is what the trade can't give either: the receiver's bar (his own worn is always eligible), no one's spare,
// no code he already has at an equal or higher BT, parked pieces into an empty slot with no bar (MODEL.md §7 item 2).
// The member's class is checked by the world's gauge. A member without builds has no gauge — no candidates, only his base SPD.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { spdReach } from '@/game/stat/spd';
import type { Piece } from '@/features/gear/model/gear';
import { candidates } from './cands';
import type { World } from './model';

// pieces — the store's pieces by id (`Cand.item` carries only what the search needs)
export function tradeSpdReach(ctx: Ctx, c: Char, w: World, pieces: Readonly<Record<string, Piece>>): number {
  const ps = Object.values(candidates(w, { to: c.id })).flatMap((list) => list.flatMap((x) => pieces[x.item.id] ?? []));
  return spdReach(ctx, c, ps);
}
