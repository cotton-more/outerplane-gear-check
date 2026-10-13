// Dressing in turn (MODEL.md §7 item 8): «Кого переодеть?» shows what each hero would gain now. A hero's
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
  const w1 = advance(w, { plans: [{ to, plan }] });
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

// the picker's order (owner, Q1a): by name, the way the character list sorts (compare — compareChars: base name, then
// prefix) — the player already knows whom to re-dress, the gain only shows what he could take now; the re-dressed last,
// in the order they were done
export function turnOrder(ids: readonly string[], done: readonly string[], compare: (a: string, z: string) => number): string[] {
  const open = ids.filter((id) => !done.includes(id)).sort(compare);
  return [...open, ...done.filter((id) => ids.includes(id))];
}
