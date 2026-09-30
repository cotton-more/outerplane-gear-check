// @vitest-environment jsdom
// Примерка на телефоне (360px): из карточки персонажа — «Примерить» и «Примерить замену»; полоса над формой;
// «Заменить шлем Caren» — сразу ей, без «Кому надеть?»; «Следующий» примерку не сбрасывает, ✕ — снимает;
// после перезапуска примерка та же; вещь, которую вводили, — в «Вернуть».
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
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } };
// у Caren — шлем Speed Set похуже новой, Speed «Собираю»
const GEAR = {
  v: 2, seq: 1,
  pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4, at: '' } },
  pools: { [caren.id]: ['p1'] }, marks: { [caren.id + '/Speed']: 'want' },
};
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
  history.replaceState(null, '', location.pathname);
});

async function mount(state: Record<string, unknown>, item: Record<string, unknown>, extra: Record<string, unknown> = {}, keep = false) {
  if (!keep) {
    const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], gear: GEAR, state: { tab: 'eval', ...state }, item, ...extra };
    for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  }
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
const stored = (k: string) => JSON.parse(localStorage.getItem('ogc.' + k) ?? 'null');
const onCard = { tab: 'chars', charId: caren.id, slot: 'helmet', grade: 'unique' };

describe('примерка', () => {
  it('«Примерить замену» у шлема: оценка для Caren · Speed, вещь на форме та же; «Заменить» — сразу ей', async () => {
    await mount(onCard, NEW);
    await click(byText('.bgear-row', 'Speed Set'));
    await click(byText('.piece-act button', 'Try a replacement'));

    expect(stored('state').tab).toBe('eval');
    expect($('.tryon')?.textContent).toContain('Caren · Speed');
    expect(stored('tryon')).toEqual({ charId: caren.id, build: 'Speed' });
    // в ростере только Caren — другим вещь не нужна: после « — » только про неё
    expect($('.vcard .vc-title')?.textContent).toBe('better than what Caren wears');

    await click($('.vcard'));
    expect($$('.v-vs .vs-row')).toHaveLength(1);
    expect($('.v-equip')).toBeNull(); // «Кому надеть?» в примерке не нужно
    await click(byText('.vs-act', "Replace Caren's helmet"));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
  });

  it('в примерке у неё лучше — кнопки нет (надеть можно только полезную вещь); имени в строке нет — оно на полосе', async () => {
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, yellow: { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 } } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear, tryon: { charId: caren.id, build: 'Speed' } });
    // все, кому подходит (только Caren), уже носят лучше — штамп понижен (logic/worn), заголовок уже про неё
    expect($('.vcard .vc-title')?.textContent).toBe('already better on Caren');
    expect($('.vcard .vc-vs b')).toBeNull();
    expect($('.vc-equip')).toBeNull();
  });

  it('«Следующий» примерку не сбрасывает, ✕ — снимает', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { tryon: { charId: caren.id, build: 'Speed' } });
    expect($('.tryon')).toBeTruthy();
    await click($('.vb-reset'));
    expect($('.tryon')).toBeTruthy();
    await click($('.tryon-x'));
    expect($('.tryon')).toBeNull();
    expect(stored('tryon')).toBeNull();
  });

  it('после перезапуска примерка та же; билда в данных нет — примерки нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { tryon: { charId: caren.id, build: 'Pen' } });
    expect($('.tryon')?.textContent).toContain('Caren · Pen');
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    localStorage.setItem('ogc.tryon', JSON.stringify({ charId: caren.id, build: 'Gone' }));
    await mount({}, {}, {}, true);
    expect($('.tryon')).toBeNull();
  });

  it('«Примерить» на пустом слоте: слот и сет билда, грейд прежний; вещь, которую вводили, — в «Вернуть»; Caren — в ростер', async () => {
    await mount({ ...onCard, slot: 'gloves', grade: 'rare' }, { setId: speed, subs: { CHC: 2, SPD: 1 } }, { roster: [] });
    await click(byText('.bgear-empty', 'Armor')?.querySelector<HTMLElement>('.bgear-act button:last-child'));

    const st = stored('state');
    expect(st).toMatchObject({ tab: 'eval', slot: 'armor', grade: 'rare' });
    expect(stored('item')).toMatchObject({ setId: speed, subs: {} });
    expect(stored('roster')).toContain(caren.id);
    expect($('.toast:not(.gear-toast)')?.textContent).toContain('Undo');

    await click($('.toast:not(.gear-toast) button'));
    expect(stored('state').slot).toBe('gloves');
    expect(stored('item').subs).toEqual({ CHC: 2, SPD: 1 });
    expect($('.tryon')).toBeTruthy();
  });

  it('второй «Примерить» подряд: «Вернуть» — всё ещё та вещь, которую вводили', async () => {
    await mount({ ...onCard, slot: 'gloves', grade: 'rare' }, { setId: speed, subs: { CHC: 2, SPD: 1 } });
    await click(byText('.bgear-empty', 'Armor')?.querySelector<HTMLElement>('.bgear-act button:last-child'));
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Characters'));
    await click(byText('.bgear-empty', 'Boots')?.querySelector<HTMLElement>('.bgear-act button:last-child'));
    expect(stored('state').slot).toBe('shoes');

    await click($('.toast:not(.gear-toast) button'));
    expect(stored('state').slot).toBe('gloves');
    expect(stored('item').subs).toEqual({ CHC: 2, SPD: 1 });
  });

  it('сообщение экипировки на «Персонажах» не прячет «Вернуть» формы на «Оценке»', async () => {
    const { encodeGear } = await import('../src/logic/gearStore');
    await mount({ ...onCard, slot: 'gloves', grade: 'rare' }, { setId: speed, subs: { CHC: 2, SPD: 1 } });
    await click(byText('.roster-bar .linkbtn', 'export / import'));
    const ta = $('#gear-code') as HTMLTextAreaElement;
    ta.value = encodeGear(GEAR as never);
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Replace'));
    expect($('.gear-toast')).toBeTruthy();
    await click(byText('.bgear-empty', 'Armor')?.querySelector<HTMLElement>('.bgear-act button:last-child'));
    expect($('.toast:not(.gear-toast)')?.textContent).toContain('Undo');
  });

  it('вещей нет: «Собрать билд» — примерка без смены вещи на форме', async () => {
    await mount({ ...onCard, slot: 'gloves' }, { setId: speed, subs: { CHC: 2 } }, { gear: { v: 2, seq: 0, pieces: {}, pools: {} } });
    await click(byText('.btabs button', 'Pen'));
    await click(byText('.bgear-none button', 'Gear up this build'));

    expect($('.tryon')?.textContent).toContain('Caren · Pen');
    expect(stored('state')).toMatchObject({ tab: 'eval', slot: 'gloves' });
    expect(stored('item').subs).toEqual({ CHC: 2 });
  });

  // «Надеть всё равно» нет, но вещь с полезными статами «Надеть» кладёт в «По статам» (находка 28, Р11)
  it('не её сет — «не по билду», но по статам подходит: строка про «По статам» и «Надеть на Caren»', async () => {
    const def = D.sets.find((s) => s.short === 'Defense')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: def, subs: { 'DEF%': 2, CHC: 2, CHD: 3, SPD: 1 } }, { tryon: { charId: caren.id, build: 'Speed' } });
    expect($('.vcard .vc-title')?.textContent).toContain('Caren · Speed — off-build');
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(`Not for Speed: Defense isn't in its combos. It fits Caren by stats — "Equip" puts it in "By stats".`);
    expect($('.vs-act')?.textContent).toBe('Equip on Caren');
    expect($('.v-vs .bn')?.textContent).toBe('By stats');
  });

  // сет не из её связок: вещь — в «По статам»; Speed (цель примерки), где она лишь заняла пустой слот, «Собираю» не
  // становится
  it('вещей нет, сет не из её билдов, «Надеть на Caren»: вещь у неё, Speed не отмечен «Собираю»', async () => {
    const atk = D.sets.find((s) => s.short === 'Attack')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: atk, subs: { 'DEF%': 2, CHC: 2, CHD: 3, SPD: 1 } },
      { tryon: { charId: caren.id, build: 'Speed' }, gear: { v: 2, seq: 0, pieces: {}, pools: {} } });
    await click($('.vc-equip'));
    // прочая в пустой слот Speed — не «засчитано в Speed»: кнопка и строка обещали «По статам»
    expect($('.gear-toast')?.textContent).toContain('On Caren: gloves. Counts in "By stats".');
    expect(stored('gear').pools[caren.id]).toHaveLength(1);
    expect(stored('gear').marks ?? {}).toEqual({});
  });

  it('не её сет и полезных статов нет: «не по билду», кнопки нет', async () => {
    const def = D.sets.find((s) => s.short === 'Defense')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: def, subs: { RES: 2, EFF: 2, HP: 3, ATK: 1 } }, { tryon: { charId: caren.id, build: 'Speed' } });
    expect($('.vcard .vc-title')?.textContent).toContain('Caren · Speed — off-build');
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe("Not for Speed: Defense isn't in its combos.");
  });
});

