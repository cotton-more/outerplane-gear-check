// Что показывает план (R6.3, R6.4, R8.4 — MODEL.md §10; «было → станет» — MODEL.md §7 item 3): по героям —
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
  critBefore: Milli;        // the kit's crit loss (MODEL.md §12 item 6): «Лишний крит a → b» on the line (decision 14)
  critAfter: Milli;
  eff?: EffLine;            // a member with the EFF goal (MODEL.md §13): battle EFF before and after; none — no goal
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
// «Эфф ≈ 184 → 222 · 93%» (.x/0200-boss E3 Q6): the game's battle EFF of the worn kit before and after, the boss's RES (the
// target − 1), «≈» — no stat-screen EFF typed
export interface EffLine { a: number; b: number; res: number; approx: boolean }

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

export const keyIn = (w: World, id: string) => (w.gauge(id) ? kitIn(w, id).key : null);

// points the way the plan writes them (to tenths): «+0 очк.» and «слабее на 0 очк.» never occur (stage 10 review); halves round
// away from zero both ways, otherwise a gain of −1.05 read «−1» while «слабее на» read «1,1»
export const tenths = (m: Milli) => Math.sign(m) * Math.round(Math.abs(m) / 100) / 10;
// the gain on the hero's line of the plan («▲ +6,3 очк.») — and the mark in «Кого переодеть?» (turn.ts)
export const lineGain = (l: Pick<HeroLine, 'before' | 'after'>) => tenths(l.after - l.before);
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
    // the gain stays plain stats (owner Q6): the goal's term is put back
    const plain = (k: ReturnType<typeof keyIn>) => (k ? k.total + (k.goal ?? 0) : 0);
    const goal = w0.gauge(hero)?.goal;
    const ids = (w: World) => Object.values(w.heroes.find((h) => h.id === hero)?.worn ?? {}).filter((x): x is string => !!x);
    return {
      hero, receiver,
      before: plain(k0), after: plain(k1), ptsBefore: k0?.pts ?? 0, ptsAfter: k1?.pts ?? 0,
      critBefore: k0?.crit ?? 0, critAfter: k1?.crit ?? 0,
      ...(goal ? { eff: { a: goal.eff(ids(w0)), b: goal.eff(ids(w1)), res: goal.t - 1, approx: goal.approx } } : {}),
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
