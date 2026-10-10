// A worn set on its own header line (features/gear/ui/pieceText setBlocksOf): the head names the set and the highest active row,
// «T4» when every row is T4, «T?» when a piece's Breakthrough is unknown; the body is the rows' bonus texts. Fixture data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { bonusRows } from '@/game/set/setBonus';
import { setBlocksOf } from '@/features/gear/ui/pieceText';
import { TEXTS } from '@/i18n';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const pcs = (short: string, ...bt: (number | null)[]) => bt.map((b) => ({ setId: set(short), bt: b }));
const blocks = (lang: 'ru' | 'en', ...p: ReturnType<typeof pcs>[]) => setBlocksOf(TEXTS[lang], idx, bonusRows(idx.SET, p.flat())).map(({ head, body, rows }) => ({ head, body, rows }));

describe('setBlocksOf: a set gets its own header, the bonus rows under it', () => {
  it('one row (Attack ×2 at T0–T3): the head has no «T0–T3», one row', () => {
    expect(blocks('en', pcs('Attack', 0, 0))).toEqual([{ head: 'Attack ×2', body: 'Attack +30%', rows: 1 }]);
  });

  it('two rows (Attack ×4): the head names the highest row, texts joined with « · »', () => {
    expect(blocks('en', pcs('Attack', 0, 0, 0, 0))).toEqual([{ head: 'Attack ×4', body: 'Attack +30% · Attack +20%', rows: 2 }]);
  });

  it('Speed ×4 at T0–T3: no 2P row — one 4P row', () => {
    expect(blocks('en', pcs('Speed', 0, 0, 0, 0))).toEqual([{ head: 'Speed ×4', body: 'Speed +25%', rows: 1 }]);
  });

  it('every row T4 — «T4» in the head, none on the rows', () => {
    expect(blocks('en', pcs('Speed', 4, 4, 4, 4))).toEqual([{ head: 'Speed ×4 · T4', body: 'Speed +13% · Speed +12%', rows: 2 }]);
  });

  it('mixed rows (T4 and T0–T3) — «T4» only in front of the T4 row, not in the head', () => {
    expect(blocks('en', pcs('Attack', 4, 4, 0, 0))).toEqual([{ head: 'Attack ×4', body: 'T4 Attack +35% · Attack +20%', rows: 2 }]);
  });

  it('Breakthrough unknown — «T?» in the head, «mark Breakthrough» ends the rows', () => {
    expect(blocks('en', pcs('Attack', null, 0))).toEqual([{ head: 'Attack ×2 · T?', body: 'Attack +30% · mark Breakthrough', rows: 1 }]);
    expect(blocks('ru', pcs('Attack', null, 0))).toEqual([{ head: 'Attack ×2 · T?', body: 'Attack +30% · отметь Breakthrough', rows: 1 }]);
  });

  it('two sets — two blocks in the sets\' order; a set with no active row gives none', () => {
    expect(blocks('en', pcs('Attack', 0, 0), pcs('Life', 0, 0), pcs('Speed', 0, 0)).map((b) => b.head)).toEqual(['Attack ×2', 'Life ×2']);
    expect(blocks('en', pcs('Speed', 0, 0, 0))).toEqual([]);
  });
});
