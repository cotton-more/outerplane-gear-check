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
import { TEXTS } from '../src/i18n';
import { CORE } from '../src/tour/core';
import { LIMITS } from '../src/tour/tips';

// в jsdom import.meta.url — не file:, берём путь от этого файла
// обучение пройдено, полоса была, ничего не «новое» (первый запуск в будущем)
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: '2099-01-01', tips: true };
const T = TEXTS.en.tour;
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
  history.replaceState(null, '', location.pathname); // тур «Экипировка» открывает Caren — #caren в адресе открыл бы её снова
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
// «Какое обучение?» → главный тур
const pickCore = () => click(byText('.tour-strip button', 'Checking a piece'));
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

    expect(strip()).toContain(T.stepOf(1, CORE.length));
    expect($('[data-tour="slot"]') && $('[data-tour="grade"]')).toBeTruthy();
    await click($('.slot[aria-label="Armor"]'));
    expect(strip()).toContain(T.stepOf(1, CORE.length)); // только броня: грейд ещё L
    await click($('.grade[aria-label="Epic"]'));

    expect(strip()).toContain(T.stepOf(2, CORE.length));
    expect(strip()).toContain('Speed Set');
    await click($('[data-tour="pick"]'));
    expect(strip()).toContain('Pick in the window'); // окно выбора открыто — узкая плашка
    await click(byText('.drawer .set', 'Speed'));

    expect(strip()).toContain(T.stepOf(3, CORE.length));
    for (const k of ['SPD', 'CHC', 'CHD']) await click(cell(k));

    expect(strip()).toContain(T.stepOf(4, CORE.length));
    await click($('.vcard[data-tour="verdict"]'));

    expect(strip()).toContain('Close the window'); // шаг 5, а шторка вердикта ещё открыта
    await click($('.drawer-x'));
    expect(strip()).toContain(T.stepOf(5, CORE.length));
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

describe('на примере — только то, что в примере', () => {
  it('лишний стат: шаг не засчитан, полоса подсказывает; снял лишний — дальше', async () => {
    await mount();
    await click(byText('.welcome button', 'Take it'));
    await click(byText('.tour-strip button', 'Example'));
    const { pinSelector } = await import('../src/tour/anchors');
    expect($(pinSelector('slot:armor')) && $(pinSelector('grade:rare'))).toBeTruthy();
    await click($('.slot[aria-label="Helmet"]'));
    expect(strip()).toContain(T.stepOf(1, CORE.length));
    await click($(pinSelector('slot:armor')));
    await click($(pinSelector('grade:rare')));
    await click($('[data-tour="pick"]'));
    expect($(pinSelector('sets:Speed'))).toBeTruthy();
    await click([...document.querySelectorAll<HTMLElement>('.drawer .set')].find((b) => !b.textContent?.includes('Speed')));
    expect(strip()).toContain(T.stepOf(2, CORE.length));
    expect(strip()).toContain('needs Speed Set');
    await click($('[data-tour="pick"]'));
    await click($(pinSelector('sets:Speed')));
    for (const k of ['SPD', 'HP%', 'CHC']) await click(cell(k));
    expect(strip()).toContain(T.stepOf(3, CORE.length));
    expect(strip()).toContain('only SPD, CHC and CHD');
    await click($(pinSelector('rows:HP%')));
    expect(strip()).toContain('Pick in the window');
    await click($(pinSelector('subpick:CHD')));
    expect(strip()).toContain(T.stepOf(4, CORE.length));
  });
});

