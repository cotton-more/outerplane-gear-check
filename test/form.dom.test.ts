// @vitest-environment jsdom
// Форма на телефоне (360px): без вердикта (нет сета, main или предмета) карточка вердикта не встаёт на место сетки,
// а то, чего не хватает, выделено; как только выбрано — карточка появляется.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';
import { TIPS } from '../src/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
// обучение пройдено, все подсказки знакомы — «Что нового» нет
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
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

describe('кубик Reforge на карточке', () => {
  const attack = D.sets.find((s) => s.short === 'Attack')!.id;

  it('Epic helmet «Разобрать»: у штампа «3/9», строка — три стата; в окне 4-го — три точки', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: attack, subs: { 'ATK%': 1, CHC: 1, RES: 1 } });

    expect($('.vcard .dice')?.textContent).toBe('3/9');
    expect([...document.querySelectorAll('.vcard .vc-gamble .pill.lucky')].map((e) => e.textContent)).toEqual(['SPD', 'CHD', 'ATK']);
    await act(async () => $('.subadd')!.click());
    expect([...document.querySelectorAll('.subopt .lucky-dot')].map((e) => e.closest('.subopt')!.querySelector(':scope > span:not([class])')!.textContent)).toEqual(['SPD', 'CHD', 'ATK']);
  });

  const texts = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.textContent);
  const helmet = (set: string, subs: Record<string, number>) => mount({ slot: 'helmet', grade: 'rare' }, { setId: D.sets.find((s) => s.short === set)!.id, subs });

  it('смешанный кубик: число на кубике — только к «Оставить», в строке и «Временно» (жёлтая точка), без «в разбор»', async () => {
    await helmet('Attack', { 'ATK%': 4, 'DMG UP%': 1, RES: 1 });

    expect($('.vcard .dice')?.textContent).toBe('3/9');
    expect($('.vcard .dice')?.getAttribute('title')).toContain('3 of 9');
    expect(texts('.vc-gamble .pill.lucky:has(.lucky-dot:not(.t))')).toEqual(['CHC', 'SPD', 'ATK']);
    expect(texts('.vc-gamble .pill.lucky:has(.lucky-dot.t)')).toEqual(['CHD', 'EFF%']);
    expect($('.vc-gamble')?.textContent).not.toMatch(/dismantle/i);
    expect($('.vcard')?.getAttribute('aria-label')).toMatch(/^Dismantle · Reforge gamble: 3 of 9/);
  });

  it('«Временно»: удачные этому персонажу — пунктиром с точкой в его цепочке, и второй вид flat-оси тоже', async () => {
    await helmet('Attack', { 'DMG UP%': 3, 'ATK%': 3, CHD: 3 });
    expect(texts('.vc-chain .pill.lucky')).toEqual(['CHC', 'SPD']);
    expect($('.vc-chain .pill.lucky .lucky-dot:not(.t)')).toBeTruthy();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';

    await helmet('Counterattack', { CHC: 4, CHD: 2, ATK: 2 });
    expect(texts('.vc-chain .pill.lucky')).toContain('ATK%');
  });

  it('«Временно», а удачные — у других персонажей: вместо цепочки строка кубика', async () => {
    await helmet('Defense', { CHC: 3, CHD: 2, EFF: 1 });

    expect($('.vc-chain')).toBeNull();
    expect(texts('.vc-gamble .pill.lucky')).toEqual(['SPD', 'DEF%', 'DEF', 'DMG RED%']);
  });

  it('Epic-оружие: кубик и точки жёлтые (→ «Временно»), в окне 4-го — только жёлтая легенда', async () => {
    await mount({ slot: 'weapon', grade: 'rare' }, { main: 'ATK%', subs: { CHC: 2, CHD: 1, RES: 1 } });

    expect($('.vcard .dice.t')?.textContent).toBe('4/8');
    expect(document.querySelectorAll('.vc-gamble .lucky-dot.t')).toHaveLength(4);
    await act(async () => $('.subadd')!.click());
    expect(document.querySelectorAll('.subopt .lucky-dot.t')).toHaveLength(4);
    expect(document.querySelectorAll('.note-line .lucky-dot')).toHaveLength(1);
    expect($('.note-line .lucky-dot.t')).toBeTruthy();
  });

  it('подробности: в каждой строке — цель и цепочка, где этот стат уже на месте; «почти»; что не выпадет из-за main', async () => {
    await helmet('Speed', { CHD: 4, RES: 2, HP: 1 });
    await act(async () => $('.vcard')!.click());

    const rows = [...document.querySelectorAll('.v-gamble li')];
    expect(rows.map((li) => li.querySelector('.pill.lucky')!.textContent)).toEqual(['CHC', 'SPD', 'EFF%']);
    for (const li of rows) expect(li.querySelector('.pill.new')?.textContent).toBe(li.querySelector('.pill.lucky')!.textContent);
    expect(rows.map((li) => li.querySelector('.stamp')!.className)).toEqual(['stamp s v-keep', 'stamp s v-temp', 'stamp s v-temp']);
    expect(texts('.v-gamble .g-near .pill.lucky')).toContain('SPD');
    expect($('.v-gamble')?.textContent).toContain('HP% — the main');
  });

  it('вкладка «Персонажи» на ширине от 380: кубик на плашке рядом со штампом', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    try {
      await mount({ slot: 'helmet', grade: 'rare', tab: 'chars' }, { setId: D.sets.find((s) => s.short === 'Attack')!.id, subs: { 'ATK%': 1, CHC: 1, RES: 1 } });
      expect($('.vbar .stamp')).toBeTruthy();
      expect($('.vbar .dice')?.textContent).toBe('3/9');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    }
  });

  it('Legendary — кубика нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: attack, subs: { 'ATK%': 1, CHC: 1, RES: 1, 'DMG RED%': 1 } });

    expect($('.vcard')).toBeTruthy();
    expect($('.dice')).toBeNull();
  });
});
