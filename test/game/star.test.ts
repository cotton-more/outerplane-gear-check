// The hero's ★ floor (owner 2026-10-12): a hero starts at their base rarity and never has fewer stars; not set — the minimum.
import { describe, expect, it } from 'vitest';
import { heroStar, minStar } from '@/game/hero/star';

describe('game/hero/star', () => {
  it('minStar — the base rarity 1…3; unknown or odd — ★1', () => {
    expect([1, 2, 3, null, 0, 7].map((rarity) => minStar({ rarity }))).toEqual([1, 2, 3, 1, 1, 1]);
  });

  it('heroStar — the stored ★, never below the minimum; not set — the minimum', () => {
    const ame = { rarity: 3 };
    expect([heroStar(ame, undefined), heroStar(ame, null), heroStar(ame, 1), heroStar(ame, 5)]).toEqual([3, 3, 3, 5]);
    expect(heroStar({ rarity: 1 }, undefined)).toBe(1);
  });
});
