// @vitest-environment jsdom
// Поле «Резервная копия» на «Персонажах» (.x/0060-share-code SPEC 2.3–2.4): что вставили — что происходит.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { encodeBackup } from '@/features/roster/backup';
import type { GearStore } from '@/features/gear/model/gear';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const [caren, kappa, rin, stella, eternal, cfEternal] = ['Caren', 'Kappa', 'Rin', 'Demiurge Stella', 'Eternal', 'Core Fusion Eternal'].map(char);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, lit: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '2026-10-01', ...o });
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

async function mount(extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars' }, item: {}, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
  await click($$('.roster-bar .linkbtn').find((b) => b.textContent === 'export / import'));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const raw = (k: string) => localStorage.getItem('ogc.' + k);
const box = () => $('#backup-code') as HTMLTextAreaElement;
const replace = async (code: string) => {
  box().value = code;
  await click([...box().closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
};
const line = () => $('#io-msg')?.textContent;
const toast = () => $('.gear-toast span')?.textContent ?? null;

const MINE = { roster: [rin.id, caren.id, kappa.id], gear: G([P('p1', 'helmet', { CHC: 2 }), P('p2', 'armor', { SPD: 1 })], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) };

describe('поле «Резервная копия»', () => {
  it('2.3 подпись, код текущих ростера и вещей, «Скопировать» и «Заменить», без «Добавить»', async () => {
    await mount(MINE);
    expect(box().closest('.roster-io')!.querySelector('label')?.textContent).toBe('Backup — roster and gear in one code');
    expect(box().value).toBe(encodeBackup(MINE.gear as GearStore, MINE.roster));
    expect([...box().closest('.roster-io')!.querySelectorAll('.btn')].map((b) => b.textContent)).toEqual(['Copy', 'Replace']);
    expect($('#roster-code')).toBeNull();
  });

  it('2.17 пусто: ни ростера, ни вещей — поле пустое', async () => {
    await mount({ roster: [] });
    expect(box().value).toBe('');
  });

  it('2.14 новый код → «Заменить» → «Вернуть»: ростер (с порядком) и вещи в точности прежние', async () => {
    await mount(MINE);
    const before = { roster: raw('roster'), gear: raw('gear') };
    const other = G([P('p1', 'gloves', { CHD: 3 }, { bt: 4 })], { [kappa.id]: ['p1'] });

    await replace(encodeBackup(other as GearStore, [stella.id, kappa.id]));

    expect(JSON.parse(raw('gear')!).pools).toEqual({ [kappa.id]: ['p1'] });
    expect(new Set(JSON.parse(raw('roster')!))).toEqual(new Set([stella.id, kappa.id]));
    expect(toast()).toBe('Backup loaded: 1 pieces, 2 heroes in the roster.');
    await click($$('.gear-toast button').find((b) => b.textContent === 'Undo'));
    expect({ roster: raw('roster'), gear: raw('gear') }).toEqual(before);
  });

  it('2.15 в коде и X, и Core Fusion X — остаётся Core Fusion, одно сообщение', async () => {
    await mount(MINE);
    const both = G([P('p1', 'helmet', { CHC: 1 }), P('p2', 'armor', { CHC: 1 })], { [eternal.id]: ['p1'], [cfEternal.id]: ['p2'] });

    await replace(encodeBackup(both as GearStore, [eternal.id, cfEternal.id]));

    expect({ roster: JSON.parse(raw('roster')!), pools: JSON.parse(raw('gear')!).pools }).toEqual({ roster: [cfEternal.id], pools: { [cfEternal.id]: ['p2'] } });
    expect($$('.gear-toast').length).toBe(1);
    expect($('.gear-toast small')?.textContent).toContain('Core Fusion Eternal kept in the roster');
  });

  it('2.12 старый код ростера «caren, demiurge-stella» — ростер из них и героев с вещами, есть «Вернуть»', async () => {
    await mount({ ...MINE, gear: G([P('p1', 'helmet', { CHC: 2 })], { [kappa.id]: ['p1'] }) });

    await replace('caren, demiurge-stella');

    expect(JSON.parse(raw('roster')!)).toEqual([caren.id, stella.id, kappa.id]);
    await click($$('.gear-toast button').find((b) => b.textContent === 'Undo'));
    expect(JSON.parse(raw('roster')!)).toEqual(MINE.roster);
  });

  it.each([
    ['текст без героев', 'foo, bar', "Didn't find a single hero."],
    ['код героя', 'OGH1abcdef', 'This is a hero code — open it with "Enter code".'],
    ['ссылка показа', 'https://x.github.io/outerplane-gear/#OGH1abcdef', 'This is a hero code — open it with "Enter code".'],
    ['мусор', '!!! что-то ???', "Can't read the code."],
    ['код новее', 'OGC-GEAR4-abc', 'A newer page saved this code — reload the page.'],
  ])('%s → строка под полем, ничего не меняется', async (_, code, msg) => {
    await mount(MINE);
    const before = { roster: raw('roster'), gear: raw('gear') };

    await replace(code);

    expect([line(), toast()]).toEqual([msg, null]);
    expect({ roster: raw('roster'), gear: raw('gear') }).toEqual(before);
  });

  it('2.8 повреждённый новый код → «повреждён или обрезан», ничего не меняется', async () => {
    await mount(MINE);
    const before = { roster: raw('roster'), gear: raw('gear') };
    const code = encodeBackup(MINE.gear as GearStore, MINE.roster);

    await replace(code.slice(0, -3));

    expect(line()).toBe('The code is damaged or cut off — copy all of it.');
    expect({ roster: raw('roster'), gear: raw('gear') }).toEqual(before);
  });

  it('2.16 экипировку сохранила более новая версия — подпись «обнови», «Заменить» недоступна', async () => {
    await mount({ gear: { v: 3, seq: 0, pieces: {}, pools: {} } });
    expect(box().closest('.roster-io')!.querySelector('label')?.textContent).toContain('reload the page');
    expect(([...box().closest('.roster-io')!.querySelectorAll('.btn')].find((b) => b.textContent === 'Replace') as HTMLButtonElement).disabled).toBe(true);
  });
});
