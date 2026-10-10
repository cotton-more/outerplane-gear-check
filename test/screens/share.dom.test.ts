// @vitest-environment jsdom
// «Показать героя» на живой странице 360px (DEVELOPMENT.md "features/worn"): «Поделиться» во «Надето», ссылка при запуске и в
// открытом приложении, «Ввести код», карточка показа — только просмотр, ничего не меняет.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { pinOptions } from '@/game/build/profile';
import { encodeHero } from '@/features/gear/store/heroCode';
import type { Piece } from '@/features/gear/model/gear';
import { openMore, startTour } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'), kappa = char('Kappa');
const noBuilds = D.chars.find((c) => !c.builds.length)!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, lit: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '2026-10-01', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const HELM = P('p1', 'helmet', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 2 }, { bt: 4 });
const ARM = P('p2', 'armor', { CHC: 2, SPD: 1 }, { bt: 0 });
const WORN = G([HELM, ARM], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1', armor: 'p2' } } });

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
  vi.unstubAllGlobals();
});

const STD = (extra: Record<string, unknown> = {}) => ({ lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars', charId: caren.id }, item: {}, gear: WORN, ...extra });
async function mount(saved: Record<string, unknown> | null = STD(), hash = '') {
  for (const [k, v] of Object.entries(saved ?? {})) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  if (!saved) localStorage.setItem('ogc.lang', '"en"');
  if (hash) history.replaceState(null, '', location.pathname + '#' + hash);
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
const card = () => $('.drawer.shown');
const closeCard = () => click(card()?.querySelector<HTMLElement>('.drawer-x'));
const snapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
const shareBtn = () => byText('.bgear.worn button', 'Share');
const codeOf = (pieces: Pc[], hero = caren.id, aim: string | null = `${caren.id}/Speed`) =>
  encodeHero(hero, Object.fromEntries(pieces.map((p) => [p.slot, p as unknown as Piece])), aim)!;
const goHash = async (hash: string) => {
  await act(async () => { history.replaceState(null, '', location.pathname + '#' + hash); window.dispatchEvent(new HashChangeEvent('hashchange')); });
};

describe('3.1 «Поделиться»', () => {
  it('надето 0 — кнопки нет; надето 1 — есть', async () => {
    await mount(STD({ gear: G([HELM], { [caren.id]: ['p1'] }) }));
    expect(shareBtn()).toBeUndefined();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
    await mount(STD({ gear: G([HELM], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) }));
    expect(shareBtn()).toBeTruthy();
  });

  // в обучении на странице пример или пусто: «Поделиться» не показываем вовсе (canShare)
  it('обучение идёт — кнопки нет', async () => {
    await mount(STD({ state: { tab: 'eval' } }));
    await startTour();
    await click(byText('.tour-strip button', 'Checking a piece'));
    await click(byText('.tour-strip button', 'Example'));
    await openMore();
    await click(byText('.more button', 'Characters'));
    await click($$('#cgrid .ctile').find((b) => b.textContent?.includes('Caren')));
    expect(byText('#char-detail .btabs [role="tab"]', 'Worn')).toBeTruthy();
    expect(shareBtn()).toBeUndefined();
  });

  it('экипировку сохранила более новая версия — кнопки нет', async () => {
    await mount(STD({ gear: { v: 3, seq: 0, pieces: {}, pools: {} } }));
    expect(shareBtn()).toBeUndefined();
  });
});

describe('3.2 нажатие', () => {
  it('есть системное «Поделиться» — его вызвали со ссылкой на код героя', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share });
    await mount();
    await click(shareBtn());
    const url = (share.mock.calls[0] as unknown as [{ url: string }])[0].url;
    expect(url.startsWith(`${location.origin}${location.pathname}#OGH`)).toBe(true);
    expect(url.split('#')[1].length).toBeLessThanOrEqual(64);
  });

  it('нет — ссылка в буфер, «Link copied»', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    await mount();
    await click(shareBtn());
    expect((writeText.mock.calls[0] as unknown as [string])[0]).toMatch(/#OGH/);
    expect($('.worn-share [role="status"]')?.textContent).toBe('Link copied');
  });

  it('нет и буфера — ссылка строкой', async () => {
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: undefined });
    await mount();
    await click(shareBtn());
    expect($('.worn-share .share-link')?.textContent).toMatch(/#OGH/);
  });
});

