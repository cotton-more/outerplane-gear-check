// Кандидаты получателя (R5; MODEL.md §7, вопрос 15): свои вещи, надетое других (кроме переодетых в этом окне; члены
// команды друг другу открыты), снятое этим же расчётом, свободные вещи расчёта, parked pieces (anyone's; into an empty slot
// with no bar — MODEL.md §7 item 2). Not his own weak set-aside piece: it fills no slot (pool/info eligibleIn, owner
// 2026-10-15). Запас других — нет (owner, 2026-10-12, Q1b). Не кандидаты: не по классу,
// не годная для получателя (порог MODEL.md §4; своё надетое годно всегда, MODEL.md §3 item 2; except, in the team trade, a
// teammate's weapon or accessory where the receiver's own piece is empty or off his list, belowBarOk), код, который у
// получателя уже есть, без BT выше (R5.5). A frozen slot («Оставить как было», MODEL.md §7 item 4): the receiver keeps what
// he wears there (nothing else is a candidate) and nobody takes it from him. Герои без билдов — ни получатели, ни держатели (R2.7).
import type { SlotId } from '@/game/data/types';
import { keyOf } from './kit';
import { belowBarOk, heldOf, SLOT_ORDER, slotKey, type Cand, type Cands, type Cost, type Gauge, type Hero, type World } from './model';
import type { Milli } from '@/features/gear/model/vs';

export interface CandInput {
  to: string;                       // получатель
  open?: ReadonlySet<string>;       // переодетые, чьё надетое всё же кандидат: члены команды, чей шаг впереди (R3.5)
  frozen?: ReadonlySet<string>;     // «Оставить как было»: slotKey(hero, slot)
  free?: readonly string[];         // свободные вещи этого расчёта (R5.4)
  team?: ReadonlySet<string>;       // the team trade's members (MODEL.md §7 item 2); no — the one-hero trade
}

const NOBODY: Hero = { id: '', rank: -1, locked: false, worn: {}, pool: [] };
const btOf = (bt: number | null) => bt ?? 0;

// сколько очков теряет держатель, если опустеет только этот слот (по его мерилу). Never below 0: with the crit soft cap a
// CHC main can lower V (MODEL.md §12 item 2), so emptying the slot may raise the holder's V, but a taken piece is never a
// gain for its holder — the slot stays a hole (MODEL.md §7 item 7)
export function holderLoss(w: World, k: Hero, gk: Gauge, slot: SlotId): Milli {
  const slots: Partial<Record<SlotId, Cand>> = {};
  for (const s of SLOT_ORDER) {
    const id = k.worn[s];
    const val = id ? gk.value(id) : null;
    if (id && val && w.items[id]) slots[s] = { item: w.items[id], v: val.v, fit: val.fit, cost: 0, loss: 0, holder: k.id, rank: k.rank };
  }
  if (!slots[slot]) return 0;
  const before = keyOf(gk, slots).total;
  delete slots[slot];
  return Math.max(0, before - keyOf(gk, slots).total);
}

export function candidates(w: World, inp: CandInput): Cands {
  const g = w.gauge(inp.to);
  if (!g) return {};
  const h = w.heroes.find((x) => x.id === inp.to) ?? { ...NOBODY, id: inp.to };
  const out: Partial<Record<SlotId, Cand[]>> = {};
  // запись в пулах двух героев, надетая одним, — его надетое, а не чей-то запас (ревью этапа 10): иначе сеанс её не
  // закрывал, а после «Сделал» она была бы надета на двоих
  const held = w.held ?? heldOf(w);
  const wornBy = new Map<string, string>();
  for (const k of w.heroes) for (const id of Object.values(k.worn)) if (id) wornBy.set(id, k.id);
  const elsewhere = (id: string) => { const by = wornBy.get(id); return !!by && by !== h.id; };
  // коды получателя и наибольший BT каждого (R5.5); надетое другим в его пуле — не его копия
  const mine = new Map<string, number>();
  for (const id of h.pool) {
    if (elsewhere(id)) continue;
    const it = w.items[id];
    if (it) mine.set(it.code, Math.max(mine.get(it.code) ?? 0, btOf(it.bt)));
  }
  const frozen = (heroId: string, slot: SlotId) => !!inp.frozen?.has(slotKey(heroId, slot));
  // an extra condition of the team trade, not an exception of the bar (MODEL.md §7 item 2; owner, 2026-10-13): a teammate's
  // weapon or accessory (worn by him, or taken off by this same calculation — not parked, not his spare) may come below the
  // receiver's bar when his own piece in that slot is empty or off his list (fit 'no')
  const mate = (id: string, slot: SlotId, holder: Hero | null): boolean => {
    if (!holder || holder.id === h.id || !inp.team?.has(h.id) || !inp.team.has(holder.id) || w.parked?.has(id)) return false;
    const on = h.worn[slot], val = on ? g.value(on) : null;
    return belowBarOk(slot, val ? val.fit : null);
  };
  const add = (id: string, cost: Cost, holder: Hero | null, loss: Milli, own: boolean) => {
    const item = w.items[id];
    if (!item) return;
    const val = g.value(id);
    if (!val) return;
    const worn = own && cost === 0;
    if (frozen(h.id, item.slot) && !worn) return;
    // a parked piece fills an empty slot with no bar: better than nothing (MODEL.md §7 item 2)
    const open = !!w.parked?.has(id) && !h.worn[item.slot];
    if (!worn && !val.ok && !open && !mate(id, item.slot, holder)) return;
    if (!own && mine.has(item.code) && btOf(item.bt) <= mine.get(item.code)!) return;
    (out[item.slot] ??= []).push({ item, v: val.v, fit: val.fit, cost, loss, holder: holder ? holder.id : null, rank: holder ? holder.rank : -1 });
  };
  const wornIds = (k: Hero) => new Set(Object.values(k.worn).filter((x): x is string => !!x));
  // свои: надетое — 0, запас — 1
  const hw = wornIds(h);
  for (const id of h.pool) if (!elsewhere(id)) add(id, hw.has(id) ? 0 : 1, h, 0, true);
  for (const k of w.heroes) {
    if (k.id === h.id) continue;
    const gk = w.gauge(k.id);
    if (!gk) continue;
    const kw = wornIds(k);
    const open = !k.locked || !!inp.open?.has(k.id);
    for (const id of k.pool) {
      const it = w.items[id];
      if (!it) continue;
      // his spare is held for him (a better piece, Breakthrough): in game it is locked, not worn — handed to another hero it
      // would be worn and locked with nobody knowing whom it was for (owner, 2026-10-12, Q1b). Taken off by this same
      // calculation (a team member's step), or by an earlier «Сделал» of this window (free, World.held) — not held: the swap of
      // two members goes on, and a re-dressed hero's old piece goes to the next
      if (!kw.has(id)) { if (!wornBy.has(id) && !held.has(id)) add(id, 2, k, 0, false); }
      else if (open && k.worn[it.slot] === id && !frozen(k.id, it.slot)) add(id, 3, k, holderLoss(w, k, gk, it.slot), false);
    }
  }
  for (const id of inp.free ?? []) add(id, 2, null, 0, false);
  return out;
}
