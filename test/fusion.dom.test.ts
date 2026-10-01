// @vitest-environment jsdom
// Core Fusion на живой странице 360px (правила владельца 2026-09-30, logic/fusion): загрузка и перенос v1 — остаётся
// Core Fusion, сообщение; окна перехода (звезда, «Надеть», примерка) в обе стороны и «Отмена»; пакетные добавления без
// окон; импорт кода v1 и v2 с обоими; список — X сразу за Core Fusion, с пометкой; карточка X.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';
import { TIPS } from '../src/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'), eternal = char('Eternal'), cfEternal = char('Core Fusion Eternal'), eps = char('Epsilon'), cfEps = char('Core Fusion Epsilon');
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const speed = set('Speed');
const NEW = { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } };
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const V1 = (pieces: Pc[], builds: Record<string, Record<string, string>>) => ({
  v: 1, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])),
  builds: Object.fromEntries(Object.entries(builds).map(([k, slots]) => [k, { slots, at: '' }])),
});
const b64 = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

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

async function mount(state: Record<string, unknown>, item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'eval', ...state }, item, ...extra };
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
const roster = () => JSON.parse(localStorage.getItem('ogc.roster')!);
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const tile = (name: string) => $$('#cgrid .cwrap').find((w) => w.querySelector('.ctile')?.getAttribute('title')?.startsWith(name + ' ') || w.querySelector('.ctile')?.getAttribute('title') === name);
const ask = () => $('.fusion-ask')?.closest<HTMLElement>('.drawer') ?? null;
const askBtn = (text: string) => byText('.fusion-ask .btn', text);
const importCode = async (code: string) => {
  await click(byText('.roster-bar .linkbtn', 'export'));
  const ta = $('#gear-code') as HTMLTextAreaElement;
  ta.value = code;
  await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
};

describe('обновление: загрузка и перенос v1', () => {
  // было: хранилище — как было до действия игрока; Р17 (2026-09-30) — исправленное записано сразу
  it('v2, вещи у обоих, в ростере X: в ростере Core Fusion, вещей X на карточке нет, сообщение; записано сразу', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 }), P('p2', 'armor', speed, { SPD: 2 })], { [eternal.id]: ['p1'], [cfEternal.id]: ['p2'] });
    await mount({ tab: 'chars', charId: eternal.id }, {}, { gear, roster: [eternal.id] });

    expect($('.gear-toast span')?.textContent).toBe('Core Fusion Eternal kept in the roster: Eternal is replaced, their gear removed.');
    expect($('.pool summary')).toBeNull();
    expect(tile('Core Fusion Eternal')?.querySelector('.star')?.getAttribute('aria-pressed')).toBe('true');
    expect({ pools: stored().pools, roster: roster() }).toEqual({ pools: { [cfEternal.id]: ['p2'] }, roster: [cfEternal.id] });
  });

  // было (a2-app «перенос v1: вещи только у X»): вещи оставались у X, а карточка X говорила «вещи у CF X»
  it('перенос v1: вещи только у X, в ростере X и Core Fusion — вещи у Core Fusion; на карточке X — «заменён», без вещей', async () => {
    const v1 = V1([P('p1', 'helmet', speed, { SPD: 2, CHC: 1 })], { [eps.id + '/Speed']: { helmet: 'p1' } });
    await mount({ tab: 'chars', charId: eps.id }, {}, { gear: v1, roster: [eps.id, cfEps.id] });

    expect($('.gear-toast span')?.textContent).toBe('Core Fusion Epsilon kept in the roster: Epsilon is replaced, their gear moved to Core Fusion Epsilon.');
    expect({ line: $('.own-row .linkbtn')?.textContent, pool: $('.pool summary')?.textContent }).toEqual({
      line: 'Epsilon is replaced by Core Fusion Epsilon: Core Fusion Epsilon is in the roster and has the gear.', pool: undefined,
    });
    await click($('.own-row .linkbtn'));
    expect($('.pool summary')?.textContent).toContain('Core Fusion Epsilon');
  });

  // было (a2-app «подсказка autoNew»): подсказка оставалась у X, у которого вещей больше нет (находка 16)
  it('перенос v1 с вещами у обоих: у X нет подсказки «теперь собирается сам»', async () => {
    const v1 = V1([P('p1', 'helmet', set('Immunity'), { CHC: 1 }), P('p2', 'helmet', speed, { SPD: 1 })],
      { [eps.id + '/Augment Immune']: { helmet: 'p1' }, [cfEps.id + '/Pen']: { helmet: 'p2' } });
    await mount({ tab: 'chars', charId: eps.id }, {}, { gear: v1, roster: [cfEps.id] });
    expect($('.cd-note')).toBeNull();
  });
});

