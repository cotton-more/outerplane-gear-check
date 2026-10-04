// «Обмен вещами», лучший комплект получателя (R6.1, R2.5): .x/0040-trade/TESTS.md, раздел D, и сверка с перебором.
import { describe, expect, it } from 'vitest';
import type { SlotId } from '../src/data/types';
import { bestKit, keyOf } from '../src/logic/trade/kit';
import { cmpUse, SLOT_ORDER, type Cand, type Gauge, type Part, type SetGain } from '../src/logic/trade/model';
import { bruteKit, cand, candsOf, lcg, synthGauge } from './trade.helpers';

const speed: Part = { set: 'Speed', n: 4, conv: true };
const pen: Part = { set: 'Pen', n: 4, conv: false };
const idsOf = (g: Gauge, list: Cand[]) => {
  const k = bestKit(g, candsOf(list));
  return Object.fromEntries(Object.entries(k.slots).map(([s, c]) => [s, c.item.id]));
};
const useOf = (g: Gauge, slots: Partial<Record<SlotId, Cand>>) => keyOf(g, slots);

describe('выбор комплекта: ничьи (R6.1)', () => {
  it('D5: при равной пользе запас Ноа (цена 2) лучше надетой на Карен (цена 3)', () => {
    const g = synthGauge();
    const karen = cand({ id: 'karen', slot: 'weapon', v: 5, cost: 3, loss: 0, holder: 'K', rank: 1, ord: 1 });
    const noa = cand({ id: 'noa', slot: 'weapon', v: 5, cost: 2, holder: 'N', rank: 2, ord: 2 });
    expect(cmpUse(useOf(g, { weapon: karen }), useOf(g, { weapon: noa }))).toBe(0);
    expect(idsOf(g, [karen, noa]).weapon).toBe('noa');
  });

  it('D12: при равных ценах берётся у того, кто теряет меньше (Карен 2, Майя 5)', () => {
    const g = synthGauge();
    // ранг у Карен хуже, чтобы решала именно потеря
    const karen = cand({ id: 'karen', slot: 'weapon', v: 5, cost: 3, loss: 2, holder: 'K', rank: 5, ord: 2 });
    const maya = cand({ id: 'maya', slot: 'weapon', v: 5, cost: 3, loss: 5, holder: 'M', rank: 1, ord: 1 });
    expect(cmpUse(useOf(g, { weapon: karen }), useOf(g, { weapon: maya }))).toBe(0);
    expect(idsOf(g, [karen, maya]).weapon).toBe('karen');
  });

  it('D13: равные по всему кандидаты — выбор один и тот же, не зависит от порядка во входе', () => {
    const g = synthGauge();
    const mk = () => [1, 2, 3].map((n) => cand({ id: `x${n}`, slot: 'weapon', v: 5, cost: 2, holder: 'N', rank: 1, ord: n }));
    const list = mk();
    const first = idsOf(g, list);
    expect(idsOf(g, list)).toEqual(first);
    expect(idsOf(g, [...list].reverse())).toEqual(first);
    expect(first.weapon).toBe('x1'); // старшая запись
  });

  describe('D19: равные по пользе комплекты (пара сета A против пары сета B)', () => {
    const g = synthGauge({ bonus: { A: { 2: 5 }, B: { 2: 5 } } });
    const kit = (o: { a: [number, number, number, number]; b: [number, number, number, number] }) => {
      // a/b: [цена шлема, цена брони, потеря, ранг] — потеря и ранг ставятся на броню
      const mk = (id: string, slot: SlotId, set: string, cost: 0 | 1 | 2 | 3, loss: number, rank: number, ord: number) =>
        cand({ id, slot, v: 4, set, cost, loss, rank, ord });
      return [
        mk('Ah', 'helmet', 'A', o.a[0] as 0 | 1 | 2 | 3, 0, o.a[3], 10), mk('Aa', 'armor', 'A', o.a[1] as 0 | 1 | 2 | 3, o.a[2], o.a[3], 11),
        mk('Bh', 'helmet', 'B', o.b[0] as 0 | 1 | 2 | 3, 0, o.b[3], 1), mk('Ba', 'armor', 'B', o.b[1] as 0 | 1 | 2 | 3, o.b[2], o.b[3], 2),
      ];
    };
    const equalUse = (list: Cand[]) => {
      const [ah, aa, bh, ba] = list;
      return cmpUse(useOf(g, { helmet: ah, armor: aa }), useOf(g, { helmet: bh, armor: ba }));
    };

    it('суммы цен равны (3 и 3) — решает меньшая потеря', () => {
      const list = kit({ a: [1, 2, 0, 5], b: [0, 3, 3, 0] }); // ранг и старшинство говорят за B
      expect(equalUse(list)).toBe(0);
      expect(idsOf(g, list)).toMatchObject({ helmet: 'Ah', armor: 'Aa' });
    });
    it('цены и потери равны — решает порядок ростера', () => {
      const list = kit({ a: [1, 2, 0, 5], b: [2, 1, 0, 0] });
      expect(equalUse(list)).toBe(0);
      expect(idsOf(g, list)).toMatchObject({ helmet: 'Bh', armor: 'Ba' });
    });
    it('суммы цен 3 и 4 — берётся меньшая, хотя ранг и старшинство за другой', () => {
      const list = kit({ a: [1, 2, 0, 5], b: [1, 3, 0, 0] });
      expect(equalUse(list)).toBe(0);
      expect(idsOf(g, list)).toMatchObject({ helmet: 'Ah', armor: 'Aa' });
    });
  });
});

