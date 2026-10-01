// @vitest-environment jsdom
// Режим «для героя» на телефоне (360px; прежде — примерка билда): из карточки персонажа — «Оценить вещь для Caren»,
// «Примерить» и «Примерить замену»; полоса «Только для · Caren» над формой; строка и «Надеть» — только про героя, по
// всем его билдам; «Заменить шлем Caren» — сразу ей, без «Кому надеть?»; «Следующий» режим не сбрасывает, ✕ — снимает;
// после перезапуска режим тот же; вещь, которую вводили, — в «Вернуть».
// Шаг 10 «Оценка — единственный ввод»: на полосе только имя (было «Caren · Speed»); вещь не по билду предустановки —
// не «не по билду», а исход по всем билдам и строка героя (heroNote)
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
  pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4, at: '' } },
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

describe('режим «для героя»', () => {
  it('«Примерить замену» у шлема: оценка для Caren, вещь на форме та же; «Заменить» — сразу ей', async () => {
    await mount(onCard, NEW);
    await click(byText('.bgear-row', 'Speed Set'));
    await click(byText('.piece-act button', 'Try a replacement'));

    expect(stored('state').tab).toBe('eval');
    expect($('.tryon')?.textContent).toBe('Only for·Caren✕');
    expect(stored('tryon')).toEqual({ charId: caren.id, build: 'Speed', replace: 'p1' });
    expect(stored('item').subs).toEqual(NEW.subs);
    // в ростере только Caren — другим вещь не нужна: после « — » только про неё
    expect($('.vcard .vc-title')?.textContent).toBe('better than what Caren wears');

    await click($('.vcard'));
    expect($$('.v-vs .vs-row')).toHaveLength(1);
    expect($('.v-equip')).toBeNull(); // «Кому надеть?» в режиме героя не нужно
    await click(byText('.vs-act', "Replace Caren's helmet"));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
  });

  it('в режиме героя у неё лучше — кнопки нет (надеть можно только полезную вещь); имени в строке нет — оно на полосе', async () => {
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, yellow: { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 } } } };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear, tryon: { charId: caren.id, build: 'Speed' } });
    // все, кому подходит (только Caren), уже носят лучше — штамп понижен (logic/worn), заголовок уже про неё
    expect($('.vcard .vc-title')?.textContent).toBe('already better on Caren');
    expect($('.vcard .vc-vs b')).toBeNull();
    expect($('.vc-equip')).toBeNull();
  });

  it('«Следующий» режим героя не сбрасывает, ✕ — снимает', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { tryon: { charId: caren.id, build: 'Speed' } });
    expect($('.tryon')).toBeTruthy();
    await click($('.vb-reset'));
    expect($('.tryon')).toBeTruthy();
    await click($('.tryon-x'));
    expect($('.tryon')).toBeNull();
    expect(stored('tryon')).toBeNull();
  });

  // шаг 10 (В10): было — билда в данных нет, примерки нет; цель — герой, билд — только предустановка
  it('после перезапуска режим тот же; билда в данных нет — режим героя остаётся; героя нет — режима нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { tryon: { charId: caren.id, build: 'Pen' } });
    expect($('.tryon .tryon-n')?.textContent).toBe('Caren');
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    localStorage.setItem('ogc.tryon', JSON.stringify({ charId: caren.id, build: 'Gone' }));
    await mount({}, {}, {}, true);
    expect($('.tryon .tryon-n')?.textContent).toBe('Caren');
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    localStorage.setItem('ogc.tryon', JSON.stringify({ charId: '999', build: 'Speed' }));
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

  it('вещей нет: «Собрать билд» — режим героя без смены вещи на форме', async () => {
    await mount({ ...onCard, slot: 'gloves' }, { setId: speed, subs: { CHC: 2 } }, { gear: { v: 2, seq: 0, pieces: {}, pools: {} } });
    await click(byText('.btabs button', 'Pen'));
    await click(byText('.bgear-none button', 'Gear up this build'));

    expect($('.tryon .tryon-n')?.textContent).toBe('Caren');
    expect(stored('tryon')).toEqual({ charId: caren.id, build: 'Pen' });
    expect(stored('state')).toMatchObject({ tab: 'eval', slot: 'gloves' });
    expect(stored('item').subs).toEqual({ CHC: 2 });
  });

  // «Надеть всё равно» нет, но вещь с полезными статами «Надеть» кладёт в «По статам» (находка 28, Р11). Было —
  // Defense-перчатки «не по билду Speed»; у героя Defense есть в Def/Immu (исход по всем билдам), поэтому — Attack
  it('сета нет в её билдах, а по статам подходит: строка про «По статам» под карточкой и «Надеть на Caren»', async () => {
    const atk = D.sets.find((s) => s.short === 'Attack')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: atk, subs: { 'DEF%': 2, CHC: 2, CHD: 3, SPD: 1 } }, { tryon: { charId: caren.id, build: 'Speed' } });
    const fits = `It fits Caren by stats — "Equip" puts it in "By stats".`;
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    expect($('.vc-note')?.textContent).toBe(fits);
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(fits);
    expect($('.vs-act')?.textContent).toBe('Equip on Caren');
    expect($('.v-vs .bn')?.textContent).toBe('By stats');
  });

  // сет не из её связок: вещь — в «По статам»; Speed (предустановка), где она лишь заняла пустой слот, «Собираю» не
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

  // было: «не по билду Speed» (Defense); вещь не для героя — offHero (11.1), кнопки нет
  it('сета нет в её билдах и полезных статов нет: «Caren doesn\'t need it: Attack…», кнопки нет', async () => {
    const atk = D.sets.find((s) => s.short === 'Attack')!.id;
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: atk, subs: { RES: 2, EFF: 2, HP: 3, ATK: 1 } }, { tryon: { charId: caren.id, build: 'Speed' } });
    const off = "Caren doesn't need it: Attack isn't in Caren's builds.";
    expect($('.vc-equip')).toBeNull();
    expect($('.vc-note')?.textContent).toBe(off);
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(off);
  });
});

