// «Партия» on the page (MODEL.md §8): the batch in 'ogc.batch', the entry being fixed, what the list /
// plan view shows, and the actions — start, «В партию», fix, remove, «Посчитать», «Не брать», «Это другой», «Записать план»
// with «Вернуть», ✕. The plan is computed only while it is shown, always on the current store.
import { useMemo, useRef, useState, type Dispatch } from 'react';
import { isArmor, type Index } from '@/game/data';
import type { Char, Grade, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Piece } from '@/features/gear/model/gear';
import type { Texts } from '@/i18n';
import type { FormAction } from '@/features/eval/form/formState';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { storage } from '@/shared/storage';
import { useTimed } from '@/shared/useTimed';
import { addSkip, entriesOf, fitsKind, kindOf, kindOfInput, NEW_BATCH, putItem, removeItem, removedOf, restoreBatch, restoreItem, setChoice, setTwin, toggleDone, type Batch, type BatchEntry, type BatchKind } from './batch';
import { planBatch, skipKey, undoPlan, type Plan } from './plan';
import { walkOf, type Walk } from './walk';

export type BatchView = 'list' | 'plan' | 'walk' | null;
// the form under a batch of a known kind (owner 2026-10-08): other slots and sets can't be picked — a new batch for them
// the next piece of the game list may be another slot or grade: armor asks the slot again (a weapon or accessory batch
// has one slot), every piece asks the grade; «В партию», «E» and «🔒» wait for it — a note says what's missing
export interface BatchAsk { slot: boolean; grade: boolean }
// grade — the first piece's (owner 2026-10-09: 60 Epic swords — 60 taps on «E» otherwise; Epic and Legendary are
// different materials, so a mix-up is the costliest mistake); explain — a tap on a locked one: the note says why
export interface BatchLock { slots: SlotId[]; set: string | null; grade: Grade | null; explain: () => void }
// seq — a new one per put, so fixing the same #n again scrolls and plays again
export interface BatchFresh { n: number; seq: number }
const ARMOR_SLOTS: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];

export interface BatchMode {
  on: boolean;
  batch: Batch;
  editing: number | null;          // #n being fixed on the form («Сохранить #n»)
  fresh: BatchFresh | null;        // wide screen: the entry just added or fixed — the list scrolls to it
  note: string | null;             // «Введены не все сабстаты…» for a few seconds
  view: BatchView;                 // phone: the sheet; wide screen: what the right column shows
  plan: Plan | null;               // only while view is 'plan' or 'walk'
  walk: Walk | null;               // the step-by-step walk of that plan
  lock: BatchLock | null;          // one filter per batch: what the form may still pick (null — anything)
  what: string;                    // «Legendary Speed», «Epic оружие» … — the batch's kind in a phrase (batch.what)
  wornOf: (c: string, slot: SlotId) => Piece | null; // an «E» entry's piece: the hero's worn record of that slot
  ask: BatchAsk | null;            // after «В партию»: what the next piece must pick again (owner 2026-10-09)
  answer: (what: 'slot' | 'grade') => void;
  asking: boolean;                 // ✕ with pieces: «Закончить партию?»
  start: () => void;
  add: (input: ItemInput, complete: boolean) => void; // «В партию» / «Сохранить #n»; complete — entered far enough for a verdict
  fix: (n: number) => void;
  remove: (n: number) => void;
  show: (v: BatchView) => void;
  skip: (line: string, hero: string) => void;
  twin: (n: number) => void;
  done: () => void;
  wornCands: (slot: SlotId) => Char[] | null; // «E»: roster heroes wearing a piece of this slot that fits the batch; null — the slot is asked first
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
  const [fresh, setFresh] = useState<BatchFresh | null>(null);
  const [view, setView] = useState<BatchView>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useTimed<string>(4000);
  const [ask, setAsk] = useState<BatchAsk | null>(null);
  const askNote = (a: BatchAsk) => setNote(t.batch.askFirst(a.slot, a.grade));
  const batch = value ?? NEW_BATCH;
  const current = useRef(value);          // the batch as it is when «Вернуть» is tapped, not as it was at ✕
  current.current = value;
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
  // fixing the only entry may change the kind and the grade — no lock then
  const free = editing !== null && batch.items.length === 1;
  const grade: Grade | null = free ? null : (value?.items.find((e) => e.kind === 'piece') as { input: ItemInput } | undefined)?.input.grade ?? null;
  // the batch's kind in a phrase («Epic Speed», «Legendary оружие»): the titles, the walk's filter note, the notes
  const whatOf = (k: BatchKind | null) => t.batch.what(!k ? null : k.startsWith('set:') ? { set: idx.SET[k.slice(4)]?.short ?? '' } : k === 'weapon' ? 'weapon' : k === 'accessory' ? 'accessory' : null, grade);
  const kindText = (k: BatchKind | null) => t.batch.otherKind(whatOf(k));
  // an entry of another kind isn't added: the note says what this batch is
  const put = (e: BatchEntry, k: BatchKind): boolean => {
    if (!value) return false;
    // fixing the only entry may change the kind
    const rest = free ? null : kind;
    if (!fitsKind(rest, k) || (grade && e.kind === 'piece' && e.input.grade !== grade)) { setNote(kindText(rest)); return false; }
    const next = putItem(value, e, editing);
    set(next);
    // the phone's list is in a closed sheet: nothing to scroll; the strip's count says it
    if (!narrow) setFresh((f) => ({ n: editing ?? next.items.length, seq: (f?.seq ?? 0) + 1 }));
    setEditing(null);
    setNote(null);
    return true;
  };
  const lock: BatchLock | null = !kind || free ? null
    : kind === 'weapon' || kind === 'accessory' ? { slots: [kind], set: null, grade, explain: () => setNote(kindText(kind)) }
    : { slots: ARMOR_SLOTS, set: kind.startsWith('set:') ? kind.slice(4) : null, grade, explain: () => setNote(kindText(kind)) };
  const slotKind = (slot: SlotId): BatchKind => (isArmor(slot) ? 'armor' : (slot as 'weapon' | 'accessory'));

