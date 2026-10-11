// A hero's total of one stat from what the app knows (MODEL.md, crit soft cap): the hero's own sources, the main lines
// of the pieces, set rows that are on and the substats. Hidden sources (gems, talisman, transcend, EE, team buffs) are
// not here — they only add, so the total is never above the game's. Only CHC for now; EFF reuses the same shape later.
import type { Char, Grade, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import { itemMains } from '@/game/item/mains';
import { MAX_LIT, type Subs } from '@/game/item/subs';
import { bonusRows } from '@/game/set/setBonus';

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

export function statTotal(ctx: Ctx, hero: Char, pieces: readonly StatPiece[], stat: TotalStat): StatTotal {
  const own = hero.chc;
  const base = (own?.base ?? 0) / 10;
  const cls = (own?.cls ?? 0) / 10;
  const quirk = ctx.settings.quirks ? (own?.quirk ?? 0) / 10 : 0;
  let mains = 0, subs = 0;
  const step = ctx.idx.SUB[stat]?.step ?? 0;
  for (const p of pieces) {
    for (const line of itemMains(ctx.idx, p).lines) if (line === stat) mains += mainValue(ctx, p, line);
    subs += Math.min(MAX_LIT, p.lit[stat] ?? 0) * step;
  }
  let sets = 0;
  for (const r of bonusRows(ctx.idx.SET, pieces)) if (r.bon.stat === stat && r.bon.mode === 'add') sets += r.bon.value;
  const c0 = base + cls + quirk + mains + sets;
  return { base, cls, quirk, mains, sets, subs, c0, total: c0 + subs };
}
