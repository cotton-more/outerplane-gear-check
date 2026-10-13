// A hero's SPD from what the app knows (.x/0200-boss E1, owner: the app's count only, no typed value), the game's
// CalcFinalStat like EFF (game/stat/eff): SPD = ⌊B · (1000 + gear rate)/1000⌋ + gear flat. B — the hero's base SPD (level
// by `lv120Of`, quirks by the setting — the same base the Speed Set's rows are counted on, game/set/setBonus spdBase);
// gear rate ‰ — the Speed Set rows (% of B, the T4 rule of bonusRows); gear flat — SPD substats (3 a segment, ≤ 6 segments)
// and an accessory's SPD main at +10 by tier. Invisible: allies' transcend speed bonus, the EE, talisman, buffs in battle —
// so this is a lower bound. One function for «Команда» (the turn timeline); no second SPD total.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { itemMains } from '@/game/item/mains';
import { MAX_LIT } from '@/game/item/subs';
import { bonusRows, spdBase } from '@/game/set/setBonus';
import { mainRaw, type StatPiece } from './total';

const KEY = 'SPD'; // the substat, the main line and the set rows

// base — B; gear — what the pieces add; total — the game's number without what the app can't see
export interface Spd { base: number; gear: number; total: number }

// null — data without the hero's SPD base (old snapshots)
export function spdOf(ctx: Ctx, c: Char, pieces: readonly StatPiece[]): Spd | null {
  const base = spdBase(ctx, c);
  if (!base) return null;
  let segs = 0, flat = 0;
  for (const p of pieces) {
    segs += Math.min(MAX_LIT, p.lit[KEY] ?? 0);
    for (const line of itemMains(ctx.idx, p).lines) if (line === KEY) flat += mainRaw(ctx, p, line);
  }
  const rate = bonusRows(ctx.idx.SET, pieces).reduce((n, r) => n + (r.bon.stat === KEY && r.bon.mode === 'rate' ? r.bon.value * 10 : 0), 0);
  const total = Math.floor((base * (1000 + rate)) / 1000) + Math.round(segs * (ctx.idx.SUB[KEY]?.step ?? 0)) + flat;
  return { base, gear: total - base, total };
}
