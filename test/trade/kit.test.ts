// «Обмен вещами», лучший комплект получателя (R6.1; польза — MODEL.md §3): .x/0040-trade/TESTS.md, раздел D, и
// сверка с перебором (X2).
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { bestKit, keyOf } from '@/features/trade/model/kit';
import { cmpUse, SLOT_ORDER, type Cand, type Gauge, type SetGain } from '@/features/trade/model/model';
import { bruteKit, cand, candsOf, lcg, synthGauge } from './helpers';

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

describe('выбор комплекта: польза — V, как у лучшей раскладки (MODEL.md §3, §7)', () => {
  it('D20: четвёртая Speed (+3 сету) проигрывает вещи другого сета (+8)', () => {
    const g = synthGauge({ bonus: { Speed: { 4: 3 } } });
    const own = [
      cand({ id: 'h', slot: 'helmet', v: 1, set: 'Speed' }),
      cand({ id: 'a', slot: 'armor', v: 1, set: 'Speed' }),
      cand({ id: 'g', slot: 'gloves', v: 1, set: 'Speed' }),
    ];
    const s4 = cand({ id: 's4', slot: 'shoes', v: 0, set: 'Speed' });
    const other = cand({ id: 'other', slot: 'shoes', v: 8, set: 'Other' });
    const [h, a, gl] = own;
    expect(useOf(g, { helmet: h, armor: a, gloves: gl, shoes: s4 }).total).toBe(3000 + 3000); // 1+1+1+0 + сет 3
    expect(useOf(g, { helmet: h, armor: a, gloves: gl, shoes: other }).total).toBe(11000);
    expect(idsOf(g, [...own, s4, other]).shoes).toBe('other');
  });

  describe('D21: половина сета-эффекта стоит своё в V, но не больше', () => {
    // Pen ×2 на T4 включает половину сета-эффекта ценой 6 очк. (U); без T4 — ничего
    const g = synthGauge({ bonusFn: (set, _n, n4) => (set === 'Pen' && n4 >= 2 ? { v: 6000, halves: 1, eff: 1 } : { v: 0, halves: 0, eff: 0 }) });
    const withHalf = [cand({ id: 'h4', slot: 'helmet', v: 0, set: 'Pen', t4: true }), cand({ id: 'a4', slot: 'armor', v: 0, set: 'Pen', t4: true })];
    it('пара без T4 с очками 2 + 2 — берётся пара T4 (6 > 4)', () => {
      const no = [cand({ id: 'h0', slot: 'helmet', v: 2, set: 'Pen' }), cand({ id: 'a0', slot: 'armor', v: 2, set: 'Pen' })];
      const k = useOf(g, { helmet: withHalf[0], armor: withHalf[1] });
      expect([k.halves, k.eff, k.total]).toEqual([1, 1, 6000]);
      expect(idsOf(g, [...withHalf, ...no])).toEqual({ helmet: 'h4', armor: 'a4' });
    });
    it('пара без T4 с очками 4 + 4 — берётся она (8 > 6)', () => {
      const no = [cand({ id: 'h0', slot: 'helmet', v: 4, set: 'Pen' }), cand({ id: 'a0', slot: 'armor', v: 4, set: 'Pen' })];
      expect(idsOf(g, [...withHalf, ...no])).toEqual({ helmet: 'h0', armor: 'a0' });
    });
  });

  it('ранг оружия решает раньше V: рекомендованное с меньшими очками бьёт оружие не из билдов', () => {
    const g = synthGauge();
    const rec = cand({ id: 'rec', slot: 'weapon', v: 2, fit: 'rec' }), no = cand({ id: 'no', slot: 'weapon', v: 9, fit: 'no' });
    expect(useOf(g, { weapon: rec }).rank).toBe(2);
    expect(idsOf(g, [rec, no]).weapon).toBe('rec');
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
    const g = synthGauge({ bonusFn: (set, n) => (set === 'S' && n >= 2 ? { v: 3000, halves: 1, eff: 0 } : { v: 0, halves: 0, eff: 0 }) });
    const list = base();
    expect(useOf(g, { helmet: list[0] }).total).toBe(useOf(g, { helmet: list[1] }).total);
    expect(idsOf(g, list).helmet).toBe('mine');
  });

  it('D24: T4 даёт бонус сета (очки выше) — берётся копия с BT 4', () => {
    const g = synthGauge({ bonusFn: (set, n, n4) => (set === 'S' && n >= 2 ? { v: 3000 + (n4 >= 1 ? 5000 : 0), halves: 1, eff: 0 } : { v: 0, halves: 0, eff: 0 }) });
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
      const bonus: Record<string, { 2?: number; 4?: number }> = {};
      for (const s of names) bonus[s] = { ...(r() < 0.8 ? { 2: int(6) } : {}), ...(r() < 0.8 ? { 4: int(9) } : {}) };
      const g = synthGauge({ bonus, effect: names.filter(() => r() < 0.4) });
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
      const table = new Map<string, SetGain>();
      const g = synthGauge({
        bonusFn: (set, n, n4) => {
          const k = `${set}:${n}:${n4}`;
          if (!table.has(k)) {
            const halves = n >= 4 && r() < 0.6 ? 2 : n >= 2 && r() < 0.7 ? 1 : 0;
            table.set(k, { v: int(4) * 1000 * (r() < 0.3 ? 0 : 1), halves, eff: r() < 0.4 ? halves : 0 });
          }
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