// Без примерки (logic/worn): штамп по надетому — всем, кому подходит, уже надето не хуже; вещь уже в билде
describe('штамп по надетому', () => {
  // на Caren · Speed — шлем заметно лучше новой, все Reforge сделаны
  const STRONG = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, yellow: { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 } } } };

  it('Caren носит лучше — Legendary «Фоддер»: у кого лучше, ▼ на карточке, кнопки «Надеть» нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: STRONG });
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vcard .vc-title')?.textContent).toBe('already better on Caren');
    expect($('.vcard .vc-vs .vs.down')).toBeTruthy();
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-reasons')?.textContent).toContain("Won't improve anyone");
    expect($$('.v-vs .vs-row.vs-down')).toHaveLength(1);
  });

  // Р15: вердикт снятой («Старая: «Разобрать».») больше не пишем — игрок снимет её в игре и оценит сам
  it('«Заменить» старую другой линии (Epic): в сообщении ни вердикта старой, ни строки о ней', async () => {
    const old = { 'DEF%': 2, CHC: 2, CHD: 2 };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: old, lit: old, bt: null } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear });

    await click($('.vc-equip'));

    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    expect($('.gear-toast small')).toBeNull();
  });

  it('Epic 2 из 3 и Caren носит чуть лучше — штамп не понижен, сетка на месте: третий сабстат можно ввести', async () => {
    const epic = { 'DEF%': 3, CHC: 2, CHD: 2 };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: epic, lit: epic, bt: null } } };
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed, subs: { 'DEF%': 3, CHC: 3 } }, { gear });
    expect($('.vcard')).toBeNull();
    expect($('.statgrid')).toBeTruthy();
  });

  // намеренно иначе (GEARPOOL): Speed-шлем Caren стоит и в Speed/Immu — примерка Speed/Immu не пуста, там он лучше
  it('примерка Caren · Speed/Immu: её Speed-шлем стоит и там и лучше — «Разобрать», надеть нельзя', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 2 } },
      { gear: STRONG, tryon: { charId: caren.id, build: 'Speed/Immu' } });
    expect($('.vcard .stamp')?.textContent).toBe('Dismantle');
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-reasons')?.textContent).toContain("Won't improve anyone");
  });

  it('вещь из билда, сама по себе «в разбор», — «Оставить»: где она', async () => {
    const junk = { setId: speed, subs: { HP: 1, RES: 1, EFF: 1 } };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: junk.subs, lit: junk.subs, bt: null } } };
    await mount({ slot: 'helmet', grade: 'rare' }, junk, { gear });
    expect($('.vcard .stamp')?.textContent).toBe('Keep');
    expect($('.vcard .vc-title')?.textContent).toBe('Caren already has it');
  });
});