  const toForm = () => { if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }); };
  const close = () => { setAsk(null); setValue(null); if (persist) storage.set('batch', null); setEditing(null); setView(null); setFresh(null); setAsking(false); };
  return {
    on: !!value, batch, editing, fresh, note, view, plan, walk, lock, asking,
    wornOf: (c, slot) => { const id = gear.store.worn?.[c]?.[slot]; return id ? gear.store.pieces[id] ?? null : null; },
    what: whatOf(kind),
    start: () => { set({ ...NEW_BATCH }); setEditing(null); setView(narrow ? null : 'list'); },
    add: (input, complete) => {
      if (!value) return;
      if (ask && (ask.slot || ask.grade)) { askNote(ask); return; }
      if (!complete) { setNote(t.batch.incomplete); return; }
      const fixing = editing !== null;
      if (!put({ kind: 'piece', input }, kindOfInput(input))) return;
      dispatch({ type: 'reset', batch: true });
      if (!fixing) setAsk({ slot: isArmor(input.slot), grade: false }); // the grade is the batch's from now on (lock)
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
    // ✕ removes at once and every later #n moves up: a message with «Вернуть» puts the entry back at its place with its marks
    remove: (n) => {
      if (!value) return;
      const gone = removedOf(value, n);
      set(removeItem(value, n));
      setEditing((e) => (e === n ? null : e !== null && e > n ? e - 1 : e));
      if (gone) say({ text: t.batch.removed(n), note: '', tab: 'eval', after: () => { if (current.current) set(restoreItem(current.current, gone)); } });
    },
    show: (v) => { setView(v); setFresh(null); },
    skip: (line, hero) => { if (value) set(addSkip(value, skipKey(line, hero))); },
    twin: (n) => { if (value) set(setTwin(value, n)); },
    // «Записать план»: the plan on the current store — never a stale one; «Вернуть» undoes its operations and brings the batch back
    done: () => {
      if (!value) return;
      const was = value;
      const p = planBatch(ctx, gear.store, entriesOf(value), new Set(value.skip));
      gear.set(p.st);
      close();
      dispatch({ type: 'reset' });
      // records «Надеть» dropped in other slots (no longer needed) — said, as after a single «Надеть», never silently
      const pruned = [...new Set(p.ops.flatMap((o) => ('r' in o && o.r.removed.some((x) => x.slot !== o.r.slot) ? [ctx.idx.CHAR[o.c]?.name ?? ''] : [])))];
      say({
        text: t.batch.recorded(p.counts.wear, p.counts.keep), note: pruned.length ? t.fit.pruned(pruned.join(', ')) : '', tab: 'eval',
        undo: (x) => undoPlan(x, p),
        after: () => { set(was); setView(narrow ? null : 'list'); },
      });
    },
    wornCands: (slot) => {
      if (!value) return [];
      if (ask?.slot) { askNote({ slot: true, grade: false }); return null; }
      const taken = new Set(value.items.filter((e) => e.kind === 'worn' && e.slot === slot).map((e) => e.kind === 'worn' ? e.c : ''));
      return [...ctx.roster].map((id) => idx.CHAR[id]).filter((c): c is Char => {
        if (!c || taken.has(c.id)) return false;
        const id = gear.store.worn?.[c.id]?.[slot];
        const p = id ? gear.store.pieces[id] : null;
        return !!p && fitsKind(kind, kindOfInput(p)) && (!grade || p.grade === grade);
      });
    },
    // «E» and «🔒» take the form's slot: armor asks it first, like a piece
    addWorn: (c, slot) => {
      if (ask?.slot) { askNote({ slot: true, grade: false }); return; }
      if (put({ kind: 'worn', c, slot }, slotKind(slot)) && isArmor(slot)) setAsk({ slot: true, grade: ask?.grade ?? false });
    },
    addLock: (slot) => {
      if (ask?.slot) { askNote({ slot: true, grade: false }); return; }
      if (put({ kind: 'lock', slot }, slotKind(slot)) && isArmor(slot)) setAsk({ slot: true, grade: ask?.grade ?? false });
    },
    ask: value ? ask : null,
    answer: (what) => setAsk((a) => (a ? { ...a, [what]: false } : a)),
    choose: (line, c) => { if (value) set(setChoice(value, line, c)); },
    tick: (step) => { if (value) set(toggleDone(value, step)); },
    end: () => { if (value?.items.length) setAsking(true); else close(); },
    endNow: close,
    cancelEnd: () => setAsking(false),
  };
}
