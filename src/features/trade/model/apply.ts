// «Сделал» (MODEL.md §7 item 9; R6.6, R3.2, R4.3–R4.5): one record for the whole walk — the plan's moves, then the
// replacements, the parking and the pieces entered for empty slots (HISTORY.md 0200-boss E2b Q2–Q7). A move: the piece leaves its
// holder's pool (was worn — his slot empties), enters the receiver's pool and is worn; the receiver's old piece stays in his
// pool unworn — then the end decides it: a replacement moves it to the giver and wears it there, parking marks it parked.
// Copies of a taken piece (same code) in the receiver's pool leave the app (leftovers). An entered piece is a new record,
// worn in its slot. Counted on another store — null (count again). «Вернуть» — the store before, if nobody touched it since.
import type { SlotId } from '@/game/data/types';
import type { ItemInput } from '@/game/item/item';
import { gc, newPiece, parkIn, today, type GearStore } from '@/features/gear/model/gear';
import type { Ends } from './ends';
import type { Plan } from './gate';
import { codeOf } from './model';
import type { HeroPlan } from './plan';

const canon = (x: unknown): unknown => (Array.isArray(x) ? x.map(canon)
  : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon((x as Record<string, unknown>)[k])])) : x);
export const stampOf = (st: GearStore): string => JSON.stringify(canon(st));

// пулы и надетое — то, что меняет «Сделал»; один и тот же перенос у применения и у расчёта команды (team.ts)
export interface Placement { pools: Record<string, string[]>; worn: Record<string, Partial<Record<SlotId, string>>> }
export interface Step { plans: readonly { to: string; plan: Plan }[] }

const takenOf = (plans: readonly { plan: Plan }[]) => new Set(plans.flatMap((p) => p.plan.changes.map((c) => c.cand.item.id)));
// копии взятого в пуле получателя: тот же код, сама вещь не взята никем (R6.6)
function copiesOf(pools: Placement['pools'], code: (id: string) => string | null, plan: Plan, to: string, taken: ReadonlySet<string>): string[] {
  const codes = new Set(plan.changes.map((c) => code(c.cand.item.id)));
  return (pools[to] ?? []).filter((id) => !taken.has(id) && code(id) !== null && codes.has(code(id)));
}

// один шаг: копии взятого уходят из пула получателя; вещь уходит от держателя, входит в пул получателя и надевается
// (снятая остаётся в его пуле); у отдавшего слот пустеет.
// Надетое, которое ушло к другому, на прежнем держателе больше не надето. Меняет p на месте
export function moveStep(p: Placement, step: Step, code: (id: string) => string | null): void {
  const out = (c: string, id: string) => { if (p.pools[c]) p.pools[c] = p.pools[c].filter((x) => x !== id); };
  const put = (c: string, slot: SlotId, id: string) => {
    if (!(p.pools[c] ??= []).includes(id)) p.pools[c].push(id);
    (p.worn[c] ??= {})[slot] = id;
  };
  const taken = takenOf(step.plans);
  for (const { to, plan } of step.plans) {
    for (const id of copiesOf(p.pools, code, plan, to, taken)) out(to, id);
  }
  for (const { to, plan } of step.plans) {
    for (const { slot, cand } of plan.changes) {
      if (cand.holder && cand.holder !== to) out(cand.holder, cand.item.id);
      if (p.worn[to]?.[slot] && p.worn[to][slot] !== cand.item.id) delete p.worn[to][slot];
    }
  }
  for (const { to, plan } of step.plans) for (const { slot, cand } of plan.changes) put(to, slot, cand.item.id);
  for (const [c, w] of Object.entries(p.worn)) for (const [slot, id] of Object.entries(w)) if (id && !p.pools[c]?.includes(id)) delete w[slot as SlotId];
}

// копии, которые после «Сделал» не будут ни в одном пуле: «старый … останется в инвентаре, из приложения уйдёт»
export function leftovers(st: GearStore, hp: HeroPlan, to: string): string[] {
  return leftoversOf(st, { plans: [{ to, plan: hp.plan }] })[to];
}
export function leftoversOf(st: GearStore, step: Step): Record<string, string[]> {
  const taken = takenOf(step.plans);
  return Object.fromEntries(step.plans.map(({ to, plan }) => [to, copiesOf(st.pools, codeIn(st), plan, to, taken)]));
}

const codeIn = (st: GearStore) => (id: string) => (st.pieces[id] ? codeOf(st.pieces[id]) : null);

export interface Applied { st: GearStore; undo: (x: GearStore) => GearStore | null }
// what «Сделал» records: the plan's steps, the end (replacements kept as they were are not done — their pieces park), the
// pieces entered for empty slots
export interface Entered { hero: string; slot: SlotId; input: ItemInput }
export interface TradeRecord { steps: readonly Step[]; ends: Ends; entered: readonly Entered[] }

export function applyWalk(st: GearStore, r: TradeRecord, stamp: string, at = today()): Applied | null {
  if (stampOf(st) !== stamp) return null;
  const p: Placement = {
    pools: Object.fromEntries(Object.entries(st.pools).map(([c, ids]) => [c, [...ids]])),
    worn: Object.fromEntries(Object.entries(st.worn ?? {}).map(([c, w]) => [c, { ...w }])),
  };
  for (const step of r.steps) moveStep(p, step, codeIn(st));
  for (const x of r.ends.repl) {
    if (x.kept) continue;
    p.pools[x.from] = (p.pools[x.from] ?? []).filter((id) => id !== x.item);
    if (!(p.pools[x.to] ??= []).includes(x.item)) p.pools[x.to].push(x.item);
    (p.worn[x.to] ??= {})[x.slot] = x.item;
  }
  const rest = Object.fromEntries(Object.entries(p.worn).filter(([, w]) => Object.keys(w).length));
  const { worn: _w, ...base } = st;
  let next = gc({ ...base, pools: p.pools, ...(Object.keys(rest).length ? { worn: rest } : {}) });
  for (const e of r.entered) {
    const made = newPiece(next, { ...e.input, slot: e.slot }, at);
    next = gc({
      ...made.st, pools: { ...made.st.pools, [e.hero]: [...(made.st.pools[e.hero] ?? []), made.piece.id] },
      worn: { ...made.st.worn, [e.hero]: { ...made.st.worn?.[e.hero], [e.slot]: made.piece.id } },
    });
  }
  next = parkIn(next, r.ends.park.map((x) => x.item));
  const after = stampOf(next);
  // nothing moved («Менять нечего» — «Ок») — the same store: no record, no toast, no session lock
  if (after === stampOf(st)) return { st, undo: () => null };
  return { st: next, undo: (x) => (stampOf(x) === after ? st : null) };
}
