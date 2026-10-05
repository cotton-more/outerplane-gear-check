// Что показывает план (R10.4, R10.5, .x/0040-trade/SPEC.md): проценты (J6) и итог по героям — кто получил, кто
// потерял, включившийся сет, копии, которые уйдут из приложения. Подписи — test/trade/trade.dom.test.ts.
import { describe, expect, it } from 'vitest';
import { heroMoves, advance } from '@/features/trade/model/moves';
import { heroPlan } from '@/features/trade/model/plan';
import { gainOf, linesOf } from '@/features/trade/model/view';
import { synthWorld } from './helpers';

describe('J6. проценты', () => {
  it('J6: 40 → 45 — +13%, 40 → 35 — −13%, 40 → 40,1 — 0%, 0 → 5 — +5 очк.', () => {
    expect(gainOf(40000, 45000)).toEqual({ kind: 'pct', n: 13 });
    expect(gainOf(40000, 35000)).toEqual({ kind: 'pct', n: -13 });
    expect(gainOf(40000, 40100)).toEqual({ kind: 'pct', n: 0 });
    expect(gainOf(0, 5000)).toEqual({ kind: 'pts', n: 5 });
  });
});

describe('итог плана по героям', () => {
  // Рин берёт надетый меч Карен (дыра Карен не закрывается); шлемы — сет S (2 шт. включают бонус)
  const w = synthWorld({
    items: { sw: { slot: 'weapon' }, old: { slot: 'weapon' }, h1: { slot: 'helmet', set: 'S' }, a1: { slot: 'armor', set: 'S' }, ra: { slot: 'armor' } },
    heroes: {
      R: { worn: { weapon: 'old', armor: 'ra' }, pool: ['a1'], value: { sw: 20, old: 10, h1: 1, a1: 1, ra: 1 }, parts: [{ set: 'S', n: 2, conv: false }], bonus: { S: { 2: 10 } } },
      K: { worn: { weapon: 'sw', helmet: 'h1' }, pool: ['old'], value: { sw: 30, old: 5, h1: 1 } },
    },
  });

  it('у получателя — очки до и после и включившийся сет; у отдавшего — потеря и чем закрыта дыра', () => {
    const hp = heroPlan(w, { to: 'R' });
    const step = { plans: [{ to: 'R', plan: hp.plan }], fills: hp.holes.fills };
    const lines = linesOf(w, advance(w, step), ['R'], heroMoves(w, 'R', step));
    const r = lines.find((l) => l.hero === 'R')!, k = lines.find((l) => l.hero === 'K')!;
    expect(r.receiver).toBe(true);
    expect(r.after).toBeGreaterThan(r.before);
    expect(r.moves.map((m) => m.item)).toContain('sw');
    expect(k.receiver).toBe(false);
    expect(k.after).toBeLessThan(k.before);
    expect(lines.indexOf(r)).toBeLessThan(lines.indexOf(k));
  });
});
