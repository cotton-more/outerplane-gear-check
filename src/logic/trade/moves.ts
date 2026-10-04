// Что игроку сделать в игре (R6.4, R7.2): итог плана против начала, без промежуточных переносов. Шаги расчёта (очередь,
// дыры, обмены пары) могут передать вещь дважды — игроку это не нужно: у каждого героя по слотам — какую вещь надеть,
// каждая вещь один раз. Откуда взять — по ходу выполнения в этом порядке (в Change Gear получателя): надета на другом —
// «у {героя}», лежит запасом — «в инвентаре · запас {героя}», иначе «в инвентаре» (снятая этим же планом, свободная).
// Надеть вещь, надетую на другом, в игре снимает её с него, поэтому у обмена двоих второй берёт свою из инвентаря.
import type { SlotId } from '../../data/types';
import { moveStep, type Placement, type Step } from './apply';
import { SLOT_ORDER, type Hero, type World } from './model';

export type Source = { kind: 'worn'; hero: string } | { kind: 'stock'; hero: string } | { kind: 'inventory' };
export interface Move { hero: string; slot: SlotId; item: string; from: Source }
// emptied — слоты, где было надето, а после плана пусто (дыра без заполнения, слот получателя)
export interface Moves { moves: Move[]; emptied: { hero: string; slot: SlotId }[] }

// мир после шага: тот же перенос, что у «Сделал» (apply moveStep); мерила и вещи — прежние (R2.6: на момент расчёта)
export function advance(w: World, step: Step): World {
  const p: Placement = {
    pools: Object.fromEntries(w.heroes.map((h) => [h.id, [...h.pool]])),
    worn: Object.fromEntries(w.heroes.map((h) => [h.id, { ...h.worn }])),
  };
  moveStep(p, step, (id) => w.items[id]?.code ?? null);
  const old = new Set(w.heroes.map((h) => h.id));
  const heroes: Hero[] = [];
  for (const h of w.heroes) if (p.pools[h.id]?.length) heroes.push({ ...h, pool: p.pools[h.id], worn: p.worn[h.id] ?? {} });
  // получатель без вещей — после шага с вещами: в конец (места в ростере у него не было)
  for (const [id, pool] of Object.entries(p.pools)) {
    if (!old.has(id) && pool.length) heroes.push({ id, rank: w.heroes.length + heroes.length, pinned: false, worn: p.worn[id] ?? {}, pool });
  }
  return { heroes, items: w.items, gauge: w.gauge };
}

// first — получатели в порядке плана; дальше остальные (герои дыр) в порядке ростера
export function movesOf(w0: World, w1: World, first: readonly string[]): Moves {
  const before = new Map(w0.heroes.map((h) => [h.id, h]));
  const after = new Map(w1.heroes.map((h) => [h.id, h]));
  const rest = [...new Set([...w0.heroes, ...w1.heroes].map((h) => h.id))].filter((id) => !first.includes(id));
  rest.sort((a, z) => (before.get(a)?.rank ?? after.get(a)?.rank ?? 0) - (before.get(z)?.rank ?? after.get(z)?.rank ?? 0));
  // кто сейчас носит вещь и чей она нетронутый запас
  const wearer = new Map<string, [string, SlotId]>();
  const stock = new Map<string, string>();
  for (const h of w0.heroes) {
    for (const s of SLOT_ORDER) if (h.worn[s]) wearer.set(h.worn[s]!, [h.id, s]);
    for (const id of h.pool) if (!wearer.has(id)) stock.set(id, h.id);
  }
  const now = new Map(w0.heroes.map((h) => [h.id, { ...h.worn }]));
  const moves: Move[] = [], emptied: Moves['emptied'] = [];
  for (const hero of [...first, ...rest]) {
    const was = before.get(hero)?.worn ?? {}, will = after.get(hero)?.worn ?? {};
    for (const slot of SLOT_ORDER) {
      const item = will[slot];
      if (item === was[slot]) continue;
      if (!item) { emptied.push({ hero, slot }); continue; }
      const on = wearer.get(item);
      const from: Source = on ? { kind: 'worn', hero: on[0] } : stock.has(item) ? { kind: 'stock', hero: stock.get(item)! } : { kind: 'inventory' };
      moves.push({ hero, slot, item, from });
      // в игре: вещь снимается с прежнего носителя, прежняя вещь слота уходит в инвентарь
      if (on) { delete now.get(on[0])?.[on[1]]; }
      const mine = (now.get(hero) ?? now.set(hero, {}).get(hero)!);
      if (mine[slot]) { wearer.delete(mine[slot]!); }
      mine[slot] = item;
      wearer.set(item, [hero, slot]);
      stock.delete(item);
    }
  }
  return { moves, emptied };
}

// инструкция для плана героя
export const heroMoves = (w: World, to: string, step: Step): Moves => movesOf(w, advance(w, step), [to]);
