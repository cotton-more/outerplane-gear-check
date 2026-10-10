// What is in the batch (DEVELOPMENT.md "features/batch"): #1…#N in the entered order — the game filter's order; a tap loads
// the piece into the form to fix it, ✕ removes it. «E · Caren» rows and «🔒 шлем» without substats — only ✕. «Посчитать» — the plan.
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { BatchEntry } from '@/features/batch/batch';
import type { BatchFresh } from '@/features/batch/useBatchMode';
import { fold, land, slide, takeOff } from '@/shared/fly';
import type { SlotId } from '@/game/data/types';
import type { Piece } from '@/features/gear/model/gear';
import { inputOfPiece } from '@/features/batch/plan';
import { HeroName } from '@/game/hero/HeroName';
import { useT } from '@/i18n';
import { LockIcon, SlotIcon } from '@/game/icons/Img';
import { SubToken } from '@/game/item/SubToken';
import { HeroFace } from '@/game/hero/HeroFace';
import { CloseButton } from '@/shared/ui/CloseButton';
import { formPiece } from '@/features/gear/verdict';
import { BtLabel, PieceName } from '@/features/gear/ui/pieceText';

// a batch piece as a row: number, slot, caption (Q4: no grade chip, the grade and set are in the title), substats, T4
// locked — a «🔒» entry entered with its substats: the lock after the number
export function BatchPiece({ ctx, n, x, locked = false, children }: { ctx: Ctx; n: number; x: ItemInput; locked?: boolean; children?: React.ReactNode }) {
  const p = formPiece(x);
  return (
    <>
      <SlotIcon slot={x.slot} />
      <span className="bgear-n"><b className="bnum">#{n}</b>{locked && <LockIcon />}<span className="bgear-nm"><PieceName ctx={ctx} p={p} batch /></span></span>
      {children}
      <span className="bgear-t">{Object.entries(x.subs).map(([k, v]) => <SubToken key={k} stat={k} lit={v} />)}</span>
      <span className="bgear-meta"><BtLabel p={p} t4Only /></span>
    </>
  );
}

// fresh — the entry just added or fixed (wide screen, owner 2026-10-10: past 13 rows a new one was below the column's
// edge — was it added?): the column scrolls to it and the row comes in (motion.css .brow.fresh); a new key replays it.
// What was tapped flies in (shared/fly): substats into the row's chips, the hero into its portrait, «🔒» into the number;
// the row then only fades in (.landing) — a rise would move the place they fly to
// wornOf — an «E» entry's piece (the hero's worn record): shown like a free piece plus a line with the hero's round
// portrait and name (owner 2026-10-09); no record — the hero line alone
export function BatchList({ ctx, items, editing, fresh, wornOf, onFix, onRemove, onPlan }: {
  ctx: Ctx; items: readonly BatchEntry[]; editing: number | null; fresh: BatchFresh | null; wornOf: (c: string, slot: SlotId) => Piece | null;
  onFix: (n: number) => void; onRemove: (n: number) => void; onPlan: () => void;
}) {
  const t = useT();
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const row = fresh && list.current?.children[fresh.n - 1];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const chips = [...row.querySelectorAll('.bgear-t > *')];
    const face = row.querySelector('.bworn .face');
    land(fresh.legs, face ? [face] : chips.length ? chips : [...row.querySelectorAll('.bnum')]);
  }, [fresh]);
  // ✕: the row folds and the rows under it move up (shared/fly) — their places are taken before the list changes
  const box = useRef<HTMLDivElement>(null);
  const gone = useRef<{ n: number; tops: number[] } | null>(null);
  const drop = (n: number) => {
    const rows = [...(list.current?.children ?? [])];
    if (rows[n - 1]) fold(takeOff([rows[n - 1]]), box.current ?? undefined);
    gone.current = { n, tops: rows.slice(n).map((r) => r.getBoundingClientRect().top) };
    onRemove(n);
  };
  useLayoutEffect(() => {
    const g = gone.current;
    gone.current = null;
    if (g && list.current) slide([...list.current.children].slice(g.n - 1, g.n - 1 + g.tops.length), g.tops);
  }, [items]);
  return (
    <div ref={box} className="batch">
      {!items.length && <p className="muted small">{t.batch.empty}</p>}
      <ol ref={list} className="bgear-list batch-items">
        {items.map((e, i) => {
          const isNew = fresh?.n === i + 1;
          const key = isNew ? `${i}:${fresh.seq}` : i;
          const nw = !isNew ? '' : fresh.legs.length ? ' landing' : ' fresh';
          const x = <CloseButton className="brow-x hit" label={t.batch.remove(i + 1)} title={t.batch.remove(i + 1)} onClick={() => drop(i + 1)} />;
          return e.kind === 'piece' ? (
            <li key={key} className={`bgear-row brow${editing === i + 1 ? ' editing' : ''}${nw}`}>
              <button type="button" className="brow-fix" onClick={() => onFix(i + 1)} aria-label={`#${i + 1}`} />
              <BatchPiece ctx={ctx} n={i + 1} x={e.input}>{x}</BatchPiece>
            </li>
          ) : e.kind === 'worn' ? (() => {
            const c = ctx.idx.CHAR[e.c];
            const p = wornOf(e.c, e.slot);
            const hero = c && <span className="bworn"><HeroFace c={c} round /><HeroName c={c} /></span>;
            return p ? (
              <li key={key} className={`bgear-row brow bmark${nw}`}>
                <BatchPiece ctx={ctx} n={i + 1} x={inputOfPiece(p)}>{x}</BatchPiece>
                {hero}
              </li>
            ) : (
              <li key={key} className={`bgear-row brow bmark${nw}`}>
                <SlotIcon slot={e.slot} />
                <span className="bgear-n"><b className="bnum">#{i + 1}</b>{hero}</span>
                {x}
              </li>
            );
          })() : e.input ? (
            <li key={key} className={`bgear-row brow bmark${editing === i + 1 ? ' editing' : ''}${nw}`}>
              <button type="button" className="brow-fix" onClick={() => onFix(i + 1)} aria-label={`#${i + 1}`} />
              <BatchPiece ctx={ctx} n={i + 1} x={e.input} locked>{x}</BatchPiece>
            </li>
          ) : (
            <li key={key} className={`bgear-row brow bmark${nw}`}>
              <SlotIcon slot={e.slot} />
              <span className="bgear-n"><b className="bnum">#{i + 1}</b><LockIcon />{t.batch.lockRow(e.slot)}</span>
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
