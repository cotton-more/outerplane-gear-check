// Команда из 4 (R7, .x/0040-trade/SPEC.md; решения — DESIGN.md «Этап 5»). Очередь: члены по одному, шаг члена — обычный
// расчёт героя (heroPlan) по его заказу; надетое членов, прошедших шаг, закрыто для следующих (как переодетые в сеансе,
// MODEL.md §7 item 4), надетое тех, чей шаг впереди, — кандидат, даже если они переодеты раньше в этом окне (R3.5). Перебираются все 24 порядка (общие начала считаются один раз). Потом обмены внутри
// четвёрки: пара меняется надетым в нескольких слотах сразу, если никому не хуже, а хотя бы одному лучше по порогу.
// Лучший итог: сумма комплектов членов (ранг, V, заполненность), потом очки героев вне команды, потом выигрыши членов по возрастанию, потом
// первый порядок. Расчёт — генератором (teamSteps): runTeam уступает поток кусками, «Отмена» — без последствий (J7).
import type { SlotId } from '@/game/data/types';
import type { Step } from './apply';
import { skipKey } from './cands';
import { type Plan } from './gate';
import type { HoleFill } from './holes';
import { keyOf } from './kit';
import { cmpUse, gains, SLOT_ORDER, type Cand, type Gauge, type Hero, type Kit, type KitKey, type World } from './model';
import type { Milli } from '@/features/gear/model/vs';
import { advance, movesOf, type Moves } from './moves';
import { heroPlan, partOn, type Missing } from './plan';

export const TEAM_SIZE = 4;

export interface TeamInput { team: readonly string[]; skip?: ReadonlySet<string> }
// шаг плана: член очереди (kind 'hero', с дырами) или обмен пары внутри четвёрки ('swap')
export interface TeamStep extends Step {
  kind: 'hero' | 'swap';
  plans: { to: string; plan: Plan }[];
  fills: HoleFill[];
  unfilled: Record<string, SlotId[]>;
  missing?: Missing[];      // шаг члена: части его заказа, которым не хватает вещей
}
export interface TeamMember { to: string; before: Kit; after: Kit; unfilled: SlotId[]; missing: Missing[] }
// steps — как считалось (для «Сделал»); moves — что игроку надеть: итог против начала, каждая вещь один раз
export interface TeamPlan { order: string[]; steps: TeamStep[]; members: TeamMember[]; moves: Moves }

// ровно 4 разных героя с билдами (R4.1, R2.7)
export const teamOk = (w: World, team: readonly string[]): boolean =>
  team.length === TEAM_SIZE && new Set(team).size === TEAM_SIZE && team.every((id) => !!w.gauge(id));

// ----------------------------------------------------------------------------------------------- мир по ходу расчёта

const locked = (w: World, ids: readonly string[]): World =>
  ids.length ? { ...w, heroes: w.heroes.map((h) => (ids.includes(h.id) && !h.locked ? { ...h, locked: true } : h)) } : w;

// надетое героя как комплект по его мерилу
export function kitIn(w: World, id: string): Kit {
  const g = w.gauge(id)!, h = w.heroes.find((x) => x.id === id);
  const slots: Partial<Record<SlotId, Cand>> = {};
  for (const s of SLOT_ORDER) {
    const iid = h?.worn[s], val = iid ? g.value(iid) : null;
    if (iid && val) slots[s] = { item: w.items[iid], v: val.v, fit: val.fit, cost: 0, loss: 0, holder: id, rank: h!.rank };
  }
  return { slots, key: keyOf(g, slots) };
}

// ----------------------------------------------------------------------------------------------- обмены внутри четвёрки

const USE = (k: KitKey) => [k.rank, k.total, k.filled];
const lex = (a: readonly number[], z: readonly number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) return a[i] - z[i]; return 0; };

type Slots = Partial<Record<SlotId, Cand>>;

