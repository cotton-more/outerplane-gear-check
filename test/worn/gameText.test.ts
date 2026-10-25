// «Надето» cards in the game's words (HISTORY.md 0260): main lines and substats as the game's piece card shows them.
// Owner's Steel Sword · ATK% (2026-10-25): two main lines «Attack» — flat and % — must not look the same without numbers
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import { gameMains, gameSub } from '@/features/gear/ui/pieceText';
import { idx, mk } from '../gear/statSets';

const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const sword = (bt: 0 | 4 | null) => mk('w', 'weapon', null, { CHD: 2, CHC: 3, SPD: 1 }, bt, { grade: 'rare', itemKey: null, main: 'ATK%' });

describe('the game card of a worn piece', () => {
  it('main lines: the fixed Attack first, then the chosen main; below T4 no number, a percent line keeps «%»', () => {
    expect(gameMains(ctx, sword(0)).map((m) => [m.name, m.value, m.pct])).toEqual([['Attack', null, false], ['Attack', null, true]]);
    expect(gameMains(ctx, sword(null)).map((m) => m.value)).toEqual([null, null]);
  });
  it('at T4 the numbers are exact: Epic weapon ATK 1080, ATK% 54.0%', () => {
    expect(gameMains(ctx, sword(4)).map((m) => [m.name, m.value])).toEqual([['Attack', '1080'], ['Attack', '54.0%']]);
  });
  it('substats: LV × step, percent stats with one decimal', () => {
    expect([gameSub(idx, 'CHD', 2), gameSub(idx, 'CHC', 3), gameSub(idx, 'SPD', 1), gameSub(idx, 'ATK', 2), gameSub(idx, 'DMG UP%', 2), gameSub(idx, 'DMG RED%', 1)])
      .toEqual([
        { name: 'Crit DMG', value: '+8.0%' }, { name: 'Crit Chance', value: '+9.0%' }, { name: 'Speed', value: '+3' },
        { name: 'Attack', value: '+80' }, { name: 'DMG Increase', value: '+4.0%' }, { name: 'DMG Reduction', value: '+2.4%' },
      ]);
  });
});