// Находка 28 (Р11): примерка — явный выбор. Вещь не по билду, но с полезными статами — «Надеть» кладёт её в «По статам»;
// вкладка «По статам» — своя примерка. Demiurge Drakhan: броня Revenge OGC HLMW PCHM (SPD 3 · HP 1 · HP% 1)
describe('примерка и «По статам» (находка 28)', () => {
  const drakhan = D.chars.find((c) => c.slug === 'demiurge-drakhan')!;
  const revenge = D.sets.find((s) => s.short === 'Revenge')!.id;
  const HLMW = { setId: revenge, subs: { SPD: 3, HP: 1, 'HP%': 1 } };
  const EMPTY = { v: 2, seq: 0, pieces: {}, pools: {} };

  it('Drakhan · Speed, вещей нет: «не по билду», строка про «По статам» и «Надеть» — вещь у неё', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, HLMW, { roster: [drakhan.id], gear: EMPTY, tryon: { charId: drakhan.id, build: 'Speed' } });
    expect($('.vcard .vc-title')?.textContent).toContain(`${drakhan.name} · Speed — off-build`);
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(`Not for Speed: Revenge isn't in its combos. It fits ${drakhan.name} by stats — "Equip" puts it in "By stats".`);
    await click($('.vs-act'));
    expect(stored('gear').pools[drakhan.id]).toHaveLength(1);
    expect(stored('gear').marks ?? {}).toEqual({});
  });

  it('вкладка «По статам» → «Собрать билд»: примерка «Drakhan · By stats»', async () => {
    await mount({ tab: 'chars', charId: drakhan.id }, {}, { roster: [drakhan.id], gear: EMPTY });
    await click(byText('.btabs button', 'By stats'));
    await click($('.bgear-none button'));
    expect($('.tryon')?.textContent).toContain(`${drakhan.name} · By stats`);
    expect(stored('tryon')).toEqual({ charId: drakhan.id, build: '#stats' });
  });

  it('вкладка «По статам» → «Примерить» у пустого слота: примерка «По статам», на форме слот без сета', async () => {
    const gear = { v: 2, seq: 1, pieces: { p1: { id: 'p1', slot: 'armor', grade: 'rare', setId: revenge, itemKey: null, main: null, yellow: HLMW.subs, lit: HLMW.subs, bt: null, at: '' } }, pools: { [drakhan.id]: ['p1'] } };
    await mount({ tab: 'chars', charId: drakhan.id, slot: 'armor', grade: 'rare' }, HLMW, { roster: [drakhan.id], gear });
    expect($('.btabs button[aria-selected="true"]')?.textContent).toMatch(/^By stats/); // открыта на лучшем варианте
    await click(byText('.bgear-empty', 'Helmet')?.querySelector<HTMLElement>('.bgear-act button'));
    expect(stored('tryon')).toEqual({ charId: drakhan.id, build: '#stats' });
    expect(stored('state')).toMatchObject({ tab: 'eval', slot: 'helmet' });
    expect(stored('item').setId ?? null).toBeNull();
  });

  it('примерка «По статам», вещь без полезных статов: «ничего не даст», кнопки нет', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, { setId: revenge, subs: { RES: 2, EFF: 2, 'ATK%': 1 } },
      { roster: [drakhan.id], gear: EMPTY, tryon: { charId: drakhan.id, build: '#stats' } });
    expect($('.vcard .vc-title')?.textContent).toContain(`${drakhan.name} · By stats — gives nothing`);
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(`This piece gives ${drakhan.name} nothing: no useful stats.`);
  });

  // повторное ревью, мелочь 6: Mage-оружие у Aer (Striker) — было «полезных статов нет» (цель «По статам») или ничего
  // (цель — билд); причина — класс
  const aer = D.chars.find((c) => c.name === 'Aer')!;
  const ODYSSEY = { itemKey: '17', main: 'ATK%', subs: { 'DMG UP%': 2, CHC: 2, CHD: 1, SPD: 1 } }; // Thumping Odyssey — только Mage
  it.each([['#stats'], ['Speed']])('примерка Aer (%s), оружие не для класса: «не носит этот предмет», кнопки нет', async (build) => {
    await mount({ slot: 'weapon', grade: 'unique' }, ODYSSEY, { roster: [aer.id], gear: EMPTY, tryon: { charId: aer.id, build } });
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe("Aer can't wear this item: it's for another class.");
  });
});
