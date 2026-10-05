// План героя целиком (R6, R8) и подсказка закреплённых (R6.5, .x/0040-trade/SPEC.md): кандидаты → порог → дыры.
import { candidates, type CandInput } from './cands';
import { planFor, type Plan } from './gate';
import { THRESHOLD } from '@/features/gear/model/vs';
import { fillHoles, type HolesResult } from './holes';
import type { World } from './model';
import type { Milli } from '@/features/gear/model/vs';

export interface PlanInput { to: string; skip?: ReadonlySet<string>; allow?: ReadonlySet<string> }
export interface HeroPlan { plan: Plan; holes: HolesResult }

export function heroPlan(w: World, inp: PlanInput): HeroPlan {
  const g = w.gauge(inp.to);
  const cin: CandInput = { to: inp.to, skip: inp.skip, allow: inp.allow };
  const plan = g ? planFor(g, candidates(w, cin)) : { kit: { slots: {}, key: null as never }, changes: [], losses: [] };
  return { plan, holes: fillHoles(w, { to: inp.to, plan }) };
}

export interface PinnedHint { heroes: string[]; gain: Milli; plan: HeroPlan }

// «У {героев} (закреплены) лучше» (R6.5): с вещами закреплённых итог лучше по порогу (+1 очк., включился
// неконвертируемый сет, выросла рекомендованность). Герои — только те закреплённые, чьи вещи попали в лучший план;
// plan — то, что получится после «Взять»
export function pinnedHint(w: World, inp: PlanInput): PinnedHint | null {
  const g = w.gauge(inp.to);
  if (!g) return null;
  const pinned = new Set(w.heroes.filter((h) => h.pinned && h.id !== inp.to && !inp.allow?.has(h.id)).map((h) => h.id));
  if (!pinned.size) return null;
  const base = heroPlan(w, inp);
  const wide = heroPlan(w, { ...inp, allow: new Set([...(inp.allow ?? []), ...pinned]) });
  const heroes = [...new Set(wide.plan.changes.map((c) => c.cand.holder).filter((h): h is string => !!h && pinned.has(h)))];
  if (!heroes.length) return null;
  const take = heroPlan(w, { ...inp, allow: new Set([...(inp.allow ?? []), ...heroes]) });
  const a = base.plan.kit.key, b = take.plan.kit.key;
  const gain = b.total - a.total;
  return gain >= THRESHOLD || b.live > a.live || b.rec > a.rec ? { heroes, gain, plan: take } : null;
}
