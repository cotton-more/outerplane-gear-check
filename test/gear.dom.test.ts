// @vitest-environment jsdom
// Экипировка на телефоне (360px), пул GEARPOOL: вещь с формы — «Надеть на…» → к персонажу, «Вернуть»; «Это шлем
// Kappa?»; «Заменить» — что со старой (Р15: кому её отдать, не предлагаем); «Сейчас на персонажах» — строка на персонажа и «Ещё»; «Кому надеть?» — только
// полезные строки; карточка персонажа — варианты, «Собираю», «Вещи · N», «По статам», лист вещи и «Убрать у…»;
// код копии. Core Fusion — test/fusion.dom.test.ts.
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
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'), kappa = char('Kappa'), rin = char('Rin');
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const speed = set('Speed');
const NEW = { setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } };
let root: Root | null = null;

// вещь и хранилище v2
type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const WEAK = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt: 4 });

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
const roster = () => JSON.parse(localStorage.getItem('ogc.roster')!);
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('«Надеть» и «Вернуть»', () => {
  it('«Надеть на…» → Caren (вещей нет): вещь у неё, «Начал собирать» без отметок (Р19), «Вернуть» — как было', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Equip — starts Speed, Speed/Immu');
    await click(byText('.equip-row', 'Caren') as HTMLElement);

    expect($('.gear-toast')?.textContent).toContain('On Caren: helmet. Counts in Speed, Speed/Immu.');
    expect($('.gear-toast small')?.textContent).toContain('Started filling Speed, Speed/Immu.');
    expect(stored()).toMatchObject({ v: 2, pools: { [caren.id]: ['p1'] }, pieces: { p1: { slot: 'helmet', setId: speed, yellow: NEW.subs, bt: null } } });
    expect(stored().marks ?? {}).toEqual({});
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored()).toMatchObject({ pieces: {}, pools: {}, marks: {} });
  });

  it('карточка: «▲ +25% Caren · Speed +1», кнопка под ней — «Заменить шлем Caren»; после — «уже есть», кнопки нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    // Speed-шлем Caren стоит и в Speed, и в Speed/Immu — новая лучше в обоих: «+1»
    expect($('.vcard .vc-vs')?.textContent).toBe('better than the one on: +25%Caren· Speed +1+CHD (3rd) · −SPD (4th)');
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    expect(stored().pools[caren.id]).toEqual(['p2']);
    expect($('.vcard .vc-vs .vs')?.textContent).toBe('already has it');
    expect($('.vc-equip')).toBeNull();
  });

  it('вторая кнопка «или — Caren · Speed ▸»: у другого кандидата тоже держащий исход — сразу ему, с «Вернуть»', async () => {
    // у Kappa три Speed-вещи — шлем соберёт ей Speed ×4 (первая кнопка); у Caren шлем слабее — новая лучше
    const kap = ['armor', 'gloves', 'shoes'].map((slot, i) => P('k' + (i + 1), slot, speed, { 'DEF%': 1, CHC: 1 }));
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK, ...kap], { [caren.id]: ['p1'], [kappa.id]: ['k1', 'k2', 'k3'] }), roster: [caren.id, kappa.id] });
    expect($('.vc-equip')?.textContent).toBe('Equip on Kappa');
    expect($('.vc-other')?.textContent).toBe('or — Caren · Speed ▸');
    await click($('.vc-other'));
    expect(stored().pools[caren.id]).toHaveLength(1);
    expect(stored().pools[caren.id]).not.toContain('p1');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(['p1']);
  });

  it('у неё лучше — строка сравнения есть, кнопки нет (надеть можно только полезную вещь)', async () => {
    const strong = P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, { lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }, bt: 4 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([strong], { [caren.id]: ['p1'] }) });
    expect($('.vcard .vc-vs .vs.down')).toBeTruthy();
    expect($('.vc-equip')).toBeNull();
  });

  it('«Вернуть» откатывает только «Надеть»: правка в карточке за эти секунды остаётся; Kappa ушла из ростера', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2 }, { bt: 4 });
    // Caren с вещами — в ростере (Р16); Kappa — через поиск по имени
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([helm], { [caren.id]: ['p1'] }), roster: [caren.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'kappa');
    await click(byText('.equip-row', 'Kappa') as HTMLElement);
    expect(stored().pools[kappa.id]).toEqual(['p2']);
    expect(roster()).toEqual([caren.id, kappa.id]); // «Надеть» добавило в ростер

    await click($('#tab-chars'));
    await click($$('#cgrid .ctile').find((b) => b.textContent?.includes('Caren')));
    expect($('.gear-toast')).toBeNull(); // сообщение — на вкладке, где сделано
    await click($('.bgear-row'));
    await click(byText('.piece-bt .fbtn', 'T3'));
    await click($('.drawer-x'));
    await click($('.vbar .vb-tab'));
    await click(byText('.gear-toast button', 'Undo'));

    expect(stored().pools[kappa.id]).toBeUndefined();
    expect(stored().pieces.p1.bt).toBe(3);
    expect(roster()).toEqual([caren.id]);
  });

  it('«Заменить» в шторке вердикта: сообщение лежит поверх неё — внизу шторки место (toast-on), «Вернуть» — снимает', async () => {
    const junk = P('p1', 'helmet', speed, { HP: 1, DEF: 1, ATK: 1, RES: 1 }, { bt: 0 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([junk], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click(byText('.drawer .vs-act', "Replace Caren's helmet"));
    expect($('.drawer')).toBeTruthy();
    expect(document.body.classList.contains('toast-on')).toBe(true);
    await click(byText('.gear-toast button', 'Undo'));
    expect(document.body.classList.contains('toast-on')).toBe(false);
  });

  it('две шторки сразу: Esc закрывает верхнюю, drawer-lock снимается с последней', async () => {
    const { Sheet } = await import('../src/components/Sheet');
    const closed: string[] = [];
    const el = document.createElement('div');
    document.body.append(el);
    root = createRoot(el);
    const draw = (both: boolean) => act(async () => root!.render(createElement('div', null,
      createElement(Sheet, { title: 'A', onClose: () => { closed.push('A'); }, children: 'a' }),
      both && createElement(Sheet, { title: 'B', onClose: () => { closed.push('B'); }, children: 'b' }))));
    await draw(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(closed).toEqual(['B']);
    await draw(false);
    expect(document.body.classList.contains('drawer-lock')).toBe(true);
    await act(async () => root!.render(createElement('div')));
    expect(document.body.classList.contains('drawer-lock')).toBe(false);
  });

  it('idle (не все сабстаты) — «Надеть на…» нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 2, CHC: 2 } });
    await click($('.vbar .vb-main'));
    expect($('.v-equip')).toBeNull();
  });
});

describe('«Это шлем Kappa?»', () => {
  const same = () => G([P('p1', 'helmet', speed, NEW.subs, { lit: { ...NEW.subs, CHD: 5 }, bt: 2 })], { [kappa.id]: ['p1'] });
  const ask = async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: same() });
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Caren') as HTMLElement);
  };

  it('«Она же — и у Caren»: та же запись в пуле Caren (seq тот же), Reforge и Breakthrough общие; «Вернуть» — только у Kappa', async () => {
    await ask();
    expect(byText('.drawer', "Is this Kappa's helmet?")).toBeTruthy();
    expect($('.twin')?.textContent).toContain('Kappa already has the same piece (in Speed');
    expect($$('.drawer')).toHaveLength(1);
    await click(byText('.twin button', 'Same piece — Caren too'));

    expect(stored()).toMatchObject({ seq: 1, pools: { [kappa.id]: ['p1'], [caren.id]: ['p1'] }, pieces: { p1: { bt: 2 } } });
    expect($('.gear-toast small')?.textContent).toContain("Same piece as Kappa's: Reforge and Breakthrough are shared.");
    expect($$('.drawer')).toHaveLength(0);
    expect(document.body.classList.contains('drawer-lock')).toBe(false);
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'] });
  });

  it('«Другая — своя» — новая запись у Caren, у Kappa её вещь остаётся', async () => {
    await ask();
    await click(byText('.twin button', 'Another copy'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'], [caren.id]: ['p2'] });
  });
});

// Р15: снятую при «Заменить» другим героям не предлагаем — никогда. Было: строка «Старый — Rin? Speed: соберёт.» и
// кнопка «Отдать Rin»
describe('«Заменить»: что со старой', () => {
  // у Caren слабый Speed-шлем (для Rin он хорош), у Rin — три Speed-вещи: шлем собрал бы ей Speed ×4
  const gear = () => G([
    P('p1', 'helmet', speed, { 'ATK%': 2, CHC: 2, CHD: 1, SPD: 1 }),
    P('p2', 'armor', speed, { 'ATK%': 2, CHC: 2 }), P('p3', 'gloves', speed, { 'ATK%': 2, CHC: 2 }), P('p4', 'shoes', speed, { 'ATK%': 2, CHC: 2 }),
  ], { [caren.id]: ['p1'], [rin.id]: ['p2', 'p3', 'p4'] });

  it('старый шлем пригодился бы Rin — ни кнопки «Отдать», ни строки про Rin; та же линия — материал новой', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: gear(), roster: [caren.id, rin.id] });

    await click($('.vc-equip'));

    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    expect($('.gear-toast small')?.textContent).toBe("The old helmet can feed the new one's Breakthrough.");
    expect($$('.gear-toast button').map((b) => b.textContent)).toEqual(['Undo']);
    expect(stored().pools[rin.id]).toEqual(['p2', 'p3', 'p4']);
  });

  it('старый у другого персонажа тоже — «остался у…»', async () => {
    const helm = P('p1', 'helmet', speed, { SPD: 1 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([helm], { [caren.id]: ['p1'], [kappa.id]: ['p1'] }) });
    await click($('.vc-equip'));
    expect($('.gear-toast small')?.textContent).toContain('The old helmet stays with Kappa (in Speed');
    expect($$('.gear-toast button').map((b) => b.textContent)).toEqual(['Undo']);
  });
});

