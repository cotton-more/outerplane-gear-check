// «Найти вещь» in «Ещё» (owner 2026-10-12, 0199): the code of a piece → the piece, who wears it and who has it set aside;
// a name opens the hero's card. Only a search: the verdict and the batch don't change
import { useState } from 'react';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { subsText } from '@/game/text';
import { useT } from '@/i18n';
import { CodeInput } from '@/features/eval/code/ItemCode';
import { holdersOf } from '@/features/gear/find';
import type { GearStore } from '@/features/gear/model/gear';
import { Holders } from '@/features/gear/ui/Holders';
import { PieceName } from '@/features/gear/ui/pieceText';
import { formPiece } from '@/features/gear/verdict';

// fits — the code suits these data (App: fitsData, as «Ввести код»)
export function FindPiece({ ctx, store, fits, onOpenChar }: {
  ctx: Ctx; store: GearStore; fits: (item: ItemInput) => boolean; onOpenChar: (id: string) => void;
}) {
  const t = useT();
  const [item, setItem] = useState<ItemInput | null>(null);
  const h = item ? holdersOf(store, item) : null;
  const p = item && formPiece(item);
  return (
    <div className="find">
      <CodeInput fits={fits} onLoad={setItem} action={t.ui.findGo} hint={t.ui.findHint} />
      {p && h && (
        <div className="find-res" aria-live="polite">
          <p className="piece-n"><PieceName ctx={ctx} p={p} /></p>
          <p className="muted small">{subsText(p.lit)}</p>
          <Holders idx={ctx.idx} h={h} className="find-who" onOpenChar={onOpenChar} />
          {!h.worn.length && !h.stash.length && <p className="muted">{t.ui.findNone}</p>}
        </div>
      )}
    </div>
  );
}
