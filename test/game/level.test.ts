// The hero's level (.x/0205-hero-level): a level marked on the card (Ctx.lv, 100 or 120) wins over the `lv120` setting —
// «Уровень по умолчанию» — for every reader: flat vs % (flatFactor), white EFF (effOf); other heroes follow the default.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { lv120Of } from '@/game/hero/level';
import { flatFactor } from '@/game/build/score';
import { effOf } from '@/game/stat/eff';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const hero = (name: string) => D.chars.find((c) => c.name === name)!;
const ctxOf = (lv120: boolean, lv: Record<string, number> = {}) =>
  makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120, quirks: true }, new Set(), undefined, undefined, undefined, lv);

describe('the hero\'s level', () => {
  const iota = hero('Iota'), caren = hero('Caren');
  it('a mark wins over the default, both ways; no mark — the default; anything but 100/120 — the default', () => {
    expect([lv120Of(ctxOf(false, { [iota.id]: 120 }), iota), lv120Of(ctxOf(false, { [iota.id]: 120 }), caren)]).toEqual([true, false]);
    expect([lv120Of(ctxOf(true, { [iota.id]: 100 }), iota), lv120Of(ctxOf(true, { [iota.id]: 100 }), caren)]).toEqual([false, true]);
    expect(lv120Of(ctxOf(true, { [iota.id]: 110 }), iota)).toBe(true);
  });
  it('white EFF and flat vs % follow the hero\'s level (Iota: W 120 → 180; the flat ATK factor drops with a higher base)', () => {
    expect(effOf(ctxOf(false, { [iota.id]: 120 }), iota, [])!.w).toBe(180);
    expect(effOf(ctxOf(true, { [iota.id]: 100 }), iota, [])!.w).toBe(120);
    expect(flatFactor(ctxOf(false, { [iota.id]: 120 }), iota, 'ATK')).toBe(flatFactor(ctxOf(true), iota, 'ATK'));
    expect(flatFactor(ctxOf(false, { [iota.id]: 120 }), iota, 'ATK')).toBeLessThan(flatFactor(ctxOf(false), iota, 'ATK'));
  });
});