describe('«Надеть»: что уходит из пула и что пишет сообщение (Р7)', () => {
  const JUNK = { RES: 1, EFF: 1, HP: 1, ATK: 1 }, STRONG = { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 };

  // подпись кнопки — то, что сделает «Надеть» (находка 5): ничего не уберёт — «Надеть», а не «Заменить ботинки»
  it('новая в пустой слот, а стала ненужной вещь другого слота — «Надеть на Caren» → «Надето», вещь в пуле', async () => {
    const pcs = [P('p1', 'helmet', speed, JUNK), P('p2', 'helmet', set('Attack'), STRONG), P('p3', 'armor', speed, JUNK), P('p4', 'gloves', speed, JUNK)];
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: speed, subs: { CHC: 3, CHD: 2, 'DEF%': 1, HP: 1 } }, { gear: G(pcs, { [caren.id]: ['p1', 'p2', 'p3', 'p4'] }) });
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain('On Caren: boots.');
    expect(stored().pools[caren.id]).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  // Def: три Defense-вещи + Attack-ботинки не по связке; Def/Immu: Defense ×2 + слабые Immunity-ботинки. Сильные
  // Immunity-ботинки лучше обеих — в Def вместо Attack, в Def/Immu вместо слабой Immunity
  it('две вещи её слота ушли — «Заменено: ботинки — убраны прежние: Attack и Immunity», обе вне пула; «Вернуть» — обе обратно', async () => {
    const def = set('Defense');
    const pcs = [
      P('p1', 'helmet', def, { 'DEF%': 2, CHC: 2 }), P('p2', 'armor', def, { 'DEF%': 2, CHC: 2 }), P('p3', 'gloves', def, { 'DEF%': 2, CHC: 2 }),
      P('p4', 'shoes', set('Attack'), { 'DEF%': 2, CHC: 2 }), P('p5', 'shoes', set('Immunity'), JUNK),
    ];
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Immunity'), subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }) });
    expect($('.vc-equip')?.textContent).toBe("Replace Caren's boots");
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's boots — the old Attack and Immunity ones are removed.");
    expect(stored().pools[caren.id]).toEqual(['p1', 'p2', 'p3', 'p6']);
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  // Р1: Speed/Immu — Immunity-шлем и броня + Speed-перчатки и ботинки на T4. Сильные Immunity-ботинки ломают Speed ×2
  // ради статов, но Speed/Immu собирается из вещей Caren — Speed-ботинки остаются
  // было: кнопка «Заменить ботинки» (Speed-ботинки вытеснены в показанной сборке), а тост «Надето» — теперь одно и то же
  it('две ушли, одна из них — и у Kappa: в строке про неё имя сета, а не «The old»', async () => {
    const def = set('Defense');
    const pcs = [
      P('p1', 'helmet', def, { 'DEF%': 2, CHC: 2 }), P('p2', 'armor', def, { 'DEF%': 2, CHC: 2 }), P('p3', 'gloves', def, { 'DEF%': 2, CHC: 2 }),
      P('p4', 'shoes', set('Attack'), { 'DEF%': 2, CHC: 2 }), P('p5', 'shoes', set('Immunity'), JUNK),
    ];
    const pools = { [caren.id]: pcs.map((p) => p.id as string), [kappa.id]: ['p4'] };
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Immunity'), subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, pools) });
    await click($('.vc-equip'));
    const toast = $('.gear-toast')?.textContent ?? '';
    expect(toast).toContain("Replaced: Caren's boots — the old Attack and Immunity ones are removed.");
    expect(toast).toMatch(/The Attack boots stay with Kappa \(in [^)]+\)\./);
    expect(toast).not.toContain('The old');
  });

  it('Р1: новая ломает сет-стат ради статов — прежняя вещь её слота остаётся: «Надеть на Caren» → «Надето»', async () => {
    const pcs = [
      P('p1', 'helmet', set('Immunity'), { 'DEF%': 2, CHC: 2 }), P('p2', 'armor', set('Immunity'), { 'DEF%': 2, CHC: 2 }),
      P('p3', 'gloves', speed, { 'DEF%': 2, CHC: 2 }, { bt: 4 }), P('p4', 'shoes', speed, JUNK, { bt: 4 }),
    ];
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Immunity'), subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }) });
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain('On Caren: boots.');
    expect(stored().pools[caren.id]).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });
});

// Р4, находка 5: кнопка есть только у исхода, который держит штамп и где вещь встаёт, или если вещь начнёт билд; подпись —
// то, что сделает «Надеть» (тост)
describe('кнопка = то, что сделает «Надеть»', () => {
  const mid = { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 1 };
  const openPick = async () => { await click($('.vcard')); await click($('.v-equip')); };

  // было (сценарий 4): карточка «ломает сет», а кнопка «Надеть на Caren» — от строки «на уровне» в Speed; жмёшь —
  // Speed-шлем уходил из пула
  it('лучший исход «ломает сет» (не встаёт): кнопки нет ни под карточкой, ни в «Сейчас на персонажах»', async () => {
    const pcs = [P('p1', 'helmet', set('Immunity'), { CHC: 1, HP: 1, RES: 1, EFF: 1 }), P('p2', 'gloves', set('Immunity'), mid), P('p3', 'armor', speed, mid),
      P('p4', 'shoes', speed, mid), P('p5', 'helmet', speed, mid)];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 2 } },
      { gear: G(pcs, { [caren.id]: ['p1', 'p2', 'p3', 'p4', 'p5'] }, { marks: { [`${caren.id}/Speed`]: 'want' } }) });
    expect($('.vcard .vc-vs .vs')?.textContent).toBe('breaks a set');
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect(byText('.v-vs .vs-row', 'Caren')?.querySelector('.vs-act')).toBeNull();
  });

  it('лучший исход «ломает сет»: в «Кому надеть?» Caren нет', async () => {
    const pcs = [P('p1', 'helmet', set('Immunity'), { CHC: 1, HP: 1, RES: 1, EFF: 1 }), P('p2', 'gloves', set('Immunity'), mid), P('p3', 'armor', speed, mid),
      P('p4', 'shoes', speed, mid), P('p5', 'helmet', speed, mid)];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 2 } },
      { gear: G(pcs, { [caren.id]: ['p1', 'p2', 'p3', 'p4', 'p5'] }, { marks: { [`${caren.id}/Speed`]: 'want' } }) });
    await openPick();
    expect(byText('.equip-row', 'Caren')).toBeUndefined();
  });

  // было (гипотеза b, B1-правило): штамп понижен, а в «Сейчас на персонажах» — «Заменить шлем Caren», в «Кому надеть?» —
  // строка. Р4 это правило заменил
  it('«на уровне» (штамп понижен): кнопки нет, строка сравнения есть; в «Кому надеть?» Caren нет', async () => {
    const pcs = ['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('p' + (i + 1), sl, speed, mid));
    await mount({ slot: 'helmet', grade: 'unique', rosterOnly: true }, { setId: speed, subs: { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 2 } },
      { gear: G(pcs, { [caren.id]: ['p1', 'p2', 'p3', 'p4'] }) });
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-vs .vs-row .vs')?.textContent).toBe('on par');
    expect($('.v-vs .vs-act')).toBeNull();
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')).toBeUndefined();
  });

  // было (повторное ревью, a3-lower seed 11): «Fodder · already no worse on Kappa · starts · Kappa · Speed» и под ней
  // «Equip on Kappa». Вещь, которая кандидату начинает билд, штамп не понижает (П1)
  it('Kappa: Speed-ботинки начнут Speed — штамп не «Fodder», под карточкой «Equip on Kappa»', async () => {
    const pcs = [
      P('k1', 'helmet', set('Counterattack'), { 'ATK%': 4, SPD: 1, 'DEF%': 2 }), P('k2', 'armor', set('Counterattack'), { SPD: 4, HP: 2, CHC: 1 }, { bt: 0 }),
      P('k3', 'helmet', set('Effectiveness'), { SPD: 1, CHC: 1 }), P('k4', 'armor', set('Mitigation'), { CHD: 4, RES: 2, SPD: 3 }),
      P('k5', 'gloves', set('Defense'), { HP: 3, 'HP%': 2, CHC: 3, 'DEF%': 3 }, { bt: 4 }), P('k6', 'shoes', set('Defense'), { CHD: 2, RES: 2 }, { bt: 4 }),
    ];
    const marks = { [`${kappa.id}/Swift Defense`]: 'want', [`${kappa.id}/Swift Counter`]: 'want' };
    await mount({ slot: 'shoes', grade: 'unique', rosterOnly: true, fodder: true, stage: 'grow' }, { setId: speed, subs: { 'DMG UP%': 1, 'DEF%': 3, CHD: 1, DEF: 3 } },
      { gear: G(pcs, { [kappa.id]: pcs.map((p) => p.id as string) }, { marks }), roster: [kappa.id] });
    expect($('.vcard .vc-vs')?.textContent).toBe('startsKappa· Speed');
    expect($('.vcard')?.textContent).not.toContain('Fodder');
    expect($('.vcard')?.textContent).not.toContain('already');
    expect($('.vc-equip')?.textContent).toBe('Equip on Kappa');
  });

  // было (браузер): у Core Fusion Eternal главная строка «только статы — … оставь как есть» про «По статам», а под ней
  // «Надеть на Core Fusion Eternal» — и её Effectiveness-шлем уходил. «По статам» теперь остаётся и после «Надеть»
  // (находка 28): Effectiveness-шлем сильнее по статам и стоит в нём — «Надеть», не «Заменить», и он остаётся в пуле
  it('Core Fusion Eternal, 4 Effectiveness: Speed-шлем только начнёт Speed — главная строка «начнёт», кнопка «Надеть» = тост, Effectiveness-шлем остаётся', async () => {
    const cf = char('Core Fusion Eternal');
    const pcs = ['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('e' + (i + 1), sl, set('Effectiveness'), { SPD: 2, EFF: 2, CHC: 1, HP: 1 }));
    await mount({ slot: 'helmet', grade: 'unique', rosterOnly: false }, { setId: speed, subs: { SPD: 3, EFF: 2, CHC: 2, 'ATK%': 1 } },
      { gear: G(pcs, { [cf.id]: ['e1', 'e2', 'e3', 'e4'] }), roster: [cf.id] });
    expect($('.vcard .vc-vs')?.textContent).toBe('startsCore Fusion Eternal· Speed');
    expect($('.vc-equip')?.textContent).toBe('Equip on Core Fusion Eternal');
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain('On Core Fusion Eternal: helmet.');
    expect(stored().pools[cf.id]).toContain('e1');
  });

  // «По статам» живой (в пуле нет брони из сетов связок) — его «только статы» остаётся в «Ещё», но не главной строкой
  it('Core Fusion Eternal: «только статы» у «По статам» — не главная строка (главная — «начнёт»), только в «Ещё»', async () => {
    const cf = char('Core Fusion Eternal');
    const pcs = ['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('e' + (i + 1), sl, set('Effectiveness'), { SPD: 2, EFF: 2, CHC: 1, HP: 1 }));
    await mount({ slot: 'helmet', grade: 'unique', rosterOnly: false }, { setId: speed, subs: { SPD: 3, EFF: 2, CHC: 2, 'ATK%': 1 } },
      { gear: G(pcs, { [cf.id]: ['e1', 'e2', 'e3', 'e4'] }), roster: [cf.id] });
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Core Fusion Eternal')!;
    expect(row.querySelector('.vs')?.textContent).toBe('starts');
    expect(row.querySelector('.vs-more-btn')?.textContent).toContain('By stats — stats only');
    expect(row.querySelector('.vs-act')?.textContent).toBe('Equip on Core Fusion Eternal');
  });

  // было (сценарий «Eternal»): «Кому надеть?» — «Надеть — начнёт Speed», а жмёшь — «Заменено: шлем Eternal». Attack-шлем
  // сильнее по статам и остаётся в «По статам» (находка 28) — «Надето», шлем в пуле
  it('Eternal, 4 Attack, слабый Speed-шлем через «Кому надеть?»: вещь начнёт Speed, Attack-шлем остаётся — тост «Надето», «Начал собирать Speed»', async () => {
    const eternal = char('Eternal');
    const pcs = ['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('e' + (i + 1), sl, set('Attack'), { SPD: 3, EFF: 2, CHC: 2 }));
    await mount({ slot: 'helmet', grade: 'unique', rosterOnly: false }, { setId: speed, subs: { SPD: 1, HP: 1, RES: 1, DEF: 1 } },
      { gear: G(pcs, { [eternal.id]: ['e1', 'e2', 'e3', 'e4'] }), roster: [eternal.id] });
    await openPick();
    const row = byText('.equip-row', 'Eternal')!;
    expect(row.querySelector('.vs')?.textContent).toBe('starts');
    await click(row);
    expect($('.gear-toast')?.textContent).toContain('On Eternal: helmet.');
    expect($('.gear-toast small')?.textContent).toContain('Started filling Speed.');
    expect(stored().pools[eternal.id]).toContain('e1');
  });
});

describe('«Сейчас на персонажах»', () => {
  it('строка на персонажа — лучший исход; «Ещё: …» — остальные, по нажатию целиком', async () => {
    const immu = set('Immunity');
    // у Caren: Speed-шлем и Immunity-броня; новый шлем Immunity — в Speed/Immu «сет …», в Def/Immu — тоже
    const gear = G([P('p1', 'helmet', speed, { CHC: 1 }), P('p2', 'armor', immu, { CHC: 1 })], { [caren.id]: ['p1', 'p2'] });
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: immu, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } }, { gear });
    await click($('.vcard'));
    const rows = $$('.v-vs .vs-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.vs')?.textContent).toMatch(/completes|set \d of 4/);
    const more = rows[0].querySelector<HTMLElement>('.vs-more-btn');
    expect(more?.textContent).toMatch(/^More: /);
    await click(more);
    expect(rows[0].querySelectorAll('.vs-more').length).toBeGreaterThan(0);
  });

  it('ни вещей, ни своих среди кандидатов — вердикт как раньше', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { roster: [] });
    expect($('.vcard .vc-vs')).toBeNull();
    expect($('.vcard .vc-chain')).toBeTruthy();
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-vs')).toBeNull();
    expect($('.v-equip')).toBeTruthy();
  });

  // находка 21: было — у Caren без вещей ни строки, ни кнопки, надеть только через «Надеть на…»
  it('у своей Caren вещей нет — на карточке «начнёт», кнопка «Надеть на Caren» → «Надето», строка в «Сейчас на персонажах»', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    expect($('.vcard .vc-vs')?.textContent).toBe('startsCaren· Speed');
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Caren')!;
    expect(row.querySelector('.vs')?.textContent).toBe('starts');
    expect(row.querySelector('.vs-act')?.textContent).toBe('Equip on Caren');
    // повторное ревью, мелочь 14: что начнёт — в заголовке строки, без «Also counts toward…» (это единственное, куда она идёт)
    expect(row.querySelector('.vs-h .bn')?.textContent).toBe('Speed, Speed/Immu');
    expect(row.textContent).not.toContain('Also counts toward');
    await click($('.drawer-x'));
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain('On Caren: helmet.');
  });

  it('шлем хуже у Caren в Speed — ▼, цепочки, места; материал её Breakthrough', async () => {
    const worn = P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 }, { lit: { 'DEF%': 6, CHC: 4, CHD: 4, HP: 2 }, bt: 2 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([worn], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    const row = $('.v-vs .vs-row')!;
    expect(row.querySelector('.vs.down')?.textContent).toMatch(/^worse than the one on: −\d+%$/);
    expect(row.querySelectorAll('.vs-cmp .chain')).toHaveLength(2);
    expect(row.textContent).toContain('this is a tier of its Breakthrough, T2 → T3');
    expect(row.querySelector('.vs-act')).toBeNull(); // хуже — надеть нельзя
  });

  it('оружие: временная против рекомендованной — чип словом, ▼ «stopgap»', async () => {
    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;
    const w = P('p1', 'weapon', null, { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 }, { itemKey: embrace.key, main: 'DEF%', bt: 2 });
    await mount({ slot: 'weapon', grade: 'rare' }, { main: 'DEF%', subs: { CHC: 3, CHD: 3, SPD: 3 } }, { gear: G([w], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    expect($('.v-vs .vs.down')?.textContent).toBe('worse than the one on: stopgap');
    expect($('.v-vs .vs-row')?.textContent).toContain('the passive matters more than substats');
  });

  // Р2, находка 22: у Luna четыре Pen без отметки Breakthrough — Pen ×4 на T0; Attack-шлем «ломает» именно его
  // у Pen-шлема полезных нет: процента «лучше на 150750%» нет — «полезных нет», а распадается Pen ×4 — строкой «Lost»
  it('Luna, 4 Pen без T4 + Attack-перчатки и ботинки: Attack-шлем — Penetration ×4 пропадёт, совет отметить T4, кнопки нет', async () => {
    const luna = char('Demiurge Luna'), pen = set('Penetration'), atk = set('Attack');
    const strong = { 'ATK%': 6, CHC: 6, CHD: 6, SPD: 6 };
    const pcs = [
      ...['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('p' + (i + 1), sl, pen, { RES: 1, EFF: 1, HP: 1 })),
      P('p5', 'gloves', atk, strong), P('p6', 'shoes', atk, strong),
    ];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: atk, subs: { 'ATK%': 4, CHC: 4, CHD: 3, SPD: 3 } }, { gear: G(pcs, { [luna.id]: pcs.map((p) => p.id as string) }), roster: [luna.id] });
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Demiurge Luna')!;
    expect(row.querySelector('.vs')?.textContent).toBe('breaks a set');
    expect(row.textContent).toContain('The one on has nothing useful');
    expect(row.textContent).not.toMatch(/\d{4,}%/);
    expect(row.textContent).toContain('Lost: Penetration ×4 (T0–T3) — Penetration +20%.');
    expect(row.textContent).toContain('Fits once two Penetration pieces are marked Breakthrough T4.');
    expect(row.querySelector('.vs-act')).toBeNull();
  });

  // Speed/Immu собран, Immunity-шлем без полезных; Defense-шлем в Speed/Immu — «только статы» (Immunity ×2 ради статов
  // не ломаю): процента нет, но что сломается — есть, одной строкой (было: только «The one on has nothing useful»)
  it('Caren, Speed/Immu с пустым Immunity-шлемом: Defense-шлем — «только статы» одной строкой «nothing useful… But it breaks»', async () => {
    const junk = { RES: 1, EFF: 1, HP: 1, ATK: 1 }, immu = set('Immunity');
    const pcs = [P('p1', 'helmet', immu, junk), P('p2', 'armor', immu, junk), P('p3', 'gloves', speed, junk), P('p4', 'shoes', speed, junk)];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Defense'), subs: { 'DEF%': 2, CHC: 2, CHD: 1, HP: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }) });
    await click($('.vcard'));
    const row = () => byText('.v-vs .vs-row', 'Caren');
    await click(row()?.querySelector<HTMLElement>('.vs-more-btn'));
    const stats = [...row()!.querySelectorAll<HTMLElement>('.vs-more')].find((m) => m.querySelector('.vs')?.textContent === 'stats only')!;
    expect(stats.querySelector('.bn')?.textContent).toBe('Speed/Immu');
    expect([...stats.querySelectorAll('p')].slice(1).map((p) => p.textContent)).toEqual(["Better on stats — the helmet on has nothing useful. But it breaks Immunity ×2 — don't equip."]);
  });

  it('Luna, одна из четырёх Pen на T4: Attack-шлем — «ломает», совет отметить T4 у одной вещи, не «у двух»', async () => {
    const luna = char('Demiurge Luna'), pen = set('Penetration'), atk = set('Attack');
    const strong = { 'ATK%': 6, CHC: 6, CHD: 6, SPD: 6 };
    const pcs = [
      ...['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('p' + (i + 1), sl, pen, { RES: 1, EFF: 1, HP: 1 }, sl === 'armor' ? { bt: 4 } : {})),
      P('p5', 'gloves', atk, strong), P('p6', 'shoes', atk, strong),
    ];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: atk, subs: { 'ATK%': 4, CHC: 4, CHD: 3, SPD: 3 } }, { gear: G(pcs, { [luna.id]: pcs.map((p) => p.id as string) }), roster: [luna.id] });
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Demiurge Luna')!;
    expect(row.querySelector('.vs')?.textContent).toBe('breaks a set');
    expect(row.textContent).not.toContain('two Penetration pieces');
    expect(row.textContent).not.toContain('Fits once you find');
    expect(row.textContent).toMatch(/Fits once the Penetration (gloves|boots) are marked Breakthrough T4\./);
  });

  // было: Caracal начинал только отмеченный переносом DPS speed, Pen-шлем — «начнёт». Р18: оружие из списка начинает
  // билд, а Caracal — в списке всех билдов Ame: все начаты, Pen-шлем в DPS pen — «сет 1 из 4», остальные не трогает
  it('после переноса v1: Caracal у Ame из списка всех билдов (Р18) — Pen-вещь в DPS pen «сет 1 из 4», не «начнёт»', async () => {
    const ame = char('Mystic Sage Ame');
    const caracal = D.weapons.find((w) => w.name.startsWith('Rampaging Caracal') && w.star === 6)!;
    const v1 = { v: 1, seq: 1, pieces: { p1: P('p1', 'weapon', null, { CHC: 1 }, { itemKey: caracal.key, main: 'ATK%' }) }, builds: { [ame.id + '/DPS speed']: { slots: { weapon: 'p1' }, at: '' } } };
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Penetration'), subs: { 'ATK%': 3, CHC: 3, CHD: 2, SPD: 2 } }, { gear: v1, roster: [ame.id] });
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Mystic Sage Ame')!;
    expect(row.querySelector('.vs')?.textContent).toBe('set 1 of 4');
    expect(row.textContent).toContain('Leaves DPS speed, DPS revenge, DPS attack, Sub-DPS, Immu as is.');
    expect(row.textContent).not.toContain('it starts filling');
  });
});

