// What is in the batch (DEVELOPMENT.md "features/batch"): #1…#N in the entered order — the game filter's order; a tap loads
// the piece into the form to fix it, ✕ removes it. «E · Caren» and «🔒 шлем» rows — only ✕. «Посчитать» — the plan.
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { BatchEntry } from '@/features/batch/batch';
import type { SlotId } from '@/game/data/types';
import type { Piece } from '@/features/gear/model/gear';
import { inputOfPiece } from '@/features/batch/plan';
import { HeroName } from '@/game/hero/HeroName';
import { useT } from '@/i18n';
import { SlotIcon } from '@/game/icons/Img';
import { SubToken } from '@/game/item/SubToken';
import { HeroFace } from '@/game/hero/HeroFace';
import { CloseButton } from '@/shared/ui/CloseButton';
import { formPiece } from '@/features/gear/verdict';
import { BtLabel, PieceName } from '@/features/gear/ui/pieceText';

// a batch piece as a row: number, slot, caption (Q4: no grade chip, the grade and set are in the title), substats, T4
export function BatchPiece({ ctx, n, x, children }: { ctx: Ctx; n: number; x: ItemInput; children?: React.ReactNode }) {
  const p = formPiece(x);
  return (
    <>
      <SlotIcon slot={x.slot} />
      <span className="bgear-n"><b className="bnum">#{n}</b><span className="bgear-nm"><PieceName ctx={ctx} p={p} batch /></span></span>
      {children}
      <span className="bgear-t">{Object.entries(x.subs).map(([k, v]) => <SubToken key={k} stat={k} lit={v} />)}</span>
      <span className="bgear-meta"><BtLabel p={p} t4Only /></span>
    </>
  );
}

// wornOf — an «E» entry's piece (the hero's worn record): shown like a free piece plus a line with the hero's round
// portrait and name (owner 2026-10-09); no record — the hero line alone
export function BatchList({ ctx, items, editing, wornOf, onFix, onRemove, onPlan }: {
  ctx: Ctx; items: readonly BatchEntry[]; editing: number | null; wornOf: (c: string, slot: SlotId) => Piece | null;
  onFix: (n: number) => void; onRemove: (n: number) => void; onPlan: () => void;
}) {
  const t = useT();
  return (
    <div className="batch">
      {!items.length && <p className="muted small">{t.batch.empty}</p>}
      <ol className="bgear-list batch-items">
        {items.map((e, i) => {
          const x = <CloseButton className="brow-x hit" label={t.batch.remove(i + 1)} title={t.batch.remove(i + 1)} onClick={() => onRemove(i + 1)} />;
          return e.kind === 'piece' ? (
            <li key={i} className={`bgear-row brow${editing === i + 1 ? ' editing' : ''}`}>
              <button type="button" className="brow-fix" onClick={() => onFix(i + 1)} aria-label={`#${i + 1}`} />
              <BatchPiece ctx={ctx} n={i + 1} x={e.input}>{x}</BatchPiece>
            </li>
          ) : e.kind === 'worn' ? (() => {
            const c = ctx.idx.CHAR[e.c];
            const p = wornOf(e.c, e.slot);
            const hero = c && <span className="bworn"><HeroFace c={c} round /><HeroName c={c} /></span>;
            return p ? (
              <li key={i} className="bgear-row brow bmark">
                <BatchPiece ctx={ctx} n={i + 1} x={inputOfPiece(p)}>{x}</BatchPiece>
                {hero}
              </li>
            ) : (
              <li key={i} className="bgear-row brow bmark">
                <SlotIcon slot={e.slot} />
                <span className="bgear-n"><b className="bnum">#{i + 1}</b>{hero}</span>
                {x}
              </li>
            );
          })() : (
            <li key={i} className="bgear-row brow bmark">
              <SlotIcon slot={e.slot} />
              <span className="bgear-n"><b className="bnum">#{i + 1}</b>{t.batch.lockRow(e.slot)}</span>
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
