// Дыры в плане (R8, .x/0040-trade/SPEC.md): слот героя вне получателей, надетое в котором ушло получателю. Дыры не
// закрываются (владелец, 2026-10-04): снятое с героя остаётся снятым, пока ему не выдадут вещь через оценку. План только
// подсказывает, что искать (R8.4, R9.2): breaks — сет, значимый бонус которого дыра выключила.
import type { SlotId } from '../../data/types';
import type { Plan } from './gate';
import { SLOT_ORDER, type Cand, type Gauge, type World } from './model';

export interface HoleFill { hero: string; slot: SlotId; breaks: string | null }
export interface HolesInput { to: string; plan: Plan }
export interface HolesResult { fills: HoleFill[]; unfilled: SlotId[] } // unfilled — слоты получателя, оставшиеся пустыми (F9)

// включённые значимые бонусы связки (неконвертируемые части)
function activeSets(g: Gauge, slots: Partial<Record<SlotId, Cand | true>>, w: World, worn: Partial<Record<SlotId, string>>): Set<string> {
  const out = new Set<string>();
  for (const p of g.parts) {
    if (p.conv) continue;
    let n = 0, n4 = 0;
    for (const s of SLOT_ORDER) {
      const it = slots[s] && worn[s] ? w.items[worn[s]!] : null;
      if (it?.set === p.set) { n++; if (it.t4) n4++; }
    }
    if (n >= 2 && g.bonus(p.set, n, n4).top >= p.n) out.add(p.set);
  }
  return out;
}

export function fillHoles(w: World, inp: HolesInput): HolesResult {
  const heroOf = new Map(w.heroes.map((h) => [h.id, h]));
  const lost = inp.plan.losses.filter((l) => l.holder !== inp.to);
  const fills: HoleFill[] = [];
  for (const l of lost) {
    const hero = heroOf.get(l.holder), g = hero && w.gauge(hero.id);
    if (!hero || !g) continue;
    // слоты, что остаются на герое после плана (все дыры этого плана у него — пустые)
    const gone = new Set(lost.filter((x) => x.holder === hero.id).map((x) => x.slot));
    const keep: Partial<Record<SlotId, true>> = {};
    for (const s of SLOT_ORDER) if (hero.worn[s] && !gone.has(s)) keep[s] = true;
    const was = activeSets(g, { ...keep, [l.slot]: true }, w, hero.worn);
    const now = activeSets(g, keep, w, hero.worn);
    fills.push({ hero: hero.id, slot: l.slot, breaks: [...was].find((x) => !now.has(x)) ?? null });
  }
  fills.sort((a, z) => heroOf.get(a.hero)!.rank - heroOf.get(z.hero)!.rank || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(z.slot));
  return { fills, unfilled: SLOT_ORDER.filter((s) => !inp.plan.kit.slots[s]) };
}
