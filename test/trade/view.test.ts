// Что показывает план (R10.4, .x/0040-trade/SPEC.md; «было → станет» — .x/0085 FORMULA §7 п. 3): итог по героям — кто
// получил, кто потерял, очки статов отдельно от сетов, включившаяся половина сета. Подписи — test/trade/trade.dom.test.ts.
import { describe, expect, it } from 'vitest';
import { heroMoves, advance } from '@/features/trade/model/moves';
import { heroPlan } from '@/features/trade/model/plan';
import { linesOf } from '@/features/trade/model/view';
import { synthWorld } from './helpers';

describe('итог плана по героям', () => {
  // Рин берёт надетый меч Карен (дыра Карен не закрывается); шлемы — сет S (2 шт. включают бонус)
  const w = synthWorld({
    items: { sw: { slot: 'weapon' }, old: { slot: 'weapon' }, h1: { slot: 'helmet', set: 'S' }, a1: { slot: 'armor', set: 'S' }, ra: { slot: 'armor' } },
    heroes: {
      R: { worn: { weapon: 'old', armor: 'ra' }, pool: ['a1'], value: { sw: 20, old: 10, h1: 1, a1: 1, ra: 1 }, bonus: { S: { 2: 10 } } },
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

describe('T7.3: было → станет', () => {
  // Рин носит сильный шлем без сета (5) и броню сета S (1); шлем S (2) включает половину S (+10): V растёт, статы падают
  const w = synthWorld({
    items: { rh: { slot: 'helmet' }, ra: { slot: 'armor', set: 'S' }, h1: { slot: 'helmet', set: 'S' } },
    heroes: {
      R: { worn: { helmet: 'rh', armor: 'ra' }, pool: ['h1'], value: { rh: 5, ra: 1, h1: 2 }, bonus: { S: { 2: 10 } } },
    },
  });
  it('очки статов отдельно от сетов: 6 → 3, V 6 → 13, включилась S ×2', () => {
    const hp = heroPlan(w, { to: 'R' });
    const step = { plans: [{ to: 'R', plan: hp.plan }], fills: hp.holes.fills };
    const [r] = linesOf(w, advance(w, step), ['R'], heroMoves(w, 'R', step));
    expect([r.ptsBefore, r.ptsAfter]).toEqual([6000, 3000]);
    expect([r.before, r.after]).toEqual([6000, 13000]);
    expect(r.on).toEqual([{ set: 'S', n: 2 }]);
    expect(r.off).toEqual([]);
  });
});

describe('цена каждой вещи плана', () => {
  // Rin: wears sword old (6, not recommended), reserve — recommended rec (2); helmet S (2) instead of rh (5) turns on S ×2
  const w = synthWorld({
    items: { old: { slot: 'weapon' }, rec: { slot: 'weapon' }, rh: { slot: 'helmet' }, ra: { slot: 'armor', set: 'S' }, h1: { slot: 'helmet', set: 'S' } },
    heroes: {
      R: {
        worn: { weapon: 'old', helmet: 'rh', armor: 'ra' }, pool: ['rec', 'h1'],
        value: { old: { v: 6, fit: 'stopgap' }, rec: { v: 2, fit: 'rec' }, rh: 5, ra: 1, h1: 2 }, bonus: { S: { 2: 10 } },
      },
    },
  });
  it('очки вещи против надетой в слоте, без сетов; рекомендованное оружие — passive', () => {
    const hp = heroPlan(w, { to: 'R' });
    const step = { plans: [{ to: 'R', plan: hp.plan }], fills: hp.holes.fills };
    const [r] = linesOf(w, advance(w, step), ['R'], heroMoves(w, 'R', step));
    expect(r.worth).toEqual({ weapon: { d: -4000, passive: true }, helmet: { d: -3000, passive: false } });
  });
});
