// @vitest-environment jsdom
// «Ещё» (.x/0070-more-sheet SPEC 1–3, 8, 9): одна шторка — на телефоне с нижней плашки (☰), на ПК из шапки (⋯); переходы
// только на узком экране; уведомления, настройки, данные; фраза VA Games внизу; подвала и кнопок под формой на ПК нет.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { encodeBackup } from '@/features/roster/backup';
import type { GearStore } from '@/features/gear/model/gear';
import { TIPS } from '@/tour/registry';
import { moreButton, openBackup, openMore } from './more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const [caren, kappa, rin] = ['Caren', 'Kappa', 'Rin'].map(char);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

const P = (id: string, slot: string, lit: Record<string, number>): Record<string, unknown> =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '' });
const GEAR = { v: 3, seq: 1, pieces: { p1: P('p1', 'helmet', { SPD: 1 }) }, pools: { [caren.id]: ['p1'] } };

const setWidth = (w: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  setWidth(360);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  localStorage.clear();
  history.replaceState(null, '', location.pathname);
  setWidth(360);
});

async function mount(extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'eval' }, item: {}, ...extra };
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
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const saved = () => JSON.parse(localStorage.getItem('ogc.state')!);
const nav = () => $$('.more-nav button').map((b) => b.textContent);

describe('1. шторка «Ещё» на телефоне', () => {
  it('16. первая группа — переходы: ★ Персонажи, «To dress · N», «Team trade»; после неё — действия и настройки', async () => {
    await mount({ roster: [caren.id, kappa.id], gear: GEAR });
    await openMore();
    expect($('.more')?.firstElementChild?.classList.contains('more-nav')).toBe(true);
    expect(nav()).toEqual(['★ Characters 2', 'To dress · 2', 'Team trade']);
    expect($$('.more-acts button').map((b) => b.textContent)).toEqual(['Enter code', 'Help', 'Tutorial']);
  });

  it('пустой ростер — «☆ Characters»', async () => {
    await mount({ roster: [] });
    await openMore();
    expect(nav()[0]).toBe('☆ Characters');
  });

  it('16. «To dress · N» открывает список в режиме «To dress»: поиск, стихия, класс сброшены, карточка героя закрыта', async () => {
    await mount({ roster: [caren.id, kappa.id], state: { tab: 'chars', cOwned: true, cel: 'water', ccl: 'healer', charId: caren.id } });
    await type($('#char-q') as HTMLInputElement, 'zzz');
    await openMore();
    await click(moreButton('To dress · 2'));
    expect($('.more')).toBeNull(); // нажатие на переход закрывает шторку
    expect($('.cmode [aria-pressed="true"]')?.textContent).toBe('To dress 2');
    expect(($('#char-q') as HTMLInputElement).value).toBe('');
    expect(saved()).toMatchObject({ tab: 'chars', cel: '', ccl: '', charId: null });
    expect($$('#cgrid .ctile .cn').map((e) => e.textContent)).toEqual(['Caren', 'Kappa']);
  });

  it('«Characters» — на вкладку; закрывается ✕, Esc и нажатием мимо', async () => {
    await mount();
    await openMore();
    await click($('.drawer-x'));
    expect($('.more')).toBeNull();
    await openMore();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('.more')).toBeNull();
    await openMore();
    await click($('.drawer-back'));
    expect($('.more')).toBeNull();
    await openMore();
    await click(moreButton('Characters'));
    expect(saved().tab).toBe('chars');
    expect($('.more')).toBeNull();
  });
});

