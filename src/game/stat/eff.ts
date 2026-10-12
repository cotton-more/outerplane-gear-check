// A hero's EFF from what the app knows (.x/0200-boss RESEARCH §1.2, the game's CalcFinalStat):
//   EFF = ⌊(⌊W · (1000 + gear rate)/1000⌋ + gear flat + own flat) · (1000 + premium)/1000⌋
// W — white EFF (subclass and level: `lv120`); gear rate ‰ — EFF% substats (2.5 % a segment) and Effectiveness set rows,
// both of W only; gear flat — the main lines (every glove's EFF, an accessory's EFF main) at +10 by tier; own flat — the
// Ranger quirk node (+50, by `quirks`) and a transcend flat; premium ‰ — what the app knows multiplies everything: the
// transcend passive at the hero's ★ and a permanent passive (Core Fusion Notia). Invisible: the EE, talisman, gems, buffs
// in battle — so this is a lower bound; the player's typed stat-screen value calibrates it (effShown).
// One function for the card, the sheet and «Команда» (later — the model): no second EFF total.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { itemMains } from '@/game/item/mains';
import { MAX_LIT } from '@/game/item/subs';
import { bonusRows } from '@/game/set/setBonus';
import { heroStar } from '@/game/hero/star';
import { lv120Of } from '@/game/hero/level';
import { mainRaw, type StatPiece } from './total';

// hero — W and the own flat; gear — what the pieces add before the premium (rate on W, then flats); base = hero + gear;
// total — the game's number with the premium the app knows
export interface Eff { w: number; rate: number; flat: number; own: number; premium: number; hero: number; gear: number; base: number; total: number }

const SUB = 'EFF'; // the substat EFF% and the set rows (% of W)
const MAIN = 'EFF'; // the main line: flat EFF

// null — data without the hero's EFF (old snapshots)
export function effOf(ctx: Ctx, c: Char, pieces: readonly StatPiece[]): Eff | null {
  const e = c.eff;
  if (!e) return null;
  const w = e.w[lv120Of(ctx, c) ? 1 : 0];
  const star = heroStar(c, ctx.stars[c.id]);
  const own = (ctx.settings.quirks ? e.r ?? 0 : 0) + (e.t?.f?.[star - 1] ?? 0);
  const premium = (e.p ?? 0) + (e.t?.r?.[star - 1] ?? 0);
  let segs = 0, flat = 0;
  for (const p of pieces) {
    segs += Math.min(MAX_LIT, p.lit[SUB] ?? 0);
    for (const line of itemMains(ctx.idx, p).lines) if (line === MAIN) flat += mainRaw(ctx, p, line);
  }
  const step = ctx.idx.SUB[SUB]?.step ?? 0;
  const sets = bonusRows(ctx.idx.SET, pieces).reduce((n, r) => n + (r.bon.stat === SUB && r.bon.mode === 'add' ? r.bon.value : 0), 0);
  const rate = Math.round((segs * step + sets) * 10);
  const hero = w + own;
  const gear = Math.floor((w * (1000 + rate)) / 1000) - w + flat;
  const base = hero + gear;
  return { w, rate, flat, own, premium, hero, gear, base, total: Math.floor((base * (1000 + premium)) / 1000) };
}

// The player's stat-screen EFF (Q3): typed — the number, at — the app's total when it was typed. Shown = total × typed / at,
// so it follows gear the app moves; approx («≈») — nothing typed, or the total changed since (gear changed: worth a look in
// the game). x — the multiplier over the app's base (hero + gear) the shown number carries: the premium the app knows and
// the typed factor; 1 — none
export interface EffCal { typed: number; at: number }
export interface EffShown { v: number; approx: boolean; x: number }
export function effShown(e: Pick<Eff, 'base' | 'total'>, cal?: EffCal | null): EffShown {
  const v = cal && cal.at > 0 ? Math.round((e.total * cal.typed) / cal.at) : e.total;
  return { v, approx: !cal || cal.at !== e.total, x: e.base > 0 ? v / e.base : 1 };
}

// Landing a resist-checked debuff (RESEARCH §1.1, CheckResist): EFF above RES — never resisted; else d = max(1, RES − EFF)
// and the boss resists with (⌊1000/(1 + 100/d)⌋ + 1)/1001 — float32 in the game, so each step is rounded (d = 60: 375, not 374).
// The chance it lands, 0…1 (the skill's own chance is separate)
export function landChance(eff: number, res: number): number {
  if (eff > res) return 1;
  const d = Math.max(1, res - eff);
  return 1 - (Math.floor(Math.fround(1000 / Math.fround(1 + Math.fround(100 / d)))) + 1) / 1001;
}

// EFF in battle against a boss (.x/0200-boss review C+D, owner F1 and F4): what the stat screen doesn't show but is live
// when a skill's debuffs roll the resist — added to the premium sum, so it adds that many ‰ of the base (hero + gear):
// - the element quirk node (with `quirks`): Light and Dark +5 % on every skill; Earth, Water, Fire +7 % when the hero's
//   element beats the boss's (water → fire → earth → water) — read as +5 % for Light/Dark until the game says otherwise;
// - a teammate's transcend EFF that reaches the team (`Char.eff.tm`), only the strongest one (stacking unknown) and only
//   above the hero's own team row, which their own stat screen already shows.
// Talisman and gems stay out (unknowable).
const BEATS: Readonly<Record<string, string>> = { water: 'fire', fire: 'earth', earth: 'water' };
export interface Mate { c: Char; star: number }
const teamRow = (m: Mate): number => (m.c.eff?.tm ? m.c.eff.t?.r?.[m.star - 1] ?? 0 : 0);
export function battleBonus(c: Char, star: number, quirks: boolean, bossElement: string | null, mates: readonly Mate[]): number {
  const quirk = !quirks ? 0 : c.element === 'light' || c.element === 'dark' ? 50 : bossElement && BEATS[c.element] === bossElement ? 70 : 0;
  const own = teamRow({ c, star });
  const team = Math.max(0, ...mates.filter((m) => m.c.id !== c.id).map(teamRow)) - own;
  return quirk + Math.max(0, team);
}
// the shown number in battle: + bonus ‰ of the base
export const inBattle = (e: Pick<Eff, 'base'>, shown: number, bonus: number): number => shown + Math.floor((e.base * bonus) / 1000);