// Шаг 10 «Оценка — единственный ввод»: режим «для героя» (В7, В10) — вход «Оценить вещь для Caren», одна строка героя,
// «Примерить замену» заменяет запись в любом случае (решение владельца (а)), исход по всем билдам без only
describe('режим «для героя»: вход, одна строка, замена в любом случае', () => {
  const WEAK_K = { id: 'k1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 1, SPD: 1 }, lit: { CHC: 1, SPD: 1 }, bt: 0, at: '' };
  const kappa = D.chars.find((c) => c.name === 'Kappa')!;
  const BOTH = { ...GEAR, seq: 2, pieces: { ...GEAR.pieces, k1: WEAK_K }, pools: { ...GEAR.pools, [kappa.id]: ['k1'] } };

  it('«Оценить вещь для Caren» → полоса «Только для · Caren», одна строка героя; ✕ — снова для всех', async () => {
    await mount(onCard, NEW, { gear: BOTH, roster: [caren.id, kappa.id] });
    await click($('.pool-rate'));

    expect(stored('state').tab).toBe('eval');
    expect(stored('tryon')).toEqual({ charId: caren.id });
    expect($('.tryon')?.textContent).toBe('Only for·Caren✕');
    expect($('.tryon-x')?.getAttribute('aria-label')).toBe('Rate for everyone');
    expect(stored('item').subs).toEqual(NEW.subs); // вещь на форме та же
    await click($('.vcard'));
    expect($$('.v-vs .vs-row').map((r) => r.querySelector('.nm b')?.textContent)).toEqual(['Caren']);
    expect($('.v-equip')).toBeNull(); // «Кому надеть?» в режиме героя не нужно

    await click($('.tryon-x'));
    expect(stored('tryon')).toBeNull();
    expect($('.tryon')).toBeNull();
    expect($$('.v-vs .vs-row').map((r) => r.querySelector('.nm b')?.textContent).sort()).toEqual(['Caren', 'Kappa']);
  });

  // Transistone (В-А2): в игре шлем A сменил DEF% на RES — ввели заново, он хуже записи. «Примерить замену» у A —
  // «Заменить шлем Caren» есть всё равно; «Надеть» убирает A, новая — в пуле; «Вернуть» — как было
  it('«Примерить замену» → вещь хуже (Transistone) → «Заменить шлем Caren» → запись убрана, новая в пуле → «Вернуть»', async () => {
    const worse = { setId: speed, subs: { RES: 2, CHC: 2, SPD: 2, EFF: 3 } };
    await mount(onCard, worse);
    await click(byText('.bgear-row', 'Speed Set'));
    await click(byText('.piece-act button', 'Try a replacement'));
    expect(stored('tryon')).toEqual({ charId: caren.id, build: 'Speed', replace: 'p1' });
    expect($('.vcard .vc-vs .vs.down')).toBeTruthy(); // хуже надетой — строка говорит, что вещь даёт

    await click(byText('.vc-equip', "Replace Caren's helmet"));

    expect(stored('gear').pools[caren.id]).toEqual(['p2']);
    expect(stored('gear').pieces.p2.lit).toEqual(worse.subs);
    // после «Надеть» форма — как после «Следующий», режим героя остаётся (доработка 2)
    expect({ subs: stored('item').subs, tryon: !!$('.tryon') }).toEqual({ subs: {}, tryon: true });
    // та же вещь в игре, введённая заново, — не «материал для Breakthrough новой»
    expect($('.gear-toast')?.textContent).toBe("Replaced: Caren's helmet.Undo");
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored('gear').pools[caren.id]).toEqual(['p1']);
    expect(stored('gear').pieces.p1).toEqual(GEAR.pieces.p1);
    expect(stored('item').subs).toEqual(worse.subs);
  });

  // «Примерить замену», а у вещи нет ни одного исхода (charVs best null, rows []): кнопка есть, строка под карточкой и
  // в «Сейчас на персонажах» — существующим текстом «ничего не даст», чипа исхода нет
  it('замена в любом случае без исходов (оружие не по билду): кнопка «Заменить» и строка «ничего не даст», без чипа', async () => {
    const sword = { id: 'p2', slot: 'weapon', grade: 'unique', setId: null, itemKey: '3', main: 'ATK%', yellow: { CHC: 2, CHD: 2 }, lit: { CHC: 2, CHD: 2 }, bt: null, at: '' };
    const gear = { ...GEAR, seq: 2, pieces: { ...GEAR.pieces, p2: sword }, pools: { [caren.id]: ['p1', 'p2'] } };
    await mount({ slot: 'weapon', grade: 'unique' }, { itemKey: '3', main: 'ATK%', subs: { RES: 1, EFF: 1, 'DMG UP%': 1, ATK: 1 } },
      { gear, tryon: { charId: caren.id, replace: 'p2' } });
    const none = 'This piece gives Caren nothing: no useful stats.';
    expect($('.vc-equip')?.textContent).toBe("Replace Caren's weapon");
    expect($('.vc-note')?.textContent).toBe(none);
    expect($('.vcard .vc-vs')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(none);
    expect($$('.v-vs .vs-row')).toHaveLength(1);
    expect($('.v-vs .vs-row .vs')).toBeNull();
    expect($('.v-vs .vs-act')?.textContent).toBe("Replace Caren's weapon");
  });

  // заметка шага 2: в примерке билда (charVs с only) у Eris · Pen Speed-шлем Epic на T4 терял «Надеть»; в режиме героя
  // исход — по всем билдам, без only. Пул Eris — из потока seed 5 (build/eval-only/test/step10-eris.test.ts)
  it('Eris (предустановка Pen), Speed-шлем Epic {SPD 1, DEF 4, ATK% 4, HP 3} на T4 — «Заменить» с «· T4» есть', async () => {
    const eris = D.chars.find((c) => c.name === 'Eris')!;
    const rows: [string, string, string, string, Record<string, number>, number | null][] = [
      ['p366', 'armor', 'rare', '1', { SPD: 1, CHC: 1, RES: 4 }, 0],
      ['p367', 'shoes', 'rare', '15', { 'DEF%': 1, RES: 1, SPD: 2 }, null],
      ['p368', 'helmet', 'unique', '13', { RES: 1, SPD: 2, 'HP%': 2, CHC: 1 }, 0],
      ['p369', 'armor', 'rare', '11', { 'DMG UP%': 4, CHD: 4, ATK: 3 }, 0],
      ['p370', 'armor', 'unique', '15', { 'DEF%': 3, RES: 2, DEF: 1, CHC: 4 }, 4],
      ['p371', 'gloves', 'unique', '13', { RES: 1, 'HP%': 4, CHC: 2, EFF: 2 }, 0],
      ['p372', 'helmet', 'unique', '15', { 'DEF%': 4, DEF: 2, 'HP%': 1, SPD: 4 }, 4],
      ['p373', 'gloves', 'rare', '1', { 'ATK%': 3, CHC: 3, 'DMG RED%': 2 }, 4],
      ['p374', 'shoes', 'unique', '11', { 'DEF%': 4, HP: 2, CHD: 3, 'HP%': 1 }, 4],
      ['p375', 'helmet', 'rare', '2', { SPD: 4, DEF: 2, ATK: 3 }, 4],
      ['p376', 'shoes', 'unique', '13', { 'ATK%': 1, CHD: 4, RES: 2, 'DEF%': 2 }, null],
    ];
    const pieces = Object.fromEntries(rows.map(([id, slot, grade, setId, lit, bt]) => [id, { id, slot, grade, setId, itemKey: null, main: null, yellow: lit, lit, bt, at: '' }]));
    const gear = { v: 2, seq: 400, pieces, pools: { [eris.id]: rows.map((r) => r[0]) } };
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed, subs: { SPD: 1, DEF: 4, 'ATK%': 4, HP: 3 }, t4: true },
      { gear, roster: [eris.id], tryon: { charId: eris.id, build: 'Pen' } });

    expect($('.vc-equip')?.textContent).toBe("Replace Eris's helmet · T4");
    await click($('.vcard'));
    expect($('.v-vs .vs-act')?.textContent).toBe("Replace Eris's helmet · T4");
    await click($('.v-vs .vs-act'));
    expect($('.gear-toast')?.textContent).toMatch(/^Replaced: Eris's helmet · T4 — /);
  });
});

