// Who moves first — the team or the boss (.x/0200-boss E1; rules: data/turn/TURN.md, from outerpedia's Stats guide, tested
// in game by the community — the client sample has no turn code). The turn gauge: at battle start a unit stands at
// SPD × 100 / the top SPD of the fight (the boss included) plus a hidden random head start of 0…5 points; it fills in
// proportion to SPD and the unit acts at 100 (several at 100 or above — the higher gauge first). So a hero surely moves
// before the boss only when even his worst start (0) beats the boss's best (5) — above ≈ boss × 1.053; surely after when
// his best loses to the boss's worst; between — luck, its chance counted over both head starts (uniform, independent).
// Only the first turn (owner 2026-10-13): after it, skills, buffs and pushes decide.
export const JITTER = 5;
const GRID = 100; // midpoints per head start for the chance — exact to well under 1 %

export type TurnState = 'first' | 'luck' | 'after';
// p — the chance to move before the boss, 0…1; need — the SPD that surely moves first (0 — already does)
export interface Turn { state: TurnState; p: number; need: number }

// when a unit acts: its gauge at the start reaching 100 — at once, the higher gauge first; else after (100 − g)/SPD
const when = (spd: number, top: number, r: number): number => {
  const g = (spd * 100) / top + r;
  return g >= 100 ? -(g - 100) - 1 : (100 - g) / spd;
};

function chance(hero: number, boss: number, top: number): number {
  let n = 0;
  for (let i = 0; i < GRID; i++) {
    const h = when(hero, top, ((i + 0.5) * JITTER) / GRID);
    for (let j = 0; j < GRID; j++) {
      const b = when(boss, top, ((j + 0.5) * JITTER) / GRID);
      n += h < b ? 1 : h === b ? 0.5 : 0;
    }
  }
  return n / (GRID * GRID);
}

const surelyFirst = (hero: number, boss: number, top: number) => when(hero, top, 0) < when(boss, top, JITTER);
const surelyAfter = (hero: number, boss: number, top: number) => when(hero, top, JITTER) > when(boss, top, 0);

// the hero's first turn against the boss; others — the rest of the fight's SPD (the team), for the top SPD
export function turnOf(hero: number, boss: number, others: readonly number[]): Turn {
  const topOf = (s: number) => Math.max(s, boss, ...others);
  const top = topOf(hero);
  const state: TurnState = surelyFirst(hero, boss, top) ? 'first' : surelyAfter(hero, boss, top) ? 'after' : 'luck';
  let need = 0;
  if (state !== 'first') {
    need = hero + 1;
    while (!surelyFirst(need, boss, topOf(need))) need++;
  }
  return { state, p: state === 'first' ? 1 : state === 'after' ? 0 : chance(hero, boss, top), need };
}

// the SPD that surely moves before a boss of this SPD (the team's top SPD doesn't change it — turnOf)
export const firstAt = (boss: number): number => turnOf(0, boss, []).need;
// some chance to move first at this SPD (E4 Q5: none even with the fastest kit — no SPD goal)
export const anyChance = (spd: number, boss: number): boolean => turnOf(spd, boss, []).state !== 'after';
