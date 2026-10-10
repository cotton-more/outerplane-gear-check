// The step-by-step walk of a batch plan (.x/0140-batch-walk §1, owner 2026-10-08): four stages by game screen, in an
// order where the numbers never drift — worn pieces are shown in the game filter, so equipping and taking off move
// nothing; locking moves nothing; Breakthrough needs no numbers (material is interchangeable, worn pieces aren't
// listed, locked ones can't be picked); the dismantle comes last, so nothing meant for a Breakthrough is dismantled by
// mistake (owner 2026-10-09).
//   1 equip — at the hero: «Caren → шлем», on the right the quiet hint «№ 7» (the place in the hero's slot list: the
//     batch's entries of that slot) + substats as the
//     game shows them, to check after a tap. A piece taken off one hero and put on another — after the equip that takes it
//     off.
//   2 lock — what is kept: set aside, reserves, «Спорно → Отложить», a set-aside look-alike («same»).
//   3 Breakthrough — per target: how many from the list, and how many set-aside ones to unlock first. No positions: the
//     feed has eaten pieces before, so the list has moved — the target and every piece are named by stats («several
//     identical — take the first», owner 2026-10-09). A target that isn't worn is named as a set-aside piece of its hero.
//   4 dismantle — what is left, all at once, each piece by name and substats; set-aside ones are locked — unlock first.
// Positions (#n — position in the game list, all kinds) are used by the equip and the lock only, while nothing has
// moved yet. A piece the batch doesn't hold (a taken-off piece with no «E» entry, a set-aside record) is named by its
// description instead of a number.
import type { Char, SlotId } from '@/game/data/types';
import type { Index } from '@/game/data';
import type { Piece } from '@/features/gear/model/gear';
import type { ItemInput } from '@/game/item/item';
import { slotOf, type Batch } from './batch';
import { inputOfPiece, wornAtEnd, type Fate, type Line, type Plan, type Target } from './plan';

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
  // one step: the game's dismantle is one multi-select; inputs — each piece, to check (owner 2026-10-09); unlock — how
  // many of them are set-aside records (locked in the game: unlock them first); left — a Breakthrough step comes before,
  // so the feed it didn't take is dismantled here too
  | { key: string; stage: 4; where: Where[]; inputs: ItemInput[]; unlock: number; left: boolean }
  // target — the worn piece of a hero, or a piece named by its description (set aside — a piece the plan keeps for a hero,
  // of this batch or recorded); piece — the target's own record (its name in the step), mats — the planned feed, each to
  // check (owner 2026-10-09: a Legendary item takes only copies of itself)
  | { key: string; stage: 3; target: { worn: Char; slot: SlotId } | { where: Exclude<Where, { n: number }> }; piece: ItemInput | null; n: number; unlock: number;
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
  const junk: { where: Where; input: ItemInput }[] = [];
  let unlockJunk = 0;                              // set-aside records among them: locked in the game, the dismantle skips them
  const feeds = new Map<string, Omit<Extract<Step, { stage: 3 }>, 'key' | 'stage'>>();
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

  // the Breakthrough target. A worn piece — «hero's slot»; one that is not worn (the hero wears another in the game) —
  // named as a set-aside piece of the hero, by its stats, like a record taken off; so for a piece of this batch (the
  // record the plan makes isn't in the store yet — described from the entry) and for a recorded piece (plan.st.worn)
  type Target3 = Extract<Step, { stage: 3 }>['target'];
  const targetOf = (to: Target): Target3 | null => {
    if (!('entry' in to)) {
      return wornAtEnd(plan.st, to) ? { worn: to.c, slot: to.piece.slot } : { where: { off: to.piece, c: to.c, was: 'stash' } };
    }
    const t = lineOf(to.entry);
    if (t?.fate.kind === 'wear') return { worn: t.fate.c, slot: t.input.slot };
    const f = t && fateOf(t), c = f && (f.kind === 'keep' || f.kind === 'reserve' ? f.c : null);
    // a plan feeds only a worn or kept piece of the batch (the checker's B5), so a target with no hero doesn't happen
    if (!t || !c) return null;
    const x = t.input;
    return { where: { off: { id: `batch:${t.n}`, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main, unlisted: x.unlisted,
      yellow: {}, lit: x.subs, bt: x.bt ?? null, at: '' }, c, was: 'stash' } };
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
        if (l.off?.was === 'stash') unlockJunk++;
        break;
      case 'feed': {
        const to = f.to;
        const tk = 'entry' in to ? `e${to.entry}` : `p${to.piece.id}`;
        let x = feeds.get(tk);
        if (!x) {
          const target = targetOf(to);
          if (!target) break; // not reachable (see targetOf): nothing to tell the player, so no step
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
  const bt: Extract<Step, { stage: 3 }>[] = [...feeds].map(([k, x]) => ({ key: `bt:${k}`, stage: 3, ...x }));
  // dismantle: in the order of the batch; pieces with no number after them
  junk.sort((a, z) => ('n' in a.where ? a.where.n : Infinity) - ('n' in z.where ? z.where.n : Infinity));
  const dz: Extract<Step, { stage: 4 }>[] = junk.length
    ? [{ key: 'dz', stage: 4, where: junk.map((x) => x.where), inputs: junk.map((x) => x.input), unlock: unlockJunk, left: bt.length > 0 }] : [];
  return { steps: [...first, ...second, ...lock, ...bt, ...dz], undecided };
}
