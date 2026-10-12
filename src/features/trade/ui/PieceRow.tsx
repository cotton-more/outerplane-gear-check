// A piece as the trade plan draws it (MODEL.md §7 item 3): slot icon, name with set and main, grade colour, T4, substats with
// their levels. One component for the plan and the free-pieces sheet. action — the button at the name's end, meta — the
// words after T4 (points, source), sub — a substat chip: the plan colours it by the hero's chain, the free sheet has no hero
import type { ReactNode } from 'react';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import { SlotIcon } from '@/game/icons/Img';
import { SubToken } from '@/game/item/SubToken';
import { BtLabel, PieceName } from '@/features/gear/ui/pieceText';

export function PieceRow({ ctx, p, action, meta, sub }: {
  ctx: Ctx; p: Piece; action?: ReactNode; meta?: ReactNode; sub?: (stat: string, lit: number) => ReactNode;
}) {
  return (
    <div className="bgear-row">
      <SlotIcon slot={p.slot} />
      <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
      {action}
      <span className="bgear-meta"><BtLabel p={p} />{meta}</span>
      <span className="bgear-t">
        {Object.keys(p.lit).map((k) => sub ? sub(k, p.lit[k]) : <SubToken key={k} stat={k} lit={p.lit[k]} />)}
      </span>
    </div>
  );
}
