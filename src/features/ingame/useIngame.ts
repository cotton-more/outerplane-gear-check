// «Надеть в игре» on the page (features/ingame/ingame): the lines in 'ogc.ingame'. Read once, with the dead lines dropped
// against the store of that moment; every write drops them too. persist = false — a tour is running or a newer page
// saved the gear: nothing is read against that store and nothing is written.
import { useRef, useState } from 'react';
import type { Index } from '@/game/data';
import type { GearStore } from '@/features/gear/model/gear';
import { storage } from '@/shared/storage';
import { addLine, INGAME_KEY, NO_INGAME, pruned, removeLine, restoreIngame, restoreLine, undoLine, type Ingame, type Line } from './ingame';

export interface IngameApi {
  value: Ingame;                                        // as stored: may hold lines dead since (sectionsOf / countOf filter)
  add: (line: Line, st: GearStore) => void;             // after «Надеть»: st — the store after it
  undo: (line: Line, prev: Line | null) => void;        // «Вернуть» of that «Надеть»
  tick: (id: string) => { line: Line; at: number } | null; // kept in the game: the line goes
  untick: (line: Line, at: number) => void;             // «Вернуть» after the tick
}

export function useIngame(idx: Index, store: GearStore, persist: boolean): IngameApi {
  const [value, setValue] = useState<Ingame>(() => {
    if (!persist) return NO_INGAME;
    const raw = storage.get<unknown>(INGAME_KEY, null);
    const read = restoreIngame(raw, idx);
    const live = pruned(read, store);
    // something was dropped (dead, malformed) — written back at once
    if (raw !== null && JSON.stringify(stored(live)) !== JSON.stringify(raw)) write(live);
    return live;
  });
  // the lines as they are when «Вернуть» is tapped, not as they were at «Надеть»
  const current = useRef(value);
  current.current = value;
  const set = (next: Ingame) => {
    if (next === current.current) return;
    current.current = next;
    setValue(next);
    if (persist) write(next);
  };
  return {
    value,
    add: (line, st) => set(addLine(current.current, st, line)),
    undo: (line, prev) => set(undoLine(current.current, line, prev)),
    tick: (id) => {
      const r = removeLine(current.current, id);
      if (!r) return null;
      set(r.next);
      return { line: r.line, at: r.at };
    },
    untick: (line, at) => set(restoreLine(current.current, line, at)),
  };
}

// nothing owed — no key
const stored = (b: Ingame): Ingame | null => (b.lines.length ? b : null);
const write = (b: Ingame) => storage.set(INGAME_KEY, stored(b));