describe('«Кому надеть?»', () => {
  it('вещь в шапке; строка на персонажа — что будет; только те, кому вещь встанет в билд; поиск — среди всех', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click($('.v-equip'));

    expect($('.equip-item')?.textContent).toContain('Helmet · Speed Set · L');
    expect($('.equip-subs')?.textContent).toBe('DEF%2CHC2CHD3HP1');
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Replace helmet — the new one is better · Speed');
    expect($$('.equip-row')).toHaveLength(1);
    expect($('.equip')?.textContent).toContain('Here are those whose builds can use the piece. Off-build? Search a character by name: it goes into "By stats".');
    expect($('.equip .toggle')).toBeNull(); // «показать и не по билду» больше нет

    const input = $('.equip-q input') as HTMLInputElement;
    await type(input, 'kap');
    expect(byText('.equip-row', 'Kappa')?.querySelector('.act')?.textContent).toBe('Equip — starts Speed');
    // персонаж, чьим билдам Speed Set не нужен: без поиска его нет, а поиск по имени — явный выбор, и вещь с полезными
    // ему статами встанет в его «По статам» (находка 28, Р11)
    const noSpeed = D.chars.find((c) => c.builds.length && !c.builds.some((b) => b.sets.flat().some((p) => p.set === speed)))!;
    await type(input, noSpeed.name.toLowerCase());
    expect(byText('.equip-row', noSpeed.name)?.querySelector('.act')?.textContent).toBe('Equip — empty slot · By stats');
  });

  // Шаг 14 (браузер): Aer (Striker) предлагался Thumping Odyssey — оружие только для Mage, «пустой слот · Speed».
  // Вещь не для класса героя не предлагается ни без поиска, ни при поиске по имени (и в «По статам» не встаёт)
  it('оружие только для Mage: Aer (Striker) нет ни в ростере, ни в поиске «aer»; Mage Ame — есть', async () => {
    // Arrange
    const aer = char('Aer'), ame = char('Ame');
    const names = () => $$('.equip-row .nm b').map((b) => b.textContent);
    await mount({ slot: 'weapon', grade: 'unique' }, { itemKey: '17', main: 'ATK%', subs: { CHC: 2, CHD: 2, SPD: 1, HP: 1 } }, { roster: [aer.id, ame.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(names()).toEqual([ame.name]);
    // Act
    await type($('.equip-q input') as HTMLInputElement, 'aer');
    // Assert
    expect(names()).not.toContain(aer.name);
  });

  it('поиск по имени, а вещь ей ничего не даст (полезных статов нет): строки нет, внизу — «никому с таким именем»', async () => {
    const drakhan = char('Demiurge Drakhan'); // цепочка SPD › HP › CHC › CHD › DMG UP% › DEF
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Revenge'), subs: { RES: 2, EFF: 2, 'ATK%': 1 } }, { roster: [drakhan.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'demiurge drakhan');
    expect($$('.equip-row')).toHaveLength(0);
    expect($('.equip .muted')?.textContent).toBe('It gives no one by that name anything.');
  });

  it('без поиска вещь не по билду никому: внизу — «найди персонажа по имени»', async () => {
    const drakhan = char('Demiurge Drakhan');
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Revenge'), subs: { SPD: 3, HP: 1, 'HP%': 1 } }, { roster: [drakhan.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect($$('.equip-row')).toHaveLength(0);
    expect($('.equip .muted')?.textContent).toBe('It gives no build anything. Search a character by name — with useful stats it goes into their "By stats".');
  });

  // «Надеть» уберёт вещь её слота — подпись = действие: «Заменить ботинки — соберёт Speed», «…— Speed: сет 3 из 4»
  it('замена, а вещь соберёт билд — «Replace boots — completes Speed»', async () => {
    const junk = { RES: 1, EFF: 1, HP: 1 }, ok = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('p1', 'helmet', speed, ok), P('p2', 'armor', speed, ok), P('p3', 'gloves', speed, ok), P('p4', 'shoes', set('Attack'), junk)];
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Replace boots — completes Speed');
  });

  it('замена, а вещь продвинет сет — «Replace gloves — Speed: set 3 of 4»', async () => {
    const junk = { RES: 1, EFF: 1, HP: 1 }, ok = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('p1', 'helmet', speed, ok), P('p2', 'armor', speed, ok), P('p3', 'gloves', set('Attack'), junk)];
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Replace gloves — Speed: set 3 of 4');
  });

  it('такая же вещь уже у Caren — строка «Уже есть» не нажимается: Reforge и Breakthrough записи остаются', async () => {
    const yellow = { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 };
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: yellow }, { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    const row = byText('.equip-row', 'Caren') as HTMLButtonElement;
    expect(row.textContent).toContain('Already has it — the same piece in Speed');
    expect(row.disabled).toBe(true);
    await click(row);
    expect(stored() ?? {}).not.toHaveProperty('pieces.p2');
  });
});