describe('1.4, 2.2 «Ещё» на ПК', () => {
  it('17. «⋯» в шапке открывает «Ещё» без группы переходов', async () => {
    setWidth(1280);
    await mount();
    expect($('.top-more')?.getAttribute('aria-label')).toBe('More');
    await openMore();
    expect($('.more')).toBeTruthy();
    expect($('.more-nav')).toBeNull();
    expect($$('.more-acts button').map((b) => b.textContent)).toEqual(['Enter code', 'Help', 'Tutorial']);
    expect($('.drawer h3')?.textContent).toBe('More');
  });

  it('2.2 шапка: вкладки «Evaluate item» и «Characters ★N» и кнопка «⋯» после них; «⋯» доступна и на «Персонажах»', async () => {
    setWidth(1280);
    await mount({ roster: [caren.id, kappa.id], state: { tab: 'chars' } });
    expect($$('.top .tabs [role="tab"]').map((b) => b.textContent)).toEqual(['Evaluate item', 'Characters ★ 2']);
    expect($('.top .tabs')?.nextElementSibling?.classList.contains('top-more')).toBe(true);
    await openMore();
    expect($('.more')).toBeTruthy();
  });

  // 23. под формой остались только «Следующий» и подсказка клавиш
  it('23. под формой нет «Ввести код», «Справка», «Обучение», «только мои», «Настройки»; «Следующий» есть', async () => {
    setWidth(1280);
    await mount();
    const row = $('.actions')!;
    expect($$('.actions button').map((b) => b.textContent)).toEqual(['Next item']);
    for (const text of ['Enter code', 'Help', 'Tutorial', 'only my', 'settings', 'Evaluation']) expect(row.textContent).not.toContain(text);
    expect($('#eval-in .toggle')).toBeNull();
    expect($('#eval-in details')).toBeNull();
    expect($('#opt-roster')).toBeNull();
  });
});

describe('1.3 «Ещё»: уведомления', () => {
  // как app/usePwa: поддельный service worker, который отвечает на 'ogc:info'
  class FakeWorker extends EventTarget {
    sent: unknown[] = [];
    state: ServiceWorkerState = 'installed';
    constructor(public data: string) { super(); }
    postMessage(msg: unknown, transfer?: Transferable[]) {
      this.sent.push(msg);
      if ((msg as { type?: string } | null)?.type === 'ogc:info') (transfer![0] as MessagePort).postMessage({ version: 'v', data: this.data });
    }
  }
  const stubWorker = (waiting: FakeWorker | null, controller: object | null = {}) => {
    window.OGC_PWA = true;
    class Reg extends EventTarget { waiting = waiting; installing = null; update() { return Promise.resolve(); } }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller, register: () => Promise.resolve(new Reg()), addEventListener() {}, removeEventListener() {} },
    });
  };
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  afterEach(() => { window.OGC_PWA = undefined; Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined }); });

  it('22. «Готова новая версия · Обновить» — только когда ждёт обновление приложения; кнопка включает его', async () => {
    const w = new FakeWorker(D.meta.commit!);
    // worker ждёт не при загрузке (холодный запуск включил бы его сам): controller нет → пришёл позже — проверяем через состояние 'app'
    stubWorker(null);
    await mount();
    await openMore();
    expect($('.more')?.textContent).not.toContain('A new version is ready');
    await click($('.drawer-x'));
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    // ждёт при загрузке и те же данные → страница сама включает, а плашка «Готова новая версия» остаётся до перезагрузки
    stubWorker(w);
    await mount();
    await settle();
    await openMore();
    expect($('.more .fitnote')?.textContent).toContain('A new version is ready.');
    await click($('.more .fitnote button'));
    expect(w.sent).toContain('skipWaiting');
  });

  it('22. «Install as an app» — только когда браузер предлагает; подсказка для iPhone — на iOS', async () => {
    stubWorker(null);
    await mount();
    await openMore();
    expect($('.more')?.textContent).not.toContain('Install as an app');
    await click($('.drawer-x'));
    let prompted = 0;
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: () => { prompted++; return Promise.resolve(); }, userChoice: Promise.resolve() }));
    });
    await openMore();
    await click(moreButton('Install as an app'));
    expect(prompted).toBe(1);
  });

  it('22. на iPhone — подсказка «Share → Add to Home Screen»', async () => {
    const ua = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
    try {
      stubWorker(null);
      await mount();
      await openMore();
      expect($('.more-ios')?.textContent).toBe(TEXTS.en.ui.iosMore);
    } finally {
      if (ua) Object.defineProperty(navigator, 'userAgent', ua); else delete (navigator as { userAgent?: string }).userAgent;
    }
  });

  it('без обновления, установки и iOS уведомлений в «Ещё» нет', async () => {
    await mount();
    await openMore();
    expect($('.more-notes')).toBeNull();
  });
});

