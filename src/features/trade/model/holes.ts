// Дыры в плане (R8, .x/0040-trade/SPEC.md): слот героя вне получателей, надетое в котором ушло получателю. Дыры не
// закрываются (владелец, 2026-10-04): снятое с героя остаётся снятым, пока ему не выдадут вещь через оценку. План только
// подсказывает, что искать (R8.4, R9.2): breaks — сет, половина которого (MODEL.md §2) с дырой выключилась.
import type { SlotId } from '@/game/data/types';
import type { Plan } from './gate';
import { SLOT_ORDER, type Gauge, type World } from './model';

export interface HoleFill { hero: string; slot: SlotId; breaks: string | null }
export interface HolesInput { to: string; plan: Plan }
export interface HolesResult { fills: HoleFill[]; unfilled: SlotId[] } // unfilled — слоты получателя, оставшиеся пустыми (F9)

// половины сетов в надетом героя (по слотам `slots`): сет → сколько половин включено
export function halvesIn(g: Gauge, w: World, worn: Partial<Record<SlotId, string>>, slots: readonly SlotId[] = SLOT_ORDER): Map<string, number> {
  const cnt = new Map<string, [number, number]>();
  for (const s of slots) {
    const it = worn[s] ? w.items[worn[s]!] : null;
    if (!it?.set) continue;
    const [n, n4] = cnt.get(it.set) ?? [0, 0];
    cnt.set(it.set, [n + 1, n4 + (it.t4 ? 1 : 0)]);
  }
  const out = new Map<string, number>();
  for (const [set, [n, n4]] of cnt) {
    const h = n >= 2 ? g.bonus(set, n, n4).halves : 0;
    if (h) out.set(set, h);
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
    const keep = SLOT_ORDER.filter((s) => hero.worn[s] && !gone.has(s));
    const was = halvesIn(g, w, hero.worn, [...keep, l.slot]);
    const now = halvesIn(g, w, hero.worn, keep);
    fills.push({ hero: hero.id, slot: l.slot, breaks: [...was].find(([set, h]) => (now.get(set) ?? 0) < h)?.[0] ?? null });
  }
  fills.sort((a, z) => heroOf.get(a.hero)!.rank - heroOf.get(z.hero)!.rank || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(z.slot));
  return { fills, unfilled: SLOT_ORDER.filter((s) => !inp.plan.kit.slots[s]) };
}
