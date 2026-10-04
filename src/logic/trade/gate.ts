// Порог и итог плана героя (R6.2–R6.4, .x/0040-trade/SPEC.md). Лучший комплект — bestKit; потом слот за слотом в порядке
// приложения: слот меняется, только если новая вещь лучше НАДЕТОЙ хотя бы на 1 очк., или включает неконвертируемый сет,
// или повышает рекомендованность оружия/аксессуара (R6.2). В слоте, где лучший комплект меняет вещь, берётся самая
// дешёвая по источнику из вещей в окне «хуже лучшей на 0…1 очк.», не меняющих сеты и не понижающих рекомендованность.
// Принятое — в fix; комплект пересчитывается с ним, поэтому «уже принятые замены» учитываются у следующих слотов.
import type { SlotId } from '../../data/types';
import { bestKit, keyOf, type Fix } from './kit';
import { GEAR_SLOTS, milli, SLOT_ORDER, type Cand, type Cands, type Fit, type Gauge, type Kit, type Milli } from './model';

export const THRESHOLD: Milli = milli(1); // R6.2: «хотя бы на 1 очк.»

const FIT: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };
const isGear = (slot: SlotId) => GEAR_SLOTS.includes(slot);

export interface Change { slot: SlotId; cand: Cand; was: Cand | null }
export interface Loss { holder: string; slot: SlotId; loss: Milli } // кто отдаёт надетое и сколько теряет (R6.4)
export interface Plan { kit: Kit; changes: Change[]; losses: Loss[] }

// Порог R6.2: вещь `to` вместо надетой `from` при остальном комплекте `rest`
export function passesThreshold(g: Gauge, rest: Partial<Record<SlotId, Cand>>, slot: SlotId, from: Cand, to: Cand): boolean {
  const a = keyOf(g, { ...rest, [slot]: from }), b = keyOf(g, { ...rest, [slot]: to });
  return b.total - a.total >= THRESHOLD || b.live > a.live || (isGear(slot) && FIT[to.fit] > FIT[from.fit]);
}

// меньшая цена источника, потом больше очков, дальше R6.1
const cheaper = (a: Cand, z: Cand) =>
  a.cost - z.cost || z.v - a.v || a.loss - z.loss || a.rank - z.rank || a.item.ord - z.item.ord;

export function planFor(g: Gauge, cands: Cands): Plan {
  const wornOf = (slot: SlotId) => (cands[slot] ?? []).find((c) => c.cost === 0) ?? null;
  const fix: Fix = {};
  for (const slot of SLOT_ORDER) {
    const best = bestKit(g, cands, fix);
    const b = best.slots[slot] ?? null, w = wornOf(slot);
    if (!w) { fix[slot] = b; continue; }                   // неотмеченный слот порога не имеет (R5.6)
    if (!b || b.item.id === w.item.id) { fix[slot] = w; continue; }
    const opts = (cands[slot] ?? []).filter((c) => {
      const k = keyOf(g, { ...best.slots, [slot]: c });
      const window = best.key.total - k.total;
      if (window < 0 || window >= THRESHOLD) return false;
      if (k.hard !== best.key.hard || k.live !== best.key.live || k.soft !== best.key.soft) return false;
      if (isGear(slot) && FIT[c.fit] < FIT[b.fit]) return false;
      return c.item.id === w.item.id || passesThreshold(g, best.slots, slot, w, c);
    });
    fix[slot] = opts.sort(cheaper)[0] ?? w;
  }
  const kit = bestKit(g, cands, fix);
  const changes: Change[] = [], losses: Loss[] = [];
  for (const slot of SLOT_ORDER) {
    const c = kit.slots[slot], w = wornOf(slot);
    if (!c || c.item.id === w?.item.id) continue;
    changes.push({ slot, cand: c, was: w });
    if (c.cost === 3 && c.holder) losses.push({ holder: c.holder, slot, loss: c.loss });
  }
  return { kit, changes, losses };
}
