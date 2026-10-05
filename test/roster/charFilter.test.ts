// Фильтр «не всё надето» (features/roster/charFilter): кого доодеть
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { charMatches, isBare, type CharFilter } from '@/features/roster/charFilter';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const withBuilds = D.chars.find((c) => c.builds.length)!;
const noBuilds = D.chars.find((c) => !c.builds.length)!;
const BARE: CharFilter = { cq: '', cel: '', ccl: '', cOwned: false, cAll: false, cBare: true };

describe('«не всё надето»', () => {
  it('ничего не надето (нет записи) и 5 из 6 — показан; 6 из 6 — нет', () => {
    expect(isBare(withBuilds, new Map())).toBe(true);
    expect(isBare(withBuilds, new Map([[withBuilds.id, 5]]))).toBe(true);
    expect(isBare(withBuilds, new Map([[withBuilds.id, 6]]))).toBe(false);
  });

  it('героя без билдов и заменённого Core Fusion не показывает', () => {
    expect(isBare(noBuilds, new Map())).toBe(false);
    expect(isBare(withBuilds, new Map(), new Map([[withBuilds.id, 'cf']]))).toBe(false);
  });

  it('вместе с «только мои» — только герои ростера', () => {
    const roster = new Set([withBuilds.id]);
    const other = D.chars.find((c) => c.builds.length && c.id !== withBuilds.id)!;
    const f = { ...BARE, cOwned: true };
    expect(charMatches(withBuilds, f, roster, new Map())).toBe(true);
    expect(charMatches(other, f, roster, new Map())).toBe(false);
  });
});
