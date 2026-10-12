// The hero's in-game transcend ★ (owner 2026-10-12): a hero starts at their base rarity (★1–★3) and can never have fewer
// stars, so the minimum is also the default — a hero whose ★ isn't set is at their minimum (card, Team, crit).
import type { Char } from '@/game/data/types';

// the lowest ★: the base rarity; unknown — ★1
export const minStar = (c: Pick<Char, 'rarity'>): number => (c.rarity && c.rarity >= 1 && c.rarity <= 6 ? c.rarity : 1);
// the hero's ★: the stored one, never below the minimum; not set — the minimum
export const heroStar = (c: Pick<Char, 'rarity'>, stored: number | null | undefined): number => Math.max(stored ?? 0, minStar(c));
