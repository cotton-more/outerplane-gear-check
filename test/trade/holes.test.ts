// «Обмен вещами», the end of a plan (MODEL.md §7 item 7; .x/0200-boss E2b Q2): a hole is filled at the end — the giver
// gets the receiver's old piece; a receiver's empty slots are holes («Ввести» / «Оставить»); a hole that switched a set's
// half off says so (breaks — the search hint, R9.2). Parking and team cases — test/trade/walk.test.ts.
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { heroPlan } from '@/features/trade/model/plan';
import { NO_DECISIONS, outcomeOf } from '@/features/trade/model/walk';
import type { World } from '@/features/trade/model/model';
import { synthWorld } from './helpers';

// Рин (R) забирает у Майи (M) вещь слота
const swap = (slot: SlotId) => synthWorld({
  items: { r1: { slot }, m1: { slot } },
  heroes: { R: { worn: { [slot]: 'r1' }, value: { r1: 5, m1: 9 } }, M: { worn: { [slot]: 'm1' }, value: { r1: 6, m1: 8 } } },
});
const end = (w: World) => {
  const hp = heroPlan(w, { to: 'R' });
  return outcomeOf(w, [{ plans: [{ to: 'R', plan: hp.plan }] }], ['R'], ['R'], NO_DECISIONS);
};

describe('F. the end of a plan', () => {
  it('the hole is filled: Maya wears Rin\'s old gloves; Rin keeps none of them', () => {
    const o = end(swap('gloves'));
    expect(o.ends.repl).toEqual([{ to: 'M', slot: 'gloves', item: 'r1', from: 'R', kept: false }]);
    expect(o.w2.heroes.find((h) => h.id === 'M')?.worn.gloves).toBe('r1');
    expect(o.w2.heroes.find((h) => h.id === 'R')?.pool).not.toContain('r1');
  });
  it('F9: the receiver\'s empty slots are holes; the changed one is not', () => {
    const holes = end(swap('gloves')).ends.holes.filter((h) => h.hero === 'R').map((h) => h.slot);
    expect(holes).toContain('weapon');
    expect(holes).not.toContain('gloves');
  });
  it('a hole that switched a half off names the set (breaks, R9.2)', () => {
    const w = synthWorld({
      items: { h1: { slot: 'helmet', set: 'S' }, a1: { slot: 'armor', set: 'S' }, rh: { slot: 'helmet' } },
      heroes: {
        R: { worn: { helmet: 'rh' }, value: { h1: 20, rh: 1 } },
        M: { worn: { helmet: 'h1', armor: 'a1' }, value: { h1: 1, a1: 1, rh: null }, bonus: { S: { 2: 10 } } },
      },
    });
    expect(end(w).ends.holes.filter((h) => h.hero === 'M')).toEqual([{ hero: 'M', slot: 'helmet', receiver: false, breaks: 'S' }]);
  });
});
