// Set halves in a hero's worn gear (MODEL.md §2): the plan's «включится / выключится» (view) and the empty-slot hint — a
// set whose half switched off with the hole (ends). Holes themselves are the end of a trade now (ends, MODEL.md §7 item 7).
import type { SlotId } from '@/game/data/types';
import { SLOT_ORDER, type Gauge, type World } from './model';

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
