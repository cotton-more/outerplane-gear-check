// Что показывает план (R6.3, R6.4, R8.4, R10.4, R10.5, .x/0040-trade/SPEC.md): по героям — очки до и после (комплект по
// мерилу, R2.2), сеты, которые включились и выключились, что надеть (moves) и какие слоты опустели; копии, которые после
// «Сделал» не будут ни в одном пуле («из приложения уйдёт»). Данные, не подписи: подписи — компоненты и i18n.
import type { SlotId } from '../../data/types';
import { SLOT_ORDER, type Milli, type Part, type World } from './model';
import type { Move, Moves } from './moves';
import { kitIn } from './team';

export interface HeroLine {
  hero: string;
  receiver: boolean;
  before: Milli;
  after: Milli;
  on: Part[];               // части связки, бонус которых включился
  off: Part[];              // и выключился
  moves: Move[];
  emptied: SlotId[];        // было надето — стало пусто
  empty: SlotId[];          // получатель: все пустые слоты после плана (подсказка R8.4)
  gone: string[];           // получатель: копии, которые уйдут из приложения (R6.6)
}

// части связки с включённым бонусом в надетом героя (наибольшая активная строка ≥ нужной части)
function activeParts(w: World, id: string): Set<Part> {
  const g = w.gauge(id), h = w.heroes.find((x) => x.id === id);
  const out = new Set<Part>();
  if (!g || !h) return out;
  for (const p of g.parts) {
    let n = 0, n4 = 0;
    for (const s of SLOT_ORDER) {
      const it = h.worn[s] ? w.items[h.worn[s]!] : null;
      if (it?.set === p.set) { n++; if (it.t4) n4++; }
    }
    if (n >= 2 && g.bonus(p.set, n, n4).top >= p.n) out.add(p);
  }
  return out;
}

const scoreIn = (w: World, id: string): Milli => (w.gauge(id) ? kitIn(w, id).key.total : 0);
const poolOf = (w: World) => new Map(w.heroes.flatMap((h) => h.pool.map((id) => [id, h.id] as const)));

// w0 — до плана, w1 — после; receivers — получатели в порядке плана; дальше — герои, у которых поменялось надетое
export function linesOf(w0: World, w1: World, receivers: readonly string[], m: Moves): HeroLine[] {
  const rest = [...new Set([...m.moves.map((x) => x.hero), ...m.emptied.map((x) => x.hero)])].filter((id) => !receivers.includes(id));
  const was = poolOf(w0), now = poolOf(w1);
  const gone = [...was.keys()].filter((id) => !now.has(id));
  const after = new Map(w1.heroes.map((h) => [h.id, h]));
  return [...receivers, ...rest].map((hero) => {
    const receiver = receivers.includes(hero);
    const a = activeParts(w0, hero), b = activeParts(w1, hero);
    const worn = after.get(hero)?.worn ?? {};
    return {
      hero, receiver,
      before: scoreIn(w0, hero), after: scoreIn(w1, hero),
      on: [...b].filter((p) => !a.has(p)), off: [...a].filter((p) => !b.has(p)),
      moves: m.moves.filter((x) => x.hero === hero),
      emptied: m.emptied.filter((x) => x.hero === hero).map((x) => x.slot),
      empty: receiver ? SLOT_ORDER.filter((s) => !worn[s]) : [],
      gone: receiver ? gone.filter((id) => was.get(id) === hero) : [],
    };
  });
}

// R10.5: процент до целого (половина — от нуля), 0% — без стрелки; очки до = 0 — очки вместо процента
export type Gain = { kind: 'pct'; n: number } | { kind: 'pts'; n: number };
export function gainOf(before: Milli, after: Milli): Gain {
  if (before === 0) return { kind: 'pts', n: (after - before) / 1000 };
  const x = (100 * (after - before)) / before;
  const n = Math.sign(x) * Math.round(Math.abs(x));
  return { kind: 'pct', n: n === 0 ? 0 : n };
}
