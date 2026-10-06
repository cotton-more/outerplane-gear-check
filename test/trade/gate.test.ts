// «Обмен вещами», порог и итог плана героя (R6.2–R6.4): .x/0040-trade/TESTS.md, раздел D (D1–D4, D6–D11, D14–D18).
// Надетое — кандидат с ценой 0 (cand({ cost: 0 })), как его даёт candidates().
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { planFor } from '@/features/trade/model/gate';
import type { Cand } from '@/features/trade/model/model';
import { cand, candsOf, synthGauge } from './helpers';

// Pen — сет-эффект (его половина проходит порог при не меньшем V), Speed — статовый
const PEN = synthGauge({ bonus: { Pen: { 2: 0 } }, effect: ['Pen'] });
const worn = (id: string, slot: SlotId, v: number, o: { set?: string; fit?: 'rec' | 'stopgap' | 'no' } = {}) =>
  cand({ id, slot, v, cost: 0, ...o });
const plan = (list: Cand[], gauge = synthGauge()) => planFor(gauge, candsOf(list));
const took = (list: Cand[], gauge = synthGauge()) =>
  Object.fromEntries(plan(list, gauge).changes.map((c) => [c.slot, c.cand.item.id]));

describe('порог: один слот (R6.2)', () => {
  it('D1: своя запасная лучше надетой на 1 очк. — берём из запаса', () => {
    const list = [worn('w', 'weapon', 5), cand({ id: 'spare', slot: 'weapon', v: 6, cost: 1 })];
    expect(took(list)).toEqual({ weapon: 'spare' });
  });

  it('D2: своя запасная лучше на 0,5 — менять нечего', () => {
    const p = plan([worn('w', 'weapon', 5), cand({ id: 'spare', slot: 'weapon', v: 5.5, cost: 1 })]);
    expect(p.changes).toEqual([]);
    expect(p.kit.slots.weapon!.item.id).toBe('w');
  });

  it('D3: меч Карен лучше меча Рин на 0,5 — не берём', () => {
    const list = [worn('rin', 'weapon', 5), cand({ id: 'karen', slot: 'weapon', v: 5.5, cost: 3, holder: 'K', rank: 1 })];
    expect(plan(list).changes).toEqual([]);
  });

  it('D4: меч Карен лучше на 1 — берём, Карен среди теряющих', () => {
    const list = [worn('rin', 'weapon', 5), cand({ id: 'karen', slot: 'weapon', v: 6, cost: 3, loss: 4, holder: 'K', rank: 1 })];
    const p = plan(list);
    expect(p.changes.map((c) => [c.slot, c.cand.item.id, c.was?.item.id])).toEqual([['weapon', 'karen', 'rin']]);
    expect(p.losses).toEqual([{ holder: 'K', slot: 'weapon', loss: 4000 }]);
  });

  it('D11: слот не отмечен — надевается лучшая вещь, даже если даёт меньше 1 очк.', () => {
    const p = plan([cand({ id: 'a', slot: 'weapon', v: 0.3, cost: 1 }), cand({ id: 'b', slot: 'weapon', v: 0.1, cost: 1 })]);
    expect(p.changes.map((c) => [c.cand.item.id, c.was])).toEqual([['a', null]]);
  });

  describe('D16: порог — разность округлённых очков', () => {
    it('40,0004 и 41,0000 (разность 1,000) — порог пройден', () => {
      expect(took([worn('w', 'weapon', 40.0004), cand({ id: 'n', slot: 'weapon', v: 41, cost: 1 })])).toEqual({ weapon: 'n' });
    });
    it('40,0006 и 41,0000 (разность 0,999) — порог не пройден', () => {
      expect(took([worn('w', 'weapon', 40.0006), cand({ id: 'n', slot: 'weapon', v: 41, cost: 1 })])).toEqual({});
    });
  });

  describe('D8: сеты', () => {
    const base = (set: string) => [
      worn('h0', 'helmet', 4), worn('a', 'armor', 4, { set }),
      cand({ id: 'h1', slot: 'helmet', v: 4.3, set, cost: 1 }),
    ];
    it('+0,3, но включает половину сета-эффекта — берём', () => {
      expect(took(base('Pen'), PEN)).toEqual({ helmet: 'h1' });
    });
    it('та же вещь со статовым сетом — порог не пройден', () => {
      expect(took(base('Speed'), synthGauge({ bonus: { Speed: { 2: 0 } } }))).toEqual({});
    });
  });

  it('D10: рекомендованное оружие берётся вместо «на время», даже при равных очках; дешёвая замена не понижает его', () => {
    const list = [
      worn('w', 'weapon', 3, { fit: 'stopgap' }),
      cand({ id: 'rec', slot: 'weapon', v: 5, cost: 3, holder: 'K', rank: 1, fit: 'rec' }),
      cand({ id: 'cheap', slot: 'weapon', v: 4.5, cost: 1, fit: 'stopgap' }),
    ];
    expect(took(list)).toEqual({ weapon: 'rec' });
    expect(took([worn('w', 'weapon', 5, { fit: 'stopgap' }), cand({ id: 'rec', slot: 'weapon', v: 5, cost: 3, holder: 'K', rank: 1, fit: 'rec' })]))
      .toEqual({ weapon: 'rec' });
  });
});

