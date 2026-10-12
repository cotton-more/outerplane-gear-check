// Free pieces of a trade window (MODEL.md §7 items 2 and 8): worn by someone when the window opened, worn by nobody now —
// taken off by a «Сделал» in this window. Not held (World.held): any next hero may take them. Spare that was already
// unworn at the open stays held (Q1b). Nothing is stored: the set at the open lives in the sheet, the rest is the store.
import type { GearStore } from '@/features/gear/model/gear';
import { SLOT_ORDER } from './model';

export const wornOf = (st: GearStore): Set<string> =>
  new Set(Object.values(st.worn ?? {}).flatMap((w) => Object.values(w).filter((x): x is string => !!x)));

// opened — wornOf(store at the open). Only pieces that still exist and sit in some pool (a copy that left the app is gone);
// by slot, then by entry
export function freeOf(opened: ReadonlySet<string>, st: GearStore): string[] {
  const now = wornOf(st);
  const inPool = new Set(Object.values(st.pools).flat());
  const slot = (id: string) => SLOT_ORDER.indexOf(st.pieces[id].slot);
  return [...opened].filter((id) => st.pieces[id] && inPool.has(id) && !now.has(id)).sort((a, z) => slot(a) - slot(z));
}
