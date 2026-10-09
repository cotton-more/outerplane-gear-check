// @vitest-environment jsdom
// Форма на телефоне (360px): без вердикта (нет сета, main или предмета) карточка вердикта не встаёт на место сетки,
// а то, чего не хватает, выделено; как только выбрано — карточка появляется. «T4» (у брони и Legendary оружия и
// аксессуара) и сегменты 1–6.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
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

async function mount(state: Record<string, unknown>, item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, state: { tab: 'eval', ...state }, item, ...extra };
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

describe('без вердикта карточки нет, нужное поле выделено', () => {
  // owner 2026-10-09: a weapon's main is picked in the grid, like an accessory's — only ATK%, DEF%, HP% are on
  it('Epic оружие: сабстаты есть, main нет — сетка выбирает main (ATK% / DEF% / HP%), поле main выделено; выбрал main — карточка', async () => {
    await mount({ slot: 'weapon', grade: 'rare' }, { subs: { SPD: 1, CHC: 1, CHD: 1 } });
    expect($('.vcard')).toBeNull();
    expect($('.statgrid.main-mode')).toBeTruthy();
    expect([...document.querySelectorAll<HTMLButtonElement>('.statgrid.main-mode .sg:not([disabled])')].map((b) => b.getAttribute('aria-label')).sort()).toEqual(['ATK%', 'DEF%', 'HP%']);
    expect($('[data-tour="pick"].need')).toBeTruthy();
    await act(async () => $('.statgrid.main-mode .sg[aria-label="ATK%"]')!.click());
    expect($('[data-tour="pick"].need')).toBeNull();
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

  it('оружие: main ATK% выбран в сетке — клетка ATK% становится «main» и сабстатом не бывает; нажатие снимает main', async () => {
    await mount({ slot: 'weapon', grade: 'rare' }, {});
    await act(async () => $('.statgrid.main-mode .sg[aria-label="ATK%"]')!.click());
    expect($('.statgrid.main-mode')).toBeNull();
    const cell = $('.statgrid .sg.is-main');
    expect(cell?.textContent).toContain('ATK%');
    await act(async () => cell!.click());
    expect($('.statgrid.main-mode')).toBeTruthy();
  });

  it('Legendary оружие с main, но без предмета: выделено поле предмета', async () => {
    await mount({ slot: 'weapon', grade: 'unique' }, { subs: { SPD: 1 } });
    expect($('[data-tour="pick"].need')).toBeTruthy(); // сначала main — в сетке
    await act(async () => $('.statgrid.main-mode .sg:not([disabled])')!.click());
    expect($('[data-tour="item"].need')).toBeTruthy();
    expect($('[data-tour="pick"].need')).toBeNull();
  });
});

// кубика Reforge нет (решение владельца 2026-10-01): вердикт — по вещи как есть, без «какой 4-й вытянет».
// Шаг 11: было — ещё проверки «нет .dice / .lucky-dot / .v-gamble»; этих классов в src больше нет, проверки проходили
// всегда — убраны. Остались те, что смотрят на текст вердикта. Тест «на плашке штамп без кубика» (ширина 420) убран:
// без .dice в нём оставалось только «штамп на плашке есть»
describe('свежая Epic с тремя сабстатами — без Reforge в вердикте', () => {
  const attack = D.sets.find((s) => s.short === 'Attack')!.id;

  it('«Разобрать»: строка карточки — причина, в подписи для диктора Reforge нет', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: attack, subs: { 'ATK%': 1, CHC: 1, RES: 1 } });

    expect($('.vcard .stamp')?.textContent).toBe('Dismantle');
    expect($('.vcard .vc-line')).toBeTruthy();
    expect($('.vcard')?.getAttribute('aria-label')).not.toMatch(/Reforge/);
  });

  // было (в тесте выше): «в окне 4-го — без точек» удачных статов кубика; точек нет вовсе — проверяем само окно
  it('«+ 4-й сабстат» на форме: статы вещи недоступны, остальные — да', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: attack, subs: { 'ATK%': 1, CHC: 1, RES: 1 } });

    await act(async () => $('.subadd')!.click());

    const opt = (k: string) => document.querySelector<HTMLButtonElement>(`.subopt[data-tour-item="${k}"]`);
    expect(['ATK%', 'CHC', 'RES', 'CHD'].map((k) => opt(k)?.disabled)).toEqual([true, true, true, false]);
  });

  it('«Временно», подробности: в «Прокачке» — Enhance и «не вкладывай», строк Reforge нет', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: attack, subs: { 'DMG UP%': 2, 'ATK%': 3, CHD: 3 } });
    await act(async () => $('.vcard')!.click());

    expect($('.vcard .stamp')?.textContent).toBe('Stopgap');
    const plan = [...document.querySelectorAll('.v-plan li')].map((li) => li.textContent);
    expect(plan).toEqual(['Enhance to +10 right away: it raises the main stat.', "Breakthrough — don't invest: it's a stopgap until the right piece drops."]);
  });
});

