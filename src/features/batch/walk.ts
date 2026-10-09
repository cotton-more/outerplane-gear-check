// The step-by-step walk of a batch plan (.x/0140-batch-walk §1, owner 2026-10-08): four stages by game screen, in an
// order where the numbers never drift — worn pieces are shown in the game filter, so equipping and taking off move
// nothing; locking moves nothing; the dismantle is one multi-select; Breakthrough needs no numbers (material is
// interchangeable, worn pieces aren't listed, locked ones can't be picked).
//   1 equip — at the hero: «Caren → шлем → № 7 в списке» (the hero's slot list: the batch's entries of that slot) +
//     substats as the game shows them, to check after a tap. A piece taken off one hero and put on another — after the
//     equip that takes it off.
//   2 lock — what is kept: set aside, reserves, «Спорно → Отложить», a set-aside look-alike («same»).
//   3 dismantle — all at once, by rows of the inventory grid (10 per row).
//   4 Breakthrough — per target: how many from the list, and how many set-aside ones to unlock first.
// Positions come from the batch entries (#n — position in the game list, all kinds). A piece the batch doesn't hold
// (a taken-off piece with no «E» entry, a set-aside record) is named by its description instead of a number.
import type { Char, SlotId } from '@/game/data/types';
import type { Index } from '@/game/data';
import type { Piece } from '@/features/gear/model/gear';
import type { ItemInput } from '@/game/item/item';
import { slotOf, type Batch } from './batch';
import { inputOfPiece, type Fate, type Line, type Plan } from './plan';

export const PER_ROW = 10;                       // the game's inventory grid (owner, 2026-10-08)
export const rowOf = (n: number): { r: number; p: number } => ({ r: Math.ceil(n / PER_ROW), p: ((n - 1) % PER_ROW) + 1 });

// where a piece is: a position in the game list (n), or only a description (piece + its hero — taken off or set aside)
export type Where = { n: number } | { off: Piece; c: Char; was: 'worn' | 'stash' };
// a kept piece of the batch — why it stays (owner 2026-10-08: «Замок: ряд 3, 1-й» alone didn't say what or for whom):
// keep — set aside to wear later, reserve — Breakthrough material, maybe — «Спорно → Отложить» (no hero), same — a
// look-alike of a piece already set aside
export interface Kept { n: number; input: ItemInput; c: Char | null; why: 'keep' | 'reserve' | 'maybe' | 'same' }
export type Step =
  | { key: string; stage: 1; c: Char; slot: SlotId; k: number | null; where: Where; subs: Record<string, number>; input: ItemInput }
  | { key: string; stage: 2; where: Where; kept: Kept | null }
  | { key: string; stage: 3; where: Where[]; inputs: (ItemInput | null)[] } // one step: the game's dismantle is one multi-select; inputs — each piece, to check (owner 2026-10-09)
  // piece — the target's own record (its name in the step), mats — the planned feed, each to check (owner 2026-10-09:
  // a Legendary item takes only copies of itself — «#9, #45 Noblewoman's Guile» says why «до 2»)
  | { key: string; stage: 4; target: { worn: Char; slot: SlotId } | { where: Where; kept: Kept | null }; piece: ItemInput | null; n: number; unlock: number;
      mats: { where: Where; input: ItemInput }[] };
export interface Walk {
  steps: Step[];       // in walk order: stage 1…4
  undecided: number;   // «Спорно» lines without a choice — the walk waits for them
}

// substats as the game's middle panel shows them: «LV 3 Crit Chance +9.0%», «LV 2 Attack +80»
export function gameSubs(idx: Index, subs: Record<string, number>): string[] {
  return Object.entries(subs).map(([k, n]) => {
    const s = idx.SUB[k];
    const v = s ? s.step * n : 0;
    return `LV ${n} ${idx.D.statNames[k] ?? k} +${s?.pct ? v.toFixed(1) + '%' : Math.round(v)}`;
  });
}

