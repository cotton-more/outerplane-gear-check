// «Обмен вещами», дыры в плане (R8): .x/0040-trade/TESTS.md, раздел F (кроме F8 — применение, этап 4) и X3.
import { describe, expect, it } from 'vitest';
import type { SlotId } from '../src/data/types';
import { skipKey } from '../src/logic/trade/cands';
import type { Plan } from '../src/logic/trade/gate';
import { fillHoles } from '../src/logic/trade/holes';
import { keyOf } from '../src/logic/trade/kit';
import type { Cand, World } from '../src/logic/trade/model';
import { heroPlan } from '../src/logic/trade/plan';
import { lcg, synthWorld } from './trade.helpers';

const fillOf = (w: World, to: string, hero: string, slot: SlotId, skip?: Set<string>) =>
  heroPlan(w, { to, skip }).holes.fills.find((f) => f.hero === hero && f.slot === slot)!;

// Рин (R) забирает у Майи (M) вещь слота; снятая с Рин вещь свободна и может закрыть дыру Майи
const swap = (slot: SlotId, mv: Record<string, number | null> = {}) => synthWorld({
  items: { r1: { slot }, m1: { slot } },
  heroes: { R: { worn: { [slot]: 'r1' }, value: { r1: 5, m1: 9 } }, M: { worn: { [slot]: 'm1' }, value: { r1: 6, m1: 8, ...mv } } },
});

describe('F. дыры', () => {
  it('F1: Рин забирает перчатки Майи — Майе перчатки, снятые с Рин', () => {
    const f = fillOf(swap('gloves'), 'R', 'M', 'gloves');
    expect(f.cand?.item.id).toBe('r1');
  });
  it('F2: Рин забирает меч Карен — дыру закрывает меч, снятый с Рин', () => {
    const w = swap('weapon');
    const { plan, holes } = heroPlan(w, { to: 'R' });
    expect(plan.changes.map((c) => c.cand.item.id)).toEqual(['m1']);
    expect(holes.fills[0]).toMatchObject({ hero: 'M', slot: 'weapon', cand: { item: { id: 'r1' } } });
  });
  it('F3: лучшая вещь для дыры надета на другом — не берётся, берётся лучшая из свободного', () => {
    const w = synthWorld({
      items: { r1: { slot: 'gloves' }, m1: { slot: 'gloves' }, l1: { slot: 'gloves' } },
      heroes: {
        R: { worn: { gloves: 'r1' }, value: { r1: 5, m1: 9, l1: null } },
        M: { worn: { gloves: 'm1' }, value: { r1: 6, m1: 8, l1: 10 } },
        L: { worn: { gloves: 'l1' }, value: { l1: 10 } },
      },
    });
    expect(fillOf(w, 'R', 'M', 'gloves').cand?.item.id).toBe('r1');
  });
  it('F5: вещь без полезных сабстатов (0 очк.) всё равно закрывает дыру', () => {
    expect(fillOf(swap('gloves', { r1: 0 }), 'R', 'M', 'gloves').cand?.item.id).toBe('r1');
  });
  it('F6: кандидата нет — cand null (подсказка R9.2), K3', () => {
    expect(fillOf(swap('gloves', { r1: null }), 'R', 'M', 'gloves').cand).toBeNull();
  });
  it('F7: «Не брать» у заполнения — подсказка', () => {
    expect(fillOf(swap('gloves'), 'R', 'M', 'gloves', new Set([skipKey('r1', 'M')])).cand).toBeNull();
  });
  it('F9: слот получателя после плана пуст — он в unfilled', () => {
    const { holes } = heroPlan(swap('gloves'), { to: 'R' });
    expect(holes.unfilled).toContain('weapon');
    expect(holes.unfilled).not.toContain('gloves');
  });
  it('F10: у Майи две дыры (перчатки, сапоги), по вещи на каждую — закрыты обе', () => {
    const w = synthWorld({
      items: { rg: { slot: 'gloves' }, rs: { slot: 'shoes' }, mg: { slot: 'gloves' }, ms: { slot: 'shoes' } },
      heroes: {
        R: { worn: { gloves: 'rg', shoes: 'rs' }, value: { rg: 5, rs: 5, mg: 9, ms: 9 } },
        M: { worn: { gloves: 'mg', shoes: 'ms' }, value: { rg: 6, rs: 6, mg: 8, ms: 8 } },
      },
    });
    const { fills } = heroPlan(w, { to: 'R' }).holes;
    expect(fills.map((f) => f.cand?.item.id).sort()).toEqual(['rg', 'rs']);
  });
  it('F11: две вещи с равным ростом — берётся та, что у держателя раньше в ростере; расчёт повторяем', () => {
    const w = synthWorld({
      items: { r1: { slot: 'gloves' }, m1: { slot: 'gloves' }, x1: { slot: 'gloves' }, y1: { slot: 'gloves' }, xw: { slot: 'gloves' }, yw: { slot: 'gloves' } },
      heroes: {
        R: { worn: { gloves: 'r1' }, value: { r1: 5, m1: 9 } },
        M: { worn: { gloves: 'm1' }, value: { m1: 8, x1: 7, y1: 7 } },
        X: { worn: { gloves: 'xw' }, pool: ['x1'], value: {} },
        Y: { worn: { gloves: 'yw' }, pool: ['y1'], value: {} },
      },
    });
    const a = fillOf(w, 'R', 'M', 'gloves').cand?.item.id;
    expect(a).toBe('x1');
    expect(fillOf(w, 'R', 'M', 'gloves').cand?.item.id).toBe(a);
  });
  describe('F12: кандидат дыры не проходит R5.5', () => {
    it('чужой класс (null) и «Не брать» — не берутся', () => {
      expect(fillOf(swap('gloves', { r1: null }), 'R', 'M', 'gloves').cand).toBeNull();
      expect(fillOf(swap('gloves'), 'R', 'M', 'gloves', new Set([skipKey('r1', 'M')])).cand).toBeNull();
    });
    it('код уже есть у героя дыры — не берётся', () => {
      const w = synthWorld({
        items: { r1: { slot: 'gloves', code: 'same' }, m1: { slot: 'gloves' }, m2: { slot: 'gloves', code: 'same' } },
        heroes: { R: { worn: { gloves: 'r1' }, value: { r1: 5, m1: 9 } }, M: { worn: { gloves: 'm1' }, pool: ['m2'], value: { r1: 6, m1: 8, m2: 1 } } },
      });
      expect(fillOf(w, 'R', 'M', 'gloves').cand?.item.id).toBe('m2'); // свой запас, а не копия r1
    });
  });
  it('F13: оружие — рекомендованная A (+1) выбирается раньше «на время» B (+5)', () => {
    const w = synthWorld({
      items: { r1: { slot: 'weapon' }, m1: { slot: 'weapon' }, a: { slot: 'weapon' }, b: { slot: 'weapon' }, lw: { slot: 'weapon' } },
      heroes: {
        R: { worn: { weapon: 'r1' }, value: { r1: 5, m1: 9 } },
        M: { worn: { weapon: 'm1' }, value: { m1: 8, a: { v: 1, fit: 'rec' }, b: { v: 5, fit: 'stopgap' } } },
        L: { worn: { weapon: 'lw' }, pool: ['a', 'b'], value: {} },
      },
    });
    // r1 Майя носить не может — выбор между A и B
    expect(fillOf(w, 'R', 'M', 'weapon').cand?.item.id).toBe('a');
  });
});

