// @vitest-environment jsdom
// Вкладка «Надето» в карточке персонажа (шаг 6): порядок вкладок и вкладка по умолчанию, «Ввести» у пустого слота, «Да, всё
// надето», совет «из своих» и «Надеть» (в совете и в карточке вещи), «надета» в списке вещей. Данные — только из
// test/fixtures, не владельца. Логика — test/wearing.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';
import { TIPS } from '../src/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 };
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const WEAK = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4 });
const BETTER = P('p2', 'helmet', speed, NEW);
const SLOT6 = ['weapon', 'accessory', 'helmet', 'armor', 'gloves', 'shoes'];
const six = SLOT6.map((slot, i) => P('s' + (i + 1), slot, ['helmet', 'armor', 'gloves', 'shoes'].includes(slot) ? speed : null, { CHC: 2, SPD: 2 }, slot === 'weapon' || slot === 'accessory' ? { grade: 'rare' } : {}));

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
  history.replaceState(null, '', location.pathname);
});

async function mount(extra: Record<string, unknown>, state: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars', charId: caren.id, ...state }, item, ...extra };
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
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const stored = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');
const tabs = () => $$('.btabs button').map((b) => b.textContent);
const selected = () => $('.btabs button[aria-selected="true"]')?.textContent;

describe('вкладка «Надето»: порядок и вкладка по умолчанию', () => {
  it('герой ростера: «Надето» — первая вкладка, счётчик k/6', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect(tabs()[0]).toBe('Worn1/6');
  });

  it('что-то надето — вкладка «Надето» открывается сама', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect(selected()).toBe('Worn1/6');
    expect($('.worn-aim')?.textContent).toContain('Build — ');
  });

  it('ничего не надето — открывается билд героя, как раньше; «Надето 0/6» первая', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }) });
    expect(tabs()[0]).toBe('Worn0/6');
    expect(selected()).not.toContain('Worn');
  });

  it('героя нет в ростере — вкладки «Надето» нет', async () => {
    await mount({ roster: [] });
    expect(tabs().some((x) => x?.includes('Worn'))).toBe(false);
  });

  it('пустая вкладка: подсказка и строка билда «сменить ▾» есть всегда', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }) });
    await click(byText('.btabs button', 'Worn'));
    expect($('.worn-hint')?.textContent).toBe('Mark what Caren wears in game now.');
    expect($('.worn-aim button')?.textContent).toBe('change ▾');
    expect($('.worn-aim button')?.getAttribute('aria-label')).toBe('Change build for Caren');
  });
});

describe('заголовок сборки над вкладками', () => {
  // «Лучше всего собран…» / «По статам — ни один билд не начат» — про сборку билдов, а не про надетое
  it('на вкладке «Надето» его нет, на вкладке билда — есть', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect(selected()).toBe('Worn1/6');
    expect($('.cd-lead')).toBeNull();

    await click($$('.btabs button').find((b) => !b.textContent?.includes('Worn')));

    expect($('.cd-lead')).not.toBeNull();
  });
});

describe('«Ввести» у пустого слота', () => {
  it('режим героя на этот слот: грейд прежний, сет, сабстаты пусты', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) },
      { grade: 'rare', slot: 'helmet' }, { setId: speed, subs: NEW });
    const enter = $$('.bgear-empty').find((li) => li.textContent?.includes('Armor'))!.querySelector('button') as HTMLElement;
    await click(enter);

    const st = JSON.parse(localStorage.getItem('ogc.state')!), item = JSON.parse(localStorage.getItem('ogc.item')!);
    expect({ tab: st.tab, slot: st.slot, grade: st.grade, setId: item.setId ?? null, subs: item.subs }).toEqual({ tab: 'eval', slot: 'armor', grade: 'rare', setId: null, subs: {} });
    expect(JSON.parse(localStorage.getItem('ogc.tryon')!)).toMatchObject({ charId: caren.id });
    expect($('.tryon .tryon-n')?.textContent).toBe('Caren');
  });
});

describe('«Да, всё надето»', () => {
  const askShown = () => !!byText('.bgear-none button', 'Yes, all worn');

  it('по одной вещи на слот: кнопка есть, нажатие надевает всё, тост и «Вернуть»', async () => {
    await mount({ gear: G(six, { [caren.id]: six.map((p) => p.id as string) }) });
    await click(byText('.btabs button', 'Worn'));
    expect($('.bgear-none p')?.textContent).toBe('Caren has 6 pieces, at most one per slot. Are all of them worn now?');
    await click(byText('.bgear-none button', 'Yes, all worn'));

    expect(Object.keys(stored().worn[caren.id])).toHaveLength(6);
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: 6 pieces');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn?.[caren.id]).toBeUndefined();
  });

  it('пять вещей без брони — кнопка есть', async () => {
    const five = six.filter((p) => p.slot !== 'armor');
    await mount({ gear: G(five, { [caren.id]: five.map((p) => p.id as string) }) });
    await click(byText('.btabs button', 'Worn'));
    expect(askShown()).toBe(true);
  });

  it('два шлема в вещах — кнопки нет', async () => {
    await mount({ gear: G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }) });
    await click(byText('.btabs button', 'Worn'));
    expect(askShown()).toBe(false);
  });

  it('что-то уже надето — блока нет', async () => {
    await mount({ gear: G(six, { [caren.id]: six.map((p) => p.id as string) }, { worn: { [caren.id]: { helmet: 's3' } } }) });
    expect(askShown()).toBe(false);
  });
});

describe('совет «из своих» и «Надеть»', () => {
  it('лучший шлем в вещах: «Лучше из своих» с ▲, «Надеть» ставит его, тост, «Вернуть» — прежний', async () => {
    await mount({ gear: G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    const advice = $('.worn-advice')!;
    expect(advice.textContent).toMatch(/^Better in own pieces: Speed Set ▲ \+\d+%Wear$/);
    await click(advice.querySelector('button'));

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: Helmet');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[caren.id].helmet).toBe('p1');
  });

  it('пустой слот, вещь в пуле есть: «Из своих», без процента', async () => {
    const gloves = P('g', 'gloves', speed, { CHC: 2, SPD: 2 });
    await mount({ gear: G([WEAK, BETTER, gloves], { [caren.id]: ['p1', 'p2', 'g'] }, { worn: { [caren.id]: { helmet: 'p2' } } }) });
    expect($('.worn-advice')?.textContent).toMatch(/^From own pieces: Speed Set/);
  });
});

describe('«Надеть» в карточке вещи и «надета» в списке', () => {
  const pool = () => G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1' } } });

  it('у надетой вещи в списке — «worn», у ненадетой — где стоит', async () => {
    await mount({ gear: pool() });
    const rows = $$('.pool-list li');
    expect(rows[0].querySelector('.pool-w')?.textContent).toBe('worn');
    expect(rows[1].querySelector('.pool-w')?.textContent).not.toBe('worn');
  });

  it('ненадетая вещь: «Wear» в карточке надевает её, тост, «Вернуть»', async () => {
    await mount({ gear: pool() });
    await click($$('.pool-row')[1]);
    await click(byText('.piece-act button', 'Wear'));

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: Helmet');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[caren.id].helmet).toBe('p1');
  });

  it('надетая вещь: кнопки «Wear» в карточке нет', async () => {
    await mount({ gear: pool() });
    await click($$('.pool-row')[0]);
    expect(byText('.piece-act button', 'Wear')).toBeUndefined();
  });
});
