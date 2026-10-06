// План героя целиком (R6, R8, .x/0040-trade/SPEC.md): кандидаты → порог → дыры. Честная строка заказа набора
// (.x/0085 FORMULA §7 п. 3): часть, которая не собралась, потому что её сета нет в нужном числе слотов.
import type { SlotId } from '@/game/data/types';
import { candidates, type CandInput } from './cands';
import { planFor, type Plan } from './gate';
import { fillHoles, type HolesResult } from './holes';
import { ARMOR_SLOTS, type Cand, type Cands, type Gauge, type Part, type World } from './model';

export interface PlanInput { to: string; skip?: ReadonlySet<string>; open?: ReadonlySet<string> }
// missing — части заказа, которым не хватает вещей: slots — слоты брони, где вещи этого сета нет ни у кого
// t4 — вещи части есть по слотам, но ниже T4, а части нужен T4 (ревью этапа 10, В2): «не собирается: нужен T4»
export interface Missing { part: Part; slots: SlotId[]; t4?: boolean }
export interface HeroPlan { plan: Plan; holes: HolesResult; missing: Missing[] }

// часть включена: у сета в комплекте нужное число половин (×2 — одна, ×4 — две)
export function partOn(g: Gauge, slots: Partial<Record<SlotId, Cand>>, p: Part): boolean {
  let n = 0, n4 = 0;
  for (const s of ARMOR_SLOTS) if (slots[s]?.item.set === p.set) { n++; if (slots[s]!.item.t4) n4++; }
  return n >= 2 && g.bonus(p.set, n, n4).halves >= (p.n === 4 ? 2 : 1);
}

export function missingOf(g: Gauge, cands: Cands, slots: Partial<Record<SlotId, Cand>>): Missing[] {
  const out: Missing[] = [];
  for (const part of g.parts) {
    if (partOn(g, slots, part)) continue;
    const lack = ARMOR_SLOTS.filter((s) => !(cands[s] ?? []).some((c) => c.item.set === part.set));
    if (ARMOR_SLOTS.length - lack.length < part.n) { out.push({ part, slots: lack }); continue; }
    const need = part.n === 4 ? 2 : 1;
    const have4 = ARMOR_SLOTS.filter((s) => (cands[s] ?? []).some((c) => c.item.set === part.set && c.item.t4)).length;
    const n4 = Math.min(have4, part.n);
    if (n4 < part.n && g.bonus(part.set, part.n, part.n).halves >= need && g.bonus(part.set, part.n, n4).halves < need) out.push({ part, slots: [], t4: true });
  }
  return out;
}

export function heroPlan(w: World, inp: PlanInput): HeroPlan {
  const g = w.gauge(inp.to);
  const cin: CandInput = { to: inp.to, skip: inp.skip, open: inp.open };
  const cands = g ? candidates(w, cin) : {};
  const plan = g ? planFor(g, cands) : { kit: { slots: {}, key: null as never }, changes: [], losses: [] };
  return { plan, holes: fillHoles(w, { to: inp.to, plan }), missing: g ? missingOf(g, cands, plan.kit.slots) : [] };
}