describe('карточка персонажа', () => {
  it('заголовок, «Собираю», бонусы с уровнем; вещь с сегментами по цепочке; карточка вещи — оранжевый и T4', async () => {
    const four = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, speed, { 'DEF%': 2, EFF: 1 }));
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(four, { [caren.id]: four.map((p) => p.id as string) }) });

    expect($('.cd-lead')?.textContent).toContain('Best assembled: Speed · set 4 of 4');
    expect(byText('.btabs button', 'Speed')?.textContent).toBe('Speed4/6');
    expect($('.want-btn')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.want-row')?.textContent).toContain('— assembled');
    expect($('.bgear-set')?.textContent).toContain('Speed ×4 · T? — ');
    expect($('.bgear-set')?.textContent).toContain('mark Breakthrough');
    expect($$('.bgear-row')[0].querySelectorAll('.tok')[0].className).toBe('tok ok');
    expect($('.bgear-m')?.textContent).toBe('T? · Reforge 0/6');
    await click($('.bgear-row'));
    await click($$('.piece .seg6')[0].querySelectorAll('button')[2] as HTMLElement); // 3-я клетка DEF% — оранжевая
    await click(byText('.piece-bt .fbtn', 'T4'));
    expect(stored().pieces.p1).toMatchObject({ yellow: { 'DEF%': 2 }, lit: { 'DEF%': 3 }, bt: 4 });
    expect($('.piece')?.textContent).toContain('Reforge: 1 of 6');
  });

  it('«Собираю» выключить — «Не собираю» у варианта; включить обратно — отметки нет (собирается сам)', async () => {
    const four = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, speed, { CHC: 1 }));
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(four, { [caren.id]: four.map((p) => p.id as string) }) });
    await click(byText('.btabs button', 'Speed/Immu'));
    await click($('.want-btn'));
    expect(stored().marks).toEqual({ [caren.id + '/Speed/Immu']: 'skip' });
    expect($('.want-row')?.textContent).toContain("not filling — its pieces don't hold the verdict");
    await click($('.want-btn'));
    expect(stored().marks).toEqual({});
  });

  it('варианты связок: чипы (лучший + ещё два) и «ещё N» на 280px — шторка со всеми, у каждого «Собираю»', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 280 });
    const luna = char('Demiurge Luna');
    const pen = ['helmet', 'armor'].map((slot, i) => P('p' + (i + 1), slot, set('Penetration'), { 'ATK%': 2, CHC: 1 }));
    await mount({ tab: 'chars', charId: luna.id }, {}, { gear: G(pen, { [luna.id]: ['p1', 'p2'] }), roster: [luna.id] });
    await click(byText('.btabs button', 'Pen mix'));
    const chips = $$('.vchips .vchip');
    expect(chips.map((c) => c.textContent)).toHaveLength(4);
    expect(chips[3].textContent).toBe('2 more ▾');
    await click(chips[1]);
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    await click($$('.vchips .vchip')[3]);
    expect($('.vsheet')?.textContent).toContain('Penetration ×2 in all, the other half differs.');
    expect($$('.vlist li')).toHaveLength(5);
    expect($$('.vlist .want-btn').every((b) => b.getAttribute('aria-pressed') === 'true')).toBe(true); // Pen ×2 собран в каждом
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
  });

  it('шторка вариантов без вещей: связки со сбором есть, «Собираю» нет — как в блоке билда', async () => {
    const luna = char('Demiurge Luna');
    await mount({ tab: 'chars', charId: luna.id }, {}, { roster: [luna.id] });
    await click(byText('.btabs button', 'Pen mix'));
    await click(byText('.vchips .vchip', 'more'));

    expect($$('.vlist li')).toHaveLength(5);
    expect($('.vlist .want-btn')).toBeNull();
  });

  it('«По статам» у Eternal: вкладка последней, бонус случайного сета считается, «Не хватает» — вещи сета билда', async () => {
    const cf = char('Core Fusion Eternal');
    const eff = ['helmet', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, set('Effectiveness'), { SPD: 2, EFF: 1 }));
    await mount({ tab: 'chars', charId: cf.id }, {}, { gear: G(eff, { [cf.id]: ['p1', 'p2', 'p3'] }), roster: [cf.id] });
    expect($('.cd-lead')?.textContent).toBe("By stats — no build started yet: pieces are laid out by Core Fusion Eternal's chain.");
    expect($$('.btabs button').map((b) => b.textContent).at(-1)).toBe('By stats3/6');
    expect($('.btabs button[aria-selected="true"]')?.textContent).toBe('By stats3/6'); // открыта на лучшем варианте
    expect($('.bgear-set')?.textContent).toContain("Effectiveness ×2 · T? — Effectiveness +18% · mark Breakthrough · not in Core Fusion Eternal's builds, but the bonus counts");
    expect($('.bgear-need')?.textContent).toContain('Missing: Speed Set pieces — the first one starts Speed');
  });

  it('Р1: раскладка Speed отдала перчатки Immunity-вещи — карточка честная (3 Speed), но «Не хватает» не просит Speed-вещь, которая уже есть', async () => {
    const imm = set('Immunity');
    const pieces = [
      P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { bt: 4 }), P('p2', 'armor', speed, { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }, { bt: 4 }),
      P('p3', 'gloves', speed, { CHC: 2, CHD: 2, SPD: 1, ATK: 1 }), P('p4', 'shoes', speed, { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }),
      P('p5', 'helmet', imm, { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }), P('p6', 'gloves', imm, { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
    ];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(pieces, { [caren.id]: pieces.map((p) => p.id as string) }) });
    await click($$('.btabs button').find((b) => /^Speed\d/.test(b.textContent ?? '')));
    expect($$('.bgear-list li').filter((li) => li.textContent?.includes('Speed Set'))).toHaveLength(3);
    expect($('.bgear-need')).toBeNull();
    expect(byText('.pool-list li', 'no longer needs it')).toBeUndefined();
  });

  it('Р1: подпись «Собираю» — по показанной раскладке: не «готова Speed ×4», пока в перчатках Immunity, а «собирается из вещей Caren»', async () => {
    const imm = set('Immunity');
    const pieces = [
      P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { bt: 4 }), P('p2', 'armor', speed, { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }, { bt: 4 }),
      P('p3', 'gloves', speed, { CHC: 2, CHD: 2, SPD: 1, ATK: 1 }), P('p4', 'shoes', speed, { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }),
      P('p5', 'helmet', imm, { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }), P('p6', 'gloves', imm, { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
    ];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(pieces, { [caren.id]: pieces.map((p) => p.id as string) }) });
    await click($$('.btabs button').find((b) => /^Speed\d/.test(b.textContent ?? '')));
    expect($('.want-row .want-btn')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.want-row .muted')?.textContent).toBe("— Speed ×4 can be made from Caren's pieces, but the layout is better without it");
  });

  it('Р14: Def/Immu начат одной Immunity-вещью — «Собираю» включён, но не «ближе всех к сборке» (ближе Speed ×4)', async () => {
    const pieces = [...['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, speed, { CHC: 1 })), P('p5', 'helmet', set('Immunity'), { CHC: 1 })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(pieces, { [caren.id]: pieces.map((p) => p.id as string) }) });
    await click(byText('.btabs button', 'Def/Immu'));
    expect($('.want-row .want-btn')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.want-row .muted')?.textContent).toBe('');
  });

  it('«Вещи Caren · N»: где стоит; ненужная — «больше не нужна» и «Убрать у Caren» с «Вернуть»', async () => {
    const weak = P('p1', 'helmet', speed, { RES: 1 }), strong = P('p2', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 3 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([weak, strong], { [caren.id]: ['p1', 'p2'] }) });
    expect($('.pool summary')?.textContent).toBe("Caren's gear · 2");
    expect(byText('.pool-list li', 'no longer needs it')).toBeTruthy();
    expect(byText('.pool-row', 'in every build')).toBeTruthy(); // собирается Speed и Speed/Immu — шлем в обоих
    await click(byText('.pool-unused button', 'Remove from Caren'));
    expect(stored().pools[caren.id]).toEqual(['p2']);
    expect($('.gear-toast')?.textContent).toContain('Removed from Caren.');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id].sort()).toEqual(['p1', 'p2']);
  });

  it('лист общей вещи: где стоит и у кого; «Убрать у Caren» — у Kappa остаётся; «Разобрал — убрать у всех»', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'], [kappa.id]: ['p1'] }) });
    await click($('.bgear-row'));
    expect($('.piece')?.textContent).toContain('In Speed, Speed/Immu and with Kappa — edits change it everywhere.');
    await click(byText('.piece-act .btn', 'Remove from Caren'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'] });
    expect($('.gear-toast')?.textContent).toContain('Removed from Caren.');
    expect($('.gear-toast small')?.textContent).toBe('Kappa still has it.');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'], [caren.id]: ['p1'] });

    await click($('.bgear-row'));
    await click(byText('.piece-act .btn', 'Dismantled — remove everywhere'));
    expect(stored()).toMatchObject({ pools: {}, pieces: {} });
  });

  it('лист вещи в одном билде, только у Caren: «правка изменит везде» нет — вещь не общая', async () => {
    const helm = P('p1', 'helmet', set('Penetration'), { 'DEF%': 2, CHC: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    expect(byText('.pool-row', 'in Pen')).toBeTruthy();
    await click($('.bgear-row'));
    const text = $('.piece')?.textContent ?? '';
    expect(text).not.toContain('edits change it everywhere');
    expect(text).not.toContain('In no build');
  });

  it('разовая подсказка после переноса: закрыл — ключ удалён', async () => {
    const four = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, speed, { CHC: 1 }));
    const gear = G(four, { [caren.id]: four.map((p) => p.id as string) }, { marks: { [caren.id + '/Speed']: 'want' }, autoNew: [caren.id + '/Speed/Immu'] });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear });
    expect($('.cd-note')?.textContent).toContain('Speed/Immu now assembles itself from Caren\'s gear.');
    await click($('.cd-note button'));
    expect(stored().autoNew).toEqual([]);
    expect($('.cd-note')).toBeNull();
  });

  it('замена стата в карточке вещи: статы вещи недоступны, переезда строк нет', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 3, SPD: 1 }, { lit: { 'DEF%': 4, CHC: 3, SPD: 1 } });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await click($('.bgear-row'));
    await click($('.piece .subkey'));
    const opt = (k: string) => $$('.subopt').find((b) => b.textContent === k) as HTMLButtonElement;
    expect(opt('CHC').disabled).toBe(true);
    expect(opt('CHD').disabled).toBe(false);
    expect($('.subopt .row-n')).toBeNull();
  });

  it('жёлтые через название стата: тот же стат → «Сколько жёлтых» → 3; Reforge не прибавился', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 1, CHC: 2 }, { lit: { 'DEF%': 3, CHC: 2 } });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await click($('.bgear-row'));
    await click($('.piece .subkey'));
    await click($$('.subopt').find((b) => b.textContent?.replace(/^%/, '') === 'DEF%'));
    expect($('.drawer-h h3')?.textContent).toBe('How many yellow on DEF%?');
    await click(byText('.piece-bt .fbtn', '3'));
    expect(stored().pieces.p1).toMatchObject({ yellow: { 'DEF%': 3 }, lit: { 'DEF%': 5 } });
    expect($('.piece')?.textContent).toContain('Reforge: 2 of 6');
  });

  it('«Слабее всех» — перчатки Epic: что искать, «Примерить вещи» — примерка перчаток', async () => {
    const pc = (id: string, slot: string, grade: string, lit: Record<string, number>, bt: number) => P(id, slot, speed, lit, { grade, bt });
    const gear = G([
      pc('p1', 'helmet', 'unique', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 1 }, 4), pc('p2', 'armor', 'unique', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 4),
      pc('p3', 'gloves', 'rare', { 'DEF%': 1, SPD: 2, EFF: 1 }, 2), pc('p4', 'shoes', 'unique', { 'DEF%': 2, CHC: 3, CHD: 3, SPD: 2 }, 4),
    ], { [caren.id]: ['p1', 'p2', 'p3', 'p4'] });
    await mount({ tab: 'chars', charId: caren.id, slot: 'helmet' }, {}, { gear });
    expect($('.bgear-weak p')?.textContent).toBe('The weakest — gloves (Epic, Breakthrough T2). Look for Speed Gloves with CHC and CHD — in try-on the verdict shows whether it beats the one on.');
    await click(byText('.bgear-weak button', 'Try on pieces'));
    expect(JSON.parse(localStorage.getItem('ogc.state')!)).toMatchObject({ tab: 'eval', slot: 'gloves' });
    expect($('.tryon')?.textContent).toContain('Caren · Speed');
  });

  it('карточка вещи — шторкой в <body>; ушли на «Оценку» — закрылась, прокрутка не заперта', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([P('p1', 'helmet', speed, { 'DEF%': 2 })], { [caren.id]: ['p1'] }) });
    await click($('.bgear-row'));
    expect($('.piece')?.closest('.drawer-back')?.parentElement).toBe(document.body);
    await click($('.vbar .vb-tab'));
    expect($('.piece')).toBeNull();
    expect(document.body.classList.contains('drawer-lock')).toBe(false);
  });
});

