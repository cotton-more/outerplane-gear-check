// «Партия» on the page (.x/0110-batch/PLAN.md §1, §4): the batch in 'ogc.batch', the entry being fixed, what the list /
// plan view shows, and the actions — start, «В партию», fix, remove, «Посчитать», «Не брать», «Это другой», «Сделал»
// with «Вернуть», ✕. The plan is computed only while it is shown, always on the current store.
import { useMemo, useState, type Dispatch } from 'react';
import type { Index } from '@/game/data';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Texts } from '@/i18n';
import type { FormAction } from '@/features/eval/form/formState';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { storage } from '@/shared/storage';
import { useTimed } from '@/shared/useTimed';
import { addSkip, entriesOf, NEW_BATCH, putItem, removeItem, restoreBatch, setTwin, type Batch } from './batch';
import { planBatch, skipKey, undoPlan, type Plan } from './plan';

export type BatchView = 'list' | 'plan' | null;

export interface BatchMode {
  on: boolean;
  batch: Batch;
  editing: number | null;          // #n being fixed on the form («Сохранить #n»)
  note: string | null;             // «Введены не все сабстаты…» for a few seconds
  view: BatchView;                 // phone: the sheet; wide screen: what the right column shows
  plan: Plan | null;               // only while view === 'plan'
  asking: boolean;                 // ✕ with pieces: «Закончить партию?»
  start: () => void;
  add: (input: ItemInput, complete: boolean) => void; // «В партию» / «Сохранить #n»; complete — entered far enough for a verdict
  fix: (n: number) => void;
  remove: (n: number) => void;
  show: (v: BatchView) => void;
  skip: (line: string, hero: string) => void;
  twin: (n: number) => void;
  done: () => void;
  end: () => void;                 // ✕: asks when the batch has pieces
  endNow: () => void;
  cancelEnd: () => void;
}

// persist = false — a tour is running: nothing is written (the tour doesn't offer the batch anyway)
export function useBatchMode({ idx, t, ctx, gear, dispatch, persist, narrow, say }: {
  idx: Index; t: Texts; ctx: Ctx; gear: GearApi;
  dispatch: Dispatch<FormAction>; persist: boolean; narrow: boolean;
  say: (m: GearMsg) => void;
}): BatchMode {
  const [value, setValue] = useState<Batch | null>(() => restoreBatch(storage.get<unknown>('batch', null), idx));
  const set = (next: Batch | null) => {
    setValue(next);
    if (persist) storage.set('batch', next);
  };
  const [editing, setEditing] = useState<number | null>(null);
  const [view, setView] = useState<BatchView>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useTimed<string>(4000);
  const batch = value ?? NEW_BATCH;
  const plan = useMemo(() => (value && view === 'plan' ? planBatch(ctx, gear.store, entriesOf(value), new Set(value.skip)) : null),
    [ctx, gear.store, value, view]);

  const toForm = () => { if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }); };
  const close = () => { setValue(null); if (persist) storage.set('batch', null); setEditing(null); setView(null); setAsking(false); };
  return {
    on: !!value, batch, editing, note, view, plan, asking,
    start: () => { set({ ...NEW_BATCH }); setEditing(null); setView(narrow ? null : 'list'); },
    add: (input, complete) => {
      if (!value) return;
      if (!complete) { setNote(t.batch.incomplete); return; }
      set(putItem(value, input, editing));
      setEditing(null);
      setNote(null);
      dispatch({ type: 'reset' });
      toForm();
    },
    fix: (n) => {
      const x = value?.items[n - 1];
      if (!x) return;
      dispatch({ type: 'load', item: x });
      setEditing(n);
      if (narrow) setView(null);
      toForm();
    },
    remove: (n) => {
      if (!value) return;
      set(removeItem(value, n));
      setEditing((e) => (e === n ? null : e !== null && e > n ? e - 1 : e));
    },
    show: setView,
    skip: (line, hero) => { if (value) set(addSkip(value, skipKey(line, hero))); },
    twin: (n) => { if (value) set(setTwin(value, n)); },
    // «Сделал»: the plan on the current store — never a stale one; «Вернуть» undoes its operations and brings the batch back
    done: () => {
      if (!value) return;
      const was = value;
      const p = planBatch(ctx, gear.store, entriesOf(value), new Set(value.skip));
      gear.set(p.st);
      close();
      dispatch({ type: 'reset' });
      // records «Надеть» dropped in other slots (no longer needed) — said, as after a single «Надеть», never silently
      const pruned = [...new Set(p.ops.filter((o) => o.r.removed.some((x) => x.slot !== o.r.slot)).map((o) => ctx.idx.CHAR[o.c]?.name ?? ''))];
      say({
        text: t.batch.recorded(p.counts.wear, p.counts.keep), note: pruned.length ? t.fit.pruned(pruned.join(', ')) : '', tab: 'eval',
        undo: (x) => undoPlan(x, p),
        after: () => { set(was); setView(narrow ? null : 'list'); },
      });
    },
    end: () => { if (value?.items.length) setAsking(true); else close(); },
    endNow: close,
    cancelEnd: () => setAsking(false),
  };
}