// «T4» рядом с сетом (шаг 8): бонус сета считается по Breakthrough — у каждой вещи свой. Вопрос 7 (б) ревью eval-only:
// и рядом с предметом Legendary оружия и аксессуара — материал такого же предмета
describe('«T4» на форме', () => {
  const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
  const chip = () => $('.formrow .btchip');
  const pressed = () => chip()?.getAttribute('aria-pressed');
  const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
  const key = async (k: string) => { await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }); };

  it.each(['helmet', 'armor', 'gloves', 'shoes'])('броня (%s): «T4» есть, не нажата; подпись и подсказка — из текстов', async (slot) => {
    await mount({ slot, grade: 'unique' }, { setId: set('Speed') });
    expect(pressed()).toBe('false');
    expect(chip()?.textContent).toBe('T4');
    expect(chip()?.getAttribute('aria-label')).toBe('Piece at Breakthrough T4');
    expect(chip()?.getAttribute('title')).toBe('Already at T4 — its set bonus counts at T4');
  });

  // было (В4): у оружия и аксессуара «T4» нет. Теперь у Legendary — в строке предмета, подсказка без бонуса сета
  it.each(['weapon', 'accessory'])('Legendary %s: «T4» в строке предмета, не нажата; подсказка — про Breakthrough, не про сет', async (slot) => {
    await mount({ slot, grade: 'unique' }, {});
    expect(pressed()).toBe('false');
    expect(chip()?.closest('.formrow')?.querySelector('[data-tour="item"]')).toBeTruthy();
    expect(chip()?.getAttribute('title')).toBe('Already at T4 — no more copies needed for its Breakthrough');
  });

  // было: у Epic «T4» нет. .x/0060 SPEC 4.1: есть, в одном ряду с грейдом и main (предмета у Epic нет)
  it.each(['weapon', 'accessory'])('Epic %s: «T4» — в ряду грейда, после main', async (slot) => {
    await mount({ slot, grade: 'rare' }, {});
    const rows = [...document.querySelectorAll('.form .formrow')];
    expect(rows).toHaveLength(1);
    expect(rows[0].lastElementChild?.getAttribute('data-tour')).toBe('bt');
  });

  it('Legendary аксессуар: main — рядом с грейдом, предмет и «T4» — второй строкой, как у оружия', async () => {
    await mount({ slot: 'accessory', grade: 'unique' }, {});
    const rows = [...document.querySelectorAll('.form .formrow')];
    expect(rows.map((r) => [...r.children].map((c) => c.getAttribute('data-tour') ?? c.className.split(' ')[0]))).toEqual([['grade', 'pick'], ['item', 'bt']]);
  });

  it('оружие: другой предмет снимает «T4», клавиша T — нажимает', async () => {
    const [a, b] = D.weapons.filter((i) => i.grade === 'unique' && i.star === 6);
    await mount({ slot: 'weapon', grade: 'unique' }, { itemKey: a.key, main: a.mains[0], t4: true });
    expect(pressed()).toBe('true');

    await click($('[data-tour="item"]'));
    await click([...document.querySelectorAll<HTMLElement>('.drawer .item')].find((el) => el.textContent?.includes(b.name)));
    expect(pressed()).toBe('false');

    await key('t');
    expect(pressed()).toBe('true');
  });

  // Anarky: годная Pen-броня Epic T0 в пуле; новая Pen-броня Epic с мусором — материал её Breakthrough. С «T4» новая
  // материалом не бывает (D6, .x/0085 FORMULA §4 п. 3а) — «Разобрать»
  it('нажатие меняет вход вердикта: без «T4» — Breakthrough для брони Anarky, с «T4» — тоже, но «сразу станет T4»', async () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const P = (id: string, slot: string, setId: string, yellow: Record<string, number>, o: Record<string, unknown> = {}) =>
      ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: 4, at: '', ...o });
    const good = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('a1', 'helmet', set('Defense'), good), P('a2', 'gloves', set('Defense'), good), P('a3', 'shoes', set('Penetration'), good),
      P('a4', 'armor', set('Penetration'), { 'DEF%': 3, CHC: 3, CHD: 2 }, { grade: 'rare', bt: 0 })];
    const gear = { v: 3, seq: 4, pieces: Object.fromEntries(pcs.map((p) => [p.id, p])), pools: { [anarky.id]: ['a1', 'a2', 'a3', 'a4'] } };
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Penetration'), subs: { HP: 1, 'DMG RED%': 1, RES: 1 } }, { gear, roster: [anarky.id] });
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vcard .vc-title')?.textContent).toBe("Breakthrough for Anarky's armor");

    await click(chip());

    expect(pressed()).toBe('true');
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    await click($('.vcard'));
    expect($('.v-plan, .vdrawer')?.textContent).toContain("Do it now: this one is T4 — Anarky's armor goes straight to T4.");
  });

  it('правка сабстата «T4» не снимает; «Следующий» — снимает', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Speed'), subs: { SPD: 1, CHC: 1 } });
    await click(chip());
    await click($('.subrow .roll-b button:nth-child(3)'));
    expect(pressed()).toBe('true');

    await click($('.actions .btn.primary'));

    expect(pressed()).toBe('false');
  });

  it('смена грейда снимает «T4»', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Speed'), t4: true });
    expect(pressed()).toBe('true');

    await click($('.grade.rare'));

    expect(pressed()).toBe('false');
  });

  it('смена сета снимает «T4»; тот же сет — нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Speed'), t4: true });
    await click($('[data-tour="pick"]'));
    await click($('.drawer [data-tour-item="Speed"]'));
    expect(pressed()).toBe('true');

    await click($('[data-tour="pick"]'));
    await click($('.drawer [data-tour-item="Attack"]'));

    expect(pressed()).toBe('false');
  });

  it('клавиша T (и Е на русской раскладке) нажимает и отжимает «T4»; в поле ввода — нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Speed') });
    await key('t');
    expect(pressed()).toBe('true');
    await key('е');
    expect(pressed()).toBe('false');

    const input = document.createElement('input');
    input.type = 'text';
    document.body.append(input);
    await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true })); });

    expect(pressed()).toBe('false');
  });
});