describe('1.3 «Ещё»: настройки и данные', () => {
  it('«Только мои персонажи (N)» — переключатель оценки, тот же, что был', async () => {
    await mount({ roster: [caren.id, kappa.id] });
    await openMore();
    const box = $('#menu-roster') as HTMLInputElement;
    expect(box.closest('label')?.textContent).toContain('only my characters (2)');
    expect(box.checked).toBe(true);
    await click(box);
    expect(saved().rosterOnly).toBe(false);
  });

  // 19. «Оценка»: строка со сводкой, раскрывается на месте; открыта ли — запоминается
  it('19. «Оценка»: сводка текущих настроек; раскрыть → стадия; смена стадии меняет вердикт; открытость запоминается', async () => {
    await mount({ state: { tab: 'eval', slot: 'weapon', grade: 'unique' }, item: { unlisted: true, main: 'ATK%', subs: { 'DEF%': 1, RES: 1, DEF: 1, HP: 1 } } });
    expect($('.vcard .stamp')?.textContent).toBe('Dismantle');
    await openMore();
    const row = $('#settings')!;
    expect(row.textContent).toContain('Evaluation');
    expect(row.textContent).toContain('progression · lv 100 · Quirks');
    expect($('.more .settings-body')).toBeNull();
    await click(row);
    expect(saved().settingsOpen).toBe(true);
    await click($$('.more .settings-body .fbtn').find((b) => b.textContent?.startsWith('Endgame')));
    expect(saved().stage).toBe('end');
    await click($('.drawer-x'));
    expect($('.vcard .stamp')?.textContent).toBe('Maybe');
    // закрыли и открыли снова — строка раскрыта, как оставили
    await openMore();
    expect($('.more .settings-body')).toBeTruthy();
    await click($('#settings'));
    expect(saved().settingsOpen).toBe(false);
  });

  it('язык: «Русский · English» переключает «Ещё» на месте', async () => {
    await mount();
    await openMore();
    expect($('.more-group h4')?.textContent).toBe('Settings');
    await click($$('.more .lang .fbtn').find((b) => b.textContent === 'Русский'));
    expect($('.drawer h3')?.textContent).toBe('Ещё');
    expect($$('.more-group h4').map((h) => h.textContent)).toEqual(['Настройки', 'Данные']);
    expect(JSON.parse(localStorage.getItem('ogc.lang')!)).toBe('ru');
  });

  // 24. значки: без сохранённого выбора — из игры; кто выбрал сам, остаётся при своём
  it('24. значки: без выбора — «game» нажата и в хранилище пусто; сохранённый «own» остаётся своим', async () => {
    await mount();
    await openMore();
    const sw = () => $$('.more .lang').find((g) => g.getAttribute('aria-label') === 'Icons')!;
    expect([...sw().querySelectorAll('.fbtn')].map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`)).toEqual(['game:true', 'own:false']);
    expect(localStorage.getItem('ogc.gameIcons')).toBeNull();
    await click($('.drawer-x'));
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    await mount({ gameIcons: false });
    await openMore();
    expect([...sw().querySelectorAll('.fbtn')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect($('.more')?.closest('body')?.querySelector('.ico')).toBeTruthy(); // свои значки — контурами
  });

  it('значки из игры по умолчанию: слоты на форме — картинки, а не контуры; выбрал «own» — контуры', async () => {
    await mount();
    expect($('.slotrow .slot .ico')).toBeNull();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    await mount({ gameIcons: false });
    expect($('.slotrow .slot .ico')).toBeTruthy();
  });

  // 18. «Резервная копия»: раскрыть → код (замена кодом и «Вернуть» — test/roster/backup.dom.test.ts)
  it('18. «Backup» закрыта, пока не раскроешь; раскрыл — код текущих ростера и вещей, «Copy» и «Replace»', async () => {
    await mount({ roster: [caren.id, rin.id], gear: GEAR });
    await openMore();
    expect($('#backup-code')).toBeNull();
    await click($('#more-backup'));
    const box = $('#backup-code') as HTMLTextAreaElement;
    expect(box.value).toBe(encodeBackup(GEAR as unknown as GearStore, [caren.id, rin.id]));
    expect($$('.xp-b .btn').map((b) => b.textContent)).toEqual(['Copy', 'Replace']);
    await click($('#more-backup'));
    expect($('#backup-code')).toBeNull();
  });

  it('18. «Replace» удался — шторка закрывается, на странице сообщение с «Undo»; не вышло — шторка и строка под полем остаются', async () => {
    await mount({ roster: [caren.id], gear: GEAR });
    const ta = await openBackup();
    ta.value = 'foo, bar';
    await click($$('.xp-b .btn').find((b) => b.textContent === 'Replace'));
    expect($('.more')).toBeTruthy();
    expect($('#io-msg')?.textContent).toBe("Didn't find a single hero.");
    ta.value = 'kappa';
    await click($$('.xp-b .btn').find((b) => b.textContent === 'Replace'));
    expect($('.more')).toBeNull();
    expect($('.gear-toast button')?.textContent).toBe('Undo');
  });

  it('«About»: откуда данные, версия игры, снимок, коммит, сколько героев и билдов; «Licenses (MIT)»', async () => {
    await mount();
    await openMore();
    expect($('.about')).toBeNull();
    await click($('#more-about'));
    const text = $('.about')!.textContent!;
    expect(text).toContain('outerpedia');
    expect(text).toContain('Sevih');
    expect(text).toContain(`game version ${D.meta.gameVersion}`);
    expect(text).toContain(String(D.meta.commit).slice(0, 7));
    expect(text).toContain(`${D.meta.counts.withBuilds} with builds, ${D.meta.counts.builds} builds`);
    expect($('.about .lic summary')?.textContent).toBe('Licenses (MIT)');
    // одиночная страница (не PWA) — как обновить данные
    expect(text).toContain('task build:single');
  });
});

describe('9. фраза VA Games, подвала нет', () => {
  const PHRASE = 'This content is an unofficial fan creation. All related IP rights belong to VA Games Co., Ltd.';

  it('20. подвала нет ни на телефоне, ни на ПК', async () => {
    await mount();
    expect($('footer')).toBeNull();
    expect($('.foot')).toBeNull();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    setWidth(1280);
    await mount();
    expect($('footer')).toBeNull();
    expect($('#foot')).toBeNull();
  });

  it.each([['en', TEXTS.en.ui.rights], ['ru', TEXTS.ru.ui.rights]] as const)('20. «Ещё» (%s): последняя строка шторки — фраза VA Games дословно, не спрятана в «О приложении»', async (lang, rights) => {
    await mount({ lang });
    await openMore();
    const foot = $('.drawer .more-rights')!;
    expect(foot.textContent).toBe(rights);
    expect(foot.textContent).toContain(PHRASE);
    expect(foot.parentElement?.lastElementChild).toBe(foot);
    expect(foot.closest('#more-about, details')).toBeNull();
  });

  it('фраза видна и при раскрытых «Backup» и «About»', async () => {
    await mount();
    await openMore();
    await click($('#more-backup'));
    await click($('#more-about'));
    expect($('.drawer .more-rights')?.textContent).toContain(PHRASE);
  });
});

describe('1.2 точка «новое»', () => {
  const FRESH = { ...DONE, known: {} }; // обновилось после его первого запуска

  it('21. пока есть непросмотренное «Что нового» — точка на ☰, на «Help»; просмотрел — нет', async () => {
    await mount({ tour: FRESH });
    await click($('.tour-invite .btn:last-child')); // «Later»
    expect($('.vb-tab.has-news')).toBeTruthy();
    await openMore();
    expect($('.more .has-news')?.textContent).toBe('Help');
    await click($('.more .has-news'));
    await click($('.drawer-x'));
    expect($('.vb-tab.has-news')).toBeNull();
  });

  it('21. на ПК — точка на «⋯»', async () => {
    setWidth(1280);
    await mount({ tour: FRESH });
    expect($('.top-more.has-news')).toBeTruthy();
    await openMore();
    expect($('.more .has-news')?.textContent).toBe('Help');
    await click($('.more .has-news'));
    expect($('.top-more.has-news')).toBeNull();
  });

  it('новости нет — точки нигде нет', async () => {
    await mount();
    expect($('.has-news')).toBeNull();
    await openMore();
    expect($('.has-news')).toBeNull();
  });
});
