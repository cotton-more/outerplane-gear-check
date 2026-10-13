// The trade as a walk with ticks (MODEL.md §7 item 9; .x/0200-boss E2b Q7, owner 2026-10-13): the plan's moves, the
// replacements, parking and the empty slots as lines to do in the game top to bottom. Per hero (the receivers in the plan's
// order, then anyone else who gets a piece), slot by slot: «Замок» on his old piece right before the equip — only when that
// piece stays with him parked (O3, owner 2026-10-13: a piece that moves to someone is found in the game by grade, main and
// stats — the line names it in full, a lock would only be one more step); the equip; a slot kept as it
// was; an empty slot («Ввести» / «Оставить»). Then «В конце — замены»: replacements (kept → parked), parking. The empty
// slots of heroes who only gave are not lines (O4, owner 2026-10-13): the record keeps them empty, the player fills them
// later (evaluation, batch, another team) — «Ввести» is for the re-dressed heroes only. Each line has a key: a tick survives a recount while its line stays the same.
// «Сделал» only when every line is done — ticked, kept as it was, entered or left empty.
import type { SlotId } from '@/game/data/types';
import type { ItemInput } from '@/game/item/item';
import type { Step } from './apply';
import { endsOf, type Ends } from './ends';
import { SLOT_ORDER, slotKey, type World } from './model';
import { advance, movesOf, type Moves, type Source } from './moves';

export type Line =
  | { kind: 'lock'; key: string; hero: string; slot: SlotId; item: string }
  | { kind: 'equip'; key: string; hero: string; slot: SlotId; item: string; from: Source; receiver: boolean }
  | { kind: 'kept'; key: string; hero: string; slot: SlotId }
  | { kind: 'hole'; key: string; hero: string; slot: SlotId; receiver: boolean; breaks: string | null; entered: ItemInput | null; left: boolean }
  | { kind: 'repl'; key: string; hero: string; slot: SlotId; item: string; from: string; kept: boolean }
  | { kind: 'park'; key: string; hero: string; slot: SlotId; item: string; why: 'class' | 'kept' | 'none'; giver: string | null };

export interface Walk { heroes: { hero: string; lines: Line[] }[]; end: Line[] }

// what the player decided in this walk (kept on the device until «Сделал» / «Отмена»): slots kept as they were (frozen),
// replacements kept as they were (kept), empty slots left empty (left), pieces entered for empty slots (entered), ticks
export interface Decisions {
  frozen: readonly string[];                 // slotKey(receiver, slot)
  kept: readonly string[];                   // slotKey(replacement target, slot)
  left: readonly string[];                   // slotKey(hero, slot)
  entered: Readonly<Record<string, ItemInput>>; // slotKey(hero, slot) → the piece
  ticks: readonly string[];                  // line keys
}
export const NO_DECISIONS: Decisions = { frozen: [], kept: [], left: [], entered: {}, ticks: [] };

const srcKey = (s: Source) => (s.kind === 'inventory' ? s.kind : `${s.kind}>${s.hero}`);

// w0 — before the plan; m — the plan's moves (movesOf); ends — endsOf; receivers — in the plan's order; d — decisions
export function walkOf(w0: World, m: Moves, ends: Ends, receivers: readonly string[], d: Decisions): Walk {
  const frozen = new Set(d.frozen), left = new Set(d.left);
  const before = new Map(w0.heroes.map((h) => [h.id, h]));
  const parked = new Set(ends.park.map((p) => p.item));
  const hole = (h: Ends['holes'][number]): Line => {
    const k = slotKey(h.hero, h.slot);
    return { kind: 'hole', key: `h:${k}`, hero: h.hero, slot: h.slot, receiver: h.receiver, breaks: h.breaks, entered: d.entered[k] ?? null, left: left.has(k) };
  };
  const order = [...receivers, ...new Set(m.moves.map((x) => x.hero).filter((id) => !receivers.includes(id)))];
  const heroes = order.map((hero) => {
    const lines: Line[] = [];
    for (const slot of SLOT_ORDER) {
      if (receivers.includes(hero) && frozen.has(slotKey(hero, slot))) { lines.push({ kind: 'kept', key: `k:${slotKey(hero, slot)}`, hero, slot }); continue; }
      const i = m.moves.findIndex((x) => x.hero === hero && x.slot === slot);
      if (i >= 0) {
        const mv = m.moves[i];
        const old = before.get(hero)?.worn[slot];
        if (old && parked.has(old)) lines.push({ kind: 'lock', key: `l:${slotKey(hero, slot)}:${old}`, hero, slot, item: old });
        lines.push({ kind: 'equip', key: `e:${slotKey(hero, slot)}:${mv.item}:${srcKey(mv.from)}`, hero, slot, item: mv.item, from: mv.from, receiver: receivers.includes(hero) });
      }
      const h = ends.holes.find((x) => x.hero === hero && x.slot === slot && x.receiver);
      if (h && i < 0) lines.push(hole(h));
    }
    return { hero, lines };
  }).filter((x) => x.lines.length);
  const end: Line[] = [
    ...ends.repl.map((r): Line => ({ kind: 'repl', key: `r:${slotKey(r.to, r.slot)}:${r.item}`, hero: r.to, slot: r.slot, item: r.item, from: r.from, kept: r.kept })),
    ...ends.park.map((p): Line => ({ kind: 'park', key: `p:${p.item}:${p.hero}`, hero: p.hero, slot: p.slot, item: p.item, why: p.why, giver: p.giver })),
  ];
  return { heroes, end };
}

export const linesOfWalk = (w: Walk): Line[] => [...w.heroes.flatMap((h) => h.lines), ...w.end];
// a line is done: ticked; a slot or a replacement kept as it was; an empty slot entered or left
export function lineDone(l: Line, ticks: ReadonlySet<string>): boolean {
  if (l.kind === 'kept' || (l.kind === 'repl' && l.kept)) return true;
  if (l.kind === 'hole') return !!l.entered || l.left;
  return ticks.has(l.key);
}
// how many lines are still to do — «Сделал · ещё N»; 0 — «Сделал» is on
export const walkLeft = (w: Walk, ticks: ReadonlySet<string>): number => linesOfWalk(w).filter((l) => !lineDone(l, ticks)).length;

// The whole outcome of a plan (one hero's or the team's): the world after the steps (w1) and after the replacements (w2),
// what to wear (moves, without the replacements — they are the end), the end and the walk. Both trade sheets use it
export interface Outcome { steps: readonly Step[]; w1: World; w2: World; moves: Moves; ends: Ends; walk: Walk }
export function outcomeOf(w0: World, steps: readonly Step[], receivers: readonly string[], team: readonly string[], d: Decisions): Outcome {
  const w1 = steps.reduce(advance, w0);
  const moves = movesOf(w0, w1, receivers);
  const { ends, w2 } = endsOf(w0, w1, { receivers, team, kept: new Set(d.kept) });
  return { steps, w1, w2, moves, ends, walk: walkOf(w0, moves, ends, receivers, d) };
}
