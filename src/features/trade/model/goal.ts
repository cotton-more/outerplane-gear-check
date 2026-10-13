// The EFF goal of a debuffer in the boss team trade (.x/0200-boss E3; MODEL.md §13): a soft term inside V, like the crit
// loss (MODEL.md §12 item 6). The member's battle EFF against the boss — the app's count × the typed ratio + what battle adds
// at the spot's ★ (owner Q2, as «Ход против босса») — is held against the target RES + 1 (Q1, the debuff always lands):
// - below it each missing EFF% segment costs λ = 1 point (Q3), so the search reaches for EFF while it costs few stats;
// - above it EFF is worth nothing (Q3a): the EFF% segments and EFF set rows that carry points are laid from the EFF that
//   carries none (the hero, the main lines, rows covered by a half) heaviest first, and what lies above the target loses its
//   points — a sharp step, no knee (the chance is 100 % at RES + 1).
// The goal's EFF is linear in the segments (no floors): v = mult × (W × (1000 + rate)/1000 + own + flat), so an extra segment
// always moves it by the same amount and the Pareto dominance of the kit search stays exact; the shortfall is a sum of whole
// thousandths per piece and per set, so the search can split it by slot exactly; the plan prints the game's number (effOf
// with its floors), a point or two away at most.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { subWeightOn } from '@/game/build/points';
import type { Profile } from '@/game/build/profile';
import { MAX_LIT } from '@/game/item/subs';
import { bonusRows } from '@/game/set/setBonus';
import { setValue } from '@/game/set/setValue';
import { effOf, effShown, inBattle, type EffCal } from '@/game/stat/eff';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { piecePoints } from '@/features/gear/layout';
import { milli, type Milli } from '@/features/gear/model/vs';

const SUB = 'EFF';
export const LAMBDA = 1; // points per missing EFF% segment (owner Q3)

// the goal of one member: the target battle EFF (RES + 1), the spot's ★ and the battle bonus ‰ (game/stat/eff battleBonus)
export interface EffGoal { t: number; star: number; bonus: number }

// a piece's EFF facts for the kit search: EFF weight on the piece (place weight × credit), EFF% segments, flat EFF from
// its main lines, its points without the EFF segments
export interface GoalFacts { w: number; n: number; flat: number; non: Milli }

export interface GoalGauge {
  t: number;
  approx: boolean;                         // no stat-screen EFF typed — the plan says «≈»
  eff(itemIds: readonly string[]): number; // the kit's battle EFF as the game counts it (floors) — the plan's number
  lin(itemIds: readonly string[]): number; // the goal's EFF of the kit (linear, no floors) — what the term holds against t
  seg: number;                             // one EFF% segment, in battle EFF
  // The shortfall in whole thousandths, summed from parts so that the kit search can split it by slot (kit.ts): a — the
  // penalty of the empty kit, b(id) — what a piece takes off it (its EFF% segments and flat EFF), r — what a set's rows on n
  // pieces (n4 at T4) take off, rMax — the most any kit's rows take off. The kit's shortfall = a − Σ b − Σ r (≤ 0 — the target
  // is reached)
  a: Milli;
  b(itemId: string): Milli;
  r(set: string, n: number, n4: number): Milli;
  rMax: Milli;
  loss(itemIds: readonly string[]): Milli; // the goal's term: the shortfall's penalty + the points of EFF above the target
  facts(itemId: string): GoalFacts;
}

interface Band { w: number; n: number } // n segments of one weight

