// A hero's total of one stat from what the app knows (MODEL.md §12 item 3): the hero's own sources, the main lines
// of the pieces, set rows that are on and the substats. Transcend is here for the heroes whose stars give crit and whose ★ is
// set (`Ctx.stars`). Hidden sources (gems, talisman, EE, team buffs) are not here — they only add, so the total is never
// above the game's. Only CHC for now; EFF reuses the same shape later.
import type { Char, Grade, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import { itemMains } from '@/game/item/mains';
import { MAX_LIT, type Subs } from '@/game/item/subs';
import { bonusRows, type BonusRow } from '@/game/set/setBonus';

export type TotalStat = 'CHC';

// what a piece brings to the total: its main lines (at +10 by tier) and substats; set rows by set and tier
export interface StatPiece {
  slot: SlotId;
  grade: Grade;
  setId: string | null;
  itemKey: string | null;
  main: string | null;
  lit: Subs;
  bt: Bt | null;
}

// all in % of the stat. c0 — the part that carries no points (everything but substats); total = c0 + subs
export interface StatTotal {
  base: number;
  cls: number;
  quirk: number;
  trans: number;
  mains: number;
  sets: number;
  subs: number;
  c0: number;
  total: number;
}

// main line value at +10 in % (mainValues are ‰); bt not marked counts as T0 — the total stays ≤ the game's
export function mainValue(ctx: Ctx, p: Pick<StatPiece, 'slot' | 'grade' | 'bt'>, line: string): number {
  const row = ctx.idx.D.mainValues?.[p.slot]?.[p.grade]?.[line];
  return row ? (row[p.bt ?? 0] ?? row[0]) / 10 : 0;
}

// the hero's own part, %: base, class passive, awakening quirks (only with the `quirks` setting), transcend passive at the
// hero's ★ (not set — 0)
export function ownStat(ctx: Ctx, hero: Char, _stat: TotalStat): Pick<StatTotal, 'base' | 'cls' | 'quirk' | 'trans'> {
  const own = hero.chc;
  const star = ctx.stars[hero.id];
  return {
    base: (own?.base ?? 0) / 10, cls: (own?.cls ?? 0) / 10, quirk: ctx.settings.quirks ? (own?.quirk ?? 0) / 10 : 0,
    trans: star ? (own?.trans?.[star - 1] ?? 0) / 10 : 0,
  };
}

// the stat a piece's main lines give at +10 by its tier, %
export const mainsStat = (ctx: Ctx, p: Pick<StatPiece, 'slot' | 'grade' | 'setId' | 'itemKey' | 'main' | 'bt'>, stat: TotalStat): number =>
  itemMains(ctx.idx, p).lines.reduce((n, line) => n + (line === stat ? mainValue(ctx, p, line) : 0), 0);

// the stat set rows that are on give (bonusRows rule), %
export const rowsStat = (rows: readonly BonusRow[], stat: TotalStat): number =>
  rows.reduce((n, r) => n + (r.bon.stat === stat && r.bon.mode === 'add' ? r.bon.value : 0), 0);

export function statTotal(ctx: Ctx, hero: Char, pieces: readonly StatPiece[], stat: TotalStat): StatTotal {
  const { base, cls, quirk, trans } = ownStat(ctx, hero, stat);
  let mains = 0, subs = 0;
  const step = ctx.idx.SUB[stat]?.step ?? 0;
  for (const p of pieces) {
    mains += mainsStat(ctx, p, stat);
    subs += Math.min(MAX_LIT, p.lit[stat] ?? 0) * step;
  }
  const sets = rowsStat(bonusRows(ctx.idx.SET, pieces), stat);
  const c0 = base + cls + quirk + trans + mains + sets;
  return { base, cls, quirk, trans, mains, sets, subs, c0, total: c0 + subs };
}
