// Дыры в плане (R8, .x/0040-trade/SPEC.md): герои, у которых план забрал надетое, закрываются только свободным —
// запасом героев с известным слотом и вещами, снятыми с получателя. С героев ничего не снимаем.
// Совместный выбор (R8.3): больше закрытых дыр, потом больше значимых бонусов (live), потом рекомендованных, потом
// больше очков; ничья — порядок ростера держателя и старшинство записи (кандидаты перебираются в этом порядке, берётся
// первое лучшее). Перебор точный, по связным частям (дыры связаны общей вещью или общим героем); X3 сверяет с полным.
import type { SlotId } from '../../data/types';
import { skipKey } from './cands';
import type { Plan } from './gate';
import { keyOf } from './kit';
import { SLOT_ORDER, type Cand, type Gauge, type Hero, type World } from './model';

export interface HoleFill {
  hero: string;
  slot: SlotId;
  cand: Cand | null;        // null — нечем закрыть: подсказка keyOfHole (R8.4)
  breaks: string | null;    // сет, значимый бонус которого дыра выключила (для подсказки, R9.2)
}
export interface HolesInput { to: string; plan: Plan; skip?: ReadonlySet<string> }
export interface HolesResult { fills: HoleFill[]; unfilled: SlotId[] } // unfilled — слоты получателя, оставшиеся пустыми (F9)

interface Hole { hero: Hero; g: Gauge; slot: SlotId; cands: Cand[]; base: Partial<Record<SlotId, Cand>>; idx: number }

// включённые значимые бонусы связки (неконвертируемые части): сет → включён
const activeSets = (g: Gauge, slots: Partial<Record<SlotId, Cand>>): Set<string> => {
  const out = new Set<string>();
  for (const p of g.parts) {
    if (p.conv) continue;
    let n = 0, n4 = 0;
    for (const c of Object.values(slots)) if (c?.item.set === p.set) { n++; if (c.item.t4) n4++; }
    if (n >= 2 && g.bonus(p.set, n, n4).top >= p.n) out.add(p.set);
  }
  return out;
};

export function fillHoles(w: World, inp: HolesInput): HolesResult {
  const heroOf = new Map(w.heroes.map((h) => [h.id, h]));
  const taken = new Set(inp.plan.changes.map((c) => c.cand.item.id));
  const recv = heroOf.get(inp.to);
  const takenCodes = new Set([...taken].map((id) => w.items[id].code));
  // свободные вещи этого расчёта: снятое с получателя и его копии взятого (R6.6)
  const freeIds = new Set<string>();
  for (const c of inp.plan.changes) if (c.was) freeIds.add(c.was.item.id);
  for (const id of recv?.pool ?? []) if (!taken.has(id) && takenCodes.has(w.items[id].code)) freeIds.add(id);

  // дыры: слот героя, надетое в котором уходит получателю (получатель вещь берёт сам — своя дыра не нужна)
  const lost = inp.plan.losses.filter((l) => l.holder !== inp.to);
  const holeSlots = new Set(lost.map((l) => `${l.holder}:${l.slot}`));
  const known = (h: Hero, slot: SlotId) => !!h.worn[slot] || holeSlots.has(`${h.id}:${slot}`);

  const holes: Hole[] = [];
  for (const l of lost) {
    const hero = heroOf.get(l.holder), g = hero && w.gauge(hero.id);
    if (!hero || !g) continue;
    const base: Partial<Record<SlotId, Cand>> = {};
    for (const s of SLOT_ORDER) {
      const id = hero.worn[s];
      const val = id && !taken.has(id) ? g.value(id) : null;
      if (id && val && !taken.has(id)) base[s] = { item: w.items[id], ...val, cost: 0, loss: 0, holder: hero.id, rank: hero.rank };
    }
    const mine = new Map<string, number>();
    for (const id of hero.pool) if (!taken.has(id)) mine.set(w.items[id].code, Math.max(mine.get(w.items[id].code) ?? 0, w.items[id].bt ?? 0));
    const cands: Cand[] = [];
    const add = (id: string, holder: Hero | null) => {
      const item = w.items[id];
      if (!item || item.slot !== l.slot || taken.has(id)) return;
      const val = g.value(id);
      if (!val || inp.skip?.has(skipKey(id, hero.id))) return;
      if (holder?.id !== hero.id && mine.has(item.code) && (item.bt ?? 0) <= mine.get(item.code)!) return;
      cands.push({ item, ...val, cost: 2, loss: 0, holder: holder ? holder.id : null, rank: holder ? holder.rank : -1 });
    };
    for (const h of w.heroes) {
      if (!w.gauge(h.id)) continue;
      const worn = new Set(Object.values(h.worn));
      for (const id of h.pool) {
        if (freeIds.has(id)) continue;
        if (!worn.has(id) && known(h, w.items[id]?.slot)) add(id, h);
      }
    }
    for (const id of freeIds) add(id, null);
    cands.sort((a, z) => a.rank - z.rank || a.item.ord - z.item.ord);
    holes.push({ hero, g, slot: l.slot, cands, base, idx: holes.length });
  }
  holes.sort((a, z) => a.hero.rank - z.hero.rank || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(z.slot));
  holes.forEach((h, i) => (h.idx = i));

  const chosen = new Map<number, Cand | null>();
  for (const comp of components(holes)) solve(comp, chosen);

  const fills = holes.map((h): HoleFill => {
    const cand = chosen.get(h.idx) ?? null;
    const before = activeSets(h.g, { ...h.base, ...(cand ? { [h.slot]: cand } : {}) });
    const was = activeSets(h.g, { ...h.base, [h.slot]: lostCand(w, h) });
    return { hero: h.hero.id, slot: h.slot, cand, breaks: [...was].find((s) => !before.has(s)) ?? null };
  });
  const unfilled = SLOT_ORDER.filter((s) => !inp.plan.kit.slots[s]);
  return { fills, unfilled };
}