describe('меню, плитки, код копии, другая вкладка', () => {
  it('меню ☰ «Gear · 1» — список «with gear»: только Caren, на плитке «1/6», на вкладке тоже', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, {}, { gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }), roster: [caren.id, kappa.id] });
    await click($('.vb-tab'));
    await click(byText('.menu-nav button', 'Gear · 1'));
    expect(($('#c-gear') as HTMLInputElement).checked).toBe(true);
    expect($$('#cgrid .ctile .cn').map((e) => e.textContent)).toEqual(['Caren']);
    expect($('#cgrid .gearb')?.textContent).toBe('1 of 6 equipped1/6');
    expect($('.roster-bar')?.textContent).toContain('gear on 1');
    expect($('.cgrid-note')?.textContent).toContain('1 more in your roster has no gear yet');
    await click($('#cgrid .ctile'));
    expect(byText('.btabs button', 'Speed')?.textContent).toBe('Speed1/6');
  });

  it('код копии в «Экспорт / импорт» — OGC-GEAR2, вся экипировка; импорт — «Вернуть» возвращает прежнее', async () => {
    await mount({ tab: 'chars' }, {}, { gear: G([P('p1', 'helmet', speed, { SPD: 1 }, { bt: 4 })], { [caren.id]: ['p1'] }) });
    await click(byText('.roster-bar .linkbtn', 'export'));
    const ta = $('#gear-code') as HTMLTextAreaElement;
    expect(ta.value.startsWith('OGC-GEAR2 ')).toBe(true);
    const { decodeGear, encodeGear } = await import('../src/logic/gearStore');
    const { createIndex } = await import('../src/data');
    expect((decodeGear(ta.value, createIndex(D)) as { pieces: Record<string, { yellow: object }> }).pieces.p1.yellow).toEqual({ SPD: 1 });
    ta.value = encodeGear(G([P('p1', 'helmet', speed, { SPD: 1 }, { bt: 0 })], { [kappa.id]: ['p1'] }) as never);
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'] });
    expect($('.gear-toast')?.textContent).toContain('Equipment loaded: 1 pieces.');
    expect(roster()).toEqual([caren.id, kappa.id]);
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools).toEqual({ [caren.id]: ['p1'] });
    expect(stored().pieces.p1.bt).toBe(4);
  });

  it('код, сохранённый более новой версией, — «обнови страницу»', async () => {
    await mount({ tab: 'chars' }, {});
    await click(byText('.roster-bar .linkbtn', 'export'));
    const ta = $('#gear-code') as HTMLTextAreaElement;
    ta.value = 'OGC-GEAR3 abc';
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
    expect(ta.closest('.roster-io')?.textContent).toContain('A newer page saved this code — reload the page.');
  });

  it('экипировку сохранила более новая версия (v: 3): «Надеть на…» нет, в карточке — «обнови страницу», запись не тронута', async () => {
    const newer = { v: 3, seq: 0, pieces: {}, pools: {} };
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: newer });
    await click($('.vcard'));
    expect($('.v-equip')).toBeNull();
    await click($('#tab-chars'));
    await click($$('#cgrid .ctile').find((b) => b.textContent?.includes('Caren')));
    expect($('.bgear')?.textContent).toContain('newer version of the page');
    expect(stored()).toEqual(newer);
  });

  it('другая вкладка записала своё — подхватили, и следующее действие здесь его не стирает', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([P('p1', 'helmet', speed, { 'DEF%': 2 })], { [caren.id]: ['p1'] }) });
    const other = G([P('p1', 'helmet', speed, { 'DEF%': 2 }), P('p2', 'armor', speed, { 'DEF%': 2 })], { [caren.id]: ['p1', 'p2'] });
    localStorage.setItem('ogc.gear', JSON.stringify(other));
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'ogc.gear', newValue: JSON.stringify(other) })); });
    expect($('.bgear h4')?.textContent).toBe('Equipped · 2 of 6');
    await click($('.bgear-row'));
    await click(byText('.piece-bt .fbtn', 'T4'));
    expect(Object.keys(stored().pieces)).toEqual(['p1', 'p2']);
    expect(stored().pieces.p1.bt).toBe(4);
  });
});