describe('выбор комплекта: связка билда (R2.3, R2.5)', () => {
  it('D20: четвёртая Speed (+3) проигрывает вещи другого сета (+8), если Speed остаётся 3 из 4', () => {
    const g = synthGauge({ parts: [speed], bonus: { Speed: { 4: 3 } } });
    const own = [
      cand({ id: 'h', slot: 'helmet', v: 1, set: 'Speed' }),
      cand({ id: 'a', slot: 'armor', v: 1, set: 'Speed' }),
      cand({ id: 'g', slot: 'gloves', v: 1, set: 'Speed' }),
    ];
    const s4 = cand({ id: 's4', slot: 'shoes', v: 0, set: 'Speed' });
    const other = cand({ id: 'other', slot: 'shoes', v: 8, set: 'Other' });
    const [h, a, gl] = own;
    const kS = useOf(g, { helmet: h, armor: a, gloves: gl, shoes: s4 });
    const kO = useOf(g, { helmet: h, armor: a, gloves: gl, shoes: other });
    expect([kS.soft, kO.soft]).toEqual([3, 3]); // часть связки та же
    expect(kS.total).toBe(3000 + 3000);          // 1+1+1+0 + бонус 3
    expect(kO.total).toBe(11000);
    expect(idsOf(g, [...own, s4, other]).shoes).toBe('other');
  });

  it('D20: две Speed проигрывают трём, даже если очков у них больше на 8', () => {
    const g = synthGauge({ parts: [speed] });
    const own = [cand({ id: 'h', slot: 'helmet', v: 1, set: 'Speed' }), cand({ id: 'a', slot: 'armor', v: 1, set: 'Speed' })];
    const three = cand({ id: 'three', slot: 'gloves', v: 0, set: 'Speed' });
    const two = cand({ id: 'two', slot: 'gloves', v: 8, set: 'Other' });
    const k3 = useOf(g, { helmet: own[0], armor: own[1], gloves: three });
    const k2 = useOf(g, { helmet: own[0], armor: own[1], gloves: two });
    expect([k3.soft, k2.soft]).toEqual([3, 2]);
    expect(k2.total - k3.total).toBe(8000);
    expect(idsOf(g, [...own, three, two]).gloves).toBe('three');
  });

  it('D21: включённый бонус неконвертируемого сета из связки важнее очков (на 8 хуже)', () => {
    // бонус Pen включается от двух T4-вещей; без T4 — только очки
    const g = synthGauge({
      parts: [{ set: 'Pen', n: 2, conv: false }],
      bonusFn: (set, _n, n4) => (set === 'Pen' && n4 >= 2 ? { v: 0, top: 2 } : { v: 0, top: 0 }),
    });
    const withBonus = [cand({ id: 'h4', slot: 'helmet', v: 0, set: 'Pen', t4: true }), cand({ id: 'a4', slot: 'armor', v: 0, set: 'Pen', t4: true })];
    const noBonus = [cand({ id: 'h0', slot: 'helmet', v: 4, set: 'Pen' }), cand({ id: 'a0', slot: 'armor', v: 4, set: 'Pen' })];
    const kB = useOf(g, { helmet: withBonus[0], armor: withBonus[1] });
    const kN = useOf(g, { helmet: noBonus[0], armor: noBonus[1] });
    expect([kB.hard, kN.hard]).toEqual([2, 2]);
    expect([kB.live, kN.live]).toEqual([1, 0]);
    expect(kN.total - kB.total).toBe(8000);
    expect(idsOf(g, [...withBonus, ...noBonus])).toEqual({ helmet: 'h4', armor: 'a4' });
  });

  it('D22: три части Pen (бонус не включён) лучше двух частей с большими очками', () => {
    const g = synthGauge({ parts: [pen] });
    const own = [cand({ id: 'h', slot: 'helmet', v: 1, set: 'Pen' }), cand({ id: 'a', slot: 'armor', v: 1, set: 'Pen' })];
    const three = cand({ id: 'three', slot: 'gloves', v: 0, set: 'Pen' });
    const two = cand({ id: 'two', slot: 'gloves', v: 8, set: 'Other' });
    const k3 = useOf(g, { helmet: own[0], armor: own[1], gloves: three });
    const k2 = useOf(g, { helmet: own[0], armor: own[1], gloves: two });
    expect([k3.hard, k2.hard]).toEqual([3, 2]);
    expect([k3.live, k2.live]).toEqual([0, 0]);
    expect(k2.total).toBeGreaterThan(k3.total);
    expect(idsOf(g, [...own, three, two]).gloves).toBe('three');
  });
});