describe('3.3 ссылка и карточка', () => {
  it('3.8 чистый профиль, открыта ссылка — карточка на экране; после ✕ сохранено то же, что при обычном запуске', async () => {
    await mount(null);
    const plain = snapshot();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    localStorage.clear();

    await mount(null, codeOf([HELM, ARM]));

    expect(card()?.getAttribute('aria-label')).toBe('Shared · view only');
    expect(card()?.querySelector('h2')?.textContent).toContain('Caren');
    expect(location.hash).not.toContain('OGH');
    await closeCard();
    expect(card()).toBeNull();
    expect(snapshot()).toEqual(plain);
  });

  it('3.9–3.10 приложение открыто, адрес сменился на ссылку — карточка поверх; ✕ — всё как до неё, кода в адресе нет', async () => {
    await mount(STD({ roster: [caren.id, kappa.id], state: { tab: 'chars', charId: kappa.id }, item: { setId: speed, subs: { SPD: 2 } } }));
    const before = snapshot();
    const hash = location.hash;

    await goHash(codeOf([HELM]));

    expect(card()).toBeTruthy();
    expect(location.hash).toBe(hash);
    await closeCard();
    expect({ card: card(), hash: location.hash, saved: snapshot() }).toEqual({ card: null, hash, saved: before });
    expect($('.cd-head h2')?.textContent).toContain('Kappa');
  });

  it('3.12 карточка: полоса с ✕, нет звезды, «к списку», обмена, вкладок билдов, пула, «Ввести»; строки вещей не кнопки', async () => {
    await mount(STD({ roster: [], state: { tab: 'eval' } }), codeOf([HELM, ARM]));
    const c = card()!;
    expect(c.querySelector('.drawer-h h3')?.textContent).toBe('Shared · view only');
    for (const sel of ['.cd-star', '.cd-top', '.btabs', '.pool', '.cd-rate', '.bgear-empty .btn', '.worn-advice', '.worn-share', '.worn-t', '#worn-budget']) {
      expect(c.querySelector(sel), sel).toBeNull();
    }
    expect([...c.querySelectorAll('button')].map((b) => b.className)).toEqual(['drawer-x']);
    expect([...c.querySelectorAll('a')].map((a) => a.className)).toEqual(['cd-opedia']);
    expect(c.querySelectorAll('div.bgear-row')).toHaveLength(2);
    expect(c.querySelector('[data-tour]')).toBeNull();
  });

  it('3.13 строки карточки — как во «Надето» того же героя на тех же вещах', async () => {
    await mount();
    const mine = $('#char-detail .bgear.worn')!.cloneNode(true) as HTMLElement;
    for (const x of mine.querySelectorAll('.worn-share, .bgear-act, .pot, .worn-t > [aria-hidden]')) x.remove(); // the T4 line and the budget's arrow are not on the shared card
    const code = (() => {
      let got = '';
      vi.stubGlobal('navigator', { ...navigator, share: (d: { url: string }) => { got = d.url; return Promise.resolve(); } });
      return () => got.split('#')[1];
    })();
    await click(shareBtn());

    await goHash(code());

    expect(card()!.querySelector('.bgear.worn')!.textContent).toBe(mine.textContent);
  });

  it('3.14 героя нет в данных — «нет в твоих данных», без вещей', async () => {
    await mount(STD(), codeOf([HELM], '2999999', null));
    expect(card()?.textContent).toContain("This hero isn't in your data — reload the page.");
    expect(card()?.querySelector('.bgear')).toBeNull();
  });

  it('3.14 сета нет в данных — «not in your data» в строке, прочие вещи на месте', async () => {
    await mount(STD(), codeOf([{ ...HELM, setId: '99' }, ARM]));
    const rows = [...card()!.querySelectorAll('.bgear-row .bgear-n')].map((n) => n.textContent);
    expect(rows).toEqual(['Lnot in your data', 'LSpeed Set']);
  });

  it('3.14 у героя нет билдов — строки билда нет, чипы без подсветки', async () => {
    await mount(STD(), codeOf([HELM], noBuilds.id, null));
    expect(card()?.querySelector('.worn-aim')).toBeNull();
    expect(card()?.querySelectorAll('.bgear-row')).toHaveLength(1);
  });

  // stat-sets этап 6: вместо билда — закреплённый набор (PLAN Д9); набора в данных смотрящего нет — строки нет
  it('3.6 закреплённый набор отправителя — «Pinned: …»; набора нет в данных — без строки', async () => {
    const pin = pinOptions(caren)[0];
    await mount(STD(), codeOf([HELM], caren.id, pin.key));
    expect(card()?.querySelector('.worn-aim')?.textContent).toBe('Pinned: Speed ×4');
    await closeCard();
    await goHash(codeOf([HELM], caren.id, `${caren.id}/No such build#1x4`));
    expect(card()?.querySelector('.worn-aim')).toBeNull();
  });

  it('3.15 ссылка повреждена — «попроси ещё раз», карточки героя нет; новее — «обнови»', async () => {
    const code = codeOf([HELM]);
    await mount(STD(), code.slice(0, -2));
    expect(card()?.textContent).toContain('The link is damaged — ask for it again.');
    expect(card()?.querySelector('.cd-head')).toBeNull();
  });
});

