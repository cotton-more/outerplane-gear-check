// The turn timeline of «Ход против босса» (.x/0200-boss E1) and why a member should move first (E4). The turn math itself —
// game/stat/turn (the trade's SPD goal counts the same chance).
import type { Char, TurnReason } from '@/game/data/types';
import { turnOf, type Turn } from '@/game/stat/turn';

export { JITTER, turnOf, firstAt, anyChance, luckPct, type Turn, type TurnState } from '@/game/stat/turn';

// the timeline: heroes by SPD (higher first), the boss after everyone whose chance to move first is at least ½
export interface TurnRow<H> { hero: H; spd: number; turn: Turn }
export function timeline<H>(heroes: readonly { hero: H; spd: number }[], boss: number): { before: TurnRow<H>[]; after: TurnRow<H>[] } {
  const spds = heroes.map((h) => h.spd);
  const rows = heroes.map((h, i) => ({ ...h, turn: turnOf(h.spd, boss, spds.filter((_, j) => j !== i)) }))
    .sort((a, z) => z.spd - a.spd);
  return { before: rows.filter((r) => r.turn.p >= 0.5), after: rows.filter((r) => r.turn.p < 0.5) };
}

// Why the hero should move before the boss (.x/0200-boss E4 Q1): the hero's turn-1 reasons (Char.turn — a skill ready on
// turn 1 that acts on the boss's first move or shields the team) that work on this boss — a row the boss is immune to at the
// stage (imm, factsAt) goes. None — no SPD goal: SPD stays a plain chain stat
export const reasonsAt = (c: Pick<Char, 'turn'>, imm: readonly string[]): TurnReason[] =>
  (c.turn ?? []).filter((r) => !r.fx || !imm.includes(r.fx));
