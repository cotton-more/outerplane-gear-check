// «Сделал» плана героя (R6.6, R8.5, R8.6, R3.2, R4.3–R4.5, R10.6, .x/0040-trade/SPEC.md): одна запись в хранилище.
// Изменения: вещь уходит из пула держателя (была надета — дыра), входит в пул получателя и надевается; свободная — просто
// в пул; снятая остаётся в пуле получателя ненадетой. Копии взятого (тот же код) в пуле получателя уходят из пула — их
// может взять дыра, иначе их больше нет в приложении (leftovers). Заполнения дыр: вещь — из пула держателя (свободная —
// из пула получателя), в пул героя дыры, надета. Закрепление получателя = переключатель плана. План считали на другом
// хранилище — null (пересчитать). «Вернуть» — хранилище до шага, если после шага его не трогали.
import type { SlotId } from '../../data/types';
import { gc, setPinned, type GearStore } from '../gear';
import type { Plan } from './gate';
import type { HoleFill } from './holes';
import { codeOf } from './model';
import type { HeroPlan } from './plan';
import type { TeamPlan } from './team';

export const stampOf = (st: GearStore): string => JSON.stringify(st);

// пулы и надетое — то, что меняет «Сделал»; один и тот же перенос у применения и у расчёта команды (team.ts)
export interface Placement { pools: Record<string, string[]>; worn: Record<string, Partial<Record<SlotId, string>>> }
export interface Step { plans: readonly { to: string; plan: Plan }[]; fills: readonly HoleFill[] }

const takenOf = (plans: readonly { plan: Plan }[]) => new Set(plans.flatMap((p) => p.plan.changes.map((c) => c.cand.item.id)));
// копии взятого в пуле получателя: тот же код, сама вещь не взята никем (R6.6)
function copiesOf(pools: Placement['pools'], code: (id: string) => string | null, plan: Plan, to: string, taken: ReadonlySet<string>): string[] {
  const codes = new Set(plan.changes.map((c) => code(c.cand.item.id)));
  return (pools[to] ?? []).filter((id) => !taken.has(id) && code(id) !== null && codes.has(code(id)));
}

// один шаг: копии взятого уходят из пула получателя; вещь уходит от держателя, входит в пул получателя и надевается
// (снятая остаётся в его пуле); заполнения дыр — из пула держателя (свободная — от получателя), в пул героя дыры, надеть.
// Надетое, которое ушло к другому, на прежнем держателе больше не надето. Меняет p на месте
export function moveStep(p: Placement, step: Step, code: (id: string) => string | null): void {
  const out = (c: string, id: string) => { if (p.pools[c]) p.pools[c] = p.pools[c].filter((x) => x !== id); };
  const put = (c: string, slot: SlotId, id: string) => {
    if (!(p.pools[c] ??= []).includes(id)) p.pools[c].push(id);
    (p.worn[c] ??= {})[slot] = id;
  };
  const taken = takenOf(step.plans);
  const homeOf = new Map<string, string>();
  for (const { to, plan } of step.plans) {
    for (const id of copiesOf(p.pools, code, plan, to, taken)) { out(to, id); homeOf.set(id, to); }
    for (const c of plan.changes) if (c.was) homeOf.set(c.was.item.id, to);
  }
  for (const { to, plan } of step.plans) {
    for (const { slot, cand } of plan.changes) {
      if (cand.holder && cand.holder !== to) out(cand.holder, cand.item.id);
      if (p.worn[to]?.[slot] && p.worn[to][slot] !== cand.item.id) delete p.worn[to][slot];
    }
  }
  for (const { to, plan } of step.plans) for (const { slot, cand } of plan.changes) put(to, slot, cand.item.id);
  for (const f of step.fills) {
    if (!f.cand) continue;
    const from = f.cand.holder ?? homeOf.get(f.cand.item.id);
    if (from) out(from, f.cand.item.id);
    put(f.hero, f.slot, f.cand.item.id);
  }
  for (const [c, w] of Object.entries(p.worn)) for (const [slot, id] of Object.entries(w)) if (id && !p.pools[c]?.includes(id)) delete w[slot as SlotId];
}

// копии, которые после «Сделал» не будут ни в одном пуле: «старый … останется в инвентаре, из приложения уйдёт»
export function leftovers(st: GearStore, hp: HeroPlan, to: string): string[] {
  return leftoversOf(st, { plans: [{ to, plan: hp.plan }], fills: hp.holes.fills })[to];
}
export function leftoversOf(st: GearStore, step: Step): Record<string, string[]> {
  const taken = takenOf(step.plans);
  const filled = new Set(step.fills.map((f) => f.cand?.item.id));
  return Object.fromEntries(step.plans.map(({ to, plan }) => [to, copiesOf(st.pools, codeIn(st), plan, to, taken).filter((id) => !filled.has(id))]));
}

const codeIn = (st: GearStore) => (id: string) => (st.pieces[id] ? codeOf(st.pieces[id]) : null);

export interface Applied { st: GearStore; undo: (x: GearStore) => GearStore | null }

export const applyHero = (st: GearStore, o: { to: string; hp: HeroPlan; pin: boolean; stamp: string }): Applied | null =>
  applyAll(st, [{ plans: [{ to: o.to, plan: o.hp.plan }], fills: o.hp.holes.fills }], { [o.to]: o.pin }, o.stamp);

// команда: шаги по порядку, одно «Сделал» на всех (R7.2); pin — «После обмена не отдавать надетое» по членам
export const applyTeam = (st: GearStore, o: { tp: TeamPlan; pin: Readonly<Record<string, boolean>>; stamp: string }): Applied | null =>
  applyAll(st, o.tp.steps, Object.fromEntries(o.tp.order.map((id) => [id, !!o.pin[id]])), o.stamp);

function applyAll(st: GearStore, steps: readonly Step[], pins: Readonly<Record<string, boolean>>, stamp: string): Applied | null {
  if (stampOf(st) !== stamp) return null;
  const p: Placement = {
    pools: Object.fromEntries(Object.entries(st.pools).map(([c, ids]) => [c, [...ids]])),
    worn: Object.fromEntries(Object.entries(st.worn ?? {}).map(([c, w]) => [c, { ...w }])),
  };
  for (const step of steps) moveStep(p, step, codeIn(st));
  const rest = Object.fromEntries(Object.entries(p.worn).filter(([, w]) => Object.keys(w).length));
  const { worn: _w, ...base } = st;
  let next = gc({ ...base, pools: p.pools, ...(Object.keys(rest).length ? { worn: rest } : {}) });
  for (const [to, pin] of Object.entries(pins)) next = setPinned(next, to, pin);
  const after = stampOf(next);
  return { st: next, undo: (x) => (stampOf(x) === after ? st : null) };
}
