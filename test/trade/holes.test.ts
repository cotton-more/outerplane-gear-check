// «Обмен вещами», дыры в плане (R8): дыры не закрываются (владелец, 2026-10-04) — у отдавшего слот пустеет, план
// подсказывает, что искать (breaks — выключенный значимый бонус, R9.2). Применение — test/trade/apply.test.ts.
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { advance } from '@/features/trade/model/moves';
import { heroPlan } from '@/features/trade/model/plan';
import { synthWorld } from './helpers';

// Рин (R) забирает у Майи (M) вещь слота; снятая с Рин вещь — в пуле Рин
const swap = (slot: SlotId) => synthWorld({
  items: { r1: { slot }, m1: { slot } },
  heroes: { R: { worn: { [slot]: 'r1' }, value: { r1: 5, m1: 9 } }, M: { worn: { [slot]: 'm1' }, value: { r1: 6, m1: 8 } } },
});

describe('F. дыры', () => {
  it('дыра не закрывается: у Майи перчатки пустые, снятые с Рин остаются у Рин', () => {
    const w = swap('gloves');
    const hp = heroPlan(w, { to: 'R' });
    expect(hp.holes.fills).toEqual([{ hero: 'M', slot: 'gloves', breaks: null }]);
    const w1 = advance(w, { plans: [{ to: 'R', plan: hp.plan }], fills: hp.holes.fills });
    expect(w1.heroes.find((h) => h.id === 'M')?.worn.gloves).toBeUndefined();
    expect(w1.heroes.find((h) => h.id === 'R')?.pool).toContain('r1');
  });
  it('F9: слот получателя после плана пуст — он в unfilled', () => {
    const { holes } = heroPlan(swap('gloves'), { to: 'R' });
    expect(holes.unfilled).toContain('weapon');
    expect(holes.unfilled).not.toContain('gloves');
  });
  it('дыра выключила половину сета — breaks: этот сет (подсказка R9.2)', () => {
    const w = synthWorld({
      items: { h1: { slot: 'helmet', set: 'S' }, a1: { slot: 'armor', set: 'S' }, rh: { slot: 'helmet' } },
      heroes: {
        R: { worn: { helmet: 'rh' }, value: { h1: 20, rh: 1 } },
        M: { worn: { helmet: 'h1', armor: 'a1' }, value: { h1: 1, a1: 1 }, bonus: { S: { 2: 10 } } },
      },
    });
    expect(heroPlan(w, { to: 'R' }).holes.fills).toEqual([{ hero: 'M', slot: 'helmet', breaks: 'S' }]);
  });
});
