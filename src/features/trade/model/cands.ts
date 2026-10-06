// Кандидаты получателя (R5; .x/0085 FORMULA §7, вопрос 15): свои вещи, надетое других (кроме переодетых в этом окне — у
// них только пул; члены команды друг другу открыты), запас других, свободные вещи расчёта. Не кандидаты: не по классу,
// не годная для получателя (порог §4; своё надетое годно всегда, §3 п. 2), «Не брать», код, который у получателя уже
// есть, без BT выше (R5.5). Герои без билдов — ни получатели, ни держатели (R2.7).
import type { SlotId } from '@/game/data/types';
import { keyOf } from './kit';
import { SLOT_ORDER, type Cand, type Cands, type Cost, type Gauge, type Hero, type World } from './model';
import type { Milli } from '@/features/gear/model/vs';

export interface CandInput {
  to: string;                       // получатель
  open?: ReadonlySet<string>;       // переодетые, чьё надетое всё же кандидат: члены команды, чей шаг впереди (R3.5)
  skip?: ReadonlySet<string>;       // «Не брать»: skipKey(вещь, получатель)
  free?: readonly string[];         // свободные вещи этого расчёта (R5.4)
}
export const skipKey = (itemId: string, heroId: string): string => `${itemId}>${heroId}`;

const NOBODY: Hero = { id: '', rank: -1, locked: false, worn: {}, pool: [] };
const btOf = (bt: number | null) => bt ?? 0;

// сколько очков теряет держатель, если опустеет только этот слот (по его мерилу)
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
  return before - keyOf(gk, slots).total;
}

export function candidates(w: World, inp: CandInput): Cands {
  const g = w.gauge(inp.to);
  if (!g) return {};
  const h = w.heroes.find((x) => x.id === inp.to) ?? { ...NOBODY, id: inp.to };
  const out: Partial<Record<SlotId, Cand[]>> = {};
  // запись в пулах двух героев, надетая одним, — его надетое, а не чей-то запас (ревью этапа 10): иначе сеанс её не
  // закрывал, а после «Сделал» она была бы надета на двоих
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
  const add = (id: string, cost: Cost, holder: Hero | null, loss: Milli, own: boolean) => {
    const item = w.items[id];
    if (!item) return;
    const val = g.value(id);
    if (!val) return;
    if (!(own && cost === 0) && (!val.ok || inp.skip?.has(skipKey(id, h.id)))) return;
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
      if (!kw.has(id)) { if (!wornBy.has(id)) add(id, 2, k, 0, false); }
      else if (open && k.worn[it.slot] === id) add(id, 3, k, holderLoss(w, k, gk, it.slot), false);
    }
  }
  for (const id of inp.free ?? []) add(id, 2, null, 0, false);
  return out;
}
