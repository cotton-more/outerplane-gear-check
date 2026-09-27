// @vitest-environment jsdom
// Обучение на живой странице (телефон 360px): тур проходится нажатиями, вещь игрока откладывается и возвращается,
// Esc не стирает вещь, давнему игроку — один раз полоса. В jsdom нет раскладки (getClientRects пуст), поэтому здесь
// проверяется логика и якоря в DOM, а не положение рамки — его считает place.ts (test/tour.test.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';

// в jsdom import.meta.url — не file:, берём путь от этого файла
const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
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

async function mount(saved: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  localStorage.setItem('ogc.lang', '"en"');
  const { App } = await import('../src/App');
  const { IndexContext } = await import('../src/components/IndexContext');
  const { createIndex } = await import('../src/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const byText = (sel: string, text: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent?.includes(text));
const click = async (el: HTMLElement | null | undefined) => {
  expect(el, 'нет элемента').toBeTruthy();
  await act(async () => el!.click());
  await frame();
};
// слой обучения меряет страницу раз в кадр (открыто ли окно, где якорь) — даём кадру пройти
const frame = () => act(() => new Promise<void>((r) => setTimeout(r, 40)));
const cell = (label: string) => [...document.querySelectorAll<HTMLElement>('.sg')].find((b) => b.querySelector(':scope > span:not(.ico)')?.textContent === label);
const strip = () => $('.tour-strip:not(.tour-invite)')?.textContent ?? '';
const stored = (k: string) => JSON.parse(localStorage.getItem('ogc.' + k) ?? 'null');
const esc = async () => {
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await frame();
};

describe('главный тур на примере', () => {
  it('новичок проходит пять шагов нажатиями; в конце форма как до тура, тур отмечен пройденным', async () => {
    await mount();
    await click(byText('.welcome button', 'Take it'));
    expect(strip()).toContain('Use an example');
    await click(byText('.tour-strip button', 'Example'));

    expect(strip()).toContain('Step 1 of 5');
    expect($('[data-tour="slot"]') && $('[data-tour="grade"]')).toBeTruthy();
    await click($('.slot[aria-label="Armor"]'));
    expect(strip()).toContain('Step 1 of 5'); // только броня: грейд ещё L
    await click($('.grade[aria-label="Epic"]'));

    expect(strip()).toContain('Step 2 of 5');
    expect(strip()).toContain('Speed Set');
    await click($('[data-tour="pick"]'));
    expect(strip()).toContain('Pick in the window'); // окно выбора открыто — узкая плашка
    await click(byText('.drawer .set', 'Speed'));

    expect(strip()).toContain('Step 3 of 5');
    for (const k of ['SPD', 'CHC', 'CHD']) await click(cell(k));

    expect(strip()).toContain('Step 4 of 5');
    await click($('.vcard[data-tour="verdict"]'));

    expect(strip()).toContain('Close the window'); // шаг 5, а шторка вердикта ещё открыта
    await click($('.drawer-x'));
    expect(strip()).toContain('Step 5 of 5');
    await click($('.vb-reset[data-tour="next"]'));

    expect(strip()).toContain("That's it");
    expect($('.toast')).toBeNull(); // «Вернуть» после «Следующего» в туре не показываем
    await click(byText('.tour-strip button', 'Done'));

    expect($('.tour-strip')).toBeNull();
    expect($('.welcome')).toBeNull();
    expect(stored('welcomeHidden')).toBe(true);
    expect(stored('tour')).toMatchObject({ first: 'done', seen: { slot: 1, pick: 1, grid: 1, verdict: 1, next: 1 } });
    expect(stored('state')).toMatchObject({ slot: 'gloves', grade: 'unique' }); // как было до тура
    expect(document.querySelectorAll('.subrow')).toHaveLength(0);
  });
});

describe('вещь игрока не теряется', () => {
  it('повтор из меню: вещь на форме откладывается, во время тура не перезаписывается и возвращается', async () => {
    await mount({ welcomeHidden: true, tour: { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: 'd', tips: true } });
    await click(cell('SPD'));
    await click(cell('ATK'));
    const item = localStorage.getItem('ogc.item');
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Tutorial'));
    expect(document.querySelectorAll('.subrow')).toHaveLength(0); // чистый лист
    await click(byText('.tour-strip button', 'Example'));
    await click($('.slot[aria-label="Armor"]'));
    expect(localStorage.getItem('ogc.item')).toBe(item);
    await click($('.tour-x'));
    expect($('.tour-strip')).toBeNull();
    expect(localStorage.getItem('ogc.item')).toBe(item);
    expect(document.querySelectorAll('.subrow')).toHaveLength(2);
    expect($('.toast')).toBeNull();
  });

  it('Esc посреди тура закрывает его и не нажимает «Следующий»', async () => {
    await mount({ welcomeHidden: true, tour: { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: 'd', tips: true } });
    await click(cell('SPD'));
    await click(byText('.actions button', 'Tutorial'));
    await click(byText('.tour-strip button', 'Example'));
    await esc();
    expect($('.tour-strip')).toBeNull();
    expect(document.querySelectorAll('.subrow')).toHaveLength(1);
    expect($('.toast')).toBeNull();
  });

  it('на своей вещи: не нажал «Следующий» — спросим, какую оставить', async () => {
    await mount({ welcomeHidden: true, tour: { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: 'd', tips: true } });
    await click(cell('SPD'));
    await click(byText('.actions button', 'Tutorial'));
    await click(byText('.tour-strip button', 'My own'));
    await click(cell('HP'));
    await click($('.tour-x'));
    expect(strip()).toContain('Which one to keep');
    await click(byText('.tour-strip button', 'Keep this one'));
    expect([...document.querySelectorAll('.subrow')].map((r) => r.textContent)).toEqual([expect.stringContaining('HP')]);
  });
});

describe('давний игрок', () => {
  it('тур не навязываем: один раз полоса «Появилось обучение», закрыл — больше не показываем', async () => {
    await mount({ roster: [D.chars[0].id] });
    expect($('.welcome')).toBeNull();
    expect($('.tour-invite')?.textContent).toContain('tutorial');
    expect(stored('tour')).toMatchObject({ first: 'skipped', invited: false });
    await click($('.tour-invite .tour-x'));
    expect($('.tour-invite')).toBeNull();
    expect(stored('tour').invited).toBe(true);
  });
});
