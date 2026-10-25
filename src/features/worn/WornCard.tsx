// A worn piece on «Надето» as the game's piece card (owner 2026-10-25, HISTORY.md 0260): the name with T and points as badges,
// then the stats in a column, in the game's words — the main lines, then «LV 2  Attack  +8.0%» per substat — so the player
// reads it line by line against the game. A substat row's colour — whether it counts for the hero (green full, amber ½),
// as the chips elsewhere. A tap opens the piece sheet; on the shared card it is not a button
import type { ReactNode } from 'react';
import type { Ctx } from '@/game/context';
import type { SlotId } from '@/game/data/types';
import type { Piece } from '@/features/gear/model/gear';
import { BtLabel, gameMains, gameSub, PieceName } from '@/features/gear/ui/pieceText';
import { tourItem } from '@/tour/anchors';
import type { WornToken } from './wearing';

export function WornCard({ ctx, p, tokens, pts, onClick, shown }: {
  ctx: Ctx; p: Piece; tokens: WornToken[]; pts: ReactNode; onClick?: () => void; shown: boolean;
}) {
  const body = (
    <>
      <span className="wcard-h">
        <span className="bgear-n"><PieceName ctx={ctx} p={p} noMain /></span>
        <BtLabel p={p} />
        {pts}
      </span>
      <span className="wcard-st">
        {gameMains(ctx, p).map((m) => (
          <span key={m.key} className="wst main"><span className="wst-n">{m.name}</span><span className="wst-v">{m.value}</span></span>
        ))}
        {tokens.map((k) => {
          const g = gameSub(ctx.idx, k.key, k.lit);
          return (
            <span key={k.key} className={`wst${k.credit >= 1 ? ' ok' : k.credit > 0 ? ' half' : ''}`}>
              <span className="wst-lv">LV {k.lit}</span><span className="wst-n">{g.name}</span><span className="wst-v">{g.value}</span>
            </span>
          );
        })}
      </span>
    </>
  );
  const slot: SlotId = p.slot;
  return onClick
    ? <button type="button" className="bgear-row wcard" onClick={onClick} {...(shown ? {} : tourItem(slot))}>{body}</button>
    : <div className="bgear-row wcard">{body}</div>;
}
