// «Free pieces» (MODEL.md §7 item 8): shown by App right after the trade window closes, when pieces taken off in it went to
// no one. A list only, nothing is stored; whose piece it was is not said (owner, 2026-10-12). Drawn like the plan's pieces.
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { Sheet } from '@/shared/ui/Sheet';
import { PieceRow } from './PieceRow';

export function FreeSheet({ ctx, st, ids, onClose }: { ctx: Ctx; st: GearStore; ids: readonly string[]; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet title={t.trade.freeTitle} onClose={onClose} className="trade-free">
      <div className="trade-b">
        <p className="muted small">{t.trade.freeNote}</p>
        <ul className="tmoves tplan">
          {ids.map((id) => st.pieces[id] && <li key={id} className="tmove"><PieceRow ctx={ctx} p={st.pieces[id]} /></li>)}
        </ul>
      </div>
    </Sheet>
  );
}