describe('3.11 «Ввести код»', () => {
  const enter = async (text: string) => {
    await openMore();
    await click(byText('.more button', 'Enter code'));
    const input = $('.codein input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => (input.form as HTMLFormElement).requestSubmit());
  };

  it.each([
    ['код героя', (c: string) => c],
    ['ссылка целиком', (c: string) => `https://example.com/outerplane-gear/#${c}`],
  ])('%s — карточка, форма не тронута', async (_, wrap) => {
    await mount(STD({ state: { tab: 'eval', slot: 'helmet', grade: 'unique' }, item: { setId: speed, subs: { SPD: 2 } } }));
    const item = localStorage.getItem('ogc.item');

    await enter(wrap(codeOf([HELM])));

    expect(card()).toBeTruthy();
    expect($('.codein')).toBeNull();
    expect(localStorage.getItem('ogc.item')).toBe(item);
  });

  // 25. код резервной копии в «Ввести код» — отсылка в «Ещё → Резервная копия»
  it('25. резервная копия — «загрузи её в «Ещё» → «Резервная копия»»', async () => {
    await mount(STD({ state: { tab: 'eval' } }));
    const { encodeBackup } = await import('@/features/roster/backup');
    await enter(encodeBackup(WORN as never, [caren.id]));
    expect($('.codein .err')?.textContent).toBe('This is a backup — load it in More → Backup.');
  });
});

describe('3.16 пока открыта карточка — обучение молчит', () => {
  it('новичку карточка новичка — после закрытия показа', async () => {
    await mount({ lang: 'en' }, codeOf([HELM]));
    expect($('.welcome')).toBeNull();
    await closeCard();
    expect($('.welcome')).toBeTruthy();
  });

  it('давнему игроку полоса «Новое» — после закрытия показа', async () => {
    await mount(STD({ tour: { ...DONE, known: {} }, state: { tab: 'eval' } }), codeOf([HELM]));
    expect($('.tour-invite')).toBeNull();
    await closeCard();
    expect($('.tour-invite')).toBeTruthy();
  });
});
