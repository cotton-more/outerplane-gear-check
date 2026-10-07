// @vitest-environment jsdom
// «Партия» on a phone (360px, .x/0110-batch): «Ещё» → «Партия», pieces in a row without a verdict, the list (fix,
// remove), the plan («Не брать»), «Сделал» with «Вернуть», the batch saved across a reload, ✕ asks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { moreButton, openMore } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren');
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, lit: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: 4, at: '2026-10-07', ...o });
const ok = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
// Caren wears Speed gloves and boots (T4) and an Epic Speed helmet
const GEAR = {
  v: 3, seq: 3,
  pieces: { g: P('g', 'gloves', ok), b: P('b', 'shoes', ok), h: P('h', 'helmet', { 'DEF%': 3, CHC: 3, CHD: 2 }, { grade: 'rare', bt: 0 }) },
  pools: { [caren.id]: ['g', 'b', 'h'] }, worn: { [caren.id]: { gloves: 'g', shoes: 'b', helmet: 'h' } },
};
const GOOD = { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 } };
const WEAK = { setId: speed, subs: { SPD: 1, RES: 1, EFF: 1, HP: 1 } };

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

async function mount(item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], gear: GEAR, state: { tab: 'eval', slot: 'helmet', grade: 'unique' }, item, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const batch = () => JSON.parse(localStorage.getItem('ogc.batch') ?? 'null');
const gear = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');
async function start() {
  await openMore();
  await click(moreButton('Batch'));
}

describe('«Партия» on a phone', () => {
  it('«Ещё» → «Партия»: the strip, no verdict; «Add · #1» adds the piece and clears the form', async () => {
    await mount(GOOD);
    expect($('.vcard')).toBeTruthy();                     // the usual verdict card first
    await start();
    expect($('.batch-strip .tryon-k')?.textContent).toBe('Batch · 0');
    expect($('.vcard')).toBeNull();                       // no verdict in the mode
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #1');
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(1);
    expect(batch().items[0]).toMatchObject({ slot: 'helmet', grade: 'unique', setId: speed, subs: GOOD.subs, bt: 0 });
    expect($('.batch-strip .tryon-k')?.textContent).toBe('Batch · 1');
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #2');
    expect(JSON.parse(localStorage.getItem('ogc.item') ?? '{}').subs ?? {}).toEqual({});
  });

  it('an incomplete piece is not added: the note says why', async () => {
    await mount({ setId: speed, subs: { SPD: 1 } });
    await start();
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(0);
    expect($('.batch-note')?.textContent).toBe('Not all substats entered — not added.');
  });

  it('the list: a tap loads the piece to fix it («Save #1»), ✕ removes it', async () => {
    await mount(GOOD, { batch: { v: 1, items: [{ slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, subs: WEAK.subs, bt: 0 }], skip: [], twin: [] } });
    expect($('.batch-strip')).toBeTruthy();               // the saved batch is back after a reload
    await click($('.batch-strip .batch-list'));
    expect($$('.batch-items .brow')).toHaveLength(1);
    await click($('.batch-items .brow-fix'));
    expect($('.vbar .vb-reset')?.textContent).toBe('Save #1');
    await click($('.batch-strip .batch-list'));
    await click($('.batch-items .brow-x'));
    expect(batch().items).toHaveLength(0);
  });

  it('the plan: the good Legendary goes on Caren, the weak one feeds it; «Done» records it, «Undo» brings all back', async () => {
    const items = [WEAK, GOOD].map((x) => ({ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...x }));
    await mount({ setId: speed, subs: {} }, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    const lines = $$('.batch-plan .brow').map((l) => l.querySelector('.bfate')?.textContent);
    expect(lines.slice(0, 2)).toEqual(['Feed to #2', 'Equip on Caren — instead of the helmet']);
    expect($('.batch-sum')?.textContent).toMatch(/^equip 1 · set aside 0 · Breakthrough 1 · dismantle \d$/);
    const before = gear();
    await click(byText('.batch button', 'Done'));
    expect(batch()).toBeNull();
    expect($('.batch-strip')).toBeNull();
    const after = gear();
    expect(after.pools[caren.id]).toHaveLength(3);        // the new helmet in, the Epic one out
    expect(Object.values(after.worn[caren.id])).not.toContain('h');
    expect($('.gear-toast')?.textContent).toContain('Batch recorded: 1 equipped, 0 set aside.');
    await click(byText('.gear-toast button', 'Undo'));
    expect(gear().pools).toEqual(before.pools);
    expect(gear().worn).toEqual(before.worn);
    expect(batch().items).toHaveLength(2);                // the batch is back
  });

  it('«Don\'t take» plans the line again without that hero', async () => {
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...GOOD }];
    await mount({ setId: speed, subs: {} }, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    expect($('.batch-plan .bfate')?.textContent).toMatch(/^Equip on Caren/);
    await click(byText('.batch-plan button', "Don't take"));
    expect(batch().skip).toEqual([`1>${caren.id}`]);
    expect($('.batch-plan .bfate')?.textContent).not.toMatch(/Caren/);
  });

  it('✕ with pieces asks; «End» clears the batch', async () => {
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK }];
    await mount(GOOD, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .tryon-x'));
    expect(byText('.drawer', 'End the batch? Pieces not planned: 1.')).toBeTruthy();
    await click(byText('.drawer button', 'End'));
    expect(batch()).toBeNull();
    expect($('.batch-strip')).toBeNull();
    expect($('.vcard')).toBeTruthy();                     // the verdict is back
  });
});
