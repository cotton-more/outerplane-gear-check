// «Партия» — what is entered (.x/0110-batch/PLAN.md §4): pieces in the game filter's order, «Не брать» per plan line,
// «Это другой» per entry. Saved in 'ogc.batch' until «Записать план» or ✕ — Android unloads the page in split screen.
import { GRADES, SLOT, isArmor, type Index } from '@/game/data';
import type { GearKind, Grade, SlotId } from '@/game/data/types';
import { MAX_LIT, MAX_SUBS, type Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';
import type { Entry } from './plan';

// An entry is one piece of the game list, in its order (.x/0140-batch-walk §1): a piece as entered; «E» — a piece worn
// by hero c (the app knows it from c's worn record, no substats); «🔒» — a locked unworn piece, someone's reserve. #n —
// the position in the game list, all kinds counted: plan lines and walk steps use it
export type BatchEntry =
  | { kind: 'piece'; input: ItemInput }
  | { kind: 'worn'; c: string; slot: SlotId }
  | { kind: 'lock'; slot: SlotId };
// choice — «Спорно» lines decided before the walk (line id → keep / junk); done — walk steps ticked ✓
export interface Batch { v: 2; items: BatchEntry[]; skip: string[]; twin: number[]; choice: Record<string, 'keep' | 'junk'>; done: string[] }
export const NEW_BATCH: Batch = { v: 2, items: [], skip: [], twin: [], choice: {}, done: [] };

// the pieces the plan computes, with their positions; E and 🔒 entries are in the store already (worn, reserves)
export const entriesOf = (b: Batch): Entry[] => b.items.flatMap((e, i) => (e.kind === 'piece' ? [{ n: i + 1, input: e.input, twin: b.twin.includes(i + 1) }] : []));
export const slotOf = (e: BatchEntry): SlotId => (e.kind === 'piece' ? e.input.slot : e.slot);

// One filter per batch (owner, 2026-10-08, W1): weapons, accessories, or armor of one set. kind — 'weapon',
// 'accessory', 'set:<id>' or 'armor' (armor with no set known yet: only E / 🔒 entries so far); null — empty
export type BatchKind = 'weapon' | 'accessory' | 'armor' | `set:${string}`;
export const kindOfInput = (x: Pick<ItemInput, 'slot' | 'setId'>): BatchKind =>
  (isArmor(x.slot) ? (x.setId ? `set:${x.setId}` : 'armor') : (x.slot as 'weapon' | 'accessory'));
export function kindOf(b: Batch, setOf: (e: BatchEntry) => string | null = () => null): BatchKind | null {
  let kind: BatchKind | null = null;
  for (const e of b.items) {
    const k: BatchKind = e.kind === 'piece' ? kindOfInput(e.input) : isArmor(e.slot) ? (setOf(e) ? `set:${setOf(e)}` : 'armor') : (e.slot as 'weapon' | 'accessory');
    if (k.startsWith('set:')) return k;
    kind ??= k;
  }
  return kind;
}
// does an entry of kind k fit a batch of kind `of`: armor with no set yet takes any armor set
export const fitsKind = (of: BatchKind | null, k: BatchKind): boolean =>
  !of || of === k || (of === 'armor' && (k === 'armor' || k.startsWith('set:'))) || (k === 'armor' && of.startsWith('set:'));

// the entry a plan line or a «Не брать» key belongs to: «12», «12~1», «12>hero» → 12
const entryOf = (key: string): number => parseInt(key, 10);

// add, or replace #at while fixing an entry: a fixed entry is another piece — its «Не брать», «Это другой» and «Спорно»
// choice go; the walk's ticks go (the plan changed)
export function putItem(b: Batch, entry: BatchEntry, at: number | null = null): Batch {
  if (at === null || at < 1 || at > b.items.length) return { ...b, items: [...b.items, entry], done: [] };
  const items = b.items.slice();
  items[at - 1] = entry;
  return { ...b, items, skip: b.skip.filter((k) => entryOf(k) !== at), twin: b.twin.filter((n) => n !== at), choice: dropKeys(b.choice, (k) => entryOf(k) === at), done: [] };
}

const dropKeys = <T>(o: Record<string, T>, drop: (k: string) => boolean): Record<string, T> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !drop(k)));

// remove #n: later entries move up a number, their «Не брать», «Это другой» and «Спорно» choice move with them
export function removeItem(b: Batch, n: number): Batch {
  const shift = (m: number) => (m > n ? m - 1 : m);
  const move = (k: string) => k.replace(/^\d+/, (d) => String(shift(Number(d))));
  return {
    ...b,
    items: b.items.filter((_, i) => i !== n - 1),
    skip: b.skip.filter((k) => entryOf(k) !== n).map(move),
    twin: b.twin.filter((m) => m !== n).map(shift),
    choice: Object.fromEntries(Object.entries(b.choice).filter(([k]) => entryOf(k) !== n).map(([k, v]) => [move(k), v])),
    done: [],
  };
}

