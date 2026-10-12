// «Найти вещь» (0199, owner 2026-10-12): who has a piece — worn or set aside; the same piece as the verdict's look-alike
import { describe, expect, it } from 'vitest';
import { holdersOf } from '@/features/gear/find';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import type { ItemInput } from '@/game/item/item';

const piece = (id: string, lit: Record<string, number>, o: Partial<Piece> = {}): Piece =>
  ({ id, slot: 'gloves', grade: 'unique', setId: '13', itemKey: null, main: null, yellow: lit, lit, bt: 0, at: '2026-10-12', ...o });
const input = (subs: Record<string, number>, o: Partial<ItemInput> = {}): ItemInput =>
  ({ slot: 'gloves', grade: 'unique', setId: '13', itemKey: null, main: null, unlisted: false, subs, ...o });
const SUBS = { 'HP%': 2, 'ATK%': 3, EFF: 2, RES: 1 };

describe('holdersOf', () => {
  const st: GearStore = {
    v: 3, seq: 4,
    pieces: { a: piece('a', SUBS), b: piece('b', SUBS), c: piece('c', SUBS, { grade: 'rare' }), d: piece('d', { 'ATK%': 3, 'HP%': 2, EFF: 2, RES: 1 }) },
    pools: { caren: ['a', 'd'], aer: ['b'], rin: ['a', 'c'] },
    worn: { caren: { gloves: 'a' } },
  } as GearStore;

  it('worn on Caren, set aside for Aer and Rin (a record shared by two heroes names both); another grade or order — another piece', () => {
    expect(holdersOf(st, input(SUBS))).toEqual({ worn: ['caren'], stash: ['aer', 'rin'] });
  });

  it('nobody: other levels, the Epic finds only its own record', () => {
    expect(holdersOf(st, input({ ...SUBS, RES: 2 }))).toEqual({ worn: [], stash: [] });
    expect(holdersOf(st, input(SUBS, { grade: 'rare' }))).toEqual({ worn: [], stash: ['rin'] });
  });
});