// было: нормализация писалась первым действием игрока (flushFusion) — оба ключа сразу. Р17: пишется при загрузке, оба
// ключа; действие после неё пишет уже нормализованное
describe('нормализация записана целиком', () => {
  it('при загрузке, без действия: и ростер без X, и вещи X у Core Fusion', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 })], { [eternal.id]: ['p1'] });
    await mount({ tab: 'chars' }, {}, { gear, roster: [eternal.id, cfEternal.id] });
    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [cfEternal.id], pools: { [cfEternal.id]: ['p1'] } });
  });

  it('первое действие в экипировке («Надеть» на Caren): записаны и вещи, и ростер без X', async () => {
    const gear = G([P('p9', 'armor', speed, { SPD: 2 })], { [eternal.id]: ['p9'] });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear, roster: [caren.id, eternal.id, cfEternal.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Caren') as HTMLElement);
    expect({ roster: roster(), cf: stored().pools[cfEternal.id], x: stored().pools[eternal.id] })
      .toEqual({ roster: [caren.id, cfEternal.id], cf: ['p9'], x: undefined });
  });
});

describe('окна перехода', () => {
  it('«Вернуть» после «Да» — ростер, каким был, в том же порядке', async () => {
    const rin = char('Rin');
    await mount({ tab: 'chars' }, {}, { roster: [eternal.id, rin.id] });
    await click(tile('Core Fusion Eternal')?.querySelector('.star') as HTMLElement);
    await click(askBtn('Yes, Core Fusion Eternal'));
    expect(roster()).toEqual([cfEternal.id, rin.id]);
    await click(byText('.gear-toast button', 'Undo'));
    expect(roster()).toEqual([eternal.id, rin.id]);
  });

  // было (a2-app «X с вещами не в ростере, звезда на CF X»): вещи оставались у X. Р16: X с вещами при загрузке — в ростер
  it('X с вещами (при загрузке — в ростер), звезда на Core Fusion — окно; «Да» — вещи у Core Fusion, в ростере он; «Вернуть» — как было', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2, CHC: 1 })], { [eps.id]: ['p1'] });
    await mount({ tab: 'chars', charId: cfEps.id }, {}, { gear, roster: [] });
    await click($('.cd-star'));

    expect(ask()?.getAttribute('aria-label')).toBe('Mark Core Fusion Epsilon?');
    expect($('.fusion-ask p')?.textContent).toBe("All of Epsilon's gear (1) moves to Core Fusion Epsilon, and Epsilon becomes inactive: only Core Fusion Epsilon stays in the roster.");
    await click(askBtn('Yes, Core Fusion Epsilon'));
    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [cfEps.id], pools: { [cfEps.id]: ['p1'] } });
    await click(byText('.gear-toast button', 'Undo'));
    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [eps.id], pools: { [eps.id]: ['p1'] } });
  });

  it('звезда на Core Fusion, X в ростере с вещами — «Отмена» и ✕ ничего не меняют', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 })], { [eternal.id]: ['p1'] });
    await mount({ tab: 'chars' }, {}, { gear, roster: [eternal.id] });
    await click(tile('Core Fusion Eternal')?.querySelector('.star') as HTMLElement);
    await click(askBtn('Cancel'));
    await click(tile('Core Fusion Eternal')?.querySelector('.star') as HTMLElement);
    await click($('.drawer-x'));

    expect(ask()).toBeNull();
    expect({ gear: stored(), roster: roster(), toast: $('.gear-toast') }).toEqual({ gear, roster: [eternal.id], toast: null });
  });

  it('X без вещей — текст без части про вещи', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [eternal.id] });
    await click(tile('Core Fusion Eternal')?.querySelector('.star') as HTMLElement);
    expect($('.fusion-ask p')?.textContent).toBe('Eternal becomes inactive: only Core Fusion Eternal stays in the roster.');
  });

  it('звезда на X, Core Fusion в ростере с вещами — «Вернуться к X?»; «Да» — X в ростере, вещи Core Fusion у него', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 })], { [cfEternal.id]: ['p1'] });
    await mount({ tab: 'chars' }, {}, { gear, roster: [caren.id, cfEternal.id] });
    await click(tile('Eternal')?.querySelector('.star') as HTMLElement);

    expect(ask()?.getAttribute('aria-label')).toBe('Switch back to Eternal?');
    expect($('.fusion-ask p')?.textContent).toBe('Core Fusion Eternal leaves the roster; its gear (1) moves to Eternal.');
    await click(askBtn('Yes, Eternal'));
    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [caren.id, eternal.id], pools: { [eternal.id]: ['p1'] } });
    expect($('.gear-toast')?.textContent).toContain("Eternal replaces Core Fusion Eternal in the roster. Core Fusion Eternal's gear moved to Eternal.");
  });

  it('«Вернуться к X?» — «Отмена» ничего не меняет', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 })], { [cfEternal.id]: ['p1'] });
    await mount({ tab: 'chars', charId: eternal.id }, {}, { gear, roster: [cfEternal.id] });
    await click($('.cd-star'));
    await click(askBtn('Cancel'));
    expect({ gear: stored(), roster: roster() }).toEqual({ gear, roster: [cfEternal.id] });
  });

  it('«Надеть на Core Fusion», X в ростере — окно; «Да» — вещь у Core Fusion, строка в сообщении; «Вернуть» — и вещь, и X', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { roster: [caren.id, eternal.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'core fusion eter');
    await click(byText('.equip-row', 'Core Fusion Eternal') as HTMLElement);
    await click(askBtn('Yes, Core Fusion Eternal'));

    expect(roster()).toEqual([caren.id, cfEternal.id]);
    expect(stored().pools[cfEternal.id]).toHaveLength(1);
    expect($('.gear-toast small')?.textContent).toContain('Core Fusion Eternal replaces Eternal in the roster.');
    await click(byText('.gear-toast button', 'Undo'));
    expect({ roster: roster(), pieces: Object.keys(stored().pieces) }).toEqual({ roster: [caren.id, eternal.id], pieces: [] });
  });

  it('«Надеть на Core Fusion» — «Отмена»: вещь не надета, ростер тот же', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { roster: [caren.id, eternal.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'core fusion eter');
    await click(byText('.equip-row', 'Core Fusion Eternal') as HTMLElement);
    await click(askBtn('Cancel'));
    expect({ gear: stored(), roster: roster() }).toEqual({ gear: null, roster: [caren.id, eternal.id] });
  });

  it('примерка Core Fusion, X в ростере — окно; «Да» — примерка Core Fusion, в ростере он', async () => {
    await mount({ tab: 'chars', charId: cfEternal.id }, {}, { roster: [eternal.id] });
    await click(byText('.bgear-none .btn', 'Gear up this build'));
    await click(askBtn('Yes, Core Fusion Eternal'));
    expect(roster()).toEqual([cfEternal.id]);
    expect($('.tryon .tryon-n b')?.textContent).toBe('Core Fusion Eternal');
  });
});

