// Цепочка приоритета в вердикте: main stat предмета — «есть на предмете», а не пунктир «нет».
// Как main сдвигает места цепочки при подсчёте — test/armor.test.ts.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chain } from '../src/components/eval/Chain';
import { IndexContext } from '../src/components/IndexContext';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { decodeItem } from '../src/logic/itemCode';
import type { ItemInput } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true }, new Set());

// цепочки всех кандидатов вердикта, у чьих билдов в приоритете есть stat
function chains(item: ItemInput, stat: string): string[] {
  const rows = evaluate(ctx, item).sections.flatMap((s) => s.rows).filter((m) => m.b.subs.flat().some((k) => k.trim() === stat));
  return rows.map((m) => renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m }))));
}

describe('цепочка: main stat предмета', () => {
  it('Epic-аксессуар с main SPD (код KAXG DZ): SPD в цепочке — с пометкой main, не «нет на предмете»', () => {
    const r = decodeItem('KAXG DZ');
    if (!r.ok) throw new Error(r.error);
    expect(r.item).toMatchObject({ slot: 'accessory', main: 'SPD' });
    const html = chains(r.item, 'SPD');
    expect(html.length).toBeGreaterThan(0);
    for (const h of html) {
      expect(h).toContain('<span class="pill main"><small>main </small>SPD</span>');
      expect(h).not.toContain('pill miss">SPD');
    }
  });

  it('main ATK% и flat ATK сабстатом: на месте оси ATK оба — main ATK% / ATK', () => {
    const item: ItemInput = { slot: 'accessory', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { ATK: 2, CHC: 1, CHD: 1 } };
    const html = chains(item, 'ATK');
    expect(html.length).toBeGreaterThan(0);
    for (const h of html) expect(h).toMatch(/<span class="pill main[^"]*"><small>main <\/small>ATK%<\/span><i class="sep">\/<\/i><span class="pill [^"]+">ATK<\/span>/);
  });
});