describe('выбор комплекта: заполненность и BT', () => {
  it('D23: при равных очках берётся вариант с большим числом заполненных слотов', () => {
    const g = synthGauge();
    const helm = cand({ id: 'helm', slot: 'helmet', v: 5 });
    const arm = cand({ id: 'arm', slot: 'armor', v: 0 });
    const k1 = useOf(g, { helmet: helm });
    const k2 = useOf(g, { helmet: helm, armor: arm });
    expect(k1.total).toBe(k2.total);
    expect([k1.filled, k2.filled]).toEqual([1, 2]);
    expect(idsOf(g, [helm, arm])).toEqual({ helmet: 'helm', armor: 'arm' });
  });

  const base = () => [
    cand({ id: 'mine', slot: 'helmet', v: 4, set: 'S', cost: 0, t4: false, holder: 'R', ord: 1 }),
    cand({ id: 'karen', slot: 'helmet', v: 4, set: 'S', cost: 3, t4: true, loss: 0, holder: 'K', rank: 1, ord: 2 }),
    cand({ id: 'o1', slot: 'armor', v: 4, set: 'S', ord: 3 }),
    cand({ id: 'o2', slot: 'gloves', v: 4, set: 'S', ord: 4 }),
  ];

  it('D24: BT 4 без T4-бонуса, очки те же — остаётся своя копия BT 0', () => {
    const g = synthGauge({ bonusFn: (set, n) => (set === 'S' && n >= 2 ? { v: 3000, top: 2 } : { v: 0, top: 0 }) });
    const list = base();
    expect(useOf(g, { helmet: list[0] }).total).toBe(useOf(g, { helmet: list[1] }).total);
    expect(idsOf(g, list).helmet).toBe('mine');
  });

  it('D24: T4 даёт бонус сета (очки выше) — берётся копия с BT 4', () => {
    const g = synthGauge({ bonusFn: (set, n, n4) => (set === 'S' && n >= 2 ? { v: 3000 + (n4 >= 1 ? 5000 : 0), top: 2 } : { v: 0, top: 0 }) });
    const list = base();
    const rest = { armor: list[2], gloves: list[3] };
    expect(useOf(g, { helmet: list[1], ...rest }).total).toBeGreaterThan(useOf(g, { helmet: list[0], ...rest }).total);
    expect(idsOf(g, list).helmet).toBe('karen');
  });
});