export function walkOf(batch: Batch, plan: Plan): Walk {
  const items = batch.items;
  // position of a piece the plan names: an entry line → its #n; a taken-off piece → the «E» entry of its hero and slot
  const wornAt = (c: Char, slot: SlotId): number | null => {
    const i = items.findIndex((e) => e.kind === 'worn' && e.c === c.id && e.slot === slot);
    return i < 0 ? null : i + 1;
  };
  const whereOf = (l: Line): Where => {
    if (!l.off) return { n: l.n };
    const at = l.off.was === 'worn' ? wornAt(l.off.c, l.off.piece.slot) : null;
    return at ? { n: at } : { off: l.off.piece, c: l.off.c, was: l.off.was };
  };
  // the hero's slot list: the batch's entries of that slot, in order
  const slotPos = (n: number): number => items.slice(0, n).filter((e) => slotOf(e) === slotOf(items[n - 1])).length;

  const fateOf = (l: Line): Fate | { kind: 'lock' } => {
    if (l.fate.kind !== 'maybe') return l.fate;
    const c = batch.choice[l.id];
    return c === 'keep' ? { kind: 'lock' } : c === 'junk' ? { kind: 'junk' } : l.fate;
  };
  const undecided = plan.lines.filter((l) => l.fate.kind === 'maybe' && !batch.choice[l.id]).length;

  const equip: Extract<Step, { stage: 1 }>[] = [];
  const lock: Extract<Step, { stage: 2 }>[] = [];
  const junk: { where: Where; input: ItemInput | null }[] = [];
  const feeds = new Map<string, Omit<Extract<Step, { stage: 4 }>, 'key' | 'stage'>>();
  const lineOf = (n: number) => plan.lines.find((l) => l.n === n && !l.off);
  // why an entry line's piece stays; a taken-off piece has its description instead (no number)
  const keptOf = (l: Line | undefined, f: Fate | { kind: 'lock' } | undefined): Kept | null => {
    if (!l || l.off || !f) return null;
    switch (f.kind) {
      case 'keep': return { n: l.n, input: l.input, c: f.c, why: 'keep' };
      case 'reserve': return { n: l.n, input: l.input, c: f.c, why: 'reserve' };
      case 'same': return { n: l.n, input: l.input, c: f.same.c, why: 'same' };
      case 'lock': return { n: l.n, input: l.input, c: null, why: 'maybe' };
      default: return null;
    }
  };

  for (const l of plan.lines) {
    const f = fateOf(l);
    const where = whereOf(l);
    switch (f.kind) {
      case 'wear': {
        const k = 'n' in where && items[where.n - 1] ? slotPos(where.n) : null;
        equip.push({ key: `eq:${l.id}`, stage: 1, c: f.c, slot: l.input.slot, k, where, subs: l.input.subs, input: l.input });
        break;
      }
      case 'keep': case 'reserve': case 'same': case 'lock':
        // a taken-off piece its hero's pool still holds stays where it is — a lock keeps it out of the dismantle
        lock.push({ key: `lk:${l.id}`, stage: 2, where, kept: keptOf(l, f) });
        break;
      case 'junk':
        junk.push({ where, input: l.input }); // a taken-off piece's line carries its record as input too
        break;
      case 'feed': {
        const to = f.to;
        const tk = 'entry' in to ? `e${to.entry}` : `p${to.piece.id}`;
        let x = feeds.get(tk);
        if (!x) {
          const target: Extract<Step, { stage: 4 }>['target'] = 'entry' in to
            ? (() => {
              const t = lineOf(to.entry);
              return t && t.fate.kind === 'wear' ? { worn: t.fate.c, slot: t.input.slot } : { where: { n: to.entry }, kept: t ? keptOf(t, fateOf(t)) : null };
            })()
            : { worn: to.c, slot: to.piece.slot };
          const piece = 'entry' in to ? lineOf(to.entry)?.input ?? null : inputOfPiece(to.piece);
          feeds.set(tk, (x = { target, piece, n: 0, unlock: 0, mats: [] }));
        }
        x.n++;
        x.mats.push({ where, input: l.input });
        if (l.off?.was === 'stash') x.unlock++;
        break;
      }
      default: break; // «нет в данных» — not touched
    }
  }
  // stage 1: a piece taken off one hero and worn by another — after the equip that takes it off; then by hero, as met
  const takesOff = (s: Extract<Step, { stage: 1 }>) => plan.lines.find((l) => l.off && `eq:${l.id}` === s.key);
  const first = equip.filter((s) => !takesOff(s)), second = equip.filter((s) => takesOff(s));
  const heroes = [...new Set(first.map((s) => s.c.id))];
  first.sort((a, z) => heroes.indexOf(a.c.id) - heroes.indexOf(z.c.id));
  const bt: Extract<Step, { stage: 4 }>[] = [...feeds].map(([k, x]) => ({ key: `bt:${k}`, stage: 4, ...x }));
  // dismantle: by position, rows of the grid top down; pieces with no number after them
  junk.sort((a, z) => ('n' in a.where ? a.where.n : Infinity) - ('n' in z.where ? z.where.n : Infinity));
  const dz: Extract<Step, { stage: 3 }>[] = junk.length ? [{ key: 'dz', stage: 3, where: junk.map((x) => x.where), inputs: junk.map((x) => x.input) }] : [];
  return { steps: [...first, ...second, ...lock, ...dz, ...bt], undecided };
}
