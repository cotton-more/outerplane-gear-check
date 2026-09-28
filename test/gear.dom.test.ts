// @vitest-environment jsdom
// Экипировка на телефоне (360px): вещь с формы — «Надеть на…» → в билд, «Вернуть»; «Сейчас на персонажах» в
// подробностях; билд в карточке персонажа; карточка вещи — оранжевые сегменты и Breakthrough.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '../src/data/types';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: {}, since: '2099-01-01', tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } };
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
  history.replaceState(null, '', location.pathname); // #slug открытого персонажа иначе перейдёт в следующий тест
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

describe('экипировка', () => {
  it('«Надеть на…» → Caren · Speed: вещь в билде, сообщение с «Вернуть»; «Вернуть» — как было', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Speed')?.closest('button') as HTMLElement);

    expect($('.gear-toast')?.textContent).toContain('Equipped: Caren · Speed · helmet');
    const st = stored();
    expect(Object.values(st.builds)).toHaveLength(1);
    expect(Object.values(st.pieces)).toMatchObject([{ slot: 'helmet', setId: speed, yellow: NEW.subs, bt: null }]);

    await click($('.gear-toast button'));
    expect(Object.keys(stored().pieces)).toEqual([]);
  });

  it('та же вещь во второй билд Caren — одна запись: в карточке «Also in Speed», сообщение говорит об этом', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Speed')?.closest('button') as HTMLElement);
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Speed/Immu') as HTMLElement);

    expect(Object.keys(stored().pieces)).toHaveLength(1);
    expect($('.gear-toast small')?.textContent).toContain('The same piece as in Speed');
  });

  it('«Кому надеть?»: вещь в шапке, в строке — что будет; имя в поиске — среди всех, не только ростера', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear });
    await click($('.vcard'));
    await click($('.v-equip'));

    expect($('.equip-item')?.textContent).toContain('Helmet · Speed Set · L');
    expect($('.equip-subs')?.textContent).toBe('DEF%2CHC2CHD3HP1');
    expect(byText('.equip-row', 'Caren Speed')?.querySelector('.act')?.textContent).toBe('Replace the helmet — the new one is better');
    expect(byText('.equip-row', 'Speed/Immu')?.querySelector('.act')?.textContent).toBe('Equip — no helmet yet');
    expect(byText('.equip-row', 'Kappa')).toBeUndefined();

    const input = $('.equip-q input') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(input, 'kap'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(byText('.equip-row', 'Kappa')).toBeTruthy();
    expect(byText('.equip-row', 'Caren')).toBeUndefined();
  });

  it('до записей раздела «Сейчас на персонажах» нет — вердикт как раньше', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vcard'));
    expect($('.v-vs')).toBeNull();
    expect($('.v-equip')).toBeTruthy();
  });

  it('на Caren · Speed шлем хуже: «Сейчас на персонажах» — ▲, «Заменить шлем Caren», заменили — старая названа', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear });
    await click($('.vcard'));

    expect($('.v-vs .vs.up')?.textContent).toBe('better than the one on: +25%');
    expect($('.v-vs .vs-places')?.textContent).toBe('+CHD (3rd) · −SPD (4th)');
    expect($$('.v-vs .vs-cmp .chain')).toHaveLength(2);
    await click(byText('.vs-act', "Replace Caren's helmet"));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet · Speed");
    expect($('.gear-toast small')?.textContent).toContain('Breakthrough material');
  });

  it('карточка персонажа: билд, вещь с сегментами по цепочке; карточка вещи — оранжевый сегмент и T4', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, EFF: 1 }, lit: { 'DEF%': 2, EFF: 1 }, bt: null, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });

    expect($('.bgear h4')?.textContent).toBe('Equipped · 1 of 6');
    expect($$('.bgear-row .tok').map((e) => [e.textContent, e.className])).toEqual([['DEF%2', 'tok ok'], ['EFF%1', 'tok']]);
    expect($('.bgear-m')?.textContent).toBe('T? · Reforge 0/6');
    await click($('.bgear-row'));
    await click($$('.piece .seg6')[0].querySelectorAll('button')[2] as HTMLElement); // 3-я клетка DEF% — оранжевая
    await click(byText('.piece-bt .fbtn', 'T4'));

    expect(stored().pieces.p1).toMatchObject({ yellow: { 'DEF%': 2 }, lit: { 'DEF%': 3 }, bt: 4 });
    expect($('.piece')?.textContent).toContain('Reforge: 1 of 6');
    expect([...$$('.piece .seg6')[0].querySelectorAll('button')].slice(0, 4).map((b) => b.getAttribute('aria-label'))).toEqual(['1, yellow', '2, yellow', '3, Reforge', '4']);
  });

  it('оружие: временная против надетой рекомендованной — чип словом, ▼ «stopgap», процент строкой ниже', async () => {
    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'weapon', grade: 'unique', setId: null, itemKey: embrace.key, main: 'DEF%', yellow: { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 }, lit: { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 }, bt: 2, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { weapon: 'p1' }, at: '' } } };
    await mount({ slot: 'weapon', grade: 'rare' }, { main: 'DEF%', subs: { CHC: 3, CHD: 3, SPD: 3 } }, { gear });
    await click($('.vcard'));

    expect($('.v-vs .vs.down')?.textContent).toBe('worse than the one on: stopgap');
    expect($('.v-vs .vs-row')?.textContent).toContain('the passive matters more than substats');
    expect($('.v-vs .vs-row')?.textContent).toMatch(/The one on has nothing useful|× the useful segments|% useful segments/);
  });

  it('замена стата в карточке вещи: статы вещи недоступны, переезда строк нет', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 3, SPD: 1 }, lit: { 'DEF%': 4, CHC: 3, SPD: 1 }, bt: null, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });
    await click($('.bgear-row'));
    await click($('.piece .subkey'));
    const opt = (k: string) => $$('.subopt').find((b) => b.textContent === k) as HTMLButtonElement;

    expect(opt('CHC').disabled).toBe(true);
    expect(opt('CHD').disabled).toBe(false);
    expect($('.subopt .row-n')).toBeNull();
  });

  it('жёлтые через название стата: тот же стат → «Сколько жёлтых» → 3; Reforge не прибавился', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 1, CHC: 2 }, lit: { 'DEF%': 3, CHC: 2 }, bt: null, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });
    await click($('.bgear-row'));
    await click($('.piece .subkey'));                                   // DEF%
    await click($$('.subopt').find((b) => b.textContent?.replace(/^%/, '') === 'DEF%')); // тот же стат — опечатка (у значка % свой «%»)
    expect($('.drawer-h h3')?.textContent).toBe('How many yellow on DEF%?');
    await click(byText('.piece-bt .fbtn', '3'));

    expect(stored().pieces.p1).toMatchObject({ yellow: { 'DEF%': 3 }, lit: { 'DEF%': 5 } });
    expect($('.piece')?.textContent).toContain('Reforge: 2 of 6');
  });

  it('«уже надета» в «Кому надеть?» не нажимается: Reforge и Breakthrough записи остаются', async () => {
    const yellow = { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 };
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow, lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: yellow }, { gear });
    await click($('.vcard'));
    expect($('.v-vs')?.textContent).not.toContain('Breakthrough T4: the new one needs');
    await click($('.v-equip'));
    const row = byText('.equip-row', 'Speed') as HTMLButtonElement;

    expect(row.textContent).toContain('already on');
    expect(row.disabled).toBe(true);
    await click(row);
    expect(stored() ?? gear).toMatchObject({ pieces: { p1: { bt: 4, lit: { 'DEF%': 4 } } } });
  });

  it('«Вернуть» откатывает только «Надеть»: правка в карточке за эти секунды остаётся; на «Персонажах» сообщения нет', async () => {
    const kappa = D.chars.find((c) => c.name === 'Kappa')!;
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2 }, lit: { 'DEF%': 2 }, bt: 4, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear, roster: [] }); // ростер пуст — в окне все персонажи
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Kappa') as HTMLElement);
    expect(stored().builds[kappa.id + '/Speed']).toBeTruthy();

    await click($('#tab-chars'));
    // персонажи: Caren → шлем → T3
    const tile = $$('#cgrid .ctile').find((b) => b.textContent?.includes('Caren'));
    await click(tile);
    expect($('.gear-toast')).toBeNull();
    await click($('.bgear-row'));
    await click(byText('.piece-bt .fbtn', 'T3'));
    await click($('.drawer-x'));
    await click($('.vbar .vb-tab'));
    await click($('.gear-toast button'));

    expect(stored().builds[kappa.id + '/Speed']).toBeUndefined();
    expect(stored().pieces.p1.bt).toBe(3);
    expect(JSON.parse(localStorage.getItem('ogc.roster')!)).toEqual([]); // Kappa попала в ростер с «Надеть» и ушла с «Вернуть»
  });

  it('импорт кода «Заменить» — сообщение с «Вернуть», и «Вернуть» возвращает прежние записи', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2 }, lit: { 'DEF%': 2 }, bt: 4, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars' }, {}, { gear });
    const { encodeGear } = await import('../src/logic/gear');
    const code = encodeGear({ v: 1, seq: 1, pieces: { p1: { ...gear.pieces.p1, bt: 0 } as never }, builds: { ['2000077/Speed']: { slots: { helmet: 'p1' }, at: '' } } });
    await click(byText('.roster-bar .linkbtn', 'export'));
    const ta = $('#gear-code') as HTMLTextAreaElement;
    ta.value = code;
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));

    expect(Object.keys(stored().builds)).toEqual(['2000077/Speed']);
    expect($('.gear-toast')?.textContent).toContain('Equipment loaded: 1 pieces.');
    await click($('.gear-toast button'));
    expect(Object.keys(stored().builds)).toEqual([caren.id + '/Speed']);
    expect(stored().pieces.p1.bt).toBe(4);
  });

  it('экипировку сохранила более новая версия (v: 2): «Надеть на…» нет, в карточке — «обнови страницу», запись не тронута', async () => {
    const newer = { v: 2, seq: 1, pieces: { p1: { id: 'p1' } }, builds: {} };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: newer });
    await click($('.vcard'));
    expect($('.v-equip')).toBeNull();
    await click($('.drawer-x'));
    await click($('#tab-chars'));
    await click($$('#cgrid .ctile').find((b) => b.textContent?.includes('Caren')));

    expect($('.bgear')?.textContent).toContain('newer version of the page');
    expect(stored()).toEqual(newer);
  });

  it('другая вкладка записала своё — подхватили, и следующее действие здесь его не стирает', async () => {
    const piece = (id: string, slot: string) => ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2 }, lit: { 'DEF%': 2 }, bt: null, at: '' });
    const gear = { v: 1, seq: 1, pieces: { p1: piece('p1', 'helmet') }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });
    const other = { v: 1, seq: 2, pieces: { p1: piece('p1', 'helmet'), p2: piece('p2', 'armor') }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1', armor: 'p2' }, at: '' } } };
    localStorage.setItem('ogc.gear', JSON.stringify(other));
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'ogc.gear', newValue: JSON.stringify(other) })); });

    expect($('.bgear h4')?.textContent).toBe('Equipped · 2 of 6');
    await click($('.bgear-row'));
    await click(byText('.piece-bt .fbtn', 'T4'));
    expect(Object.keys(stored().pieces)).toEqual(['p1', 'p2']);
    expect(stored().pieces.p1.bt).toBe(4);
  });

  it('билд переименовали в outerpedia: в карточке «Из прежнего билда» и «Перенести в этот билд»', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2 }, lit: { 'DEF%': 2 }, bt: null, at: '' } }, builds: { [caren.id + '/Speed Old']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });

    expect($('.bgear-old')?.textContent).toContain('From the former build "Speed Old": 1 piece.');
    await click($('.bgear-old button'));
    expect(stored().builds).toEqual({ [caren.id + '/Speed']: expect.objectContaining({ slots: { helmet: 'p1' } }) });
    expect($('.bgear-old')).toBeNull();
    expect($('.bgear h4')?.textContent).toBe('Equipped · 1 of 6');
  });

  it('«Взять из» у оружия — только если этот билд его берёт: Dahlia, ATK% из Speed damage в Speed Tanky (HP%) — нет', async () => {
    const dahlia = D.chars.find((c) => c.name === 'Dahlia')!;
    const w = dahlia.builds.find((b) => b.name === 'Speed damage')!.weapons[0];
    const tanky = dahlia.builds.find((b) => b.name === 'Speed Tanky')!;
    const helm = { id: 'p2', slot: 'helmet', grade: 'unique', setId: tanky.sets[0][0].set, itemKey: null, main: null, yellow: { CHC: 1 }, lit: { CHC: 1 }, bt: null, at: '' };
    const gear = { v: 1, seq: 2, pieces: { p1: { id: 'p1', slot: 'weapon', grade: 'unique', setId: null, itemKey: w.key, main: w.mains[0], yellow: { CHC: 1 }, lit: { CHC: 1 }, bt: null, at: '' }, p2: helm }, builds: { [dahlia.id + '/Speed damage']: { slots: { weapon: 'p1' }, at: '' }, [dahlia.id + '/Speed Tanky']: { slots: { helmet: 'p2' }, at: '' } } };
    await mount({ tab: 'chars', charId: dahlia.id }, {}, { gear, roster: [dahlia.id] });
    await click(byText('.btabs button', 'Speed Tanky'));

    const weaponRow = $$('.bgear-empty').find((e) => e.textContent?.startsWith('Weapon'));
    expect(weaponRow).toBeTruthy();
    expect(weaponRow?.querySelector('button')).toBeNull();
  });

  // на телефоне карточка персонажа — fixed с z-index: шторка внутри неё уходила под плашку вердикта, «Готово» не нажать
  it('карточка вещи — шторкой в <body>; ушли на «Оценку» — закрылась, прокрутка не заперта', async () => {
    const gear = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2 }, lit: { 'DEF%': 2 }, bt: null, at: '' } }, builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } } };
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });
    await click($('.bgear-row'));

    expect($('.piece')?.closest('.drawer-back')?.parentElement).toBe(document.body);
    await click($('.vbar .vb-tab'));
    expect($('.piece')).toBeNull();
    expect(document.body.classList.contains('drawer-lock')).toBe(false);
  });
});
