// «Обмен вещами», этап 5: командный обмен (R7.1–R7.3; MODEL.md §10): H1–H5, H7, H8, H10–H17, J7; у каждого
// свой заказ — stat-sets TESTS T7.6. H6, H9 (применение) — в тестах применения; H10 — отдельно.
import { describe, expect, it } from 'vitest';
import { moveStep } from '@/features/trade/model/apply';
import { skipKey } from '@/features/trade/model/cands';
import { keyOf } from '@/features/trade/model/kit';
import { heroPlan } from '@/features/trade/model/plan';
import type { Cand, World } from '@/features/trade/model/model';
import { runTeam, teamOk, teamPlan, type TeamPlan } from '@/features/trade/model/team';
import { synthWorld, type SynthHero } from './helpers';

type Items = Parameters<typeof synthWorld>[0]['items'];

// мир: данные героев + три «пустых» героя E1–E3 (мерило без вещей, ничего не надето) для добора команды до четырёх
const mk = (items: Items, heroes: Record<string, SynthHero>): World =>
  synthWorld({ items, heroes: { ...heroes, E1: { value: {} }, E2: { value: {} }, E3: { value: {} } } });
const team = (...members: string[]): string[] => [...members, 'E1', 'E2', 'E3'].slice(0, 4);

const member = (tp: TeamPlan, id: string) => tp.members.find((m) => m.to === id)!;
// изменения члена по всем шагам
const changes = (tp: TeamPlan, id: string) => tp.steps.flatMap((s) => s.plans.filter((p) => p.to === id).flatMap((p) => p.plan.changes));
// итоговый комплект члена: слот → вещь
const kitOf = (tp: TeamPlan, id: string) =>
  Object.fromEntries((Object.entries(member(tp, id).after.slots) as [string, Cand][]).map(([s, c]) => [s, c.item.id]));
// что член получил: слоты, где итог отличается от надетого до обмена
const got = (tp: TeamPlan, id: string) => {
  const was = member(tp, id).before.slots;
  return Object.fromEntries(Object.entries(kitOf(tp, id)).filter(([s, x]) => was[s as keyof typeof was]?.item.id !== x));
};
const run = (w: World, members: string[], extra: { skip?: ReadonlySet<string> } = {}): TeamPlan => {
  const tp = teamPlan(w, { team: team(...members), ...extra });
  expect(tp).not.toBeNull();
  return tp!;
};