// вещь героя, которую забрал план (для проверки «дыра выключила бонус»)
function lostCand(w: World, h: Hole): Cand {
  const id = h.hero.worn[h.slot]!;
  return { item: w.items[id], ...h.g.value(id)!, cost: 0, loss: 0, holder: h.hero.id, rank: h.hero.rank };
}

// связные части: дыры с общей вещью-кандидатом или общим героем
function components(holes: Hole[]): Hole[][] {
  const parent = holes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  const byKey = new Map<string, number>();
  holes.forEach((h, i) => {
    const keys = [`h:${h.hero.id}`, ...h.cands.map((c) => `i:${c.item.id}`)];
    for (const k of keys) { const j = byKey.get(k); if (j === undefined) byKey.set(k, i); else join(i, j); }
  });
  const groups = new Map<number, Hole[]>();
  holes.forEach((h, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(h); });
  return [...groups.values()];
}

type Score = [number, number, number, number]; // закрыто, live, rec, очки
const better = (a: Score, z: Score) => { for (let i = 0; i < 4; i++) if (a[i] !== z[i]) return a[i] > z[i]; return false; };

function solve(comp: Hole[], out: Map<number, Cand | null>): void {
  const used = new Set<string>();
  const pick: (Cand | null)[] = comp.map(() => null);
  let best: Score | null = null, bestPick: (Cand | null)[] = pick.slice();
  const heroes = [...new Set(comp.map((h) => h.hero.id))];
  const leaf = (): Score => {
    let closed = 0, live = 0, rec = 0, total = 0;
    for (const id of heroes) {
      const hs = comp.filter((h) => h.hero.id === id);
      const slots = { ...hs[0].base };
      hs.forEach((h) => { const c = pick[comp.indexOf(h)]; if (c) { slots[h.slot] = c; closed++; } });
      const k = keyOf(hs[0].g, slots);
      live += k.live; rec += k.rec; total += k.total;
    }
    return [closed, live, rec, total];
  };
  const walk = (i: number, closedSoFar: number) => {
    if (i === comp.length) {
      const s = leaf();
      if (!best || better(s, best)) { best = s; bestPick = pick.slice(); }
      return;
    }
    if (best && closedSoFar + (comp.length - i) < best[0]) return;
    for (const c of comp[i].cands) {
      if (used.has(c.item.id)) continue;
      used.add(c.item.id); pick[i] = c;
      walk(i + 1, closedSoFar + 1);
      used.delete(c.item.id); pick[i] = null;
    }
    walk(i + 1, closedSoFar);
  };
  walk(0, 0);
  comp.forEach((h, i) => out.set(h.idx, bestPick[i]));
}
