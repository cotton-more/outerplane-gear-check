// Что показывает план (R6.3, R6.4, R8.4, .x/0040-trade/SPEC.md; «было → станет» — .x/0085 FORMULA §7 п. 3): по героям —
// V и очки статов (без сетов) до и после по заказу, половины сетов, которые включились и выключились, что надеть (moves)
// with each piece's cost, and which slots were emptied; copies that after «Сделал» will be in no pool («из приложения уйдёт»). Data, not
// подписи: подписи — компоненты и i18n.
import type { SlotId } from '@/game/data/types';
import { halvesIn } from './holes';
import { FIT } from './kit';
import { GEAR_SLOTS, SLOT_ORDER, type Part, type World } from './model';
import type { Milli } from '@/features/gear/model/vs';
import type { Move, Moves } from './moves';
import { kitIn } from './team';

export interface HeroLine {
  hero: string;
  receiver: boolean;
  before: Milli;            // V надетого по заказу
  after: Milli;
  ptsBefore: Milli;         // очки статов — без сетов
  ptsAfter: Milli;
  on: Part[];               // половины сетов, которые включились: «S ×2» (1 половина) или «S ×4» (2)
  off: Part[];              // и выключились
  moves: Move[];
  worth: Partial<Record<SlotId, Worth>>; // what the move's piece gives against the one worn in the slot
  emptied: SlotId[];        // было надето — стало пусто
  empty: SlotId[];          // получатель: все пустые слоты после плана (подсказка R8.4)
  gone: string[];           // получатель: копии, которые уйдут из приложения (R6.6)
}

// The cost of a move by the hero's order: the piece's points minus the points of the one worn in this slot before the plan (sets — in the hero's line, not here);
// passive — a weapon or accessory of a higher rank (a recommended item): the plan takes it even with fewer points
export interface Worth { d: Milli; passive: boolean }

function worthOf(w0: World, hero: string, m: Move): Worth | null {
  const g = w0.gauge(hero);
  const now = g?.value(m.item);
  if (!g || !now) return null;
  const was = w0.heroes.find((h) => h.id === hero)?.worn[m.slot];
  const old = was ? g.value(was) : null;
  return { d: now.v - (old?.v ?? 0), passive: GEAR_SLOTS.includes(m.slot) && FIT[now.fit] > FIT[old?.fit ?? 'no'] };
}

// половины сетов в надетом героя
function halvesOf(w: World, id: string): Map<string, number> {
  const g = w.gauge(id), h = w.heroes.find((x) => x.id === id);
  return g && h ? halvesIn(g, w, h.worn) : new Map();
}
// сеты, где половин стало больше, чем в `less`: часть — по числу половин в `more`
const grown = (more: Map<string, number>, less: Map<string, number>): Part[] =>
  [...more].filter(([set, h]) => h > (less.get(set) ?? 0)).map(([set, h]) => ({ set, n: h === 2 ? 4 : 2 }));

const keyIn = (w: World, id: string) => (w.gauge(id) ? kitIn(w, id).key : null);
const poolOf = (w: World) => new Map(w.heroes.flatMap((h) => h.pool.map((id) => [id, h.id] as const)));

// w0 — до плана, w1 — после; receivers — получатели в порядке плана; дальше — герои, у которых поменялось надетое
export function linesOf(w0: World, w1: World, receivers: readonly string[], m: Moves): HeroLine[] {
  const rest = [...new Set([...m.moves.map((x) => x.hero), ...m.emptied.map((x) => x.hero)])].filter((id) => !receivers.includes(id));
  const was = poolOf(w0), now = poolOf(w1);
  const gone = [...was.keys()].filter((id) => !now.has(id));
  const after = new Map(w1.heroes.map((h) => [h.id, h]));
  return [...receivers, ...rest].map((hero) => {
    const receiver = receivers.includes(hero);
    const a = halvesOf(w0, hero), b = halvesOf(w1, hero);
    const k0 = keyIn(w0, hero), k1 = keyIn(w1, hero);
    const worn = after.get(hero)?.worn ?? {};
    return {
      hero, receiver,
      before: k0?.total ?? 0, after: k1?.total ?? 0, ptsBefore: k0?.pts ?? 0, ptsAfter: k1?.pts ?? 0,
      on: grown(b, a), off: grown(a, b),
      moves: m.moves.filter((x) => x.hero === hero),
      worth: Object.fromEntries(m.moves.filter((x) => x.hero === hero).flatMap((x) => {
        const v = worthOf(w0, hero, x);
        return v ? [[x.slot, v]] : [];
      })),
      emptied: m.emptied.filter((x) => x.hero === hero).map((x) => x.slot),
      empty: receiver ? SLOT_ORDER.filter((s) => !worn[s]) : [],
      gone: receiver ? gone.filter((id) => was.get(id) === hero) : [],
    };
  });
}