// сегменты 1–6 (шаг 8): 5–6 — после Reforge; сумма не выше предела грейда (game/item/subs levelCap)
describe('сегменты 1–6', () => {
  const speed = () => D.sets.find((s) => s.short === 'Speed')!.id;
  const btn = (row: number, n: number) => $(`.subrow:nth-child(${row}) .roll-b button:nth-child(${n})`);
  const level = (row: number) => document.querySelector(`.subrow:nth-child(${row}) .roll-b [aria-pressed="true"]`)?.textContent;
  const click = async (el: HTMLElement | null) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };

  it('кнопки 1–6; у 5 и 6 — подсказка «после Reforge», у 1–4 подсказки нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 1 } });
    const all = [...document.querySelectorAll('.subrow .roll-b button')];
    expect(all.map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(all.map((b) => b.getAttribute('title'))).toEqual([null, null, null, null, '5–6 — after Reforge', '5–6 — after Reforge']);
  });

  it('кнопки 5 и 6 ставят уровень', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 1, CHC: 1 } });
    await click(btn(1, 5));
    expect(level(1)).toBe('5');

    await click(btn(1, 6));

    expect(level(1)).toBe('6');
    expect($('.seg-cap')).toBeNull();
  });

  it('нажатие сверх предела (Legendary 22): уровень тот же, строка «больше 22 не бывает»; следующая правка её убирает', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 6, CHC: 6, CHD: 6, 'DEF%': 4 } });

    await click(btn(4, 5));

    expect(level(4)).toBe('4');
    expect($('.seg-cap')?.textContent).toBe("A piece can't have more than 22 segments — check the substats.");
    await click(btn(4, 3));
    expect(level(4)).toBe('3');
    expect($('.seg-cap')).toBeNull();
  });

  it('Epic — предел 17', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed(), subs: { SPD: 6, CHC: 6, CHD: 5 } });

    await click(btn(3, 6));

    expect(level(3)).toBe('5');
    expect($('.seg-cap')?.textContent).toBe("A piece can't have more than 17 segments — check the substats.");
  });
  // находка 9: было — 4-й сабстат сверх предела не добавлялся молча (окно закрылось, строки нет)
  it('«+ 4-й сабстат» сверх предела (Epic 6/6/5 = 17): сабстатов 3, строка «больше 17 не бывает»', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed(), subs: { SPD: 6, CHC: 6, CHD: 5 } });
    await click($('.subadd'));
    const atk = $('.subopt[data-tour-item="ATK%"]') as HTMLButtonElement | null; // HP% у шлема — main
    expect(atk?.disabled).toBe(false);

    await click(atk);

    expect(document.querySelectorAll('.subrow')).toHaveLength(3);
    expect($('.seg-cap')?.textContent).toContain('17');
  });

  it('сетка сверх предела (Epic 6/6/5 без сета): окна уровня нет, сабстат не добавлен, та же строка; снять стат сеткой можно', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { subs: { SPD: 6, CHC: 6, CHD: 5 } });

    await click($('.statgrid .sg[data-tour-item="ATK%"]'));

    expect($('.drawer.lvl')).toBeNull();
    expect(document.querySelectorAll('.subrow')).toHaveLength(3);
    expect($('.seg-cap')?.textContent).toContain('17');
    await click($('.statgrid .sg[data-tour-item="CHD"]'));
    expect(document.querySelectorAll('.subrow')).toHaveLength(2);
    expect($('.seg-cap')).toBeNull();
  });
});