// ручной план: слоты, которые забирают у героев (holder:slot → вещь)
const manual = (w: World, taken: [string, SlotId, string][]): Plan => ({
  kit: { slots: {}, key: null as never },
  changes: taken.map(([holder, slot, id]) => ({ slot, was: null, cand: { item: w.items[id], v: 0, fit: 'no' as const, cost: 3 as const, loss: 0, holder, rank: 0 } })),
  losses: taken.map(([holder, slot]) => ({ holder, slot, loss: 0 })),
});

describe('F4: совместный выбор заполнений (R8.3)', () => {
  const world = (nv: number) => synthWorld({
    items: { mw: { slot: 'weapon' }, nw: { slot: 'weapon' }, lw: { slot: 'weapon' }, A: { slot: 'weapon' }, B: { slot: 'weapon' } },
    heroes: {
      M: { worn: { weapon: 'mw' }, value: { A: 10, B: 9 } },
      N: { worn: { weapon: 'nw' }, value: { A: nv } },
      L: { worn: { weapon: 'lw' }, pool: ['A', 'B'], value: {} },
    },
  });
  const run = (w: World) => Object.fromEntries(fillHoles(w, { to: 'Q', plan: manual(w, [['M', 'weapon', 'mw'], ['N', 'weapon', 'nw']]) }).fills.map((f) => [f.hero, f.cand?.item.id ?? null]));
  it('дыра 1: A (+10) или B (+9), дыра 2 — только A (+10) → дыра 2 получает A, дыра 1 — B', () => {
    expect(run(world(10))).toEqual({ M: 'B', N: 'A' });
  });
  it('две дыры и одна вещь → закрывается та, где рост больше', () => {
    const w = synthWorld({
      items: { mw: { slot: 'weapon' }, nw: { slot: 'weapon' }, lw: { slot: 'weapon' }, A: { slot: 'weapon' } },
      heroes: { M: { worn: { weapon: 'mw' }, value: { A: 10 } }, N: { worn: { weapon: 'nw' }, value: { A: 7 } }, L: { worn: { weapon: 'lw' }, pool: ['A'], value: {} } },
    });
    expect(run(w)).toEqual({ M: 'A', N: null });
  });
});

