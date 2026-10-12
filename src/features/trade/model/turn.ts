// Dressing in turn (MODEL.md §7 item 8): «Кого переодеть?» shows what each hero would gain now and sorts by it. A hero's
// gain is his plan's hero line (planOf — the same candidates and threshold as heroPlan, holes do not change his kit;
// lineGain — the same number as «▲ +6,3 очк.»). One generator over the heroes (runChunks: the phone stays responsive).
import { advance } from './moves';
import type { World } from './model';
import { planOf } from './plan';
import { keyIn, lineGain } from './view';

// hero → his gain in tenths of a point; null — nothing to change («Менять нечего»)
export type Gains = ReadonlyMap<string, number | null>;

export function heroGain(w: World, to: string): number | null {
  const { plan } = planOf(w, { to });
  if (!plan.changes.length) return null;
  const w1 = advance(w, { plans: [{ to, plan }], fills: [] });
  return lineGain({ before: keyIn(w, to)?.total ?? 0, after: keyIn(w1, to)?.total ?? 0 });
}

// ids — heroes the picker offers, minus those re-dressed in this window
export function* turnGains(w: World, ids: readonly string[]): Generator<void, Gains> {
  const out = new Map<string, number | null>();
  for (const id of ids) {
    out.set(id, heroGain(w, id));
    yield;
  }
  return out;
}

// the picker's order: by gain (biggest first), then «—», then the re-dressed in the order they were done; ties keep `ids` order
export function turnOrder(ids: readonly string[], gains: Gains, done: readonly string[]): string[] {
  const rank = (id: string) => (done.includes(id) ? 2 : gains.get(id) == null ? 1 : 0);
  const open = ids.filter((id) => !done.includes(id))
    .map((id, i) => ({ id, i }))
    .sort((a, z) => rank(a.id) - rank(z.id) || (gains.get(z.id) ?? 0) - (gains.get(a.id) ?? 0) || a.i - z.i)
    .map((x) => x.id);
  return [...open, ...done.filter((id) => ids.includes(id))];
}
