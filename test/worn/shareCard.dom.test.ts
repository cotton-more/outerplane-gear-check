// @vitest-environment jsdom
// The shared hero card (PLAN 0190 Z8): another player's hero — the viewer's own stars don't change its numbers.
// Data — test/fixtures only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { createIndex } from '@/game/data';
import { IndexContext } from '@/game/data/IndexContext';
import { makeCtx } from '@/game/context';
import { LangContext } from '@/i18n';
import { en } from '@/i18n/en';
import type { Piece } from '@/features/gear/model/gear';
import { encodeHero } from '@/features/gear/store/heroCode';
import { layoutValue } from '@/features/gear/layout';
import { profileOf } from '@/game/build/profile';
import { ShareCard } from '@/screens/share/ShareCard';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const regina = D.chars.find((c) => c.name === 'Poolside Trickster Regina')!;
const crit = D.sets.find((s) => s.short === 'Critical Hit')!.id;
let root: Root | null = null;

const P = (slot: Piece['slot'], setId: string | null, lit: Piece['lit']): Piece =>
  ({ id: 'p' + slot, slot, grade: 'unique', setId, itemKey: null, main: null, yellow: lit, lit, bt: 4, at: '' });
const worn = {
  helmet: P('helmet', crit, { CHC: 4, SPD: 2 }), armor: P('armor', crit, { CHC: 2, SPD: 2 }),
  gloves: P('gloves', crit, { CHD: 3, SPD: 2 }), shoes: P('shoes', crit, { CHD: 3, SPD: 2 }),
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function shown(stars: Record<string, number>): Promise<string> {
  const code = encodeHero(regina.id, worn, null)!;
  const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), en, new Map(), stars);
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: idx },
    createElement(LangContext.Provider, { value: en }, createElement(ShareCard, { code, ctx, onClose: () => {} })))));
  return document.querySelector('.worn-h')?.textContent ?? '';
}

describe('shared hero card ignores the viewer\'s stars', () => {
  it('(sensitivity) with her own ★5 the same gear is worth fewer points — the crit loss', () => {
    const v = (stars: Record<string, number>) => {
      const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), en, new Map(), stars);
      return layoutValue(profileOf(ctx, regina)!, worn).v;
    };
    expect(v({ [regina.id]: 5 })).toBeLessThan(v({}) - 1);
  });

  it('Poolside Trickster Regina: the points (crit loss in them) are the same with ★5 set on the viewer\'s side and without it', async () => {
    const without = await shown({});
    expect(without).toMatch(/pts/);
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    expect(await shown({ [regina.id]: 5 })).toBe(without);
  });
});