// Core Fusion — test/fusion.dom.test.ts
// Р16 (владелец 2026-09-30): вещи есть только у героев ростера. Было: звезду сняли, а вещи остались — «Вещи X · N — X не
// в ростере». Теперь: при загрузке такой герой — в ростер; звезда героя с вещами — окно «Убрать X из ростера?»
describe('вещи только у героев ростера (Р16)', () => {
  const tileStar = (name: string) => $$('#cgrid .cwrap').find((w) => w.querySelector('.ctile')?.getAttribute('title')?.split(' — ')[0] === name)?.querySelector<HTMLElement>('.star');
  const ask = () => $('.roster-ask')?.closest<HTMLElement>('.drawer') ?? null;
  const askBtn = (text: string) => byText('.roster-ask .btn', text);
  // у Caren две вещи, одна из них — та же запись, что у Rin; отметка «Собираю» у Caren
  const shared = () => G([P('p1', 'helmet', speed, { CHC: 1 }), P('p2', 'armor', speed, { CHC: 1 })], { [caren.id]: ['p1', 'p2'], [rin.id]: ['p2'] },
    { marks: { [`${caren.id}/Speed`]: 'want' } });

  it('загрузка: у Caren вещи, в ростере её нет — она в ростере, сообщение «Added to the roster: Caren.»', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { roster: [], gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }) });
    expect({ star: $('.cd-star')?.getAttribute('aria-pressed'), pool: $('.pool summary')?.textContent, toast: $('.gear-toast span')?.textContent })
      .toEqual({ star: 'true', pool: "Caren's gear · 1", toast: 'Added to the roster: Caren.' });
  });

  it('звезда Caren с вещами — окно «Remove Caren from the roster?» с числом вещей', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear: shared() });
    await click(tileStar('Caren'));
    expect({ title: ask()?.getAttribute('aria-label'), text: $('.roster-ask p')?.textContent })
      .toEqual({ title: 'Remove Caren from the roster?', text: "Caren's gear (2) is removed from the app." });
  });

  // сообщение — только о герое: что та же запись осталась у Rin, не говорим (было: «Removed from Caren. Rin still has it.»)
  it('«Да, убрать»: Caren не в ростере, её вещи и отметки убраны, общая запись у Rin осталась; сообщение только о Caren', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear: shared() });
    await click(tileStar('Caren'));
    await click(askBtn('Yes, remove'));
    expect({ roster: roster(), pools: stored().pools, pieces: Object.keys(stored().pieces), marks: stored().marks })
      .toEqual({ roster: [rin.id, kappa.id], pools: { [rin.id]: ['p2'] }, pieces: ['p2'], marks: {} });
    expect({ text: $('.gear-toast span')?.textContent, note: $('.gear-toast small'), buttons: $$('.gear-toast button').map((x) => x.textContent) })
      .toEqual({ text: 'Caren is out of the roster.', note: null, buttons: ['Undo'] });
  });

  it('«Вернуть» после «Да» — вещи, отметки и место в ростере как были', async () => {
    const gear = shared();
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear });
    await click(tileStar('Caren'));
    await click(askBtn('Yes, remove'));
    await click(byText('.gear-toast button', 'Undo'));
    expect({ roster: roster(), gear: stored() }).toEqual({ roster: [rin.id, caren.id, kappa.id], gear });
  });

  it('«Отмена» и ✕ ничего не меняют', async () => {
    const gear = shared();
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear });
    await click(tileStar('Caren'));
    await click(askBtn('Cancel'));
    await click(tileStar('Caren'));
    await click($('.drawer-x'));
    expect({ ask: ask(), roster: roster(), gear: stored(), toast: $('.gear-toast') })
      .toEqual({ ask: null, roster: [rin.id, caren.id, kappa.id], gear, toast: null });
  });

  it('без вещей — звезда снимается сразу, без окна', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [caren.id, kappa.id], gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }) });
    await click(tileStar('Kappa'));
    expect({ ask: ask(), roster: roster() }).toEqual({ ask: null, roster: [caren.id] });
  });

  it('звезда в карточке персонажа — то же окно', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { roster: [caren.id], gear: shared() });
    await click($('.cd-star'));
    expect(ask()?.getAttribute('aria-label')).toBe('Remove Caren from the roster?');
  });

  // пакетное: «Очистить ростер» и код ростера «Заменить» героев с вещами не убирают (убрать с вещами — звездой, через окно)
  it('«Очистить ростер»: герои с вещами остаются на своих местах, вещи на месте', async () => {
    const gear = shared();
    await mount({ tab: 'chars' }, {}, { roster: [kappa.id, rin.id, caren.id], gear });
    await click(byText('.roster-bar .linkbtn', 'clear'));
    await click(byText('.roster-bar .linkbtn', 'tap again'));
    expect({ roster: roster(), gear: stored() }).toEqual({ roster: [rin.id, caren.id], gear });
  });

  it('код ростера «Заменить»: герои с вещами остаются — после героев из кода', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id], gear: shared() });
    await click(byText('.roster-bar .linkbtn', 'export'));
    const ta = $('#roster-code') as HTMLTextAreaElement;
    ta.value = 'kappa';
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
    expect(roster()).toEqual([kappa.id, rin.id, caren.id]);
  });

  // шаг 13б (владелец 2026-09-30): кого оставили из-за вещей — строкой в тосте; никого — тоста нет
  describe('кого оставили из-за вещей — в тосте', () => {
    const carenOnly = () => G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] });

    it('«Очистить ростер»: Rin без вещей убрана, Caren с вещами осталась, в тосте строка с Caren', async () => {
      await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id], gear: carenOnly() });

      await click(byText('.roster-bar .linkbtn', 'clear'));
      await click(byText('.roster-bar .linkbtn', 'tap again'));

      expect({ roster: roster(), toast: $('.gear-toast span')?.textContent, buttons: $$('.gear-toast button').length })
        .toEqual({ roster: [caren.id], toast: 'Kept in the roster — they have gear: Caren.', buttons: 0 });
    });

    it('код ростера «Заменить»: Rin убрана, Caren осталась после героев кода, в тосте строка с Caren', async () => {
      await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id], gear: carenOnly() });
      await click(byText('.roster-bar .linkbtn', 'export'));
      const ta = $('#roster-code') as HTMLTextAreaElement;
      ta.value = 'kappa';

      await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));

      expect({ roster: roster(), toast: $('.gear-toast span')?.textContent })
        .toEqual({ roster: [kappa.id, caren.id], toast: 'Kept in the roster — they have gear: Caren.' });
    });

    it('«Очистить ростер» без героев с вещами — тоста нет', async () => {
      await mount({ tab: 'chars' }, {}, { roster: [rin.id, kappa.id], gear: G([], {}) });

      await click(byText('.roster-bar .linkbtn', 'clear'));
      await click(byText('.roster-bar .linkbtn', 'tap again'));

      expect({ roster: roster(), toast: $('.gear-toast') }).toEqual({ roster: [], toast: null });
    });
  });

  it('«Вернуть» после «Да» точен и когда хранилище за время тоста перечитали (вернулись на страницу)', async () => {
    // у Rin — первая запись, своя у Caren — вторая: смысловое «Вернуть» поставило бы её первой среди записей
    const gear = G([P('p1', 'helmet', speed, { CHC: 1 }), P('p2', 'armor', speed, { CHC: 1 })], { [rin.id]: ['p1'], [caren.id]: ['p1', 'p2'] },
      { marks: { [`${caren.id}/Speed`]: 'want' } });
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear });
    const { restoreGear } = await import('../src/logic/gearStore');
    const { createIndex } = await import('../src/data');
    const before = JSON.stringify(restoreGear(gear, createIndex(D), [rin.id, caren.id, kappa.id]));
    await click(tileStar('Caren'));
    await click(askBtn('Yes, remove'));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await click(byText('.gear-toast button', 'Undo'));
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  // вход опровержения: в туре Eternal с настоящими вещами в ростере; звезда на Core Fusion Eternal ростер писала без
  // Eternal, а следующая звезда (Kappa) через запись при чтении переносила его вещи к Core Fusion — без окна, в туре
  describe('в обучении ростер не расходится с настоящими вещами', () => {
    const eternal = char('Eternal');
    const mine = () => G([P('p1', 'helmet', speed, { CHC: 1 })], { [eternal.id]: ['p1'] });
    const toTourChars = async () => {
      await mount({ tab: 'eval' }, {}, { roster: [caren.id, eternal.id], gear: mine() });
      await click($('.vb-tab'));
      await click(byText('.menu button', 'Tutorial'));
      await click(byText('.tour-strip button', 'Checking a piece'));
      await click(byText('.tour-strip button', 'Example'));
      await click($('.vb-tab'));
      await click(byText('.menu button', 'Characters'));
    };
    const text = () => JSON.stringify(mine());

    it('звезда на Core Fusion Eternal — ничего; звезда на Kappa — только ростер, вещи Eternal на месте', async () => {
      await toTourChars();
      await click(tileStar('Core Fusion Eternal'));
      expect(roster()).toEqual([caren.id, eternal.id]);
      await click(tileStar('Kappa'));
      expect({ roster: roster(), gear: localStorage.getItem('ogc.gear') }).toEqual({ roster: [caren.id, eternal.id, kappa.id], gear: text() });
    });

    it('код ростера «Заменить» на Core Fusion Eternal — ничего', async () => {
      await toTourChars();
      await click(byText('.roster-bar .linkbtn', 'export'));
      const ta = $('#roster-code') as HTMLTextAreaElement;
      ta.value = 'core-fusion-eternal';
      await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
      expect({ roster: roster(), gear: localStorage.getItem('ogc.gear') }).toEqual({ roster: [caren.id, eternal.id], gear: text() });
    });
  });

  it('в обучении: звезда Caren с вещами — ни окна, ни удаления; вещи и ростер на месте', async () => {
    const gear = shared();
    await mount({ tab: 'eval' }, {}, { roster: [rin.id, caren.id], gear });
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Tutorial'));
    await click(byText('.tour-strip button', 'Checking a piece'));
    await click(byText('.tour-strip button', 'Example'));
    await click($('.vb-tab'));
    await click(byText('.menu button', 'Characters'));
    await click(tileStar('Caren'));
    expect({ ask: ask(), roster: roster(), gear: stored() }).toEqual({ ask: null, roster: [rin.id, caren.id], gear });
  });
});