// what ✕ takes with an entry: the entry and its own marks — «Не брать», «Это другой», «Спорно»; the keys keep its number
export interface Removed { n: number; entry: BatchEntry; skip: string[]; twin: boolean; choice: Record<string, 'keep' | 'junk'> }
export function removedOf(b: Batch, n: number): Removed | null {
  const entry = b.items[n - 1];
  if (!entry) return null;
  return { n, entry, skip: b.skip.filter((k) => entryOf(k) === n), twin: b.twin.includes(n),
    choice: Object.fromEntries(Object.entries(b.choice).filter(([k]) => entryOf(k) === n)) };
}
// the undo of removeItem: the entry goes back to its place (later ones move down a number, their marks with them) with
// its marks; the walk's ticks are cleared, as after any change of the batch
export function restoreItem(b: Batch, r: Removed): Batch {
  const n = Math.min(r.n, b.items.length + 1);
  const shift = (m: number) => (m >= n ? m + 1 : m);
  const move = (k: string) => k.replace(/^\d+/, (d) => String(shift(Number(d))));
  const back = (k: string) => k.replace(/^\d+/, String(n));
  const items = b.items.slice();
  items.splice(n - 1, 0, r.entry);
  return {
    ...b,
    items,
    skip: [...b.skip.map(move), ...r.skip.map(back)],
    twin: [...b.twin.map(shift), ...(r.twin ? [n] : [])],
    choice: { ...Object.fromEntries(Object.entries(b.choice).map(([k, v]) => [move(k), v])), ...Object.fromEntries(Object.entries(r.choice).map(([k, v]) => [back(k), v])) },
    done: [],
  };
}

export const setTwin = (b: Batch, n: number): Batch => (b.twin.includes(n) ? b : { ...b, twin: [...b.twin, n], done: [] });
export const addSkip = (b: Batch, key: string): Batch => (b.skip.includes(key) ? b : { ...b, skip: [...b.skip, key], done: [] });
export const setChoice = (b: Batch, line: string, c: 'keep' | 'junk' | null): Batch =>
  ({ ...b, choice: c ? { ...b.choice, [line]: c } : dropKeys(b.choice, (k) => k === line), done: [] });
export const toggleDone = (b: Batch, step: string): Batch =>
  ({ ...b, done: b.done.includes(step) ? b.done.filter((x) => x !== step) : [...b.done, step] });

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

// what 'ogc.batch' holds → the batch; entries that don't fit the data are dropped with their marks. v1 — pieces only
export function restoreBatch(raw: unknown, idx: Index): Batch | null {
  const v = (raw as { v?: unknown } | null)?.v;
  if (!raw || typeof raw !== 'object' || (v !== 1 && v !== 2)) return null;
  const r = raw as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((k): k is string => typeof k === 'string') : []);
  let b: Batch = {
    ...NEW_BATCH,
    skip: strings(r.skip).filter((k) => /^\d+(~\d+)?>\d+$/.test(k)),
    twin: Array.isArray(r.twin) ? r.twin.filter((n): n is number => Number.isInteger(n) && n >= 1) : [],
    choice: v === 2 && r.choice && typeof r.choice === 'object'
      ? Object.fromEntries(Object.entries(r.choice as Record<string, unknown>).filter(([k, c]) => /^\d+(~\d+)?$/.test(k) && (c === 'keep' || c === 'junk'))) as Batch['choice']
      : {},
    done: v === 2 ? strings(r.done) : [],
  };
  const raws = Array.isArray(r.items) ? r.items : [];
  const kept = raws.map((x) => (v === 1 ? pieceOf(inputOf(x, idx)) : entryOfRaw(x, idx)));
  b = { ...b, items: kept.map((x) => x ?? { kind: 'lock', slot: 'helmet' }) };
  // drop the broken ones from the end, so the numbers of the others shift like a removal
  for (let n = kept.length; n >= 1; n--) if (!kept[n - 1]) b = removeItem(b, n);
  const done = v === 2 ? strings(r.done) : [];
  b = { ...b, done, twin: b.twin.filter((n) => n <= b.items.length), skip: b.skip.filter((k) => entryOf(k) <= b.items.length) };
  return b;
}
const pieceOf = (input: ItemInput | null): BatchEntry | null => (input ? { kind: 'piece', input } : null);
function entryOfRaw(raw: unknown, idx: Index): BatchEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const slot = r.slot as SlotId;
  if (r.kind === 'piece') return pieceOf(inputOf(r.input, idx));
  if (typeof r.slot !== 'string' || !SLOT[slot]) return null;
  if (r.kind === 'lock') return { kind: 'lock', slot };
  if (r.kind === 'worn' && typeof r.c === 'string' && idx.CHAR[r.c]) return { kind: 'worn', c: r.c, slot };
  return null;
}