export function goalGauge(ctx: Ctx, c: Char, Pv: Profile, Po: Profile, cal: EffCal | null, goal: EffGoal,
  pieceOf: (id: string) => Piece | undefined): GoalGauge | null {
  if (!c.eff) return null;
  const cx: Ctx = { ...ctx, stars: { ...ctx.stars, [c.id]: goal.star } };
  const e0 = effOf(cx, c, []);
  if (!e0) return null;
  const step = ctx.idx.SUB[SUB]?.step ?? 2.5;
  const x = cal && cal.at > 0 ? cal.typed / cal.at : 1;
  // battle EFF of one unit of `base` (hero + gear before the premium): the premium and the typed ratio on the shown number,
  // plus the battle bonus ‰ of the base (inBattle)
  const mult = ((1000 + e0.premium) / 1000) * x + goal.bonus / 1000;
  const seg = (mult * e0.w * step * 10) / 1000; // one EFF% segment, in battle EFF
  const of = (ids: readonly string[]) => ids.map(pieceOf).filter((p): p is Piece => !!p);
  const facts = new Map<string, GoalFacts>();
  const losses = new Map<string, Milli>();
  const factsOf = (p: Piece): GoalFacts => {
    let f = facts.get(p.id);
    if (!f) {
      const n = Math.min(MAX_LIT, p.lit[SUB] ?? 0);
      const w = n ? subWeightOn(Pv.ctx, Pv.c, Pv.chain, pieceInput(p), SUB) : 0;
      const pts = piecePoints(Pv, p);
      facts.set(p.id, (f = { w, n, flat: effOf(cx, c, [p])!.flat, non: milli(pts - w * n) }));
    }
    return f;
  };
  // the set rows that carry points (a stat set, not covered by a half — MODEL.md §2): bands of their own weight; the rest of
  // the rows is EFF that carries none
  const rowBands = (pieces: readonly Piece[]): Band[] => {
    const cnt = new Map<string, [number, number]>();
    for (const p of pieces) {
      if (!p.setId) continue;
      const [n, n4] = cnt.get(p.setId) ?? [0, 0];
      cnt.set(p.setId, [n + 1, n4 + (p.bt === 4 ? 1 : 0)]);
    }
    const out: Band[] = [];
    for (const [set, [n, n4]] of cnt) {
      if (n < 2) continue;
      const sv = setValue(Po, set, n, n4);
      const rows = bonusRows(ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
      rows.forEach((row, i) => {
        if (row.bon.stat !== SUB || row.bon.mode !== 'add') return;
        const pts = sv.rows[i]?.pts ?? 0, k = row.bon.value / step;
        if (!sv.effect && !sv.rows[i]?.covered && pts > 0 && k > 0) out.push({ w: pts / k, n: k });
      });
    }
    return out;
  };
  // the most EFF % any kit's set rows give: one set on 3–4 pieces, or two sets on 2 pieces each (the setChc rule of the crit cap)
  const rowPct = (set: string, n: number, n4: number) => bonusRows(ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })))
    .reduce((a, r) => a + (r.bon.stat === SUB && r.bon.mode === 'add' ? r.bon.value : 0), 0);
  const sets = ctx.idx.D.sets.map((x) => x.id);
  const two = sets.map((x) => Math.max(rowPct(x, 2, 0), rowPct(x, 2, 2))).sort((a, z) => z - a);
  const rowsPct = Math.max(0, (two[0] ?? 0) + (two[1] ?? 0), ...sets.flatMap((x) => [3, 4].flatMap((n) => Array.from({ length: n + 1 }, (_, n4) => rowPct(x, n, n4)))));
  const per = (LAMBDA * 1000) / seg; // thousandths of a point per unit of the goal's EFF
  const unitOf = (p: Piece) => { const f = factsOf(p); return f.n * seg + f.flat * mult; };
  const rowsUnits = (pct: number) => (mult * e0.w * pct * 10) / 1000;
  const bMemo = new Map<string, Milli>(), rMemo = new Map<string, Milli>();
  const bOf = (p: Piece): Milli => { let r = bMemo.get(p.id); if (r === undefined) bMemo.set(p.id, (r = Math.round(per * unitOf(p)))); return r; };
  const rOf = (set: string, n: number, n4: number): Milli => {
    const k = `${set}:${n}:${n4}`;
    let r = rMemo.get(k);
    if (r === undefined) rMemo.set(k, (r = n < 2 ? 0 : Math.round(per * rowsUnits(rowPct(set, n, n4)))));
    return r;
  };
  const counts = (pieces: readonly Piece[]) => {
    const cnt = new Map<string, [number, number]>();
    for (const p of pieces) {
      if (!p.setId) continue;
      const [n, n4] = cnt.get(p.setId) ?? [0, 0];
      cnt.set(p.setId, [n + 1, n4 + (p.bt === 4 ? 1 : 0)]);
    }
    return cnt;
  };
  const base = mult * (e0.w + e0.own);
  const a = Math.round(per * (goal.t - base));
  return {
    t: goal.t,
    approx: !cal,
    seg,
    a,
    b: (id) => { const p = pieceOf(id); return p ? bOf(p) : 0; },
    r: rOf,
    rMax: Math.ceil(per * rowsUnits(rowsPct)) + 2,
    lin(ids) {
      const pieces = of(ids);
      let v = base;
      for (const p of pieces) v += unitOf(p);
      for (const [set, [n, n4]] of counts(pieces)) if (n >= 2) v += rowsUnits(rowPct(set, n, n4));
      return v;
    },
    eff(ids) {
      const e = effOf(cx, c, of(ids));
      return e ? inBattle(e, effShown(e, cal).v, goal.bonus) : 0;
    },
    loss(ids) {
      const k = ids.join(',');
      let r = losses.get(k);
      if (r !== undefined) return r;
      const pieces = of(ids);
      let short = a;
      for (const p of pieces) short -= bOf(p);
      for (const [set, [n, n4]] of counts(pieces)) short -= rOf(set, n, n4);
      if (short > 0) { losses.set(k, short); return short; }
      // the target reached: the top of the run above it — the lightest bands (heaviest first from the bottom) lose their points
      const bands: Band[] = [];
      for (const p of pieces) { const f = factsOf(p); if (f.n) bands.push({ w: f.w, n: f.n }); }
      // EFF of the rows that carry no points stays under the bands; only the rows of bands go into them
      bands.push(...rowBands(pieces));
      let over = Math.min(bands.reduce((s, b) => s + b.n, 0), -short / (LAMBDA * 1000)); // segments above the target
      let loss = 0;
      for (const b of [...bands].sort((x, z) => x.w - z.w)) {
        if (over <= 0) break;
        const take = Math.min(b.n, over);
        loss += b.w * take;
        over -= take;
      }
      losses.set(k, (r = milli(loss)));
      return r;
    },
    facts(id) {
      const p = pieceOf(id);
      return p ? factsOf(p) : { w: 0, n: 0, flat: 0, non: 0 };
    },
  };
}
