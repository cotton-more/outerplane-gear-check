// Crit soft cap (MODEL.md §12 item 2): what CHC substats are worth once the hero's crit nears N — «сколько крита нужно герою».
// Per CHC %: f(c) = 1 up to the knee N − 15 (clamped at 0), then linear down to 0 at N, 0 above N. F is its integral.
// A layout's CHC segments are laid on the curve from C₀ (crit that carries no points: the hero, mains, set rows) heaviest
// first: a segment of weight w over [c, c + step] is worth w × (F(c + step) − F(c)) / step instead of w. Heaviest first
// keeps the value one function of the layout (no order of pieces) and never lets an extra segment lower it: adding a
// segment adds at least 0 and at most its linear points (the pruning proof in MODEL.md leans on both).
export const CRIT_KNEE = 15; // the soft border: full weight up to N − 15

// ∫₀ᶜ f — the "useful crit" up to c, in %
export function critF(need: number, c: number): number {
  const knee = Math.max(0, need - CRIT_KNEE), slope = need - knee;
  if (c <= knee) return c;
  if (slope <= 0) return knee;
  const top = Math.min(c, need);
  return knee + (slope * slope - (need - top) * (need - top)) / (2 * slope);
}

// segments of one weight: n segments (3 % each for CHC) worth w points each when linear
export interface CritSegs { w: number; n: number }

// value of the segments on the curve from c0, heaviest first; linear when the whole run stays under the knee
export function critValue(need: number, c0: number, step: number, segs: readonly CritSegs[]): number {
  const sorted = segs.filter((s) => s.n > 0 && s.w > 0).sort((a, z) => z.w - a.w);
  let c = c0, v = 0;
  for (const s of sorted) {
    const to = c + s.n * step;
    v += (s.w * (critF(need, to) - critF(need, c))) / step;
    c = to;
  }
  return v;
}

// the same segments at full weight
export const critLinear = (segs: readonly CritSegs[]): number => segs.reduce((n, s) => n + (s.w > 0 ? s.w * s.n : 0), 0);

// what the segments lose on the curve (≥ 0): exactly 0 while the whole run stays under the knee (no float noise)
export function critLoss(need: number, c0: number, step: number, segs: readonly CritSegs[]): number {
  const run = segs.reduce((n, s) => n + (s.w > 0 ? s.n : 0), 0) * step;
  if (c0 + run <= Math.max(0, need - CRIT_KNEE)) return 0;
  const loss = critLinear(segs) - critValue(need, c0, step, segs);
  return loss > 1e-12 ? loss : 0;
}