describe('X3: совместный выбор == полный перебор (случайные малые данные)', () => {
  it('50 случайных миров: закрыто, live, rec, очки равны лучшему из перебора', () => {
    const rnd = lcg(33);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    for (let n = 0; n < 50; n++) {
      const items: Parameters<typeof synthWorld>[0]['items'] = { dh: { slot: 'helmet' }, da: { slot: 'armor' } };
      const heroes: Parameters<typeof synthWorld>[0]['heroes'] = {};
      const stock: string[] = [];
      const taken: [string, SlotId, string][] = [];
      const nItems = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < nItems; i++) { items[`s${i}`] = { slot: pick<SlotId>(['helmet', 'armor']), set: pick(['A', 'B', undefined as unknown as string]) }; stock.push(`s${i}`); }
      const nHeroes = 1 + Math.floor(rnd() * 3);
      for (let h = 0; h < nHeroes; h++) {
        const id = `H${h}`, worn: Partial<Record<SlotId, string>> = {}, value: Record<string, number | null> = {};
        for (const slot of ['helmet', 'armor'] as const) if (rnd() < 0.7) { items[`${id}${slot}`] = { slot }; worn[slot] = `${id}${slot}`; taken.push([id, slot, `${id}${slot}`]); }
        for (const s of stock) value[s] = rnd() < 0.15 ? null : Math.floor(rnd() * 10);
        heroes[id] = { worn, value, parts: [{ set: 'A', n: 2, conv: false }], bonus: { A: { 2: 3 } } };
      }
      heroes.D = { worn: { helmet: 'dh', armor: 'da' }, pool: stock, value: {} };
      const w = synthWorld({ items, heroes });
      const plan = manual(w, taken);
      const res = fillHoles(w, { to: 'Q', plan });
      const score = (assign: Map<string, Cand | null>): number[] => {
        let closed = 0, live = 0, rec = 0, total = 0;
        for (const h of w.heroes.filter((x) => x.id.startsWith('H'))) {
          const slots: Partial<Record<SlotId, Cand>> = {};
          for (const slot of ['helmet', 'armor'] as const) {
            const c = assign.get(`${h.id}:${slot}`);
            if (c) { slots[slot] = c; closed++; }
          }
          const k = keyOf(w.gauge(h.id)!, slots);
          live += k.live; rec += k.rec; total += k.total;
        }
        return [closed, live, rec, total];
      };
      const candOf = (id: string, hero: string): Cand | null => {
        const v = w.gauge(hero)!.value(id);
        return v ? { item: w.items[id], ...v, cost: 2, loss: 0, holder: 'D', rank: 9 } : null;
      };
      const holes = taken.map(([h, slot]) => `${h}:${slot}`);
      let best: number[] | null = null;
      const walk = (i: number, assign: Map<string, Cand | null>, used: Set<string>) => {
        if (i === holes.length) {
          const s = score(assign);
          if (!best || s.some((x, j) => x !== best![j] && (s.slice(0, j).every((y, k) => y === best![k])) && x > best![j])) best = s;
          return;
        }
        const [h, slot] = holes[i].split(':');
        for (const id of stock) {
          const c = used.has(id) || w.items[id].slot !== slot ? null : candOf(id, h);
          if (!c) continue;
          assign.set(holes[i], c); used.add(id);
          walk(i + 1, assign, used);
          assign.delete(holes[i]); used.delete(id);
        }
        walk(i + 1, assign, used);
      };
      walk(0, new Map(), new Set());
      const got = score(new Map(res.fills.filter((f) => f.cand).map((f) => [`${f.hero}:${f.slot}`, f.cand])));
      expect(got, `мир ${n}`).toEqual(best);
    }
  });
});
