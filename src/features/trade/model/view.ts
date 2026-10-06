// Что показывает план (R6.3, R6.4, R8.4, .x/0040-trade/SPEC.md; «было → станет» — .x/0085 FORMULA §7 п. 3): по героям —
// V и очки статов (без сетов) до и после по заказу, половины сетов, которые включились и выключились, что надеть (moves)
// и какие слоты опустели; копии, которые после «Сделал» не будут ни в одном пуле («из приложения уйдёт»). Данные, не
// подписи: подписи — компоненты и i18n.
import type { SlotId } from '@/game/data/types';
import { halvesIn } from './holes';
import { SLOT_ORDER, type Part, type World } from './model';
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
  emptied: SlotId[];        // было надето — стало пусто
  empty: SlotId[];          // получатель: все пустые слоты после плана (подсказка R8.4)
  gone: string[];           // получатель: копии, которые уйдут из приложения (R6.6)
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
      emptied: m.emptied.filter((x) => x.hero === hero).map((x) => x.slot),
      empty: receiver ? SLOT_ORDER.filter((s) => !worn[s]) : [],
      gone: receiver ? gone.filter((id) => was.get(id) === hero) : [],
    };
  });
}
