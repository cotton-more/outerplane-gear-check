// Порог и итог плана героя (R6.2–R6.4 — MODEL.md §10; порог — MODEL.md §7 item 5). Лучший комплект — bestKit;
// потом слот за слотом в порядке приложения: слот меняется, только если с новой вещью заказ лучше, чем с НАДЕТОЙ, по
// порогу gains (+1 очк., половина сета-эффекта, выше ранг оружия/аксессуара). В слоте, где лучший комплект меняет вещь,
// берётся самая дешёвая по источнику из вещей в окне «хуже лучшей на 0…1 очк.», не меняющих половины сетов и не
// понижающих ранг.
// Принятое — в fix; комплект пересчитывается с ним, поэтому «уже принятые замены» учитываются у следующих слотов.
import type { SlotId } from '@/game/data/types';
import { bestKit, FIT, keyOf, type Fix } from './kit';
import { gains, GEAR_SLOTS, legendOverEpic, SLOT_ORDER, type Cand, type Cands, type Gauge, type Kit } from './model';
import { THRESHOLD, type Milli } from '@/features/gear/model/vs';

const isGear = (slot: SlotId) => GEAR_SLOTS.includes(slot);

export interface Change { slot: SlotId; cand: Cand; was: Cand | null }
export interface Loss { holder: string; slot: SlotId; loss: Milli } // кто отдаёт надетое и сколько теряет (R6.4)
export interface Plan { kit: Kit; changes: Change[]; losses: Loss[] }

// Порог: вещь `to` вместо надетой `from` при остальном комплекте `rest`
export function passesThreshold(g: Gauge, rest: Partial<Record<SlotId, Cand>>, slot: SlotId, from: Cand, to: Cand): boolean {
  return gains(keyOf(g, { ...rest, [slot]: from }), keyOf(g, { ...rest, [slot]: to }), legendOverEpic(from, to));
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
      if (k.halves !== best.key.halves || k.eff !== best.key.eff) return false;
      if (isGear(slot) && FIT[c.fit] < FIT[b.fit]) return false;
      // the worn Epic does not hold its place against a Legendary that is not worse (Q7)
      return c.item.id === w.item.id ? !legendOverEpic(w, b) : passesThreshold(g, best.slots, slot, w, c);
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