// Р17 (владелец 2026-09-30): нормализация при загрузке что-то исправила — записать сразу оба ключа, сообщение один раз
describe('запись при загрузке (Р17)', () => {
  const remount = async () => {
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    const { App } = await import('../src/App');
    const { IndexContext } = await import('../src/components/IndexContext');
    const { createIndex } = await import('../src/data');
    const el = document.createElement('div');
    document.body.append(el);
    root = createRoot(el);
    await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
  };
  const lone = () => G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] });

  it('исправленное (Caren с вещами — в ростер) записано сразу, без действия игрока', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [kappa.id], gear: lone() });
    expect({ roster: roster(), gear: stored() }).toEqual({ roster: [kappa.id, caren.id], gear: lone() });
  });

  it('сообщение — один раз: второй запуск без него', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [], gear: lone() });
    expect($('.gear-toast')).toBeTruthy();
    await remount();
    expect($('.gear-toast')).toBeNull();
  });

  it('экипировку сохранила более новая версия — ничего не пишется, и ростер тоже', async () => {
    const newer = { v: 3, seq: 0, pieces: {}, pools: {} };
    const text = JSON.stringify(newer);
    await mount({ tab: 'chars' }, {}, { roster: [char('Eternal').id, char('Core Fusion Eternal').id], gear: newer });
    expect({ gear: localStorage.getItem('ogc.gear'), roster: roster() }).toEqual({ gear: text, roster: [char('Eternal').id, char('Core Fusion Eternal').id] });
  });

  // вход опровержения: запись при загрузке стирала саб не из данных и отметку, которых эта версия не понимает
  it('чтение что-то отбросило (саб NEWSUB, отметка «maybe») — не пишется, хотя Caren добавлена в ростер в памяти', async () => {
    const gear = JSON.stringify(G([P('p1', 'helmet', speed, { CHC: 1, NEWSUB: 2 })], { [caren.id]: ['p1'] }, { marks: { [`${caren.id}/Speed`]: 'maybe' } }));
    await mount({ tab: 'chars', charId: caren.id }, {}, { roster: [], gear: JSON.parse(gear) });
    expect({ gear: localStorage.getItem('ogc.gear'), roster: localStorage.getItem('ogc.roster'), star: $('.cd-star')?.getAttribute('aria-pressed') })
      .toEqual({ gear, roster: '[]', star: 'true' });
  });

  it('ничего не исправлено — хранилище не переписано (строки те же)', async () => {
    const gear = JSON.stringify({ ...lone(), extra: { keep: 1 } });
    const list = JSON.stringify([caren.id]);
    await mount({ tab: 'chars' }, {}, { roster: [caren.id], gear: JSON.parse(gear) });
    expect({ gear: localStorage.getItem('ogc.gear'), roster: localStorage.getItem('ogc.roster') }).toEqual({ gear, roster: list });
  });
});

