// «Партия» — what is entered (.x/0110-batch/PLAN.md §4): pieces in the game filter's order, «Не брать» per plan line,
// «Это другой» per entry. Saved in 'ogc.batch' until «Сделал» or ✕ — Android unloads the page in split screen.
import { GRADES, SLOT, isArmor, type Index } from '@/game/data';
import type { GearKind, Grade, SlotId } from '@/game/data/types';
import { MAX_LIT, MAX_SUBS, type Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';
import type { Entry } from './plan';

export interface Batch { v: 1; items: ItemInput[]; skip: string[]; twin: number[] }
export const NEW_BATCH: Batch = { v: 1, items: [], skip: [], twin: [] };

export const entriesOf = (b: Batch): Entry[] => b.items.map((input, i) => ({ input, twin: b.twin.includes(i + 1) }));

// the entry a plan line or a «Не брать» key belongs to: «12», «12~1», «12>hero» → 12
const entryOf = (key: string): number => parseInt(key, 10);

// add, or replace #at while fixing an entry: a fixed entry is another piece — its «Не брать» and «Это другой» go
export function putItem(b: Batch, input: ItemInput, at: number | null = null): Batch {
  if (at === null || at < 1 || at > b.items.length) return { ...b, items: [...b.items, input] };
  const items = b.items.slice();
  items[at - 1] = input;
  return { ...b, items, skip: b.skip.filter((k) => entryOf(k) !== at), twin: b.twin.filter((n) => n !== at) };
}

// remove #n: later entries move up a number, their «Не брать» and «Это другой» move with them
export function removeItem(b: Batch, n: number): Batch {
  const shift = (m: number) => (m > n ? m - 1 : m);
  return {
    ...b,
    items: b.items.filter((_, i) => i !== n - 1),
    skip: b.skip.filter((k) => entryOf(k) !== n).map((k) => k.replace(/^\d+/, (d) => String(shift(Number(d))))),
    twin: b.twin.filter((m) => m !== n).map(shift),
  };
}

export const setTwin = (b: Batch, n: number): Batch => (b.twin.includes(n) ? b : { ...b, twin: [...b.twin, n] });
export const addSkip = (b: Batch, key: string): Batch => (b.skip.includes(key) ? b : { ...b, skip: [...b.skip, key] });

// a saved entry → the piece, or null when it doesn't fit the current data (a set, item or stat this data doesn't have)
function inputOf(raw: unknown, idx: Index): ItemInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slot = r.slot as SlotId, grade = r.grade as Grade;
  if (typeof r.slot !== 'string' || !SLOT[slot] || !GRADES.includes(grade)) return null;
  const armor = isArmor(slot);
  const setId = armor && typeof r.setId === 'string' && idx.SET[r.setId] ? r.setId : null;
  if (armor && !setId) return null;
  const itemKey = !armor && typeof r.itemKey === 'string' ? r.itemKey : null;
  if (itemKey && !idx.ITEM[slot as GearKind][itemKey]) return null;
  const main = !armor && typeof r.main === 'string' ? r.main : null;
  const subs: Subs = {};
  if (!r.subs || typeof r.subs !== 'object') return null;
  for (const [k, v] of Object.entries(r.subs as Record<string, unknown>)) {
    if (!idx.SUB[k] || !Number.isInteger(v) || (v as number) < 1 || (v as number) > MAX_LIT) return null;
    subs[k] = v as number;
  }
  if (Object.keys(subs).length > MAX_SUBS) return null;
  const bt = r.bt === 4 ? 4 : r.bt === null ? null : 0;
  return { slot, grade, setId, itemKey, main, unlisted: r.unlisted === true, subs, bt };
}

// what 'ogc.batch' holds → the batch; entries that don't fit the data are dropped with their marks
export function restoreBatch(raw: unknown, idx: Index): Batch | null {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return null;
  const r = raw as Record<string, unknown>;
  let b: Batch = {
    v: 1,
    items: [],
    skip: Array.isArray(r.skip) ? r.skip.filter((k): k is string => typeof k === 'string' && /^\d+(~\d+)?>\d+$/.test(k)) : [],
    twin: Array.isArray(r.twin) ? r.twin.filter((n): n is number => Number.isInteger(n) && n >= 1) : [],
  };
  const raws = Array.isArray(r.items) ? r.items : [];
  const kept = raws.map((x) => inputOf(x, idx));
  b = { ...b, items: kept.map((x) => x ?? { slot: 'helmet', grade: 'rare', setId: null, itemKey: null, main: null, subs: {} }) };
  // drop the broken ones from the end, so the numbers of the others shift like a removal
  for (let n = kept.length; n >= 1; n--) if (!kept[n - 1]) b = removeItem(b, n);
  b = { ...b, twin: b.twin.filter((n) => n <= b.items.length), skip: b.skip.filter((k) => entryOf(k) <= b.items.length) };
  return b;
}