describe('порог: дешёвая альтернатива в окне 0–1 (R6.2)', () => {
  const karenBest = (v: number) => cand({ id: 'karen', slot: 'weapon', v, cost: 3, loss: 2, holder: 'K', rank: 1 });

  it('D6: запас Ноа хуже вещи Карен на 0,5 и лучше надетой на ≥ 1 — берём запас Ноа', () => {
    const list = [worn('rin', 'weapon', 5), karenBest(6.7), cand({ id: 'noa', slot: 'weapon', v: 6.2, cost: 2, holder: 'N', rank: 2 })];
    expect(took(list)).toEqual({ weapon: 'noa' });
  });

  describe('D7', () => {
    const noa = cand({ id: 'noa', slot: 'weapon', v: 6.2, cost: 2, holder: 'N', rank: 2 });
    it('запас Ноа хуже на 0,8; свой запас хуже на 1,5 — берём запас Ноа', () => {
      expect(took([worn('rin', 'weapon', 5), karenBest(7), noa, cand({ id: 'own', slot: 'weapon', v: 5.5, cost: 1 })])).toEqual({ weapon: 'noa' });
    });
    it('свой запас хуже на 0,9 (лучше надетой на 1,1) — берём свой запас: цена меньше', () => {
      expect(took([worn('rin', 'weapon', 5), karenBest(7), noa, cand({ id: 'own', slot: 'weapon', v: 6.1, cost: 1 })])).toEqual({ weapon: 'own' });
    });
  });

  describe('D9: дешёвая альтернатива, выключающая половину сета', () => {
    it('хуже на 0,2, но выключает бонус — остаётся дорогая', () => {
      const g = PEN;
      const list = [
        worn('h0', 'helmet', 4), worn('a', 'armor', 4, { set: 'Pen' }),
        cand({ id: 'dear', slot: 'helmet', v: 6, set: 'Pen', cost: 3, holder: 'K', rank: 1 }),
        cand({ id: 'cheap', slot: 'helmet', v: 5.8, cost: 1 }),
      ];
      expect(took(list, g)).toEqual({ helmet: 'dear' });
    });
  });

  it('D14: две замены на дешёвое в разных слотах, по 0,8 хуже лучшей, — делаются обе', () => {
    const list: Cand[] = [];
    for (const slot of ['helmet', 'gloves'] as const) {
      list.push(worn(`w-${slot}`, slot, 3.4), cand({ id: `dear-${slot}`, slot, v: 6, cost: 3, holder: 'K', rank: 1 }),
        cand({ id: `cheap-${slot}`, slot, v: 5.2, cost: 1 }));
    }
    expect(took(list)).toEqual({ helmet: 'cheap-helmet', gloves: 'cheap-gloves' });
  });

  it('D15: две дешёвые замены по отдельности сохраняют сет, вместе выключают — делается первая по порядку слотов', () => {
    const g = PEN;
    const list: Cand[] = [];
    for (const slot of ['helmet', 'armor', 'gloves'] as const) list.push(worn(`w-${slot}`, slot, 3.4));
    for (const slot of ['helmet', 'armor', 'gloves'] as const) list.push(cand({ id: `pen-${slot}`, slot, v: 6, set: 'Pen', cost: 3, holder: 'K', rank: 1 }));
    list.push(cand({ id: 'cheap-helmet', slot: 'helmet', v: 5.2, cost: 1 }), cand({ id: 'cheap-gloves', slot: 'gloves', v: 5.2, cost: 1 }));
    expect(took(list, g)).toEqual({ helmet: 'cheap-helmet', armor: 'pen-armor', gloves: 'pen-gloves' });
  });

  describe('D17: порог против надетого, не против лучшей вещи', () => {
    it('запас лучше надетой на 0,1 — не берётся, берётся X', () => {
      const list = [worn('rin', 'weapon', 5), karenBest(6), cand({ id: 'own', slot: 'weapon', v: 5.1, cost: 1 })];
      expect(took(list)).toEqual({ weapon: 'karen' });
    });
    it('лучший комплект меняет шлем на +0,5 и перчатки на +2 — шлем остаётся, перчатки меняются', () => {
      const list = [
        worn('wh', 'helmet', 4), cand({ id: 'nh', slot: 'helmet', v: 4.5, cost: 3, holder: 'K', rank: 1 }),
        worn('wg', 'gloves', 4), cand({ id: 'ng', slot: 'gloves', v: 6, cost: 3, holder: 'K', rank: 1 }),
      ];
      expect(took(list)).toEqual({ gloves: 'ng' });
    });
  });

  describe('D18: граница окна', () => {
    const best = cand({ id: 'dear', slot: 'weapon', v: 6, cost: 3, holder: 'K', rank: 1 });
    it('альтернатива равна лучшей и дешевле — берётся она', () => {
      expect(took([worn('w', 'weapon', 3), best, cand({ id: 'eq', slot: 'weapon', v: 6, cost: 1 })])).toEqual({ weapon: 'eq' });
    });
    it('альтернатива хуже ровно на 1,0 — недопустима', () => {
      expect(took([worn('w', 'weapon', 3), best, cand({ id: 'low', slot: 'weapon', v: 5, cost: 1 })])).toEqual({ weapon: 'dear' });
    });
  });
});
