// «Надеть в игре» (HISTORY.md 0230): «Надеть» on «Оценка» records the piece at once, but in the game the
// player puts it on later, hero by hero. A line is that promise: the hero, the slot, the record put on, a snapshot of it
// for display, and what the game does with the piece it takes off. Kept in 'ogc.ingame' (not in the backup, like
// 'ogc.batch' / 'ogc.trade').
// - Live = the app still has that record worn in that slot (computed, never stored): a trade, a re-dress on the card, a
//   removal or a Core Fusion move drops the line by itself. Dead lines are dropped from storage on read and on every write.
// - One line per hero and slot: a second «Надеть» on the slot replaces the line in place. When the slot's record was
//   itself a live promise (superseded), it never went on in the game: the pool lets it go (features/gear/pool planPut
//   promised) and the new line keeps the first line's «taken off» — the game still has that piece on.
// - Written only by «Надеть» / «Заменить» from «Оценка» (screens/eval useFormFlow); «Вернуть» of that message puts back
//   the line it replaced, or none.
import { GRADES, SLOT, SLOTS, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import { MAX_LIT, MAX_SUBS, type Subs } from '@/game/item/subs';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { oldFate } from '@/features/gear/model/material';
import type { WearResult } from '@/features/gear/pool';

export const INGAME_KEY = 'ingame';
// the piece the game takes off: the hero's reserve now — lock it; Epic material of the new one — feed it to its
// Breakthrough. Otherwise nothing to do: the game drops it into the inventory, where it is rated again (Р15)
export type Off = 'lock' | 'feed';
// another hero's reserve the new piece's Breakthrough eats (useFormFlow fed): its hero and the piece as it was
export interface Fed { hero: string; snap: Piece }
export interface Line { id: string; hero: string; slot: SlotId; piece: string; snap: Piece; off?: Off; fed?: Fed[] }
export interface Ingame { v: 1; lines: Line[] }
export const NO_INGAME: Ingame = { v: 1, lines: [] };

// one line per hero and slot, and a record is never reused: the id says all three
const idOf = (hero: string, slot: SlotId, piece: string) => `${hero}:${slot}:${piece}`;

// the line's promise still stands: the hero wears that record in that slot. The record must still be that piece (slot,
// grade, set, item, main — an edit in the piece sheet changes only levels and «T4»): a backup loaded since gives out
// ids anew, and another piece may get the same id
export function isLive(st: GearStore, l: Line): boolean {
  if (st.worn?.[l.hero]?.[l.slot] !== l.piece) return false;
  const p = st.pieces[l.piece], s = l.snap;
  return !!p && p.slot === s.slot && p.grade === s.grade && p.setId === s.setId && p.itemKey === s.itemKey && p.main === s.main;
}
// the live lines only; the same object when nothing is dead
export function pruned(b: Ingame, st: GearStore): Ingame {
  const lines = b.lines.filter((l) => isLive(st, l));
  return lines.length === b.lines.length ? b : { ...b, lines };
}
// the records the hero still owes in the game — the option of «Надеть» (features/gear/pool putOn promised)
export const promisedOf = (b: Ingame, st: GearStore, hero: string): Set<string> =>
  new Set(b.lines.filter((l) => l.hero === hero && isLive(st, l)).map((l) => l.piece));
// the records promised to anyone — the same-piece guard of the verdict (features/gear/verdict VerdictOpts promised)
export const promisedAll = (b: Ingame, st: GearStore): Set<string> =>
  new Set(b.lines.filter((l) => isLive(st, l)).map((l) => l.piece));
// the live line of a hero's slot
export const lineAt = (b: Ingame, st: GearStore, hero: string, slot: SlotId): Line | null =>
  b.lines.find((l) => l.hero === hero && l.slot === slot && isLive(st, l)) ?? null;

// What the game does with the piece «Надеть» takes off (r — the put, st — the store after it): the old worn record still
// in the hero's pool — a reserve, lock it; it left and it is Epic material of the new one — feed it; otherwise nothing
export function offOf(r: WearResult & { piece: Piece }, st: GearStore, hero: string): Off | undefined {
  if (!r.wasWorn || r.wasWorn === r.id) return undefined;
  if (st.pools[hero]?.includes(r.wasWorn)) return 'lock';
  const old = r.removed.find((p) => p.id === r.wasWorn);
  return old && oldFate(old, r.piece) === 'material' ? 'feed' : undefined;
}

// The line of a «Надеть»: r — the put, st — the store after it, prev — the live line of that slot before it (lineAt on the
// store before). A superseded promise (prev) keeps its «taken off»: the game still has that piece on, not prev's
export function lineOf(r: WearResult & { piece: Piece }, st: GearStore, hero: string, prev: Line | null, fed: readonly Fed[] = []): Line {
  const off = prev ? prev.off : offOf(r, st, hero);
  return {
    id: idOf(hero, r.slot, r.id), hero, slot: r.slot, piece: r.id, snap: r.piece,
    ...(off ? { off } : {}), ...(fed.length ? { fed: [...fed] } : {}),
  };
}

// Add the line (st — the store after «Надеть»): the dead ones go; a line of the same hero and slot is replaced in place
// (the hero's section keeps its order), else it goes last
export function addLine(b: Ingame, st: GearStore, line: Line): Ingame {
  const lines = b.lines.filter((l) => (l.hero === line.hero && l.slot === line.slot) || isLive(st, l));
  const i = lines.findIndex((l) => l.hero === line.hero && l.slot === line.slot);
  if (i < 0) return { ...b, lines: [...lines, line] };
  const next = lines.slice();
  next[i] = line;
  return { ...b, lines: next };
}
// «Вернуть» of that «Надеть»: the line goes and the one it replaced (prev) comes back in its place. The slot's line is
// another by now (a later «Надеть») — nothing changes
export function undoLine(b: Ingame, line: Line, prev: Line | null): Ingame {
  const i = b.lines.findIndex((l) => l.id === line.id);
  if (i < 0) return b;
  const lines = b.lines.slice();
  if (prev) lines[i] = prev; else lines.splice(i, 1);
  return { ...b, lines };
}

// A tap on a line — kept in the game: the line goes; at — its place, for «Вернуть» (restoreLine)
export function removeLine(b: Ingame, id: string): { next: Ingame; line: Line; at: number } | null {
  const at = b.lines.findIndex((l) => l.id === id);
  if (at < 0) return null;
  return { next: { ...b, lines: b.lines.filter((_, i) => i !== at) }, line: b.lines[at], at };
}
// «Вернуть» after the tap: the line goes back to its place, unless the slot has a line again
export function restoreLine(b: Ingame, line: Line, at: number): Ingame {
  if (b.lines.some((l) => l.hero === line.hero && l.slot === line.slot)) return b;
  const lines = b.lines.slice();
  lines.splice(Math.min(at, lines.length), 0, line);
  return { ...b, lines };
}

// What the list shows: a section per hero in the order of their first promise, slots in game order; now — the record as
// it is in the store (an edit in the piece sheet shows), the line keeps the snapshot
export interface LiveLine { line: Line; now: Piece }
export interface Section { hero: string; lines: LiveLine[] }
const SLOT_ORDER = new Map(SLOTS.map((s, i) => [s.id, i]));
export function sectionsOf(b: Ingame, st: GearStore): Section[] {
  const out = new Map<string, LiveLine[]>();
  for (const line of b.lines) {
    if (!isLive(st, line)) continue;
    const rows = out.get(line.hero) ?? [];
    rows.push({ line, now: st.pieces[line.piece] });
    out.set(line.hero, rows);
  }
  return [...out].map(([hero, lines]) => ({ hero, lines: lines.sort((a, z) => SLOT_ORDER.get(a.line.slot)! - SLOT_ORDER.get(z.line.slot)!) }));
}
export const countOf = (b: Ingame, st: GearStore): number => b.lines.filter((l) => isLive(st, l)).length;

// --- storage: what 'ogc.ingame' holds → the lines; a malformed line is dropped (as restoreBatch drops an entry), and so
// is a second line of a hero's slot and a hero the data doesn't have
const str = (x: unknown): x is string => typeof x === 'string';
const strOrNull = (x: unknown): x is string | null => x === null || typeof x === 'string';
function subsOf(raw: unknown, idx: Index): Subs | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const subs: Subs = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!idx.SUB[k] || !Number.isInteger(v) || (v as number) < 1 || (v as number) > MAX_LIT) return null;
    subs[k] = v as number;
  }
  return Object.keys(subs).length <= MAX_SUBS ? subs : null;
}
function snapOf(raw: unknown, idx: Index): Piece | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!str(r.id) || !str(r.slot) || !SLOT[r.slot as SlotId] || !GRADES.includes(r.grade as Grade)) return null;
  if (!strOrNull(r.setId) || !strOrNull(r.itemKey) || !strOrNull(r.main) || !str(r.at)) return null;
  const lit = subsOf(r.lit, idx), yellow = subsOf(r.yellow, idx);
  if (!lit || !yellow) return null;
  const bt = r.bt === null ? null : Number.isInteger(r.bt) && (r.bt as number) >= 0 && (r.bt as number) <= 4 ? (r.bt as Piece['bt']) : undefined;
  if (bt === undefined) return null;
  return {
    id: r.id, slot: r.slot as SlotId, grade: r.grade as Grade, setId: r.setId, itemKey: r.itemKey, main: r.main,
    ...(r.unlisted === true ? { unlisted: true } : {}), yellow, lit, bt, at: r.at,
  };
}
function lineOfRaw(raw: unknown, idx: Index): Line | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!str(r.id) || !str(r.hero) || !idx.CHAR[r.hero] || !str(r.slot) || !SLOT[r.slot as SlotId] || !str(r.piece)) return null;
  const snap = snapOf(r.snap, idx);
  if (!snap || snap.id !== r.piece || snap.slot !== r.slot) return null;
  if (r.off !== undefined && r.off !== 'lock' && r.off !== 'feed') return null;
  let fed: Fed[] | undefined;
  if (r.fed !== undefined) {
    if (!Array.isArray(r.fed)) return null;
    fed = [];
    for (const f of r.fed as unknown[]) {
      const x = (f ?? {}) as Record<string, unknown>;
      const s = snapOf(x.snap, idx);
      if (!str(x.hero) || !idx.CHAR[x.hero] || !s) return null;
      fed.push({ hero: x.hero, snap: s });
    }
  }
  return {
    id: r.id, hero: r.hero, slot: r.slot as SlotId, piece: r.piece, snap,
    ...(r.off ? { off: r.off as Off } : {}), ...(fed?.length ? { fed } : {}),
  };
}
export function restoreIngame(raw: unknown, idx: Index): Ingame {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return NO_INGAME;
  const items = (raw as { lines?: unknown }).lines;
  const lines: Line[] = [];
  for (const x of Array.isArray(items) ? items : []) {
    const l = lineOfRaw(x, idx);
    if (l && !lines.some((m) => m.hero === l.hero && m.slot === l.slot)) lines.push(l);
  }
  return { v: 1, lines };
}