// П9 (мелочь 1 повторного ревью): «Надеть» на Core Fusion при X с вещами — putOn после «Да», по пулу, где вещи X уже у
// него; строка «Кому надеть?» считается по тому же пулу. Было: «Equip — starts Speed», а после «Да» — «Replaced»
describe('«Надеть на Core Fusion» при X с вещами: строка — по пулу после перехода (П9)', () => {
  const HIT = { setId: speed, subs: { SPD: 4, 'ATK%': 3, CHC: 3, CHD: 3 } };
  const pick = async () => {
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'core fusion eter');
    return byText('.equip-row', 'Core Fusion Eternal') as HTMLElement;
  };

  it('у X слабый Speed-шлем: строка «Replace helmet…», после «Да» — «Replaced», шлем X убран', async () => {
    const gear = G([P('e1', 'helmet', speed, { HP: 1, RES: 1, DEF: 1, ATK: 1 }), P('e2', 'armor', set('Attack'), { SPD: 3, EFF: 3, CHC: 3, 'ATK%': 3 })], { [eternal.id]: ['e1', 'e2'] });
    await mount({ slot: 'helmet', grade: 'unique' }, HIT, { gear, roster: [eternal.id] });
    const row = await pick();
    const label = row.querySelector('.act')?.textContent;

    await click(row);
    await click(askBtn('Yes, Core Fusion Eternal'));

    expect(label).toMatch(/^Replace helmet/);
    expect($('.gear-toast span')?.textContent).toContain("Replaced: Core Fusion Eternal's helmet.");
    expect(stored().pools[cfEternal.id]).not.toContain('e1');
  });

  // «Уже есть» нет (решение владельца 2026-10-01): та же вещь у X — на уровне, строки Core Fusion X нет
  it('у X та же вещь: строки «Already has» нет — после перехода она ему ничего не даёт', async () => {
    const gear = G([P('e1', 'helmet', speed, HIT.subs)], { [eternal.id]: ['e1'] });
    await mount({ slot: 'helmet', grade: 'unique' }, HIT, { gear, roster: [eternal.id] });
    const row = await pick();
    expect(row).toBeUndefined();
  });

  it('примерка Core Fusion, X с вещами появился после её начала: кнопка под карточкой — по пулу после перехода', async () => {
    const gear = G([P('e1', 'helmet', speed, { HP: 1, RES: 1, DEF: 1, ATK: 1 })], { [eternal.id]: ['e1'] });
    await mount({ slot: 'helmet', grade: 'unique' }, HIT, { gear, roster: [eternal.id], tryon: { charId: cfEternal.id, build: 'Speed' } });
    const btn = $('.vc-equip')?.textContent;

    await click($('.vc-equip'));
    await click(askBtn('Yes, Core Fusion Eternal'));

    expect(btn).toMatch(/^Replace/);
    expect($('.gear-toast span')?.textContent).toContain("Replaced: Core Fusion Eternal's helmet.");
  });

  it('X без вещей — строка по пустому пулу, как без Core Fusion: «Equip — starts Speed», тост «Started filling Speed»', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, HIT, { roster: [eternal.id] });
    const row = await pick();
    const label = row.querySelector('.act')?.textContent;
    await click(row);
    await click(askBtn('Yes, Core Fusion Eternal'));
    expect(label).toMatch(/^Equip — starts Speed/);
    expect($('.gear-toast span')?.textContent).toMatch(/^On Core Fusion Eternal: helmet\..*Started filling Speed\./);
  });
});