// Без режима героя (logic/worn): штамп по надетому — всем, кому подходит, уже надето не хуже; вещь уже в билде
describe('штамп по надетому', () => {
  // на Caren · Speed — шлем заметно лучше новой (сравнение — как есть, по уровням)
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

  // режим героя (В10): предустановка Speed/Immu исход не сужает — Speed-шлем Caren лучше новой во всех её билдах
  it('режим героя Caren (предустановка Speed/Immu): её Speed-шлем лучше — «Разобрать», надеть нельзя', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 2 } },
      { gear: STRONG, tryon: { charId: caren.id, build: 'Speed/Immu' } });
    expect($('.vcard .stamp')?.textContent).toBe('Dismantle');
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-reasons')?.textContent).toContain("Won't improve anyone");
  });

  // «дома» нет (решение владельца 2026-10-01): копия вещи из билда — новая вещь из инвентаря; у записи ниже T4 — материал
  it('копия вещи из билда, сама по себе «в разбор», — не «Оставить»: у записи T0 — «Фоддер», материал для неё', async () => {
    const junk = { setId: speed, subs: { HP: 1, RES: 1, EFF: 1 } };
    const gear = { ...GEAR, pieces: { p1: { ...GEAR.pieces.p1, grade: 'rare', yellow: junk.subs, lit: junk.subs, bt: 0 } } };
    await mount({ slot: 'helmet', grade: 'rare' }, junk, { gear });
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vcard .vc-title')?.textContent).toContain('Breakthrough material for the helmet on Caren');
  });
});