// лучший допустимый обмен пары (R7.1): никому не хуже по R2.5, хотя бы одному лучше по порогу; лучший — по сумме пары
function bestSwap(w: World, team: readonly string[], skip?: ReadonlySet<string>): TeamStep | null {
  let best: { score: number[]; step: TeamStep } | null = null;
  const heroOf = new Map(w.heroes.map((h) => [h.id, h]));
  for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
    const hA = heroOf.get(team[i]), hB = heroOf.get(team[j]);
    if (!hA || !hB) continue;                       // без вещей отдать нечего, а другой потерял бы слот
    const gA = w.gauge(hA.id)!, gB = w.gauge(hB.id)!;
    const kA = kitIn(w, hA.id), kB = kitIn(w, hB.id);
    const slots = SLOT_ORDER.filter((s) => hA.worn[s] || hB.worn[s]);
    for (let mask = 1; mask < 1 << slots.length; mask++) {
      const picked = slots.filter((_, b) => mask & (1 << b));
      const sA: Slots = { ...kA.slots }, sB: Slots = { ...kB.slots };
      const chA: Plan['changes'] = [], chB: Plan['changes'] = [];
      let ok = true;
      // вещь id (надета на from в слоте s) — к to
      const give = (id: string | undefined, from: Hero, to: Hero, g: Gauge, s: SlotId, into: Slots, ch: Plan['changes']) => {
        const was = into[s] ?? null;
        delete into[s];
        if (!id) return;
        const val = g.value(id);
        // чужая вещь, надетая тоже, — только годная для получателя (MODEL.md §7 item 2), как у шага (cands)
        if (!val || !val.ok || skip?.has(skipKey(id, to.id))) { ok = false; return; }
        const c: Cand = { item: w.items[id], v: val.v, fit: val.fit, cost: 3, loss: 0, holder: from.id, rank: from.rank };
        into[s] = c;
        ch.push({ slot: s, cand: c, was });
      };
      for (const s of picked) {
        give(hB.worn[s], hB, hA, gA, s, sA, chA);
        give(hA.worn[s], hA, hB, gB, s, sB, chB);
      }
      if (!ok) continue;
      // у получателя уже есть вещь с тем же кодом — нет (R1.2)
      const leaving = new Set(picked.flatMap((s) => [hA.worn[s], hB.worn[s]]).filter((x): x is string => !!x));
      const dup = (h: Hero, ch: Plan['changes']) => ch.some((c) => h.pool.some((id) => !leaving.has(id) && w.items[id]?.code === c.cand.item.code));
      if (dup(hA, chA) || dup(hB, chB)) continue;
      const nA = keyOf(gA, sA), nB = keyOf(gB, sB);
      if (cmpUse(nA, kA.key) < 0 || cmpUse(nB, kB.key) < 0) continue;
      if (!gains(kA.key, nA) && !gains(kB.key, nB)) continue;
      const score = USE(nA).map((x, k) => x - USE(kA.key)[k] + USE(nB)[k] - USE(kB.key)[k]);
      if (best && lex(score, best.score) <= 0) continue;
      const planOf = (key: KitKey, changes: Plan['changes'], into: Slots): Plan => ({ kit: { slots: into, key }, changes, losses: [] });
      best = {
        score,
        step: {
          kind: 'swap', fills: [],
          plans: [{ to: hA.id, plan: planOf(nA, chA, sA) }, { to: hB.id, plan: planOf(nB, chB, sB) }],
          unfilled: { [hA.id]: SLOT_ORDER.filter((s) => !sA[s]), [hB.id]: SLOT_ORDER.filter((s) => !sB[s]) },
        },
      };
    }
  }
  return best?.step ?? null;
}

// ----------------------------------------------------------------------------------------------- очередь и выбор порядка

interface Score { use: number[]; others: Milli; gains: Milli[] }
interface Result { order: string[]; steps: TeamStep[]; w: World; score: Score }