describe('пакетные добавления — без окон, одно сообщение', () => {
  it('«Отметить показанных» с X и Core Fusion — в ростере только Core Fusion, сообщение', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [] });
    await type($('#char-q') as HTMLInputElement, 'eternal');
    await click(byText('.roster-bar .linkbtn', 'mark all shown'));

    expect(ask()).toBeNull();
    expect(roster()).toEqual([cfEternal.id]);
    expect($('.gear-toast span')?.textContent).toBe('Core Fusion Eternal kept in the roster: Eternal is replaced.');
  });

  it('код ростера «Добавить» Core Fusion, у X в ростере вещи — вещи переходят, сообщение; «Вернуть» — как было', async () => {
    const gear = G([P('p1', 'helmet', speed, { SPD: 2 })], { [eternal.id]: ['p1'] });
    await mount({ tab: 'chars' }, {}, { gear, roster: [eternal.id] });
    await click(byText('.roster-bar .linkbtn', 'export'));
    const ta = $('#roster-code') as HTMLTextAreaElement;
    ta.value = 'core-fusion-eternal';
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Add'));

    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [cfEternal.id], pools: { [cfEternal.id]: ['p1'] } });
    expect($('.gear-toast')?.textContent).toContain('Core Fusion Eternal kept in the roster: Eternal is replaced, their gear moved to Core Fusion Eternal.');
    await click(byText('.gear-toast button', 'Undo'));
    expect({ roster: roster(), pools: stored().pools }).toEqual({ roster: [eternal.id], pools: { [eternal.id]: ['p1'] } });
  });
});

