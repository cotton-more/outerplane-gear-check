// The walk's state in a trade sheet (MODEL.md §7 item 9; HISTORY.md 0200-boss E2b O1): the player's decisions and ticks for one
// target (a hero or a team), kept in 'ogc.trade' until «Сделал» / «Отмена» (✕ keeps them); the entry window's slot; the
// outcome of the plan with these decisions; «Пересчитано: N» — lines a recount changed (a decline or its undo).
import { useEffect, useMemo, useState } from 'react';
import type { Index } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import type { ItemInput } from '@/game/item/item';
import { storage } from '@/shared/storage';
import type { Entered, Step } from '@/features/trade/model/apply';
import { slotKey, type World } from '@/features/trade/model/model';
import { emptyWalk, readWalk, TRADE_KEY } from '@/features/trade/model/stored';
import { linesOf, type HeroLine } from '@/features/trade/model/view';
import { linesOfWalk, NO_DECISIONS, outcomeOf, walkLeft, type Decisions, type Outcome } from '@/features/trade/model/walk';
import type { Decide } from './TradeWalk';

const toggle = (xs: readonly string[], x: string, on: boolean) => (on ? (xs.includes(x) ? xs : [...xs, x]) : xs.filter((y) => y !== x));
// lines that are a real step — what «Пересчитано» counts
const steps = (o: Outcome) => linesOfWalk(o.walk).filter((l) => l.kind !== 'kept' && l.kind !== 'hole' && !(l.kind === 'repl' && l.kept));

// target null — nothing picked yet: the stored walk is neither read nor touched; idx — what the stored walk's pieces are
// checked against
export function useWalk(target: string | null, idx: Index, persist = true) {
  const read = (x: string | null) => (x && persist ? readWalk(storage.get(TRADE_KEY, null), x, idx) : NO_DECISIONS);
  // resumed — the walk came back from the device with ticks («Продолжаю: …»)
  const load = (x: string | null) => { const d = read(x); return { target: x, d, resumed: d.ticks.length > 0 }; };
  const [state, setState] = useState(() => load(target));
  // the target changed (another hero picked): its own stored walk, or none — the old one is replaced on its first write
  const cur = state.target === target ? state : load(target);
  if (state.target !== target) setState(cur);
  const { d, resumed } = cur;
  const [entry, setEntry] = useState<{ hero: string; slot: SlotId } | null>(null);
  const [mark, setMark] = useState<Set<string> | null>(null); // the step keys before a recount
  useEffect(() => {
    if (!persist || !target) return;
    storage.set(TRADE_KEY, emptyWalk(d) ? null : { v: 1, target, d });
  }, [d, target, persist]);
  const set = (f: (x: Decisions) => Decisions) => setState((s) => ({ ...s, d: f(s.d) }));
  return {
    d, entry, resumed, mark,
    frozen: useMemo(() => new Set(d.frozen), [d.frozen]),
    decide(x: Decide, now: Outcome | null) {
      if (x.kind === 'tick') { set((y) => ({ ...y, ticks: toggle(y.ticks, x.key, !y.ticks.includes(x.key)) })); return; }
      const k = slotKey(x.hero, x.slot);
      if (x.kind === 'enter') { setEntry({ hero: x.hero, slot: x.slot }); return; }
      if (x.kind === 'unenter') { set((y) => { const { [k]: _, ...entered } = y.entered; return { ...y, entered }; }); return; }
      if (x.kind === 'leave' || x.kind === 'unleave') { set((y) => ({ ...y, left: toggle(y.left, k, x.kind === 'leave') })); return; }
      // a decline or its undo recounts the plan: remember the steps before it
      if (now) setMark(new Set(steps(now).map((l) => l.key)));
      if (x.kind === 'freeze' || x.kind === 'unfreeze') set((y) => ({ ...y, frozen: toggle(y.frozen, k, x.kind === 'freeze') }));
      else set((y) => ({ ...y, kept: toggle(y.kept, k, x.kind === 'keep') }));
    },
    save(x: ItemInput) {
      if (!entry) return;
      const k = slotKey(entry.hero, entry.slot);
      set((y) => ({ ...y, entered: { ...y.entered, [k]: x }, left: toggle(y.left, k, false) }));
      setEntry(null);
    },
    closeEntry: () => setEntry(null),
    // «Сделал» / «Отмена»: the walk is over — nothing stays on the device
    clear() { setState((s) => ({ ...s, d: NO_DECISIONS, resumed: false })); setMark(null); if (persist) storage.set(TRADE_KEY, null); },
  };
}

// the plan's outcome with the decisions; lines — the receivers' header lines (gain, stats, sets); left — lines still to do;
// recount — how many steps a recount changed (mark — the step keys before it)
export function useOutcome(w0: World, plan: Step[] | null, receivers: readonly string[], team: readonly string[], d: Decisions, mark: ReadonlySet<string> | null) {
  return useMemo(() => {
    if (!plan) return null;
    const o = outcomeOf(w0, plan, receivers, team, d);
    const lines: HeroLine[] = linesOf(w0, o.w2, receivers, o.moves).filter((l) => l.receiver);
    const ticks = new Set(d.ticks);
    const recount = mark ? steps(o).filter((l) => !mark.has(l.key)).length : 0;
    const entered: Entered[] = linesOfWalk(o.walk).flatMap((l) => (l.kind === 'hole' && l.entered ? [{ hero: l.hero, slot: l.slot, input: l.entered }] : []));
    const total = linesOfWalk(o.walk).length;
    return { o, lines, ticks, left: walkLeft(o.walk, ticks), recount, entered, total, done: total - walkLeft(o.walk, ticks) };
  }, [w0, plan, receivers, team, d, mark]);
}