// Находка 28 (Р11): режим героя — явный выбор. Вещь не по билду, но с полезными статами — «Надеть» кладёт её в «По статам»;
// вкладка «По статам» — режим героя с предустановкой «По статам». Demiurge Drakhan: броня Revenge OGC HLMW PCHM (SPD 3 · HP 1 · HP% 1)
describe('режим героя и «По статам» (находка 28)', () => {
  const drakhan = D.chars.find((c) => c.slug === 'demiurge-drakhan')!;
  const revenge = D.sets.find((s) => s.short === 'Revenge')!.id;
  const HLMW = { setId: revenge, subs: { SPD: 3, HP: 1, 'HP%': 1 } };
  const EMPTY = { v: 2, seq: 0, pieces: {}, pools: {} };

  // было: «Drakhan · Speed — не по билду» (цель — вариант); у героя — его «По статам», где слот пуст
  it('Drakhan (предустановка Speed), вещей нет: «слот пуст», строка про «По статам» и «Надеть» — вещь у неё', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, HLMW, { roster: [drakhan.id], gear: EMPTY, tryon: { charId: drakhan.id, build: 'Speed' } });
    expect($('.vcard .vc-title')?.textContent).toContain(`${drakhan.name}'s slot is empty`);
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(`It fits ${drakhan.name} by stats — "Equip" puts it in "By stats".`);
    await click($('.vs-act'));
    expect(stored('gear').pools[drakhan.id]).toHaveLength(1);
    expect(stored('gear').marks ?? {}).toEqual({});
  });

  it('вкладка «По статам» → «Собрать билд»: режим героя Drakhan с предустановкой «По статам»', async () => {
    await mount({ tab: 'chars', charId: drakhan.id }, {}, { roster: [drakhan.id], gear: EMPTY });
    await click(byText('.btabs button', 'By stats'));
    await click($('.bgear-none button'));
    expect($('.tryon .tryon-n')?.textContent).toBe(drakhan.name);
    expect(stored('tryon')).toEqual({ charId: drakhan.id, build: '#stats' });
  });

  it('вкладка «По статам» → «Примерить» у пустого слота: режим героя с «По статам», на форме слот без сета', async () => {
    const gear = { v: 2, seq: 1, pieces: { p1: { id: 'p1', slot: 'armor', grade: 'rare', setId: revenge, itemKey: null, main: null, yellow: HLMW.subs, lit: HLMW.subs, bt: null, at: '' } }, pools: { [drakhan.id]: ['p1'] } };
    await mount({ tab: 'chars', charId: drakhan.id, slot: 'armor', grade: 'rare' }, HLMW, { roster: [drakhan.id], gear });
    expect($('.btabs button[aria-selected="true"]')?.textContent).toMatch(/^By stats/); // открыта на лучшем варианте
    await click(byText('.bgear-empty', 'Helmet')?.querySelector<HTMLElement>('.bgear-act button'));
    expect(stored('tryon')).toEqual({ charId: drakhan.id, build: '#stats' });
    expect(stored('state')).toMatchObject({ tab: 'eval', slot: 'helmet' });
    expect(stored('item').setId ?? null).toBeNull();
  });

  // было: «Drakhan · By stats — ничего не даст» в заголовке; у героя Revenge нет в билдах — offHero (11.1)
  it('режим героя, вещь не из его сетов и без полезных статов: offHero, кнопки нет', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, { setId: revenge, subs: { RES: 2, EFF: 2, 'ATK%': 1 } },
      { roster: [drakhan.id], gear: EMPTY, tryon: { charId: drakhan.id, build: '#stats' } });
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe(`${drakhan.name} doesn't need it: Revenge isn't in ${drakhan.name}'s builds.`);
  });

  // повторное ревью, мелочь 6: Mage-оружие у Aer (Striker) — было «полезных статов нет» (цель «По статам») или ничего
  // (цель — билд); причина — класс
  const aer = D.chars.find((c) => c.name === 'Aer')!;
  const ODYSSEY = { itemKey: '17', main: 'ATK%', subs: { 'DMG UP%': 2, CHC: 2, CHD: 1, SPD: 1 } }; // Thumping Odyssey — только Mage
  it.each([['#stats'], ['Speed']])('режим героя Aer (%s), оружие не для класса: «не носит этот предмет», кнопки нет', async (build) => {
    await mount({ slot: 'weapon', grade: 'unique' }, ODYSSEY, { roster: [aer.id], gear: EMPTY, tryon: { charId: aer.id, build } });
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-off')?.textContent).toBe("Aer can't wear this item: it's for another class.");
  });
});