describe('импорт кода с обоими', () => {
  const pieces = [P('p1', 'helmet', speed, { SPD: 2 }), P('p2', 'armor', speed, { SPD: 2 })];

  it('v2: у Core Fusion его вещи, вещи X убраны; в ростер — Core Fusion; «Вернуть» — всё как было', async () => {
    await mount({ tab: 'chars' }, {});
    const { encodeGear } = await import('../src/logic/gearStore');
    await importCode(encodeGear(G(pieces, { [eternal.id]: ['p1'], [cfEternal.id]: ['p2'] }) as never));

    expect({ pools: stored().pools, pieces: Object.keys(stored().pieces), roster: roster() })
      .toEqual({ pools: { [cfEternal.id]: ['p2'] }, pieces: ['p2'], roster: [caren.id, cfEternal.id] });
    expect($('.gear-toast')?.textContent).toContain('Added to the roster: Core Fusion Eternal.');
    expect($('.gear-toast small')?.textContent).toBe('Core Fusion Eternal kept in the roster: Eternal is replaced, their gear removed.');
    await click(byText('.gear-toast button', 'Undo'));
    expect({ roster: roster(), pieces: Object.keys(stored().pieces) }).toEqual({ roster: [caren.id], pieces: [] });
  });

  it('v1 (OGC-GEAR1): то же — у Core Fusion его вещи, вещи X убраны', async () => {
    await mount({ tab: 'chars' }, {});
    await importCode('OGC-GEAR1 ' + b64(V1(pieces, { [eternal.id + '/Speed']: { helmet: 'p1' }, [cfEternal.id + '/Speed']: { armor: 'p2' } })));
    expect({ pools: stored().pools, roster: roster() }).toEqual({ pools: { [cfEternal.id]: ['p2'] }, roster: [caren.id, cfEternal.id] });
  });

  it('вещи только у X, Core Fusion в ростере — вещи переходят к Core Fusion', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [cfEternal.id] });
    const { encodeGear } = await import('../src/logic/gearStore');
    await importCode(encodeGear(G(pieces.slice(0, 1), { [eternal.id]: ['p1'] }) as never));
    expect({ pools: stored().pools, roster: roster() }).toEqual({ pools: { [cfEternal.id]: ['p1'] }, roster: [cfEternal.id] });
  });
});

describe('список и карточка X', () => {
  it('X — сразу за Core Fusion, приглушён, с пометкой «replaced by Core Fusion X»', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [cfEternal.id] });
    const names = $$('#cgrid .ctile').map((e) => e.getAttribute('title')?.split(' — ')[0]);
    const x = tile('Eternal')!.querySelector('.ctile')!;

    expect(names[names.indexOf('Core Fusion Eternal') + 1]).toBe('Eternal');
    expect(x.classList.contains('off')).toBe(true);
    expect(x.querySelector('.coff')?.textContent).toBe('replaced by Core Fusion Eternal');
    expect(x.querySelector('.coff')?.getAttribute('data-tour')).toBe('fusion'); // якорь подсказки окна перехода
  });

  it('без Core Fusion X — на своём месте, без пометки', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [eternal.id] });
    expect(tile('Eternal')!.querySelector('.coff')).toBeNull();
  });

  it('карточка X: строка «заменён» ведёт на Core Fusion', async () => {
    await mount({ tab: 'chars', charId: eternal.id }, {}, { roster: [cfEternal.id] });
    await click(byText('.own-row .linkbtn', 'Eternal is replaced by Core Fusion Eternal'));
    expect($('.cd-head h2')?.textContent).toBe('Core Fusion Eternal');
  });

  it('«Кому надеть?» при Core Fusion X: X нет ни в списке, ни в поиске по имени', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { roster: [caren.id, cfEternal.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    const names = () => $$('.equip-row .nm b').map((e) => e.textContent);
    expect(names()).toContain('Core Fusion Eternal');
    await type($('.equip-q input') as HTMLInputElement, 'eter');
    expect(names().filter((n) => n?.includes('Eternal'))).toEqual(['Core Fusion Eternal']);
  });
});