// окно уровня (LevelAsk): нажатие в сетке — окно у клетки с кнопками 1–6; уровень — стат встаёт в строку с ним,
// отмена — стата нет
describe('окно уровня после сетки', () => {
  const speed = () => D.sets.find((s) => s.short === 'Speed')!.id;
  const click = async (el: HTMLElement | null) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
  const grid = (k: string) => $(`.statgrid .sg[data-tour-item="${k}"]`);
  const lvl = (n: number) => $(`.drawer.lvl .roll-b button:nth-child(${n})`);
  const rows = () => [...document.querySelectorAll('.subrow')].map((r) =>
    [r.querySelector('.subkey')?.getAttribute('data-tour-item'), r.querySelector('.roll-b [aria-pressed="true"]')?.textContent]);
  const key = (k: string) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

  it('нажатие в сетке — окно со статом в заголовке и кнопками 1–6, ни одна не нажата; в строках стата ещё нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed() });

    await click(grid('ATK%'));

    expect($('.drawer-back.pop .drawer.lvl')).toBeTruthy();
    expect($('.drawer.lvl h3')?.textContent).toBe('ATK% — how many segments?');
    expect([...document.querySelectorAll('.drawer.lvl .roll-b button')].map((b) => b.textContent)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect($('.drawer.lvl [aria-pressed="true"]')).toBeNull();
    expect(rows()).toEqual([]);
  });

  it('уровень в окне — стат в строке с ним, окно закрыто; следующий встаёт ниже', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed() });

    await click(grid('SPD'));
    await click(lvl(3));
    await click(grid('CHC'));
    await click(lvl(1));

    expect($('.drawer.lvl')).toBeNull();
    expect(rows()).toEqual([['SPD', '3'], ['CHC', '1']]);
  });

  it('✕, нажатие мимо окна и Esc — стат не добавлен', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 2 } });

    await click(grid('CHC'));
    await click($('.drawer.lvl .drawer-x'));
    await click(grid('CHC'));
    await click($('.drawer-back.pop'));
    await click(grid('CHC'));
    await key('Escape');

    expect($('.drawer.lvl')).toBeNull();
    expect(rows()).toEqual([['SPD', '2']]);
  });

  it('отмеченный стат в сетке снимается сразу, без окна', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 2, CHC: 3 } });

    await click(grid('SPD'));

    expect($('.drawer.lvl')).toBeNull();
    expect(rows()).toEqual([['CHC', '3']]);
  });

  it('клавиши 1–6 в окне ставят уровень, а не слот', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed() });

    await click(grid('SPD'));
    await key('4');

    expect(rows()).toEqual([['SPD', '4']]);
    expect($('.slot[aria-pressed="true"]')?.getAttribute('aria-label')).toBe('Helmet');
  });

  it('уровень сверх предела (Legendary 6/6/6 + 5 = 23): окно остаётся, в нём строка «больше 22 не бывает»; 4 — встаёт', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed(), subs: { SPD: 6, CHC: 6, CHD: 6 } });
    await click(grid('ATK%'));

    await click(lvl(5));

    expect($('.drawer.lvl .seg-cap')?.textContent).toContain('22');
    expect(rows()).toHaveLength(3);
    await click(lvl(4));
    expect($('.drawer.lvl')).toBeNull();
    expect(rows()).toEqual([['SPD', '6'], ['CHC', '6'], ['CHD', '6'], ['ATK%', '4']]);
  });

  it('«+ 4-й сабстат» у Epic — без окна уровня, с уровнем 1', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed(), subs: { SPD: 2, CHC: 2, CHD: 2 } });
    await click($('.subadd'));

    await click($('.subopt[data-tour-item="ATK%"]'));

    expect($('.drawer.lvl')).toBeNull();
    expect(rows()).toEqual([['SPD', '2'], ['CHC', '2'], ['CHD', '2'], ['ATK%', '1']]);
  });
});