describe('H. команда', () => {
  const h1World = () => mk({ good: { slot: 'weapon' }, spare: { slot: 'weapon' } }, {
    R: { value: { good: 10, spare: 9 } },
    K: { value: { good: 12, spare: 2 } },
    O1: { worn: { weapon: 'good' } },
    O2: { worn: { weapon: 'spare' } },
  });
  it('H1: хороший меч Рин +10 / Карен +12, запасной Рин +9 / Карен +2 → Карен — хороший, Рин — запасной', () => {
    const w = h1World();
    const tp = run(w, ['R', 'K']);
    expect(got(tp, 'K')).toEqual({ weapon: 'good' });
    expect(got(tp, 'R')).toEqual({ weapon: 'spare' });
  });

  const swapWorld = (locked: boolean) => mk({ ha: { slot: 'helmet' }, wb: { slot: 'weapon' } }, {
    A: { worn: { helmet: 'ha' }, locked, value: { ha: 0, wb: 10 } },
    B: { worn: { weapon: 'wb' }, locked, value: { wb: 0, ha: 10 } },
  });

  it('H2: A первым берёт оружие B; B после этого шлем A не берёт (надетое прошедшего шаг закрыто)', () => {
    const tp = run(swapWorld(false), ['A', 'B']);
    expect(got(tp, 'A')).toEqual({ weapon: 'wb' });
    expect(got(tp, 'B')).toEqual({});
    expect(tp.order.slice(0, 2)).toEqual(['A', 'B']); // равные исходы — первый порядок по составу
  });

  it('H3: равные суммы 10 + 0 и 5 + 5 → выбран 5 + 5; повторный расчёт — тот же план', () => {
    const w = mk({ x: { slot: 'weapon' }, y: { slot: 'weapon' } }, {
      A: { value: { x: 10, y: 5 } },
      B: { value: { x: 5, y: 0 } },
      O1: { worn: { weapon: 'x' } },
      O2: { worn: { weapon: 'y' } },
    });
    const tp = run(w, ['A', 'B']);
    expect(got(tp, 'A')).toEqual({ weapon: 'y' });
    expect(got(tp, 'B')).toEqual({ weapon: 'x' });
    expect(run(w, ['A', 'B'])).toEqual(tp);
  });

  it('H4: член впереди по очереди берёт надетое члена, переодетого раньше в этом окне', () => {
    const tp = run(swapWorld(true), ['A', 'B']);
    expect(got(tp, 'A')).toEqual({ weapon: 'wb' });
  });

  // Ноа (N) и Дельта (D): перчатки N и шлем D лучше; gdForN — очки старых перчаток Дельты для Ноа (null — не носит)
  const k2 = (gdForN: number | null) => mk(
    { gN: { slot: 'gloves' }, hN: { slot: 'helmet' }, gD: { slot: 'gloves' }, hD: { slot: 'helmet' } },
    {
      N: { worn: { gloves: 'gN', helmet: 'hN' }, value: { gN: 5, hN: 5, hD: 8, gD: gdForN } },
      D: { worn: { gloves: 'gD', helmet: 'hD' }, value: { gD: 5, hD: 5, gN: 20, hN: 5 } },
    },
  );

  it('H5: Ноа и Дельта меняются перчатками и шлемом; опустевший слот Ноа порога не имеет', () => {
    const tp = run(k2(3), ['N', 'D']);
    expect(kitOf(tp, 'N')).toEqual({ helmet: 'hD', gloves: 'gD' });
    expect(kitOf(tp, 'D')).toEqual({ gloves: 'gN', helmet: 'hN' });
  });

  it('H18: инструкция K2 — у каждого по слотам, каждая вещь один раз; у обмена двоих второй берёт из инвентаря', () => {
    const tp = run(k2(3), ['N', 'D']);
    expect(tp.moves.moves).toEqual([
      { hero: 'D', slot: 'helmet', item: 'hN', from: { kind: 'worn', hero: 'N' } },
      { hero: 'D', slot: 'gloves', item: 'gN', from: { kind: 'worn', hero: 'N' } },
      { hero: 'N', slot: 'helmet', item: 'hD', from: { kind: 'inventory' } },
      { hero: 'N', slot: 'gloves', item: 'gD', from: { kind: 'inventory' } },
    ]);
    expect(tp.moves.emptied).toEqual([]);
  });

  it('H5: старые перчатки Дельты Ноа носить не может → слот перчаток Ноа пуст, обмен остаётся', () => {
    const tp = run(k2(null), ['N', 'D']);
    expect(kitOf(tp, 'N')).toEqual({ helmet: 'hD' });
    expect(kitOf(tp, 'D')).toEqual({ gloves: 'gN', helmet: 'hN' });
  });

  it('H7: «Не брать» у члена пересчитывает весь план', () => {
    const w = mk({ w: { slot: 'weapon' } }, {
      R: { value: { w: 10 } },
      K: { value: { w: 5 } },
      O: { worn: { weapon: 'w' } },
    });
    expect(got(run(w, ['R', 'K']), 'R')).toEqual({ weapon: 'w' });
    const tp = run(w, ['R', 'K'], { skip: new Set([skipKey('w', 'R')]) });
    expect(got(tp, 'R')).toEqual({});
    expect(got(tp, 'K')).toEqual({ weapon: 'w' });
  });

  describe('H8: состав команды', () => {
    const w = mk({}, { R: { value: {} }, K: { value: {} } });
    it('четыре разных героя с мерилом — можно', () => {
      expect(teamOk(w, ['R', 'K', 'E1', 'E2'])).toBe(true);
    });
    it('трое и пятеро — нельзя', () => {
      expect(teamOk(w, ['R', 'K', 'E1'])).toBe(false);
      expect(teamOk(w, ['R', 'K', 'E1', 'E2', 'E3'])).toBe(false);
    });
    it('повтор героя — нельзя', () => {
      expect(teamOk(w, ['R', 'K', 'R', 'E1'])).toBe(false);
    });
    it('герой без билдов (нет мерила) в команду не входит; плана нет', () => {
      const noBuilds: World = { ...w, gauge: (id) => (id === 'K' ? null : w.gauge(id)) };
      expect(teamOk(noBuilds, ['R', 'K', 'E1', 'E2'])).toBe(false);
      expect(teamPlan(noBuilds, { team: ['R', 'K', 'E1', 'E2'] })).toBeNull();
    });
  });

  describe('H11: порог в команде и дешёвая альтернатива', () => {
    const world = (s: number) => mk({ r: { slot: 'weapon' }, s: { slot: 'weapon' }, x: { slot: 'weapon' } }, {
      R: { worn: { weapon: 'r' }, pool: ['s'], value: { r: 5, s, x: 7 } },
      O: { worn: { weapon: 'x' } },
    });
    it('дешёвая хуже на 0,5 и проходит порог против надетого → берётся дешёвая', () => {
      expect(got(run(world(6.5), ['R']), 'R')).toEqual({ weapon: 's' });
    });
    it('дешёвая хуже на 1,5 → берётся дорогая', () => {
      expect(got(run(world(5.5), ['R']), 'R')).toEqual({ weapon: 'x' });
    });
  });

  describe('H10: выбран лучший из 24 порядков', () => {
    // очередь без обменов внутри четвёрки, посчитанная цепочкой обычных расчётов героя
    const chain = (w0: World, order: string[]): number[] => {
      let w = w0;
      for (let i = 0; i < order.length; i++) {
        const done = order.slice(0, i), ahead = order.slice(i + 1);
        const lockedW = { ...w, heroes: w.heroes.map((h) => (done.includes(h.id) ? { ...h, locked: true } : h)) };
        const hp = heroPlan(lockedW, { to: order[i], open: new Set(ahead) });
        const p = { pools: Object.fromEntries(w.heroes.map((h) => [h.id, [...h.pool]])), worn: Object.fromEntries(w.heroes.map((h) => [h.id, { ...h.worn }])) };
        moveStep(p, { plans: [{ to: order[i], plan: hp.plan }], fills: hp.holes.fills }, (id) => w.items[id]?.code ?? null);
        const ids = new Set([...w.heroes.map((h) => h.id), ...Object.keys(p.pools)]);
        w = { ...w, heroes: [...ids].filter((id) => p.pools[id]?.length).map((id, rank) => ({ ...(w.heroes.find((h) => h.id === id) ?? { id, rank, locked: false }), pool: p.pools[id], worn: p.worn[id] ?? {} })) };
      }
      const use = [0, 0, 0];
      for (const id of order) {
        const g = w.gauge(id)!, h = w.heroes.find((x) => x.id === id);
        const slots = Object.fromEntries(Object.entries(h?.worn ?? {}).filter(([, iid]) => iid && g.value(iid!)).map(([s, iid]) => [s, { item: w.items[iid!], v: g.value(iid!)!.v, fit: g.value(iid!)!.fit, cost: 0 as const, loss: 0, holder: id, rank: 0 }]));
        const k = keyOf(g, slots);
        [k.rank, k.total, k.filled].forEach((x, i) => (use[i] += x));
      }
      return use;
    };
    const perms = (xs: string[]): string[][] => (xs.length < 2 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const lexGe = (a: number[], z: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) return a[i] > z[i]; return true; };
    for (const [name, w, members] of [['H1', h1World(), ['R', 'K']], ['H5', k2(3), ['N', 'D']], ['H5 без перчаток', k2(null), ['N', 'D']]] as const) {
      it(`итог не хуже любой очереди: ${name}`, () => {
        const t = team(...members);
        const tp = run(w, [...members]);
        const mine = tp.members.reduce((u, m) => { const k = m.after.key; [k.rank, k.total, k.filled].forEach((x, i) => (u[i] += x)); return u; }, [0, 0, 0]);
        for (const order of perms(t)) expect(lexGe(mine, chain(w, order)), order.join(',')).toBe(true);
      });
    }
  });

  describe('H12: обмен вещами одного слота', () => {
    const world = (gain: number) => mk({ a: { slot: 'weapon' }, b: { slot: 'weapon' } }, {
      N: { worn: { weapon: 'a' }, value: { a: 5, b: 5 + gain } },
      D: { worn: { weapon: 'b' }, value: { b: 5, a: 5 + gain } },
    });
    it('каждому по +0,5 → обмена нет', () => {
      const tp = run(world(0.5), ['N', 'D']);
      expect(got(tp, 'N')).toEqual({});
      expect(got(tp, 'D')).toEqual({});
    });
    it('каждому по +1,0 → обмен есть', () => {
      const tp = run(world(1), ['N', 'D']);
      expect(got(tp, 'N')).toEqual({ weapon: 'b' });
      expect(got(tp, 'D')).toEqual({ weapon: 'a' });
    });
  });

  describe('H13: равная польза — дешёвый источник, потом меньшая потеря', () => {
    it('надета на Карен вне команды и такая же в запасе другого героя → из запаса (cost 2)', () => {
      const w = mk({ i1: { slot: 'weapon' }, i2: { slot: 'weapon' }, mw: { slot: 'weapon' } }, {
        R: { value: { i1: 7, i2: 7 } },
        K: { worn: { weapon: 'i1' }, value: { i1: 5 } },
        M: { worn: { weapon: 'mw' }, pool: ['i2'], value: { mw: 5 } },
      });
      const c = changes(run(w, ['R']), 'R')[0].cand;
      expect(c.item.id).toBe('i2');
      expect(c.cost).toBe(2);
    });
    it('обе надеты на других (цены равны) → отдаёт тот, кто теряет меньше', () => {
      const w = mk({ k1: { slot: 'weapon' }, l1: { slot: 'weapon' } }, {
        R: { value: { k1: 7, l1: 7 } },
        K: { worn: { weapon: 'k1' }, value: { k1: 5 } },
        L: { worn: { weapon: 'l1' }, value: { l1: 2 } },
      });
      expect(got(run(w, ['R']), 'R')).toEqual({ weapon: 'l1' });
    });
  });

  it('H14: член берёт вещь у героя вне команды и из запаса по тому же порогу; переодетого в этом окне не трогает', () => {
    const w = mk(
      {
        r: { slot: 'weapon' }, wO: { slot: 'weapon' }, rh: { slot: 'helmet' }, mh: { slot: 'helmet' }, hM: { slot: 'helmet' },
        rg: { slot: 'gloves' }, qg: { slot: 'gloves' }, pa: { slot: 'armor' },
      },
      {
        R: { worn: { weapon: 'r', helmet: 'rh', gloves: 'rg' }, value: { r: 5, rh: 5, rg: 5, wO: 7, hM: 7, qg: 5.5, pa: 20 } },
        O: { worn: { weapon: 'wO' } },
        M: { worn: { helmet: 'mh' }, pool: ['hM'] },
        Q: { worn: { gloves: 'qg' } },
        P: { worn: { armor: 'pa' }, locked: true },
      },
    );
    expect(got(run(w, ['R']), 'R')).toEqual({ weapon: 'wO', helmet: 'hM' });
  });

  describe('H15 (T7.6): сеты — по ценности в V у заказа члена', () => {
    // половина S стоит half: 4 — шлем S (3 + 4 = 7) уступает шлему без сета (8); 6 — берётся шлем S (9 > 8)
    const world = (half: number) => mk(
      { ra: { slot: 'armor', set: 'S' }, hS: { slot: 'helmet', set: 'S' }, hX: { slot: 'helmet' } },
      {
        R: { worn: { armor: 'ra' }, value: { ra: 5, hS: 3, hX: 8 }, bonus: { S: { 2: half } } },
        O1: { worn: { helmet: 'hS' } },
        O2: { worn: { helmet: 'hX' } },
      },
    );
    it('половина S дешевле разницы очков → берётся +8', () => {
      expect(got(run(world(4), ['R']), 'R')).toEqual({ helmet: 'hX' });
    });
    it('половина S дороже разницы → берётся шлем S', () => {
      expect(got(run(world(6), ['R']), 'R')).toEqual({ helmet: 'hS' });
    });
  });

  it('H16: член не проходит порог по слоту (+0,5), его вещь другим не нужна → слот как был', () => {
    const w = mk({ a: { slot: 'weapon' }, b: { slot: 'weapon' }, x: { slot: 'weapon' } }, {
      A: { worn: { weapon: 'a' }, value: { a: 5, x: 5.5 } },
      B: { worn: { weapon: 'b' }, value: { b: 5 } },
      O: { worn: { weapon: 'x' } },
    });
    const tp = run(w, ['A', 'B']);
    expect(got(tp, 'A')).toEqual({});
    expect(tp.steps).toEqual([]);
  });

  it('H19 (MODEL.md §7 item 2): обмен парой не отдаёт члену вещь, не годную для него', () => {
    const w = mk({ a1: { slot: 'helmet' }, b1: { slot: 'helmet' } }, {
      A: { worn: { helmet: 'a1' }, value: { a1: 1, b1: { v: 8, fit: 'no', ok: false } } },
      B: { worn: { helmet: 'b1' }, value: { b1: 5, a1: 5 } },
    });
    const tp = run(w, ['A', 'B']);
    expect(got(tp, 'A')).toEqual({});
    expect(tp.steps).toEqual([]);
  });

  it('H17: член без вещей получает вещи по плану, порога нет', () => {
    const w = mk({ w: { slot: 'weapon' } }, { R: { value: { w: 4 } }, O: { worn: { weapon: 'w' } } });
    expect(teamOk(w, team('R'))).toBe(true);
    expect(got(run(w, ['R']), 'R')).toEqual({ weapon: 'w' });
  });
});

describe('J7. расчёт кусками', () => {
  const w = () => mk({ w: { slot: 'weapon' } }, { R: { value: { w: 10 } }, K: { value: { w: 5 } }, O: { worn: { weapon: 'w' } } });
  it('J7: без «Отмены» — тот же план, что синхронный', async () => {
    const inp = { team: team('R', 'K') };
    expect(await runTeam(w(), inp)).toEqual(teamPlan(w(), inp));
  });
  it('J7: «Отмена» — null, мир не тронут', async () => {
    const world = w();
    const before = JSON.stringify(world.heroes);
    const ctl = new AbortController();
    const p = runTeam(world, { team: team('R', 'K') }, ctl.signal);
    ctl.abort();
    expect(await p).toBeNull();
    expect(JSON.stringify(world.heroes)).toBe(before);
  });
});
