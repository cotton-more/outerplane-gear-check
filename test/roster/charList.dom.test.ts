// @vitest-environment jsdom
// Вкладка «Персонажи» (.x/0070-more-sheet SPEC 4–6): режимы «Мои · Доодеть · Все», что запоминается, пустой ростер.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const [caren, kappa, adelie] = ['Caren', 'Kappa', 'Adelie'].map(char); // Adelie — без билдов
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, lit: Record<string, number>): Pc =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '' });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });

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

async function render() {
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
async function mount(extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars' }, item: {}, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  await render();
}
// «перезапуск»: страница заново, localStorage остаётся
async function restart() {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  await render();
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const names = () => $$('#cgrid .ctile').map((e) => e.getAttribute('title')?.split(' — ')[0]);
const mode = () => $('.cmode [aria-pressed="true"]')?.textContent;
const saved = () => JSON.parse(localStorage.getItem('ogc.state')!);

describe('режимы списка на странице', () => {
  // 1. «Мои» — все свои, с билдами и без, по алфавиту; у героя без билдов серый портрет
  it('1. «Mine»: ростер {Caren, Adelie без билдов} — видны оба, по алфавиту, у Adelie серый портрет', async () => {
    await mount({ roster: [caren.id, adelie.id], state: { tab: 'chars', cOwned: true } });
    expect(names()).toEqual(['Adelie', 'Caren']);
    expect($$('#cgrid .ctile').map((e) => e.classList.contains('nob'))).toEqual([true, false]);
  });

  // 2. «Все» — без билдов только поиском
  it('2. «All»: герой без билдов не виден; поиск по его имени — виден', async () => {
    await mount({ roster: [caren.id], state: { tab: 'chars', cOwned: false } });
    expect(names()).not.toContain('Adelie');
    await type($('#char-q') as HTMLInputElement, 'adelie');
    expect(names()).toEqual(['Adelie']);
  });

  it('3. «To dress»: свой с билдами и 3 из 6 — виден; одетый 6/6, свой без билдов и чужие — нет', async () => {
    const worn = Object.fromEntries(['helmet', 'armor', 'gloves', 'shoes', 'weapon', 'accessory'].map((s) => [s, 'p' + s]));
    const pieces = Object.keys(worn).map((s) => P('p' + s, s, { SPD: 1 }));
    await mount({
      roster: [caren.id, kappa.id, adelie.id], state: { tab: 'chars', cOwned: true },
      gear: G(pieces, { [kappa.id]: Object.values(worn) }, { worn: { [kappa.id]: worn } }),
    });
    await click(byText('.cmode button', 'To dress'));
    expect(names()).toEqual(['Caren']);
  });

  it('5. пустой ростер: переключателя нет, есть подсказка «☆ — отметь своих», список как «All»', async () => {
    await mount({ roster: [], state: { tab: 'chars', cOwned: true } });
    expect($('.cmode')).toBeNull();
    expect($('#char-list')?.textContent).toContain('☆ — mark yours: the evaluation will consider only them');
    expect(names().length).toBe(D.chars.filter((c) => c.builds.length).length);
  });

  it('6. пустой ростер, сохранено «Mine» → режим «All»; первая звёздочка режим не меняет', async () => {
    await mount({ roster: [], state: { tab: 'chars', cOwned: true } });
    const all = names().length;
    expect(saved().cOwned).toBe(false); // «Все» записано: после первой звёздочки список не схлопывается
    await click($('#cgrid .star'));
    expect(mode()).toContain('All');
    expect(names().length).toBe(all);
  });

  it('7. «Mine N» = размер ростера; «To dress N» = число из меню «To dress · N»', async () => {
    await mount({ roster: [caren.id, kappa.id], state: { tab: 'chars', cOwned: true } });
    expect($$('.cmode button').map((b) => b.textContent)).toEqual(['★ Mine 2', 'To dress 2', 'All']);
    await click($('.vb-tab')); // ← Оценка
    await click($('.vb-tab')); // ☰
    expect(byText('.menu-nav button', 'To dress · 2')).toBeTruthy();
  });

  // 8. «Мои» и «Все» запоминаются, «Доодеть» — нет
  it('8. «Mine» и «All» переживают перезапуск; «To dress» после него — «Mine»', async () => {
    await mount({ roster: [caren.id, kappa.id], state: { tab: 'chars', cOwned: false } });
    await click(byText('.cmode button', 'Mine'));
    await restart();
    expect(mode()).toContain('Mine');
    await click(byText('.cmode button', 'All'));
    await restart();
    expect(mode()).toBe('All');
    await click(byText('.cmode button', 'To dress'));
    expect(mode()).toContain('To dress');
    await restart();
    expect(mode()).toContain('Mine');
  });

  // 9. прежняя версия писала «показать и без билдов»
  it('9. сохранённое прежней версией («показать и без билдов») читается без ошибок', async () => {
    await mount({ roster: [caren.id], state: { tab: 'chars', cOwned: true, cAll: true, cel: '', ccl: '' } });
    expect(mode()).toContain('Mine');
    expect(saved()).not.toHaveProperty('cAll');
  });
});