// Находка 28 (Р11–Р13): вещь не по билду Demiurge Drakhan — броня Revenge OGC HLMW PCHM (SPD 3 · HP 1 · HP% 1)
describe('«По статам» у каждого героя (находка 28)', () => {
  const drakhan = char('Demiurge Drakhan');
  const revenge = set('Revenge');
  const HLMW = { setId: revenge, subs: { SPD: 3, HP: 1, 'HP%': 1 } };

  it('«Надеть на…» → поиск по имени: строка Drakhan «Надеть — пустой слот · By stats», нажатие кладёт вещь ей', async () => {
    await mount({ slot: 'armor', grade: 'rare' }, HLMW, { roster: [drakhan.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'demiurge drakhan');
    const row = byText('.equip-row', drakhan.name)!;
    expect(row.querySelector('.act')?.textContent).toBe('Equip — empty slot · By stats');
    await click(row);
    expect(stored().pools[drakhan.id]).toHaveLength(1);
    expect($('.gear-toast')?.textContent).toContain('Counts in "By stats".');
  });

  it('карточка Drakhan без вещей: вкладка «By stats» последней, на ней — что туда встаёт и «Собрать билд»', async () => {
    await mount({ tab: 'chars', charId: drakhan.id }, {}, { roster: [drakhan.id] });
    expect($$('.btabs button').map((b) => b.textContent)).toEqual([...drakhan.builds.map((b) => b.name), 'By stats']);
    expect($('.btabs button[aria-selected="true"]')?.textContent).toBe(drakhan.builds[0].name);
    await click(byText('.btabs button', 'By stats'));
    expect($('.bgear-none p')?.textContent).toBe(`"By stats" — ${drakhan.name}'s pieces by the chain, no sets. What ${drakhan.name} wears off-build in the game goes here too: press "Gear up this build" and enter the pieces.`);
    expect($('.bgear-none')?.getAttribute('data-tour')).toBe('stats');
  });

  it('Drakhan с HLMW, Revenge-шлем: «Сейчас на персонажах» и карточка её не показывают — строка «По статам» одна героя не приводит (Р11)', async () => {
    await mount({ slot: 'helmet', grade: 'rare' }, { setId: revenge, subs: { SPD: 4, HP: 2, CHC: 1 } },
      { roster: [drakhan.id], gear: G([P('p1', 'armor', revenge, HLMW.subs, { grade: 'rare' })], { [drakhan.id]: ['p1'] }) });
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect(byText('.v-vs .vs-row', drakhan.name)).toBeUndefined();
  });

  it('Luna: поиск — строка про «По статам», а не «начнёт Pen mix», где вещь не встаёт (подпись = что сделает «Надеть»)', async () => {
    const luna = char('Demiurge Luna');
    const pen = set('Penetration');
    const pcs = [P('p1', 'armor', pen, { ATK: 1, RES: 3, DEF: 2, CHC: 2 }), P('p2', 'gloves', pen, { HP: 1, EFF: 2, SPD: 3 })];
    // Critical Strike ×4 — «Не собираю»: иначе вещь его начала бы (Р14), и главная строка — «начнёт Critical Strike»
    const marks = { [`${luna.id}/Critical Strike`]: 'skip' };
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: set('Critical Strike'), subs: { EFF: 3, 'DEF%': 1, 'ATK%': 2, CHC: 3 } },
      { roster: [luna.id], gear: G(pcs, { [luna.id]: ['p1', 'p2'] }, { marks }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'demiurge luna');
    const row = byText('.equip-row', luna.name)!;
    expect(row.querySelector('.act')?.textContent).toBe('Equip — By stats');
    expect(row.querySelector('.vs')?.textContent).not.toBe('starts');
    await click(row);
    expect($('.gear-toast')?.textContent).toContain('Counts in "By stats".');
    expect(stored().marks ?? {}).toEqual(marks);
  });

  it('Caren со Speed-шлемом, Swiftness-ботинки через поиск: тост «Засчитано в By stats», а не в её билдах', async () => {
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Swiftness'), subs: { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 } },
      { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'caren');
    const row = byText('.equip-row', 'Caren')!;
    expect(row.querySelector('.act')?.textContent).toBe('Equip — empty slot · By stats');
    await click(row);
    expect($('.gear-toast')?.textContent).toContain('On Caren: boots. Counts in "By stats".');
  });

  it('вещь только в «По статам» — в списке вещей «в By stats»; вещь и в Speed — только «в Speed»', async () => {
    const eternal = char('Core Fusion Eternal');
    const pcs = [P('p1', 'armor', set('Effectiveness'), { SPD: 3, EFF: 2, HP: 1 }, { grade: 'rare' }), P('p2', 'gloves', speed, { SPD: 1, 'ATK%': 3, EFF: 2 }, { grade: 'rare' }),
      P('p3', 'armor', speed, { SPD: 1, HP: 1, RES: 1 }, { grade: 'rare' })];
    await mount({ tab: 'chars', charId: eternal.id }, {}, { roster: [eternal.id], gear: G(pcs, { [eternal.id]: ['p1', 'p2', 'p3'] }) });
    await click($('.pool summary'));
    const where = (id: string) => $$('.pool-list li')[['p1', 'p2', 'p3'].indexOf(id)].querySelector('.pool-w')?.textContent;
    expect(where('p1')).toBe('in "By stats"');
    expect(where('p2')).toBe('in Speed');
    expect(byText('.pool-list li', 'no longer needs it')).toBeUndefined();
  });
});

// находки 12, 13, 14, 18: имя варианта на карточке и в заголовке строки (Р5), без повторов и дублей; «completes» — только
// когда полной станет вся связка; диктор слышит тот же исход, что на чипе
describe('«Сейчас на персонажах»: имена вариантов и чипы', () => {
  const anarky = char('Anarky'), luna = char('Demiurge Luna'), sigma = char('Sigma');
  const immu = set('Immunity'), pen = set('Penetration');
  const MID = { CHC: 2, CHD: 2, 'DEF%': 1, SPD: 1 };
  // у Anarky собраны Pen ×2 и Def ×2; Defense-шлем лучше Pen-шлема: ▲ в Swiftness и Immunity (Pen там «прочее»),
  // в Penetration — «ломает сет»
  const anarkyHelmet = () => {
    const pcs = [P('a1', 'helmet', pen, MID), P('a2', 'armor', pen, MID), P('a3', 'gloves', set('Defense'), MID), P('a4', 'shoes', set('Defense'), MID)];
    return mount({ slot: 'helmet', grade: 'unique', rosterOnly: false }, { setId: set('Defense'), subs: { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 2 } },
      { gear: G(pcs, { [anarky.id]: ['a1', 'a2', 'a3', 'a4'] }, { marks: { [`${anarky.id}/Defense mix#2x2+11x2`]: 'want' } }), roster: [anarky.id] });
  };
  // у Caren четыре Speed и Immunity-шлем; Immunity-перчатки: Speed/Immu станет полной, в Def/Immu — лишь Immunity ×2
  const carenSecondImmu = () => {
    const mid = { CHC: 2, CHD: 2, 'DEF%': 1, HP: 1 };
    const pcs = [...['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('p' + (i + 1), sl, speed, mid)), P('p5', 'helmet', immu, { CHC: 3, CHD: 3, 'DEF%': 2, SPD: 1 })];
    return mount({ slot: 'gloves', grade: 'unique' }, { setId: immu, subs: { CHC: 3, CHD: 2, 'DEF%': 2, SPD: 1 } },
      { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }, { marks: { [`${caren.id}/Speed`]: 'want', [`${caren.id}/Speed/Immu`]: 'want' } }) });
  };

  it('Anarky: на карточке — имя варианта, откуда ▲ («Defense mix · Swiftness»), а не родителя', async () => {
    await anarkyHelmet();
    expect($('.vcard .vc-vs .bn')?.textContent).toBe('· Defense mix · Swiftness +1');
  });

  // было: в заголовке все варианты с тем же исходом («Defense mix · Swiftness, Defense mix · Immunity»); решение владельца
  // 2026-09-30 — только лучший, второй — в «Ещё»
  it('Anarky: заголовок строки — только лучший вариант, второй с тем же исходом — в «Ещё»', async () => {
    await anarkyHelmet();
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Anarky');
    expect({ head: row?.querySelector('.vs-h .bn')?.textContent, more: row?.querySelector('.vs-more-btn')?.textContent?.includes('Defense mix · Immunity') })
      .toEqual({ head: 'Defense mix · Swiftness', more: true });
  });

  it('Sigma: в заголовке нет дубля «Support» (тот же вариант, что «Speed»)', async () => {
    const pcs = [P('s1', 'helmet', speed, { SPD: 2, EFF: 2, CHC: 2, 'ATK%': 1 })];
    await mount({ slot: 'armor', grade: 'unique', rosterOnly: false }, { setId: speed, subs: { SPD: 3, EFF: 2, CHC: 2, 'ATK%': 1 } },
      { gear: G(pcs, { [sigma.id]: ['s1'] }), roster: [sigma.id] });
    await click($('.vcard'));
    expect(byText('.v-vs .vs-row', 'Sigma')?.querySelector('.vs-h .bn')?.textContent).toBe('Speed');
  });

  it('Luna: «Leaves … as is» — каждое имя один раз, а не «Pen mix» на каждый вариант', async () => {
    const pcs = ['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => P('l' + (i + 1), sl, pen, { CHC: 2, CHD: 2, 'ATK%': 2, SPD: 1 }, { bt: 4 }));
    await mount({ slot: 'helmet', grade: 'unique', rosterOnly: false }, { setId: speed, subs: { CHC: 2, CHD: 1, 'ATK%': 1, SPD: 1 } },
      { gear: G(pcs, { [luna.id]: pcs.map((p) => p.id as string) }), roster: [luna.id] });
    await click($('.vcard'));
    expect(byText('.v-vs .vs-row', 'Demiurge Luna')?.textContent).toContain('Leaves Penetration, Pen mix as is.');
  });

  it('Caren, вторая Immunity: «completes» — у Speed/Immu, ставшей полной; «+1» за Def/Immu, где лишь половина, нет', async () => {
    await carenSecondImmu();
    expect($('.vcard .vc-vs')?.textContent).toBe('completesCaren· Speed/Immu');
  });

  it('Caren, вторая Immunity: в «More» у Def/Immu — «set 2 of 4», а не «completes»', async () => {
    await carenSecondImmu();
    await click($('.vcard'));
    expect(byText('.v-vs .vs-row', 'Caren')?.querySelector('.vs-more-btn')?.textContent).toContain('Def/Immu — set 2 of 4');
  });

  it('Caren, только Immunity-шлем: Immunity-перчатки собирают лишь половину — чип «set 2 of 4», строка «Completes a half» остаётся', async () => {
    const pcs = [P('p1', 'helmet', immu, { CHC: 3, CHD: 3, 'DEF%': 2, SPD: 1 })];
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: immu, subs: { CHC: 3, CHD: 2, 'DEF%': 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    const row = byText('.v-vs .vs-row', 'Caren')!;
    expect(row.querySelector('.vs-h .vs')?.textContent).toBe('set 2 of 4');
    expect(row.textContent).toContain('Completes a half: Immunity ×2.');
  });

  it('Caren, только Immunity-шлем: в «Кому надеть?» — «set 2 of 4», а не «completes»', async () => {
    const pcs = [P('p1', 'helmet', immu, { CHC: 3, CHD: 3, 'DEF%': 2, SPD: 1 })];
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: immu, subs: { CHC: 3, CHD: 2, 'DEF%': 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toMatch(/^Equip — [^:]+: set 2 of 4$/);
  });

  it('подпись карточки для диктора — тот же исход, что на чипе: «better than the one on: +25% Caren»', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    expect($('.vcard')?.getAttribute('aria-label')).toContain('better than the one on: +25% Caren');
  });
});