describe('X2: лучший комплект совпадает с полным перебором', () => {
  it('50 случайных малых синтетик', () => {
    const r = lcg(2026);
    const int = (n: number) => Math.floor(r() * n);
    for (let t = 0; t < 50; t++) {
      const names = ['A', 'B', 'C'].slice(0, 2 + int(2));
      const parts: Part[] = [];
      for (const s of names) if (r() < 0.6) parts.push({ set: s, n: r() < 0.5 ? 2 : 4, conv: r() < 0.5 });
      const bonus: Record<string, { 2?: number; 4?: number }> = {};
      for (const s of names) bonus[s] = { ...(r() < 0.8 ? { 2: int(6) } : {}), ...(r() < 0.8 ? { 4: int(9) } : {}) };
      const g = synthGauge({ parts, bonus });
      const list: Cand[] = [];
      for (const slot of SLOT_ORDER) {
        const armor = !['weapon', 'accessory'].includes(slot);
        for (let i = 1 + int(3); i > 0; i--) {
          list.push(cand({
            slot, v: Math.round(r() * 16) / 2, set: armor ? names[int(names.length)] : null, t4: armor && r() < 0.3,
            fit: (['rec', 'stopgap', 'no'] as const)[int(3)], cost: int(4) as 0 | 1 | 2 | 3, loss: int(4), rank: int(4),
          }));
        }
      }
      const c = candsOf(list);
      const best = bestKit(g, c), brute = bruteKit(g, c);
      expect(best.key, `случай ${t}`).toEqual(brute.key);
      for (const slot of SLOT_ORDER) expect(best.slots[slot]?.item.id).toBe(brute.slots[slot]?.item.id);
    }
  });
});

describe('X2: отсечение и границы на броне', () => {
  // больше вещей на слот и бонусы, которые не растут с числом вещей (граница не должна на это опираться)
  it('200 случайных синтетик брони с произвольными бонусами', () => {
    const r = lcg(4040);
    const int = (n: number) => Math.floor(r() * n);
    for (let t = 0; t < 200; t++) {
      const names = ['A', 'B', 'C', 'D'].slice(0, 2 + int(3));
      const parts: Part[] = [];
      for (const s of names) if (r() < 0.5) parts.push({ set: s, n: r() < 0.5 ? 2 : 4, conv: r() < 0.5 });
      const table = new Map<string, SetGain>();
      const g = synthGauge({
        parts,
        bonusFn: (set, n, n4) => {
          const k = `${set}:${n}:${n4}`;
          if (!table.has(k)) table.set(k, { v: int(4) * 1000 * (r() < 0.3 ? 0 : 1), top: n >= 4 && r() < 0.6 ? 4 : n >= 2 && r() < 0.7 ? 2 : 0 });
          return table.get(k)!;
        },
      });
      const list: Cand[] = [];
      for (const slot of ['helmet', 'armor', 'gloves', 'shoes'] as const) {
        for (let i = 1 + int(7); i > 0; i--) {
          list.push(cand({ slot, v: int(12) / 2, set: names[int(names.length)], t4: r() < 0.4, cost: int(4) as 0 | 1 | 2 | 3, loss: int(3), rank: int(5) }));
        }
      }
      const c = candsOf(list);
      // перебор и поиск должны видеть одну и ту же таблицу бонусов: заполнить её заранее
      for (const s of names) for (let n = 0; n <= 4; n++) for (let n4 = 0; n4 <= n; n4++) g.bonus(s, n, n4);
      const best = bestKit(g, c), brute = bruteKit(g, c);
      expect(best.key, `случай ${t}`).toEqual(brute.key);
    }
  });
});