describe('вещь игрока не теряется', () => {
  it('повтор из меню: вещь на форме откладывается, во время тура не перезаписывается и возвращается', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(cell('SPD'));
    await click(cell('ATK'));
    const item = localStorage.getItem('ogc.item');
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Tutorial'));
    expect(document.querySelectorAll('.subrow')).toHaveLength(0); // чистый лист
    expect(strip()).toContain(T.pick);
    await pickCore();
    await click(byText('.tour-strip button', 'Example'));
    await click($('.slot[aria-label="Armor"]'));
    expect(localStorage.getItem('ogc.item')).toBe(item);
    await click($('.tour-x'));
    expect($('.tour-strip')).toBeNull();
    expect(localStorage.getItem('ogc.item')).toBe(item);
    expect(document.querySelectorAll('.subrow')).toHaveLength(2);
    expect($('.toast')).toBeNull();
  });

  it('«Обучение» ещё раз посреди тура: начинаем сначала, а отложенной остаётся вещь игрока', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(cell('SPD'));
    await click(cell('ATK'));
    const item = localStorage.getItem('ogc.item'), state = localStorage.getItem('ogc.state');
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'Example'));
    await click($('.slot[aria-label="Armor"]'));
    await click($('.grade[aria-label="Epic"]'));
    await click(byText('.actions button', 'Tutorial'));
    expect(strip()).toContain(T.pick);
    await click($('.tour-x'));
    expect(localStorage.getItem('ogc.item')).toBe(item);
    expect(localStorage.getItem('ogc.state')).toBe(state);
    expect(document.querySelectorAll('.subrow')).toHaveLength(2);
  });

  it('во время тура слот, грейд и вкладка в ogc.state не меняются; в конце вкладка возвращается', async () => {
    await mount({ welcomeHidden: true, tour: DONE, state: { tab: 'chars', slot: 'gloves', grade: 'unique' } });
    const state = localStorage.getItem('ogc.state');
    await click(byText('.actions button', 'Tutorial')); // кнопка под формой есть в DOM и на вкладке персонажей
    await pickCore();
    await click(byText('.tour-strip button', 'Example'));
    await click($('.slot[aria-label="Armor"]'));
    await click($('.grade[aria-label="Epic"]'));
    expect(localStorage.getItem('ogc.state')).toBe(state);
    await click($('.tour-x'));
    expect(stored('state')).toMatchObject({ tab: 'chars', slot: 'gloves', grade: 'unique' });
  });

  it('Esc посреди тура закрывает его и не нажимает «Следующий»', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(cell('SPD'));
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'Example'));
    await esc();
    expect($('.tour-strip')).toBeNull();
    expect(document.querySelectorAll('.subrow')).toHaveLength(1);
    expect($('.toast')).toBeNull();
  });

  it('Esc при открытом окне закрывает окно, а тур идёт дальше', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'Example'));
    await click($('.slot[aria-label="Armor"]'));
    await click($('.grade[aria-label="Epic"]'));
    await click($('[data-tour="pick"]'));
    expect($('.drawer')).toBeTruthy();
    await esc();
    expect($('.drawer')).toBeNull();
    expect(strip()).toContain(T.stepOf(2, CORE.length));
  });

  it('на шаге «Следующий» Esc и есть «Следующий»; нечего очищать — закрывает тур', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'My own'));
    for (let i = 0; i < 2; i++) await click(byText('.tour-strip button', T.next));
    await click(cell('SPD'));
    await click(cell('ATK'));
    await click(cell('HP'));
    await click(cell('CHC'));
    await click(byText('.tour-strip button', T.next));
    expect(strip()).toContain(T.stepOf(5, CORE.length));
    await esc();
    expect(document.querySelectorAll('.subrow')).toHaveLength(0);
    expect(strip()).toContain("That's it");
    await click(byText('.tour-strip button', 'Done'));
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'My own'));
    for (let i = 0; i < 4; i++) await click(byText('.tour-strip button', T.next));
    await esc();
    expect($('.tour-strip')).toBeNull();
  });

  it('на своей вещи: не нажал «Следующий» — спросим, какую оставить', async () => {
    await mount({ welcomeHidden: true, tour: DONE });
    await click(cell('SPD'));
    await click(byText('.actions button', 'Tutorial'));
    await pickCore();
    await click(byText('.tour-strip button', 'My own'));
    await click(cell('HP'));
    await click($('.tour-x'));
    expect(strip()).toContain('Which one to keep');
    await click(byText('.tour-strip button', 'Keep this one'));
    expect([...document.querySelectorAll('.subrow')].map((r) => r.textContent)).toEqual([expect.stringContaining('HP')]);
  });
});

describe('низкое окно (полоска разделённого экрана)', () => {
  it('обучение само не предлагаем, а кнопка в меню работает', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    try {
      await mount({ roster: [D.chars[0].id] });
      expect($('.tour-invite')).toBeNull();
      await click($('.vb-tab'));
      await click(byText('.menu button', 'Tutorial'));
      expect(strip()).toContain(T.pick);
      await pickCore();
      expect(strip()).toContain('Use an example');
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
    }
  });

  it('у новичка в карточке нет «Пройти»', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 390 });
    try {
      await mount();
      expect($('.welcome')).toBeTruthy();
      expect(byText('.welcome button', 'Take it')).toBeUndefined();
    } finally {
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
    }
  });
});