// Legendary item picker: typing that leaves exactly one item picks it; no auto-focus without a mouse (phone keyboard)
describe('окно предмета: поиск', () => {
  const click = async (el: HTMLElement | null) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
  const type = (v: string) => act(async () => {
    const input = $('#item-q') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const names = () => [...document.querySelectorAll('.drawer .item b')].map((el) => el.textContent);
  const open = async () => {
    const a = D.weapons.find((i) => i.grade === 'unique' && i.star === 6)!;
    await mount({ slot: 'weapon', grade: 'unique' }, { itemKey: a.key, main: a.mains[0] });
    await click($('[data-tour="item"]'));
  };

  it('по алфавиту; на телефоне поле поиска без фокуса', async () => {
    await open();
    expect(names()).toEqual([...names()].sort((a, b) => a!.localeCompare(b!)));
    expect(document.activeElement).not.toBe($('#item-q'));
  });

  // fake timers: the 750 ms pause before the pick costs the test nothing
  const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); });
  afterEach(() => { vi.useRealTimers(); });

  it('осталось несколько — окно открыто; остался один — подсвечен, через 750 мс выбран, окно закрыто', async () => {
    await open();
    vi.useFakeTimers();
    await type('gorgon');
    expect(names()).toHaveLength(5);
    expect($('.drawer .item.soon')).toBeNull();
    await type('twin b');
    expect($('.drawer .item.soon b')?.textContent).toBe('Twin B');
    await wait(700);
    expect($('.drawer')).toBeTruthy();
    await wait(50);
    expect($('.drawer')).toBeNull();
    expect($('[data-tour="item"]')?.textContent).toContain('Twin B');
  });

  it('стёр, и совпадений снова несколько — выбор отменён', async () => {
    await open();
    vi.useFakeTimers();
    await type('twin b');
    await type('b');
    await wait(1000);
    expect($('.drawer')).toBeTruthy();
  });
});
