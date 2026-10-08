// «Партия» on the page (.x/0110-batch/PLAN.md §1, §4): the batch in 'ogc.batch', the entry being fixed, what the list /
// plan view shows, and the actions — start, «В партию», fix, remove, «Посчитать», «Не брать», «Это другой», «Сделал»
// with «Вернуть», ✕. The plan is computed only while it is shown, always on the current store.
import { useMemo, useState, type Dispatch } from 'react';
import { isArmor, type Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Texts } from '@/i18n';
import type { FormAction } from '@/features/eval/form/formState';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { storage } from '@/shared/storage';
import { useTimed } from '@/shared/useTimed';
import { addSkip, entriesOf, fitsKind, kindOf, kindOfInput, NEW_BATCH, putItem, removeItem, restoreBatch, setChoice, setTwin, toggleDone, type Batch, type BatchEntry, type BatchKind } from './batch';
import { planBatch, skipKey, undoPlan, type Plan } from './plan';
import { walkOf, type Walk } from './walk';

export type BatchView = 'list' | 'plan' | 'walk' | null;
// the form under a batch of a known kind (owner 2026-10-08): other slots and sets can't be picked — a new batch for them
export interface BatchLock { slots: SlotId[]; set: string | null; explain: () => void } // explain — a tap on a locked one: the note says why
const ARMOR_SLOTS: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];

export interface BatchMode {
  on: boolean;
  batch: Batch;
  editing: number | null;          // #n being fixed on the form («Сохранить #n»)
  note: string | null;             // «Введены не все сабстаты…» for a few seconds
  view: BatchView;                 // phone: the sheet; wide screen: what the right column shows
  plan: Plan | null;               // only while view is 'plan' or 'walk'
  walk: Walk | null;               // the step-by-step walk of that plan
  lock: BatchLock | null;          // one filter per batch: what the form may still pick (null — anything)
  asking: boolean;                 // ✕ with pieces: «Закончить партию?»
  start: () => void;
  add: (input: ItemInput, complete: boolean) => void; // «В партию» / «Сохранить #n»; complete — entered far enough for a verdict
  fix: (n: number) => void;
  remove: (n: number) => void;
  show: (v: BatchView) => void;
  skip: (line: string, hero: string) => void;
  twin: (n: number) => void;
  done: () => void;
  wornCands: (slot: SlotId) => Char[]; // «E»: roster heroes wearing a piece of this slot that fits the batch
  addWorn: (c: string, slot: SlotId) => void;
  addLock: (slot: SlotId) => void;
  choose: (line: string, c: 'keep' | 'junk' | null) => void; // «Спорно»: decided before the walk
  tick: (step: string) => void;    // ✓ a walk step
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
  const planned = view === 'plan' || view === 'walk';
  const plan = useMemo(() => (value && planned ? planBatch(ctx, gear.store, entriesOf(value), new Set(value.skip)) : null),
    [ctx, gear.store, value?.items, value?.skip, value?.twin, planned]); // eslint-disable-line react-hooks/exhaustive-deps
  const walk = useMemo(() => (value && plan ? walkOf(value, plan) : null), [value, plan]);
  // one filter per batch (W1): the set of an «E» entry — its hero's worn record
  const wornSet = (e: BatchEntry): string | null => {
    if (e.kind !== 'worn') return null;
    const id = gear.store.worn?.[e.c]?.[e.slot];
    return id ? gear.store.pieces[id]?.setId ?? null : null;
  };
  const kind = value ? kindOf(value, wornSet) : null;
  const kindText = (k: BatchKind) => t.batch.otherKind(k.startsWith('set:') ? { set: idx.SET[k.slice(4)]?.short ?? '' } : k === 'weapon' ? 'weapon' : k === 'accessory' ? 'accessory' : { set: '' });
  // an entry of another kind isn't added: the note says what this batch is
  const put = (e: BatchEntry, k: BatchKind): boolean => {
    if (!value) return false;
    // fixing the only entry may change the kind
    const rest = editing !== null && value.items.length === 1 ? null : kind;
    if (!fitsKind(rest, k)) { setNote(kindText(rest!)); return false; }
    set(putItem(value, e, editing));
    setEditing(null);
    setNote(null);
    return true;
  };
  // fixing the only entry may change the kind — no lock then
  const lock: BatchLock | null = !kind || (editing !== null && batch.items.length === 1) ? null
    : kind === 'weapon' || kind === 'accessory' ? { slots: [kind], set: null, explain: () => setNote(kindText(kind)) }
    : { slots: ARMOR_SLOTS, set: kind.startsWith('set:') ? kind.slice(4) : null, explain: () => setNote(kindText(kind)) };
  const slotKind = (slot: SlotId): BatchKind => (isArmor(slot) ? 'armor' : (slot as 'weapon' | 'accessory'));

  const toForm = () => { if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }); };
  const close = () => { setValue(null); if (persist) storage.set('batch', null); setEditing(null); setView(null); setAsking(false); };
  return {
    on: !!value, batch, editing, note, view, plan, walk, lock, asking,
    start: () => { set({ ...NEW_BATCH }); setEditing(null); setView(narrow ? null : 'list'); },
    add: (input, complete) => {
      if (!value) return;
      if (!complete) { setNote(t.batch.incomplete); return; }
      if (!put({ kind: 'piece', input }, kindOfInput(input))) return;
      dispatch({ type: 'reset' });
      toForm();
    },
    fix: (n) => {
      const x = value?.items[n - 1];
      if (x?.kind !== 'piece') return;
      dispatch({ type: 'load', item: x.input });
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
      const pruned = [...new Set(p.ops.filter((o) => 'r' in o && o.r.removed.some((x) => x.slot !== o.r.slot)).map((o) => ctx.idx.CHAR[o.c]?.name ?? ''))];
      say({
        text: t.batch.recorded(p.counts.wear, p.counts.keep), note: pruned.length ? t.fit.pruned(pruned.join(', ')) : '', tab: 'eval',
        undo: (x) => undoPlan(x, p),
        after: () => { set(was); setView(narrow ? null : 'list'); },
      });
    },
    wornCands: (slot) => {
      if (!value) return [];
      const taken = new Set(value.items.filter((e) => e.kind === 'worn' && e.slot === slot).map((e) => e.kind === 'worn' ? e.c : ''));
      return [...ctx.roster].map((id) => idx.CHAR[id]).filter((c): c is Char => {
        if (!c || taken.has(c.id)) return false;
        const id = gear.store.worn?.[c.id]?.[slot];
        const p = id ? gear.store.pieces[id] : null;
        return !!p && fitsKind(kind, kindOfInput(p));
      });
    },
    addWorn: (c, slot) => { put({ kind: 'worn', c, slot }, slotKind(slot)); },
    addLock: (slot) => { put({ kind: 'lock', slot }, slotKind(slot)); },
    choose: (line, c) => { if (value) set(setChoice(value, line, c)); },
    tick: (step) => { if (value) set(toggleDone(value, step)); },
    end: () => { if (value?.items.length) setAsking(true); else close(); },
    endNow: close,
    cancelEnd: () => setAsking(false),
  };
}
