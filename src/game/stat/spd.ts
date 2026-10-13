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

// SPD the transcend passives add in battle (.x/0200-boss E4 Q6; outerpedia's priority formula: «Ally Speed transcend bonus»,
// Dianne + Mene + Demiurge Delta = 30, so the rows add up): every member's team row at that member's ★ (the hero's own
// included) and the hero's self-only row. The stat screen doesn't show it; the turn order counts it
export interface SpdMate { c: Pick<Char, 'id' | 'spdUp'>; star: number }
const upAt = (m: SpdMate) => m.c.spdUp?.t[m.star - 1] ?? 0;
export function spdBonus(c: Pick<Char, 'id' | 'spdUp'>, star: number, mates: readonly SpdMate[]): number {
  const team = mates.filter((m, i) => m.c.spdUp?.tm && mates.findIndex((x) => x.c.id === m.c.id) === i && m.c.id !== c.id)
    .reduce((s, m) => s + upAt(m), 0);
  return team + upAt({ c, star });
}

// The most SPD a kit from `pieces` could give the hero (E4 Q5: no chance to move first even then — no SPD goal). Per slot the
// piece with the most SPD (substats and an SPD main); the Speed Set's rows (% of the base) may beat that, so for every set
// with SPD rows each armor slot also tries its best piece of that set, T4 and not — 3⁴ armor kits per set
export function spdReach(ctx: Ctx, c: Char, pieces: readonly StatPiece[]): number {
  const one = (p: StatPiece) => spdOf(ctx, c, [p])?.gear ?? 0;
  const top = (xs: readonly StatPiece[]) => xs.reduce<StatPiece | null>((b, p) => (!b || one(p) > one(b) ? p : b), null);
  const bySlot = new Map<string, StatPiece[]>();
  for (const p of pieces) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  const gear = ['weapon', 'accessory'].flatMap((s) => top(bySlot.get(s) ?? []) ?? []);
  const armor = ['helmet', 'armor', 'gloves', 'shoes'].map((s) => bySlot.get(s) ?? []);
  const rated = Object.keys(ctx.idx.SET).filter((id) =>
    bonusRows(ctx.idx.SET, [0, 1, 2, 3].map(() => ({ setId: id, bt: 4 }))).some((r) => r.bon.stat === KEY && r.bon.mode === 'rate'));
  let best = spdOf(ctx, c, [...gear, ...armor.flatMap((xs) => top(xs) ?? [])])?.total ?? 0;
  for (const set of rated) {
    const opts = armor.map((xs) => [top(xs), top(xs.filter((p) => p.setId === set && p.bt === 4)), top(xs.filter((p) => p.setId === set && p.bt !== 4))]
      .filter((p, i, a): p is StatPiece => !!p && a.indexOf(p) === i));
    const walk = (i: number, kit: StatPiece[]) => {
      if (i === armor.length) { best = Math.max(best, spdOf(ctx, c, [...gear, ...kit])?.total ?? 0); return; }
      if (!opts[i].length) { walk(i + 1, kit); return; }
      for (const p of opts[i]) walk(i + 1, [...kit, p]);
    };
    walk(0, []);
  }
  return best;
}