function scoreOf(w: World, team: readonly string[], before: ReadonlyMap<string, Kit>): Score {
  const use = new Array<number>(3).fill(0);
  const g: Milli[] = [];
  for (const id of team) {
    const k = kitIn(w, id);
    USE(k.key).forEach((x, i) => (use[i] += x));
    g.push(k.key.total - before.get(id)!.key.total);
  }
  let others = 0;
  for (const h of w.heroes) if (!team.includes(h.id) && w.gauge(h.id)) others += kitIn(w, h.id).key.total;
  return { use, others, gains: g.sort((a, z) => a - z) };
}
const cmpScore = (a: Score, z: Score) => lex(a.use, z.use) || a.others - z.others || lex(a.gains, z.gains);

export function* teamSteps(w0: World, inp: TeamInput): Generator<void, TeamPlan | null> {
  if (!teamOk(w0, inp.team)) return null;
  const team = inp.team;
  const before = new Map(team.map((id) => [id, kitIn(w0, id)]));
  let best: Result | null = null;
  function* walk(w: World, done: string[], steps: TeamStep[]): Generator<void, void> {
    if (done.length === team.length) {
      let fw = w;
      const all = [...steps];
      for (let n = 0; n < 64; n++) {
        const s = bestSwap(fw, team, inp.skip);
        if (!s) break;
        all.push(s); fw = advance(fw, s);
      }
      const score = scoreOf(fw, team, before);
      if (!best || cmpScore(score, best.score) > 0) best = { order: done, steps: all, w: fw, score };
      yield;
      return;
    }
    for (const m of team) {
      if (done.includes(m)) continue;
      const ahead = team.filter((x) => x !== m && !done.includes(x));
      const hp = heroPlan(locked(w, done), { to: m, skip: inp.skip, open: new Set(ahead) });
      yield;
      const step: TeamStep = { kind: 'hero', plans: [{ to: m, plan: hp.plan }], fills: hp.holes.fills, unfilled: { [m]: hp.holes.unfilled }, missing: hp.missing };
      yield* walk(advance(w, step), [...done, m], [...steps, step]);
    }
  }
  yield* walk(w0, [], []);
  const r: Result = best!;
  const members = team.map((to) => {
    const after = kitIn(r.w, to), g = r.w.gauge(to)!;
    const missing = (r.steps.find((s) => s.kind === 'hero' && s.plans[0].to === to)?.missing ?? []).filter((m) => !partOn(g, after.slots, m.part));
    return { to, before: before.get(to)!, after, unfilled: SLOT_ORDER.filter((s) => !after.slots[s]), missing };
  });
  // шаги без изменений не нужны ни плану, ни «Сделал»
  const steps = r.steps.filter((s) => s.plans.some((p) => p.plan.changes.length));
  return { order: r.order, steps, members, moves: movesOf(w0, r.w, r.order) };
}

const run = <T>(gen: Generator<void, T>): T => { for (;;) { const r = gen.next(); if (r.done) return r.value; } };
export const teamPlan = (w: World, inp: TeamInput): TeamPlan | null => run(teamSteps(w, inp));

// фоновый расчёт кусками: уступает поток между кусками; signal.abort() — null, без последствий
export function runChunks<T>(gen: Generator<void, T>, signal?: AbortSignal, slice = 8): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const step = () => {
      if (signal?.aborted) { resolve(null); return; }
      try {
        const t0 = performance.now();
        for (;;) {
          const r = gen.next();
          if (r.done) { resolve(r.value); return; }
          if (performance.now() - t0 >= slice) break;
        }
        setTimeout(step, 0);
      } catch (e) { reject(e); }
    };
    setTimeout(step, 0);
  });
}
export const runTeam = (w: World, inp: TeamInput, signal?: AbortSignal, slice = 8): Promise<TeamPlan | null> =>
  runChunks(teamSteps(w, inp), signal, slice);
