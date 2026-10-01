// @vitest-environment jsdom
// Форма на телефоне (360px): без вердикта (нет сета, main или предмета) карточка вердикта не встаёт на место сетки,
// а то, чего не хватает, выделено; как только выбрано — карточка появляется. «T4» (у брони и Legendary оружия и
// аксессуара) и сегменты 1–6.
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

async function mount(state: Record<string, unknown>, item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, state: { tab: 'eval', ...state }, item, ...extra };
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
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: attack, subs: { 'DMG UP%': 3, 'ATK%': 3, CHD: 3 } });
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

  // у Epic предмета на форме нет — такую же вещь не найти, «T4» ни на что бы не влияла
  it.each(['weapon', 'accessory'])('Epic %s: «T4» нет', async (slot) => {
    await mount({ slot, grade: 'rare' }, {});
    expect($('.btchip')).toBeNull();
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

  // Anarky · Defense mix: Pen-броня Epic T0 на ней; новая Pen-броня Epic лучше. Без «T4» новую надевают и кормят ей
  // старую (Breakthrough новой), с «T4» — только надевают (тот же пример, что в gear.dom «Anarky»)
  it('нажатие меняет вход вердикта: строка карточки — без «и скорми старую»', async () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const P = (id: string, slot: string, setId: string, yellow: Record<string, number>, o: Record<string, unknown> = {}) =>
      ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: 4, at: '', ...o });
    const good = { DEF: 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('a1', 'helmet', set('Defense'), good), P('a2', 'gloves', set('Defense'), good), P('a3', 'shoes', set('Penetration'), good),
      P('a4', 'armor', set('Penetration'), { HP: 1, 'DMG RED%': 1, RES: 1 }, { grade: 'rare', bt: 0 })];
    const gear = { v: 2, seq: 4, pieces: Object.fromEntries(pcs.map((p) => [p.id, p])), pools: { [anarky.id]: ['a1', 'a2', 'a3', 'a4'] },
      marks: { [`${anarky.id}/Defense mix`]: 'want' } };
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Penetration'), subs: { CHC: 1, CHD: 1, HP: 1 } }, { gear, roster: [anarky.id] });
    expect($('.vcard .vc-title')?.textContent).toBe('better than the armor on Anarky · Defense mix: wear it and feed the old one to it');

    await click(chip());

    expect(pressed()).toBe('true');
    expect($('.vcard .vc-title')?.textContent).toBe('better than the armor on Anarky · Defense mix: wear it');
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

// сегменты 1–6 (шаг 8): 5–6 — после Reforge; сумма не выше предела грейда (logic/subs levelCap)
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

  it('сетка сверх предела (Epic 6/6/5 без сета): сабстат не добавлен, та же строка; снять стат сеткой можно', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { subs: { SPD: 6, CHC: 6, CHD: 5 } });

    await click($('.statgrid .sg[data-tour-item="ATK%"]'));

    expect(document.querySelectorAll('.subrow')).toHaveLength(3);
    expect($('.seg-cap')?.textContent).toContain('17');
    await click($('.statgrid .sg[data-tour-item="CHD"]'));
    expect(document.querySelectorAll('.subrow')).toHaveLength(2);
    expect($('.seg-cap')).toBeNull();
  });
});