describe('давний игрок', () => {
  it('тур не навязываем: полоса «Появилось обучение» — только в первый запуск, даже если её не закрыли', async () => {
    await mount({ roster: [D.chars[0].id] });
    expect($('.welcome')).toBeNull();
    expect($('.tour-invite')?.textContent).toContain(T.invite);
    expect(stored('tour')).toMatchObject({ first: 'skipped', invited: true });
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    await mount();
    // вместо неё теперь «Новое»: давнему игроку подсказки с news — новые
    expect($('.tour-invite')?.textContent).not.toContain(T.invite);
    expect($('.tour-invite')?.textContent).toContain(T.newsStrip(T.news.gear, 2));
  });

  it('новичок закрыл карточку «Понятно» — от тура отказался, полосы «Появилось обучение» нет', async () => {
    await mount();
    await click(byText('.welcome button', 'Got it'));
    expect($('.welcome')).toBeNull();
    expect($('.tour-invite')).toBeNull();
  });
});

describe('подсказки по ходу и «Что нового»', () => {
  const done = DONE;
  const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

  it('вкладка персонажей с пустым ростером: подсказка у звёздочки; нажал на звёздочку — подсказка увидена', async () => {
    // в jsdom нет раскладки: считаем видимым всё
    const orig = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList; };
    try {
      await mount({ welcomeHidden: true, tour: done, state: { tab: 'chars' } });
      await wait(LIMITS.idleMs + 700);
      expect($('.tour-tip')?.textContent).toContain('Star your characters');
      await act(async () => { $('.star')!.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
      await frame();
      expect($('.tour-tip')).toBeNull();
      expect(stored('tour').seen.star).toBe(1);
    } finally {
      Element.prototype.getClientRects = orig;
    }
  }, 10_000);

  it('после обновления — полоса «Новое»; «Позже» — точка на ☰ и «Справке»; открыл Справку — просмотрено', async () => {
    await mount({ welcomeHidden: true, tour: { ...done, since: '2026-01-01' } });
    expect($('.tour-invite')?.textContent).toContain(T.newsStrip(T.news.gear, 2));
    await click(byText('.tour-invite button', 'Later'));
    expect($('.tour-invite')).toBeNull();
    expect($('.vb-tab.has-news')).toBeTruthy();
    await click($('.vb-tab'));
    await click($('.menu .has-news'));
    expect($('.tips-help .tour-new')).toBeTruthy();
    expect(stored('tour').known).toMatchObject({ move: 1, dice: 1, gear: 1 });
    expect($('.vb-tab.has-news')).toBeNull();
  });

  it('«Показать подсказки заново» в Справке правда показывает их снова', async () => {
    await mount({ welcomeHidden: true, tour: { ...done, seen: { star: 1, code: 1, slot: 1 } } });
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Help'));
    await click(byText('.tips-help button', T.tipsReset));
    expect(stored('tour').seen).toEqual({ slot: 1 });
  });
});

describe('тур «Экипировка» на примере', () => {
  const kappa = D.chars.find((c) => c.name === 'Kappa')!;
  const speed = D.sets.find((x) => x.short === 'Speed')!.id;
  // у игрока своё: на Kappa · Speed — шлем, идёт примерка для Kappa
  const MINE = {
    welcomeHidden: true, tour: DONE, roster: [kappa.id], tryon: { charId: kappa.id, build: 'Speed' },
    gear: { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 1 }, lit: { CHC: 1 }, bt: null, at: '' } }, builds: { [kappa.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } },
    state: { tab: 'eval', slot: 'gloves', grade: 'rare' }, item: { setId: speed, subs: { SPD: 2 } },
  };
  const snapshot = () => ['gear', 'roster', 'tryon', 'state', 'item'].map((k) => localStorage.getItem('ogc.' + k));

  it('пять шагов нажатиями; записи игрока побайтно те же; в конце — его вкладка, форма и примерка', async () => {
    await mount(MINE);
    const before = snapshot();
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Tutorial'));
    await click(byText('.tour-strip button', 'Gear · 1 min'));

    expect(strip()).toContain(T.gearStepOf(1, 5));
    expect($('.char-detail.open h2')?.textContent).toBe('Caren');
    expect($('.tryon')).toBeNull(); // примерка Kappa на время тура снята
    await click($('[data-tour="gslots"] [data-tour-item="helmet"]'));

    expect(strip()).toContain(T.gearStepOf(2, 5));
    expect($('[data-tour="gpiece"]')).toBeTruthy();
    await click(byText('.piece-act button', 'Try a replacement'));

    expect(strip()).toContain(T.gearStepOf(3, 5));
    expect($('.tryon')?.textContent).toContain('Caren · Speed');
    expect(document.querySelectorAll('.subrow')).toHaveLength(4); // вещь примера на форме
    expect($('.vcard .vs.up')).toBeTruthy();
    await click(byText('.tour-strip button', T.next));

    expect(strip()).toContain(T.gearStepOf(4, 5));
    await click($('.vc-equip'));

    expect(strip()).toContain(T.gearStepOf(5, 5));
    expect($('.gear-toast')).toBeNull();
    await click($('.tryon-x'));

    expect(strip()).toContain('That was an example');
    await click(byText('.tour-strip button', 'Done'));
    expect($('.tour-strip')).toBeNull();
    expect(snapshot()).toEqual(before);
    expect($('.tryon')?.textContent).toContain('Kappa · Speed');
    expect(document.querySelectorAll('.subrow')).toHaveLength(1);
    expect(stored('tour').seen['tour.gear']).toBe(1);
  });

  it('давнему игроку «Что нового» — экипировка; «Показать» запускает тур', async () => {
    await mount({ welcomeHidden: true, tour: { ...DONE, since: '2026-01-01' } });
    expect($('.tour-invite')?.textContent).toContain(T.news.gear);
    await click(byText('.tour-invite button', 'Show'));
    expect(strip()).toContain(T.gearStepOf(1, 5));
  });

  it('✕ посреди тура — всё как было: примерки примера нет, форма игрока', async () => {
    await mount(MINE);
    const before = snapshot();
    await click(byText('.actions button', 'Tutorial'));
    await click(byText('.tour-strip button', 'Gear · 1 min'));
    await click($('[data-tour="gslots"] [data-tour-item="helmet"]'));
    await click(byText('.piece-act button', 'Try a replacement'));
    await click($('.tour-x'));
    expect(snapshot()).toEqual(before);
    expect($('.tryon')?.textContent).toContain('Kappa · Speed');
  });

  // на странице во время тура — экипировка тура: у «Экипировки» пример, у главного пусто (useGear persist = false).
  // Код показал бы её как резервную копию игрока, «Заменить» записал бы в неё, а «Вернуть» после тура — поверх его записей
  it.each([
    ['«Экипировка»', 'Gear · 1 min', null],
    ['главный', 'Checking a piece', 'Example'],
  ])('тур %s: кода экипировки нет, после тура — снова код игрока', async (_, pick, then) => {
    await mount(MINE);
    const before = snapshot();
    await click(byText('.actions button', 'Tutorial'));
    await click(byText('.tour-strip button', pick));
    if (then) await click(byText('.tour-strip button', then));
    // «Персонажи»: у «Экипировки» тур уже там, из главного — через ☰
    if (($('#view-chars') as HTMLElement).hidden) {
      await click($('.vb-tab'));
      await click(byText('.menu button', 'Characters'));
    }
    await click(byText('.roster-bar .linkbtn', 'export / import'));
    expect($('#gear-code')).toBeNull();
    expect($('#char-list')?.textContent).toContain(TEXTS.en.ui.gearCodeTour);
    await click($('.tour-x'));
    expect(snapshot()).toEqual(before);
    if (($('#view-chars') as HTMLElement).hidden) {
      await click($('.vb-tab'));
      await click(byText('.menu button', 'Characters'));
    }
    if (!$('#gear-code')) await click(byText('.roster-bar .linkbtn', 'export / import'));
    const { decodeGear } = await import('../src/logic/gear');
    const { createIndex } = await import('../src/data');
    expect(Object.keys(decodeGear(($('#gear-code') as HTMLTextAreaElement).value, createIndex(D))!.builds)).toEqual([kappa.id + '/Speed']);
  });

  it('«Вернуть» экипировки, начатое до тура, после тура не всплывает', async () => {
    // примерка Kappa · Speed: шлем с формы — кнопкой под карточкой
    await mount({ ...MINE, state: { tab: 'eval', slot: 'helmet', grade: 'unique' }, item: { setId: speed, subs: { CHC: 2, CHD: 2, SPD: 1, HP: 1 } } });
    await frame(); // кубик досчитывается следом (useDeferredValue) — кнопка встаёт после него
    await click($('.vc-equip'));
    expect($('.gear-toast')).toBeTruthy();
    await click(byText('.actions button', 'Tutorial'));
    await click(byText('.tour-strip button', 'Gear · 1 min'));
    await click($('.tour-x'));
    expect($('.gear-toast')).toBeNull();
  });
});
