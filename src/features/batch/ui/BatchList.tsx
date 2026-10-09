// What is in the batch (.x/0110-batch/PLAN.md §1 p. 3): #1…#N in the entered order — the game filter's order; a tap loads
// the piece into the form to fix it, ✕ removes it. «E · Caren» and «🔒 шлем» rows (.x/0140-batch-walk) — only ✕. «Посчитать» — the plan.
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { BatchEntry } from '@/features/batch/batch';
import { useT } from '@/i18n';
import { SlotIcon } from '@/game/icons/Img';
import { SubToken } from '@/game/item/SubToken';
import { HeroFace } from '@/game/hero/HeroFace';
import { CloseButton } from '@/shared/ui/CloseButton';
import { formPiece } from '@/features/gear/verdict';
import { BtLabel, PieceName } from '@/features/gear/ui/pieceText';

// a batch piece as a row: number, slot, name, Breakthrough, substats
export function BatchPiece({ ctx, n, x, children }: { ctx: Ctx; n: number; x: ItemInput; children?: React.ReactNode }) {
  const p = formPiece(x);
  return (
    <>
      <SlotIcon slot={x.slot} />
      <span className="bgear-n"><b className="bnum">#{n}</b><PieceName ctx={ctx} p={p} /></span>
      {children}
      <span className="bgear-t">{Object.entries(x.subs).map(([k, v]) => <SubToken key={k} stat={k} lit={v} />)}</span>
      <span className="bgear-meta"><BtLabel p={p} /></span>
    </>
  );
}

export function BatchList({ ctx, items, editing, onFix, onRemove, onPlan }: {
  ctx: Ctx; items: readonly BatchEntry[]; editing: number | null;
  onFix: (n: number) => void; onRemove: (n: number) => void; onPlan: () => void;
}) {
  const t = useT();
  return (
    <div className="batch">
      {!items.length && <p className="muted small">{t.batch.empty}</p>}
      <ol className="bgear-list batch-items">
        {items.map((e, i) => {
          const x = <CloseButton className="brow-x" label={t.batch.remove(i + 1)} title={t.batch.remove(i + 1)} onClick={() => onRemove(i + 1)} />;
          return e.kind === 'piece' ? (
            <li key={i} className={`bgear-row brow${editing === i + 1 ? ' editing' : ''}`}>
              <button type="button" className="brow-fix" onClick={() => onFix(i + 1)} aria-label={`#${i + 1}`} />
              <BatchPiece ctx={ctx} n={i + 1} x={e.input}>{x}</BatchPiece>
            </li>
          ) : (
            <li key={i} className="bgear-row brow bmark">
              <SlotIcon slot={e.slot} />
              <span className="bgear-n"><b className="bnum">#{i + 1}</b>
                {/* the hero's round portrait, as the game shows a worn piece's owner (owner 2026-10-09) */}
                {e.kind === 'worn' && ctx.idx.CHAR[e.c] && <span className="bface"><HeroFace c={ctx.idx.CHAR[e.c]} /></span>}
                {e.kind === 'worn' ? t.batch.wornRow(ctx.idx.CHAR[e.c]?.name ?? '') : t.batch.lockRow(e.slot)}</span>
              {x}
            </li>
          );
        })}
      </ol>
      <div className="batch-acts">
        <button type="button" className="btn primary" disabled={!items.length} onClick={onPlan}>{t.batch.plan}</button>
      </div>
    </div>
  );
}
