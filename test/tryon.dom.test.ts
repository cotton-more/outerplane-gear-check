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
// на Caren · Speed — шлем Speed Set похуже новой
const GEAR = {
  v: 1, seq: 1,
  pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4, at: '' } },
  builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1' }, at: '' } },
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
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet · Speed");
  });

  it('в примерке кнопка под карточкой есть и когда на ней лучше; имени в строке нет — оно на полосе', async () => {
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, yellow: { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 } } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear, tryon: { charId: caren.id, build: 'Speed' } });
    // все, кому подходит (только Caren), уже носят лучше — штамп понижен (logic/worn), заголовок уже про неё
    expect($('.vcard .vc-title')?.textContent).toBe('already better on Caren');
    expect($('.vcard .vc-vs b')).toBeNull();
    expect($('.vc-equip')?.textContent).toBe("Replace Caren's helmet");
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
    const { encodeGear } = await import('../src/logic/gear');
    await mount({ ...onCard, slot: 'gloves', grade: 'rare' }, { setId: speed, subs: { CHC: 2, SPD: 1 } });
    await click(byText('.roster-bar .linkbtn', 'export / import'));
    const ta = $('#gear-code') as HTMLTextAreaElement;
    ta.value = encodeGear(GEAR as never);
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Replace'));
    expect($('.gear-toast')).toBeTruthy();
    await click(byText('.bgear-empty', 'Armor')?.querySelector<HTMLElement>('.bgear-act button:last-child'));
    expect($('.toast:not(.gear-toast)')?.textContent).toContain('Undo');
  });

  it('пустой билд: «Собрать билд» — примерка без смены вещи на форме', async () => {
    await mount({ ...onCard, slot: 'gloves' }, { setId: speed, subs: { CHC: 2 } });
    await click(byText('.btabs button', 'Pen'));
    await click(byText('.bgear-none button', 'Gear up this build'));

    expect($('.tryon')?.textContent).toContain('Caren · Pen');
    expect(stored('state')).toMatchObject({ tab: 'eval', slot: 'gloves' });
    expect(stored('item').subs).toEqual({ CHC: 2 });
  });

  it('не её сет — «не по билду» и «Надеть всё равно»', async () => {
    const def = D.sets.find((s) => s.short === 'Defense')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: def, subs: { 'DEF%': 2, CHC: 2, CHD: 3, SPD: 1 } }, { tryon: { charId: caren.id, build: 'Speed' } });
    await click($('.vcard'));
    expect($('.v-vs .vs.off')?.textContent).toBe('off-build');
    expect($('.v-vs')?.textContent).toContain('Caren needs Speed ×4 in this build.');
    await click(byText('.vs-act', 'Equip anyway'));
    expect(stored('gear').builds[caren.id + '/Speed'].slots.gloves).toBeTruthy();
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

  it('«Заменить»: старая сама по себе «Оставить», но Caren теперь носит лучше — в сообщении «Разобрать»', async () => {
    const old = { 'DEF%': 2, CHC: 2, CHD: 2 };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: old, lit: old, bt: null } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear });
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain('The old one: "Dismantle".');
  });

  it('вещь из билда, сама по себе «в разбор», — «Оставить»: где она', async () => {
    const junk = { setId: speed, subs: { HP: 1, RES: 1, EFF: 1 } };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: junk.subs, lit: junk.subs, bt: null } } };
    await mount({ slot: 'helmet', grade: 'rare' }, junk, { gear });
    expect($('.vcard .stamp')?.textContent).toBe('Keep');
    expect($('.vcard .vc-title')?.textContent).toBe("it's already in Caren · Speed");
  });
});
