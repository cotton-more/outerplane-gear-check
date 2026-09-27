// @vitest-environment jsdom
// Форма на телефоне (360px): без вердикта (нет сета, main или предмета) карточка вердикта не встаёт на место сетки,
// а то, чего не хватает, выделено; как только выбрано — карточка появляется.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: '2099-01-01', tips: false };
let root: Root | null = null;

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

async function mount(state: Record<string, unknown>, item: Record<string, unknown>) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, state: { tab: 'eval', ...state }, item };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('../src/App');
  const { IndexContext } = await import('../src/components/IndexContext');
  const { createIndex } = await import('../src/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);

describe('без вердикта карточки нет, нужное поле выделено', () => {
  it('Epic оружие: сабстаты есть, main нет — сетка на месте, кнопки main выделены; выбрал main — карточка', async () => {
    await mount({ slot: 'weapon', grade: 'rare' }, { subs: { SPD: 1, CHC: 1, CHD: 1 } });
    expect($('.vcard')).toBeNull();
    expect($('.statgrid')).toBeTruthy();
    expect($('.mainsw.need')).toBeTruthy();
    await act(async () => $('.mainsw .msw')!.click());
    expect($('.mainsw.need')).toBeNull();
    expect($('.vcard')).toBeTruthy();
    expect($('.vcard .stamp')?.textContent).not.toBe('…');
  });

  it('броня без сета: выделено поле сета; пока сабстатов нет — ничего не выделяем', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, {});
    expect($('.pick.need')).toBeNull();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    await mount({ slot: 'armor', grade: 'rare' }, { subs: { SPD: 1, CHC: 1, CHD: 1 } });
    expect($('.vcard')).toBeNull();
    expect($('[data-tour="pick"].need')).toBeTruthy();
  });

  it('Legendary оружие с main, но без предмета: выделено поле предмета', async () => {
    await mount({ slot: 'weapon', grade: 'unique' }, { subs: { SPD: 1 } });
    expect($('.mainsw.need')).toBeTruthy(); // сначала main
    await act(async () => $('.mainsw .msw:not([disabled])')!.click());
    expect($('[data-tour="item"].need')).toBeTruthy();
    expect($('.mainsw.need')).toBeNull();
  });
});
