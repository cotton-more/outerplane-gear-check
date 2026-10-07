// @vitest-environment jsdom
// Экипировка на телефоне (360px), пул GEARPOOL: вещь с формы — «Надеть на…» → к персонажу, «Вернуть»; такая же у
// другого — своя запись (окна «Это шлем Kappa?» нет, В9); «Заменить» — что со старой (Р15: кому её отдать, не предлагаем); «Сейчас на персонажах» — строка на персонажа и «Ещё»; «Кому надеть?» — только
// полезные строки; карточка персонажа — варианты, «Собираю», «Вещи · N», «По статам», лист вещи и «Убрать у…»;
// код копии. Core Fusion — test/roster/fusion.dom.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { encodeItem } from '@/features/eval/code/codec';
import { openBackup, openMore, startTour } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
// обучение пройдено, все подсказки знакомы — «Что нового» нет
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'), kappa = char('Kappa'), rin = char('Rin');
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const speed = set('Speed');
const NEW = { setId: speed, subs: { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 } };
let root: Root | null = null;

// вещь и хранилище v2
type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const WEAK = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4 });

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
const stored = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');
const roster = () => JSON.parse(localStorage.getItem('ogc.roster')!);
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('«Надеть» и «Вернуть»', () => {
  it('«Надеть на…» → Caren (вещей нет): «Надеть — +N очк.», вещь у неё, «Вернуть» — как было', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Equip — +6.55 pts');
    await click(byText('.equip-row', 'Caren') as HTMLElement);

    expect($('.gear-toast')?.textContent).toContain('On Caren: helmet.');
    expect($('.gear-toast small')).toBeNull();
    // bt 0: форма брони без «T4» — ниже T4 (В4, шаг 3; было null — форма Breakthrough не знала)
    expect(stored()).toMatchObject({ v: 3, pools: { [caren.id]: ['p1'] }, pieces: { p1: { slot: 'helmet', setId: speed, yellow: NEW.subs, bt: 0 } } });
    await click(byText('.gear-toast button', 'Undo'));
    // «Вернуть»: хранилище как до «Надеть»
    expect(stored()).toMatchObject({ pieces: {}, pools: {} });
  });

  // доработка 2 шага 10 (решение владельца, refute-10 п. 6): было — после «Заменить» вещь оставалась на форме и
  // сравнивалась со своей записью («на уровне», кнопки нет). Теперь форма — как после «Следующий»
  it('карточка: «▲ +1.95 pts Caren», кнопка под ней — «Заменить шлем Caren»; после — форма пуста (как «Следующий»)', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect($('.vcard .vc-title')?.textContent).toBe('better than on Caren');
    expect($('.vcard .vc-vs')?.textContent).toBe('+1.95 ptsCaren');
    await click($('.vc-equip'));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    // прежний шлем на T4 — лучший Speed-шлем Caren на T4 (.x/0085 FORMULA §5 п. 3): в пуле остаётся
    expect(stored().pools[caren.id]).toEqual(['p1', 'p2']);
    expect($('.vcard')).toBeNull();
    expect($('.vc-equip')).toBeNull();
  });

  it('после «Надеть» с «T4»: сабстаты пусты, слот, грейд и сет те же, «T4» снята; «Вернуть» — пул как был и та же вещь на форме', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { ...NEW, t4: true }, { gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await click($('.vc-equip'));

    const st = JSON.parse(localStorage.getItem('ogc.state')!), item = JSON.parse(localStorage.getItem('ogc.item')!);
    expect({ slot: st.slot, grade: st.grade, setId: item.setId, subs: item.subs, t4: item.t4 ?? false }).toEqual({ slot: 'helmet', grade: 'unique', setId: speed, subs: {}, t4: false });
    expect($('.btchip')?.getAttribute('aria-pressed')).toBe('false');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(['p1']);
    expect(JSON.parse(localStorage.getItem('ogc.item')!)).toMatchObject({ setId: speed, subs: NEW.subs, t4: true });
    expect($('.vc-equip')?.textContent).toBe("Replace Caren's helmet · T4");
  });

  // было (refute-10 п. 6): один шлем за три нажатия — у Kappa, Rin и Caren (три записи). После первого «Надеть» на
  // форме пусто — второго нет
  it('один шлем: после первого «Надеть» на форме пусто — ко второму герою он не попадает', async () => {
    const kap = ['armor', 'gloves', 'shoes'].map((slot, i) => P('k' + (i + 1), slot, speed, { 'DEF%': 1, CHC: 1 }));
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK, ...kap], { [caren.id]: ['p1'], [kappa.id]: ['k1', 'k2', 'k3'] }), roster: [caren.id, kappa.id] });
    expect($('.vc-other')).toBeTruthy();
    await click($('.vc-equip'));
    expect($('.vc-equip')).toBeNull();
    expect($('.vc-other')).toBeNull();
    const pools = stored().pools;
    expect(Object.values(pools).flat().filter((id) => (stored().pieces[id as string].lit as Record<string, number>).CHD === 3)).toHaveLength(1);
  });

  // шаг 4 (В1), PLAN Д7: «Надеть» убрало вещь другого слота — заголовок про её слот («On … : boots»), убранная — строкой
  // «Лишнее убрано» (без перечня, вопрос 6); «Вернуть» — пул как был, в том же порядке. Caren: надеты Speed-броня и
  // -перчатки; в раскладке — Attack-шлем (сильнее Speed-шлема). Speed-ботинки собирают Speed ×4 со Speed-шлемом —
  // Attack-шлем выпадает из раскладки, и больше его ничто не держит (.x/0085 FORMULA §5)
  const extras = () => {
    const ok = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const ps = [P('p1', 'helmet', set('Attack'), { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }), P('p2', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }),
      P('p3', 'armor', speed, ok), P('p4', 'gloves', speed, ok)];
    return { ps, pool: ['p1', 'p2', 'p3', 'p4'], gear: G(ps, { [caren.id]: ['p1', 'p2', 'p3', 'p4'] }, { worn: { [caren.id]: { armor: 'p3', gloves: 'p4' } } }) };
  };
  const SHOES = { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } };

  it('«Надеть» Speed-ботинок Caren: тост «Extras removed — Caren no longer needs them.», «Вернуть» — всё назад', async () => {
    const { ps, pool, gear } = extras();
    await mount({ slot: 'shoes', grade: 'unique' }, SHOES, { gear });
    expect($('.vc-equip')?.textContent).toBe('Equip on Caren');
    await click($('.vc-equip'));

    expect($('.gear-toast')?.textContent).toContain('On Caren: boots.');
    expect($('.gear-toast small')?.textContent).toContain('Extras removed — Caren no longer needs them.');
    expect(stored().pools[caren.id]).toEqual(['p2', 'p3', 'p4', 'p5']);
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(pool);
    expect(stored().pieces.p1).toEqual(ps[0]);
  });

  // шаг 10 (В4): нажата «T4» — «· T4» в подписи кнопки («Кому надеть?» тоже) и в сообщении; чистка — как без неё
  it('то же с «T4»: «· T4» в подписи и сообщении, «Extras removed — …», «Вернуть»', async () => {
    const { pool, gear } = extras();
    await mount({ slot: 'shoes', grade: 'unique' }, { ...SHOES, t4: true }, { gear });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toMatch(/^Equip.* · T4$/);
    await click(byText('.equip-row', 'Caren') as HTMLElement);

    expect($('.gear-toast')?.textContent).toContain('On Caren: boots · T4.');
    expect($('.gear-toast small')?.textContent).toContain('Extras removed — Caren no longer needs them.');
    expect(stored().pieces.p5.bt).toBe(4);
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(pool);
  });

  // было: «или — Caren · Speed ▸», хотя кнопка заменяет её шлем (П8: подпись = действие, Р7)
  it('вторая кнопка «или — заменить шлем Caren · +1.95 pts ▸»: другому герою тоже «Надень» — сразу ему, с «Вернуть»', async () => {
    // у Kappa три Speed-вещи — шлем соберёт ей Speed ×4 (первая кнопка); у Caren шлем слабее — новая лучше
    const kap = ['armor', 'gloves', 'shoes'].map((slot, i) => P('k' + (i + 1), slot, speed, { 'DEF%': 1, CHC: 1 }));
    await mount({ slot: 'helmet', grade: 'unique' }, { ...NEW, t4: true },
      { gear: G([WEAK, ...kap], { [caren.id]: ['p1'], [kappa.id]: ['k1', 'k2', 'k3'] }, { worn: { [caren.id]: { helmet: 'p1' } } }), roster: [caren.id, kappa.id] });
    expect($('.vc-equip')?.textContent).toBe('Equip on Kappa · T4');
    expect($('.vc-other')?.textContent).toBe("or — replace Caren's helmet · +1.95 pts · T4 ▸");
    await click($('.vc-other'));
    expect(stored().pools[caren.id]).toHaveLength(1);
    expect(stored().pools[caren.id]).not.toContain('p1');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(['p1']);
  });

  it('у неё лучше — ни чипа, ни кнопки (надеть можно только то, что ей «Надень»)', async () => {
    const strong = P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 }, { lit: { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }, bt: 4 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([strong], { [caren.id]: ['p1'] }) });
    expect($('.vcard .vc-vs')).toBeNull();
    expect($('.vc-equip')).toBeNull();
  });

  // шаг 9 (решение оркестратора по REFUTE-5): было — «Вернуть» откатывало только «Надеть», правка в карточке за эти
  // секунды оставалась. Теперь правка в карточке вещи снимает висящее «Вернуть»: откаты возвращают записи по id, а их
  // за эти секунды поправили или скопировали. Kappa и её вещь остаются
  it('правка в карточке вещи снимает «Вернуть» прежнего «Надеть»: Kappa с вещью остаётся, правка — тоже', async () => {
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
    await click(byText('.btabs [role="tab"]', 'Pool'));
    await click($('.pool-row'));
    await click($('.piece .btchip')); // «T4» снята — ниже T4
    await click($('.drawer-x'));
    await click($('.vbar .vb-tab'));

    expect($('.gear-toast')).toBeNull();
    expect(stored().pools[kappa.id]).toEqual(['p2']);
    expect(stored().pieces.p1.bt).toBe(0);
    expect(roster()).toEqual([caren.id, kappa.id]);
  });

  // доработка 2 шага 10: было — шторка вердикта оставалась открытой под сообщением; теперь «Заменить» сбрасывает форму,
  // как «Следующий», и шторку закрывает. Сообщение на телефоне — с местом внизу (toast-on)
  it('«Заменить» в шторке вердикта: шторка закрывается, сообщение с местом внизу (toast-on), «Вернуть» — снимает', async () => {
    const junk = P('p1', 'helmet', speed, { HP: 1, DEF: 1, ATK: 1, RES: 1 }, { bt: 0 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([junk], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await click($('.vcard'));
    await click(byText('.drawer .vs-act', "Replace Caren's helmet"));
    expect($('.drawer')).toBeNull();
    expect(document.body.classList.contains('toast-on')).toBe(true);
    await click(byText('.gear-toast button', 'Undo'));
    expect(document.body.classList.contains('toast-on')).toBe(false);
  });

  it('две шторки сразу: Esc закрывает верхнюю, drawer-lock снимается с последней', async () => {
    const { Sheet } = await import('@/shared/ui/Sheet');
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

// шаг 10 (В9): было — окно «Это шлем Kappa?» («Она же — и у Caren» — та же запись в двух пулах, «Другая — своя»). Пулы
// независимы: такая же вещь, как у другого, — у героя своя запись, окна нет
describe('такая же вещь у другого (окна «Это шлем Kappa?» нет)', () => {
  const lit = { ...NEW.subs, CHD: 5 };
  const same = () => G([P('p1', 'helmet', speed, NEW.subs, { lit, bt: 2 })], { [kappa.id]: ['p1'] });

  it('«Надеть» на Caren точной копии вещи Kappa — окна нет, у Caren своя запись, у Kappa её — без изменений', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { ...NEW, subs: lit }, { gear: same() });
    await click($('.vcard'));
    await click($('.v-equip'));
    await click(byText('.equip-row', 'Caren') as HTMLElement);

    expect($('.twin')).toBeNull();
    expect(byText('.drawer', "Is this Kappa's helmet?")).toBeUndefined();
    expect(stored()).toMatchObject({ seq: 2, pools: { [kappa.id]: ['p1'], [caren.id]: ['p2'] }, pieces: { p1: { bt: 2 }, p2: { bt: 0, lit } } });
    expect($('.gear-toast')?.textContent).toContain('On Caren: helmet.');
    expect($('.gear-toast')?.textContent).not.toContain('Kappa');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'] });
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

  // .x/0060 SPEC 4.5: снятая Legendary — не материал (было «материал новой»): «сначала оцени», может подойти другому
  it('старый шлем пригодился бы Rin — ни кнопки «Отдать», ни строки про Rin; та же Legendary — «сначала оцени»', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: gear(), roster: [caren.id, rin.id] });

    await click($('.vc-equip'));

    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    expect($('.gear-toast small')?.textContent).toBe('Old helmet — evaluate it first: it may suit another hero.');
    expect($$('.gear-toast button').map((b) => b.textContent)).toEqual(['Undo']);
    expect(stored().pools[rin.id]).toEqual(['p2', 'p3', 'p4']);
  });

  // доработка шага 10 (refute-10 п. 3): новая на T4 — Breakthrough уже полный, «старый — материал для нового» неправда.
  // Снятой Legendary «сначала оцени» — и при новой на T4: она может подойти другому (.x/0060 SPEC 4.5)
  it('«Заменить» с нажатой «T4»: «Заменено: шлем Caren · T4.», строки про материал нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { ...NEW, t4: true }, { gear: gear(), roster: [caren.id, rin.id] });

    await click($('.vc-equip'));

    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet · T4.");
    expect($('.gear-toast small')?.textContent).toBe('Old helmet — evaluate it first: it may suit another hero.');
  });

  // шаг 10 (В9, Р15): было — строка «Старый остался у Kappa (в Speed)» (oldStill). Пулы независимы — про других ни слова;
  // старая общая запись у Kappa остаётся
  it('старая общая запись, она и у Kappa: про Kappa ни слова, у неё запись остаётся', async () => {
    const helm = P('p1', 'helmet', speed, { SPD: 1 });
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([helm], { [caren.id]: ['p1'], [kappa.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await click($('.vcard'));
    await click(byText('.drawer .vs-act', "Replace Caren's helmet"));
    expect($('.gear-toast')?.textContent).toContain("Replaced: Caren's helmet.");
    expect($('.gear-toast')?.textContent).not.toContain('Kappa');
    expect(stored().pools[kappa.id]).toEqual(['p1']);
    expect($$('.gear-toast button').map((b) => b.textContent)).toEqual(['Undo']);
  });
});

describe('«Надеть»: что уходит из пула и что пишет сообщение (В1)', () => {
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
    // надеты Defense ×3 и Attack-ботинки; Immunity-ботинки — лучшие Immunity-ботинки Caren (пул держит). Новые сильнее
    // обоих: Attack-ботинки больше не надеты и не нужны, Immunity — уже не лучшие (.x/0085 FORMULA §5)
    const pcs = [
      P('p1', 'helmet', def, { 'DEF%': 2, CHC: 2 }), P('p2', 'armor', def, { 'DEF%': 2, CHC: 2 }), P('p3', 'gloves', def, { 'DEF%': 2, CHC: 2 }),
      P('p4', 'shoes', set('Attack'), { 'DEF%': 2, CHC: 2 }), P('p5', 'shoes', set('Immunity'), { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
    ];
    const worn = { [caren.id]: { helmet: 'p1', armor: 'p2', gloves: 'p3', shoes: 'p4' } };
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Immunity'), subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }, { worn }) });
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
  // шаг 10 (В9): было — строка «Attack-ботинки остались у Kappa (в …)»; про других героев сообщение не говорит
  it('две ушли, одна из них — и у Kappa: про Kappa ни слова, у неё запись остаётся', async () => {
    const def = set('Defense');
    // надеты Defense ×3 и Attack-ботинки; Immunity-ботинки — лучшие Immunity-ботинки Caren (пул держит). Новые сильнее
    // обоих: Attack-ботинки больше не надеты и не нужны, Immunity — уже не лучшие (.x/0085 FORMULA §5)
    const pcs = [
      P('p1', 'helmet', def, { 'DEF%': 2, CHC: 2 }), P('p2', 'armor', def, { 'DEF%': 2, CHC: 2 }), P('p3', 'gloves', def, { 'DEF%': 2, CHC: 2 }),
      P('p4', 'shoes', set('Attack'), { 'DEF%': 2, CHC: 2 }), P('p5', 'shoes', set('Immunity'), { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
    ];
    const worn = { [caren.id]: { helmet: 'p1', armor: 'p2', gloves: 'p3', shoes: 'p4' } };
    const pools = { [caren.id]: pcs.map((p) => p.id as string), [kappa.id]: ['p4'] };
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Immunity'), subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, pools, { worn }) });
    await click($('.vcard'));
    await click(byText('.drawer .vs-act', "Replace Caren's boots"));
    const toast = $('.gear-toast')?.textContent ?? '';
    expect(toast).toContain("Replaced: Caren's boots — the old Attack and Immunity ones are removed.");
    expect(toast).not.toContain('Kappa');
    expect(stored().pools[kappa.id]).toEqual(['p4']);
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

  it('лучший исход «ломает сет»: в «Кому надеть?» Caren нет', async () => {
    const pcs = [P('p1', 'helmet', set('Immunity'), { CHC: 1, HP: 1, RES: 1, EFF: 1 }), P('p2', 'gloves', set('Immunity'), mid), P('p3', 'armor', speed, mid),
      P('p4', 'shoes', speed, mid), P('p5', 'helmet', speed, mid)];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 2 } },
      { gear: G(pcs, { [caren.id]: ['p1', 'p2', 'p3', 'p4', 'p5'] }) });
    await openPick();
    expect(byText('.equip-row', 'Caren')).toBeUndefined();
  });

});

describe('«Сейчас на персонажах»', () => {

  it('ни вещей, ни своих среди кандидатов — вердикт как раньше', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { roster: [] });
    expect($('.vcard .vc-vs')).toBeNull();
    expect($('.vcard .vc-chain')).toBeTruthy();
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect($('.v-vs')).toBeNull();
    expect($('.v-equip')).toBeTruthy();
  });

});

describe('«Кому надеть?»', () => {
  it('вещь в шапке; строка на персонажа — что будет; только те, кому вещь встанет в билд; поиск — среди всех', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW, { gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await click($('.vcard'));
    await click($('.v-equip'));

    expect($('.equip-item')?.textContent).toContain('Helmet · Speed Set · L');
    expect($('.equip-subs')?.textContent).toBe('DEF%3CHC2CHD3HP1');
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toBe('Replace helmet — +1.95 pts');
    expect($$('.equip-row')).toHaveLength(1);
    expect($('.equip')?.textContent).toContain('Here — who gains most from it now. Find anyone else by name: Equip records it on them.');
    expect($('.equip .toggle')).toBeNull(); // «показать и не по билду» больше нет

    const input = $('.equip-q input') as HTMLInputElement;
    await type(input, 'kap');
    expect(byText('.equip-row', 'Kappa')?.querySelector('.act')?.textContent).toMatch(/^Equip — \+[\d.]+ pts$/);
    // персонаж, чьим билдам Speed Set не нужен: без поиска его нет, а поиск по имени — явный выбор (TEXTS 23)
    const noSpeed = D.chars.find((c) => c.builds.length && !c.builds.some((b) => b.sets.flat().some((p) => p.set === speed)))!;
    await type(input, noSpeed.name.toLowerCase());
    expect(byText('.equip-row', noSpeed.name)?.querySelector('.act')?.textContent).toMatch(/^Equip/);
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

  // найден по имени — «Надеть» запишет вещь на нём и без прироста (TEXTS 23); имени нет — «никому с таким именем»
  it('поиск по имени, а вещь ей ничего не даст: строка «Надеть» без очков; чужое имя — «никому с таким именем»', async () => {
    const drakhan = char('Demiurge Drakhan'); // цепочка SPD › HP › CHC › CHD › DMG UP% › DEF
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Revenge'), subs: { RES: 2, EFF: 2, 'ATK%': 1 } }, { roster: [drakhan.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'demiurge drakhan');
    expect($$('.equip-row').map((r) => r.querySelector('.act')?.textContent)).toEqual(['Equip']);
    await type($('.equip-q input') as HTMLInputElement, 'zzz');
    expect($('.equip .muted')?.textContent).toBe('It gives no one by that name anything.');
  });

  it('без поиска вещь не по билду никому: внизу — «найди персонажа по имени»', async () => {
    const drakhan = char('Demiurge Drakhan');
    await mount({ slot: 'armor', grade: 'rare' }, { setId: set('Revenge'), subs: { RES: 2, EFF: 2, 'ATK%': 1 } }, { roster: [drakhan.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect($$('.equip-row')).toHaveLength(0);
    expect($('.equip .muted')?.textContent).toBe('It gives no build anything. Search a character by name — "Equip" records it as worn.');
  });

  // «Надеть» уберёт или снимет вещь её слота — подпись = действие: «Заменить ботинки — +N очк. · включит Speed ×4»
  const allWorn = (pcs: Pc[]) => ({ [caren.id]: Object.fromEntries(pcs.map((p) => [p.slot, p.id])) });
  it('замена, а вещь соберёт сет — «Replace boots — +N pts · turns on Speed ×4»', async () => {
    const junk = { RES: 1, EFF: 1, HP: 1 }, ok = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('p1', 'helmet', speed, ok), P('p2', 'armor', speed, ok), P('p3', 'gloves', speed, ok), P('p4', 'shoes', set('Attack'), junk)];
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }, { worn: allWorn(pcs) }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toMatch(/^Replace boots — \+[\d.]+ pts · turns on Speed ×4$/);
  });

  it('замена без новой половины сета — «Replace gloves — +N pts»', async () => {
    const junk = { RES: 1, EFF: 1, HP: 1 }, ok = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
    const pcs = [P('p1', 'helmet', speed, ok), P('p2', 'armor', speed, ok), P('p3', 'gloves', set('Attack'), junk)];
    await mount({ slot: 'gloves', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 } }, { gear: G(pcs, { [caren.id]: pcs.map((p) => p.id as string) }, { worn: allWorn(pcs) }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')?.querySelector('.act')?.textContent).toMatch(/^Replace gloves — \+[\d.]+ pts$/);
  });

  // «Уже есть» нет (решение владельца 2026-10-01): точная копия — другая вещь из инвентаря, сравнивается как есть
  it('точная копия записи Caren — строки «Уже есть» нет: на уровне, Caren в «Кому надеть?» нет', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: WEAK.lit }, { gear: G([WEAK], { [caren.id]: ['p1'] }), roster: [caren.id, kappa.id] });
    await click($('.vcard'));
    await click($('.v-equip'));
    expect(byText('.equip-row', 'Caren')).toBeUndefined();
    expect($$('.equip-row').some((r) => r.textContent?.includes('Already has'))).toBe(false);
  });
});

describe('карточка персонажа', () => {
  // .x/0085 этап 6: вкладки «Надето · Пул · Билды»; вещь не надета — только в «Пуле»
  const openPiece = async (i = 0) => { await click(byText('.btabs [role="tab"]', 'Pool')); await click($$('.pool-row')[i]); };
  const four = (lit: Record<string, number>) => ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('p' + (i + 1), slot, speed, lit));
  const wornOf = (ps: Pc[]) => ({ [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) });

  it('вкладки «Worn · Pool · Builds»: открыта «Надето» — бонусы надетых сетов, вещь с сегментами по очкам; шторка вещи — уровень и «T4»', async () => {
    const ps = four({ 'DEF%': 2, EFF: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(ps, { [caren.id]: ps.map((p) => p.id as string) }, { worn: wornOf(ps) }) });

    expect($$('.btabs [role="tab"]').map((b) => b.textContent)).toEqual(['Worn4/6', 'Pool4', 'Builds']);
    expect($('.btabs [aria-selected="true"]')?.textContent).toBe('Worn4/6');
    expect($('.bgear-set')?.textContent).toContain('Speed ×4 · T? — ');
    expect($('.bgear-set')?.textContent).not.toContain("not in Caren's builds");
    expect($$('.bgear-row')[0].querySelectorAll('.tok')[0].className).toBe('tok ok');
    expect($('.bgear-m')?.textContent).toBe('T?');
    expect($('.want-btn')).toBeNull();
    await click($('.bgear-row'));
    await click($$('.piece .roll-b')[0].querySelectorAll('button')[2] as HTMLElement); // DEF% — уровень 3
    await click($('.piece .btchip'));
    expect(stored().pieces.p1).toMatchObject({ yellow: { 'DEF%': 3 }, lit: { 'DEF%': 3 }, bt: 4 });
    expect($('.piece .btchip')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.piece')?.textContent).toContain('worn');
  });

  it('«Билды» — справка outerpedia: переключатель билдов и их сеты, без «N/6» и «Собираю»', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {});
    await click(byText('.btabs [role="tab"]', 'Builds'));
    expect($$('.bsel button').map((b) => b.textContent)).toEqual(caren.builds.map((b) => b.name));
    await click($$('.bsel button')[1]);
    expect($$('.bsel button')[1].getAttribute('aria-pressed')).toBe('true');
    expect($('.bsec')).toBeTruthy();
    expect($('.bsel')?.textContent).not.toMatch(/\d\/6/);
  });

  // вопрос 7 (б) ревью eval-only: у Legendary оружия «T4» — тоже (материал такого же предмета); у Epic — как у всех
  it('шторка Legendary оружия: «T4» правится, метка в слоте — «T0–T3» → «T4»', async () => {
    const w = caren.builds[0].weapons[0];
    const ps = [P('p1', 'weapon', null, { CHC: 2, SPD: 1 }, { itemKey: w.key, main: w.mains[0], bt: 0 })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(ps, { [caren.id]: ['p1'] }, { worn: wornOf(ps) }) });
    expect($('.bgear-m')?.textContent).toBe('T0–T3');

    await click($('.bgear-row'));
    expect($('.piece .btchip')?.getAttribute('title')).toBe('Already at T4 — no more copies needed for its Breakthrough');
    await click($('.piece .btchip'));

    expect(stored().pieces.p1.bt).toBe(4);
    expect($('.bgear-m')?.textContent).toBe('T4');
  });

  it('у брони «T4» снята — ниже T4: в строке «Надето» «T0–T3»; у Epic оружия «T4» есть, старая запись — «T?»', async () => {
    const ps = [P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 1 }, { bt: 4 }), P('p2', 'weapon', null, { CHC: 2, SPD: 1 }, { grade: 'rare', main: caren.builds[0].weapons[0].mains[0] })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(ps, { [caren.id]: ['p1', 'p2'] }, { worn: wornOf(ps) }) });
    expect($$('.bgear-m').map((m) => m.textContent)).toEqual(['T?', 'T4']);
    await click(byText('.bgear-row', 'Speed'));
    await click($('.piece .btchip'));
    expect(stored().pieces.p1.bt).toBe(0);
    expect($$('.bgear-m')[1].textContent).toBe('T0–T3');
  });

  it('«Пул»: вещи по слотам, справа — почему держится; ненужная — «no longer needed» и «Убрать у Caren» с «Вернуть»; внизу — «Rate a piece for Caren»', async () => {
    const weak = P('p1', 'helmet', speed, { RES: 1 }), strong = P('p2', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 3 }), glove = P('p3', 'gloves', speed, { CHC: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([glove, weak, strong], { [caren.id]: ['p3', 'p1', 'p2'], [rin.id]: ['p2'] }, { worn: { [caren.id]: { gloves: 'p3' } } }), roster: [caren.id, rin.id] });
    await click(byText('.btabs [role="tab"]', 'Pool'));
    expect($$('.pool-row .pool-why').map((w) => w.textContent)).toEqual(['no longer needed', 'best Speed', 'worn']);
    expect($('.pool')?.textContent).not.toContain('Rin');
    expect([...$('.pool')!.children].at(-1)?.textContent).toBe('Rate a piece for Caren');
    await click(byText('.pool-unused button', 'Remove from Caren'));
    expect(stored().pools[caren.id]).toEqual(['p3', 'p2']);
    expect($('.gear-toast')?.textContent).toContain('Removed from Caren.');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id].sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('шторка общей вещи: причина без «и у Kappa»; «Убрать у Caren» — у Kappa остаётся', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'], [kappa.id]: ['p1'] }) });
    await openPiece();
    expect($('.piece')?.textContent).toContain('best Speed');
    expect($('.piece')?.textContent).not.toContain('Kappa');
    await click(byText('.piece-act .btn', 'Remove from Caren'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'] });
    expect($('.gear-toast small')).toBeNull();
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools).toEqual({ [kappa.id]: ['p1'], [caren.id]: ['p1'] });
  });

  // шаг 9 (Н1, В-А2): было — нажатие на стат открывало замену (Transistone), «Сколько жёлтых», оранжевые сегменты.
  // Теперь стат не меняется (вещь вводят заново), уровень один — без жёлтых и оранжевых.
  // Шаг 11: было — проверка «нет button.y / button.o»; таких классов в src больше нет, проверка проходила всегда.
  // Теперь — классы клеток старой записи (yellow 2, lit 4): до уровня — одна «lit», 5–6 — «after»
  it('узкая правка: название стата — не кнопка, окна смены стата нет; клетки одного цвета до уровня', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 3, SPD: 1 }, { lit: { 'DEF%': 4, CHC: 3, SPD: 1 } });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    expect($('.piece .subkey')?.tagName).toBe('SPAN');
    expect($('.piece button.subkey')).toBeNull();
    expect([...$$('.piece .roll-b')[0].querySelectorAll('button')].map((b) => b.className)).toEqual(['lit', 'lit', 'lit', '', 'after', 'after']);
    expect($$('.piece .roll-b')[0].querySelector('[aria-pressed="true"]')?.textContent).toBe('4'); // уровень = lit
    expect($('.piece')?.textContent).toContain('Transistone changed a stat? Enter the piece again');
  });

  it('код вещи для чата и «Скопировать», как в вердикте; уровень 5 (после Reforge) — кода нет', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 3, SPD: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    const code = encodeItem({ slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, subs: { 'DEF%': 2, CHC: 3, SPD: 1 } });
    expect(code).toBeTruthy();
    expect($('.piece .v-share .code')?.textContent).toBe(code);
    expect(byText('.piece .v-share .btn', 'Copy')).toBeTruthy();
    expect($('.piece [data-tour="code"]')).toBeNull(); // якорь подсказки «code» — только у вердикта

    await click($$('.piece .roll-b')[1].querySelectorAll<HTMLElement>('button')[4]); // CHC — уровень 5

    expect($('.piece .v-share')).toBeNull();
  });

  it('нажатие ставит уровень; на текущий — на один меньше, но не ниже 1', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 1, CHC: 2 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    const cell = (row: number, n: number) => $$('.piece .roll-b')[row].querySelectorAll<HTMLElement>('button')[n - 1];
    await click(cell(1, 6));
    expect(stored().pieces.p1.lit).toEqual({ 'DEF%': 1, CHC: 6 });
    await click(cell(1, 6));
    expect(stored().pieces.p1.lit.CHC).toBe(5);
    await click(cell(0, 1));
    expect(stored().pieces.p1.lit['DEF%']).toBe(1);
  });

  it('предел суммы: Legendary 6/6/6/4 — 5 у четвёртого не срабатывает, строка «больше 22 не бывает»; снять можно', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 4 }, { lit: { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 4 } });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    const cell = (row: number, n: number) => $$('.piece .roll-b')[row].querySelectorAll<HTMLElement>('button')[n - 1];
    await click(cell(3, 5));
    expect(stored().pieces.p1.lit.SPD).toBe(4);
    expect($('.piece .seg-cap')?.textContent).toBe("A piece can't have more than 22 segments — check the substats.");
    await click(cell(0, 5));
    expect(stored().pieces.p1.lit['DEF%']).toBe(5);
    expect($('.piece .seg-cap')).toBeNull();
  });

  it('старая запись выше предела (6/6/6/6): уменьшить и «T4» можно', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 4 }, { lit: { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 } });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    await click($$('.piece .roll-b')[0].querySelectorAll<HTMLElement>('button')[4]);
    await click($('.piece .btchip'));
    expect(stored().pieces.p1).toMatchObject({ lit: { 'DEF%': 5, CHC: 6, CHD: 6, SPD: 6 }, bt: 4 });
  });

  it('Epic с тремя сабстатами — «+ 4th substat»: статы вещи недоступны, выбранный встаёт с уровнем 1', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 1, SPD: 1 }, { grade: 'rare' });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'] }) });
    await openPiece();
    await click($('.piece .subadd'));
    const opt = (k: string) => $$('.subopt').find((b) => b.textContent === k) as HTMLButtonElement;
    expect(opt('CHC').disabled).toBe(true);
    await click(opt('CHD'));
    expect(stored().pieces.p1.lit).toEqual({ 'DEF%': 2, CHC: 1, SPD: 1, CHD: 1 });
    expect($('.piece .subadd')).toBeNull();
  });

  // В9: общая запись делится при правке (copy-on-write) — у Rin прежняя; шторка идёт за новым id (REFUTE2 1.3)
  it('правка общей записи у Caren: у Rin прежняя, у Caren копия; шторка открыта, второе нажатие — по той же копии', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'], [rin.id]: ['p1'] }), roster: [caren.id, rin.id] });
    await openPiece();
    await click($$('.piece .roll-b')[1].querySelectorAll<HTMLElement>('button')[2]); // CHC 1 → 3

    expect($('.piece')).toBeTruthy();
    expect(stored().pools).toEqual({ [caren.id]: ['p2'], [rin.id]: ['p1'] });
    expect(stored().pieces.p1.lit).toEqual({ 'DEF%': 2, CHC: 1 });
    await click($('.piece .btchip'));
    expect(Object.keys(stored().pieces).sort()).toEqual(['p1', 'p2']);
    expect(stored().pieces.p2).toMatchObject({ lit: { 'DEF%': 2, CHC: 3 }, bt: 4 });
  });

  // решение оркестратора (REFUTE-5): «Вернуть» после «Убрать у Caren» вернул бы ей запись, которую потом поправили у Rin
  it('«Убрать у Caren» → правка у Rin → «Вернуть» больше нет', async () => {
    const helm = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 1 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([helm], { [caren.id]: ['p1'], [rin.id]: ['p1'] }), roster: [caren.id, rin.id] });
    await openPiece();
    await click(byText('.piece-act .btn', 'Remove from Caren'));
    expect(byText('.gear-toast button', 'Undo')).toBeTruthy();
    await click($('.cd-top .btn'));
    await click($$('#cgrid .ctile').find((b) => b.querySelector('.cn')?.textContent === 'Rin'));
    await openPiece();
    expect(byText('.gear-toast button', 'Undo')).toBeTruthy(); // висит и у Rin
    await click($$('.piece .roll-b')[1].querySelectorAll<HTMLElement>('button')[2]);

    expect($('.gear-toast')).toBeNull();
    expect(stored().pools).toEqual({ [rin.id]: ['p1'] });
  });

  it('карточка вещи — шторкой в <body>; ушли на «Оценку» — закрылась, прокрутка не заперта', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([P('p1', 'helmet', speed, { 'DEF%': 2 })], { [caren.id]: ['p1'] }) });
    await openPiece();
    expect($('.piece')?.closest('.drawer-back')?.parentElement).toBe(document.body);
    await click($('.vbar .vb-tab'));
    expect($('.piece')).toBeNull();
    expect(document.body.classList.contains('drawer-lock')).toBe(false);
  });

  // В-А3: правка в шторке меняет то, что держит пул, но пул не чистит. Подняли уровни слабому выше сильного — он держится,
  // сильный — «больше не нужна», в пуле оба
  it('правка уровня в шторке: поправленная держится, прежняя — «no longer needed», в пуле обе', async () => {
    const weak = P('p1', 'helmet', speed, { 'DEF%': 1, CHC: 1, CHD: 1 }), strong = P('p2', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 3 });
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G([weak, strong], { [caren.id]: ['p1', 'p2'] }) });
    await click(byText('.btabs [role="tab"]', 'Pool'));
    const unused = () => $$('.pool li').map((li) => li.classList.contains('unused'));
    expect(unused()).toEqual([true, false]);
    await click($$('.pool-row')[0]);
    const cell = (row: number, n: number) => $$('.piece .roll-b')[row].querySelectorAll<HTMLElement>('button')[n - 1];
    for (const row of [0, 1, 2]) await click(cell(row, 6));
    await click($('.drawer-x'));
    expect({ unused: unused(), pool: stored().pools[caren.id] }).toEqual({ unused: [false, true], pool: ['p1', 'p2'] });
  });

  // .x/0085 FORMULA §3 п. 3, макет 6.0 решение 2: лучшая раскладка из своих вещей лучше надетой на 1+ очко
  it('«Переодеть: +N pts ▸» → шторка: прирост, «instead of …», «Wear all 2» — надето, тост с «Вернуть»', async () => {
    const worn = [P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('p2', 'armor', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }),
      P('p3', 'gloves', set('Attack'), { RES: 2, EFF: 2 }), P('p4', 'shoes', set('Attack'), { RES: 2, EFF: 2 })];
    const spare = [P('p5', 'gloves', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('p6', 'shoes', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 })];
    const all = [...worn, ...spare];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(all, { [caren.id]: all.map((p) => p.id as string) }, { worn: wornOf(worn) }) });
    expect($('.redress')?.textContent).toMatch(/^Re-dress: \+[\d.]+ pts▸$/);
    await click($('.redress'));
    expect($('.rd-gain')?.textContent).toContain('turns on: Speed ×4');
    expect($$('.rd-was').map((x) => x.textContent)).toEqual(['instead of the Attack gloves', 'instead of the Attack boots']);
    await click(byText('.drawer .btn', 'Wear all 2'));
    expect(stored().worn[caren.id]).toMatchObject({ gloves: 'p5', shoes: 'p6' });
    expect($('.redress')).toBeNull();
    expect($('.gear-toast')?.textContent).toContain('Caren');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[caren.id]).toMatchObject({ gloves: 'p3', shoes: 'p4' });
  });

  it('«What to look for»: Speed ×4 — 2 of 4, нужны перчатки и ботинки', async () => {
    const two = [P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('p2', 'armor', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(two, { [caren.id]: ['p1', 'p2'] }, { worn: wornOf(two) }) });
    expect($('.seek h4')?.textContent).toBe('What to look for');
    expect(byText('.seek-row', 'Speed ×4')?.textContent).toBe('Speed ×4: 2 of 4 — need gloves, boots');
  });

  // .x/0085 FORMULA §6, макет 6.0 решение 7: «Закрепить набор» → шторка, предупреждение, «Pin» — плашка «Pinned: …»
  it('закрепление: шторка с вариантами и «k of 4», предупреждение, «Pin» — плашка и ключ в хранилище; «By stats» снимает', async () => {
    const two = [P('p1', 'helmet', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('p2', 'armor', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(two, { [caren.id]: ['p1', 'p2'] }, { worn: wornOf(two) }) });
    await click($('.pinb'));
    expect($('.drawer h3')?.textContent).toBe('Set for Caren');
    const rows = $$('.drawer .arow');
    expect(rows[0].textContent).toBe('By stats — not pinned');
    expect(rows[0].getAttribute('aria-checked')).toBe('true');
    expect(rows[1].textContent).toContain('Speed ×4');
    expect(rows[1].querySelector('.pin-k')?.textContent).toBe('2 of 4');
    expect($('.pin-warn')).toBeNull();
    await click(rows[1]);
    expect($('.pin-warn')?.textContent).toBe("Caren won't take armor of other sets, even with good stats. To undo — By stats.");
    await click(byText('.drawer .btn', 'Pin'));
    expect($('.pinned')?.textContent).toBe('Pinned: Speed ×4▾');
    expect($('.pinb')).toBeNull();
    expect(Object.values(stored().pin)).toEqual([expect.stringMatching(new RegExp('^' + caren.id + '/'))]);
    await click($('.pinned'));
    await click($$('.drawer .arow')[0]);
    await click(byText('.drawer .btn', 'Pin'));
    expect(stored().pin).toBeUndefined();
    expect($('.pinb')).toBeTruthy();
  });
});

describe('меню, плитки, код копии, другая вкладка', () => {
  it('меню ☰ «To dress · N» — режим «To dress»: герои ростера меньше чем 6/6, остальные фильтры сняты', async () => {
    await mount({ slot: 'helmet', grade: 'unique', cel: 'fire' }, {}, { gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }), roster: [caren.id, kappa.id] });
    await click($('.vb-tab'));
    await click(byText('.more-nav button', 'To dress · 2'));
    expect($('.cmode [aria-pressed="true"]')?.textContent).toBe('To dress 2');
    expect($$('#cgrid .ctile .cn').map((e) => e.textContent).sort()).toEqual(['Caren', 'Kappa']);
    expect($$('#cgrid .gearb').map((e) => e.textContent)).toEqual(['1 of 6 equipped1/6']); // у Kappa вещей нет — ничего не надето
    await click(byText('.cmode button', 'To dress')); // повторное нажатие — ничего не нажато, все с билдами
    expect($('.cmode [aria-pressed="true"]')).toBeNull();
    expect($$('#cgrid .ctile').length).toBeGreaterThan(2); // без режима — и не из ростера: у них не надето ничего
  });

  it('панель списка: «Trade» — сразу команда; «mark all shown», «clear roster», «export / import» нет', async () => {
    await mount({ tab: 'chars' }, {}, { gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }), roster: [caren.id] });
    expect($$('#char-list button').map((b) => b.textContent).filter((t) => /mark|clear|export|import/i.test(t ?? ''))).toEqual([]);
    await click(byText('.cbar button', 'Trade'));
    expect($('.trade-mode [aria-selected="true"]')?.textContent).toBe('Team');
  });

  it('плитка считает отмеченное надетое, не вещи билда', async () => {
    await mount({ tab: 'chars' }, {}, { gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }), roster: [caren.id, kappa.id] });
    expect($$('#cgrid .gearb').map((e) => e.textContent)).toEqual(['1 of 6 equipped1/6']);
  });

  // .x/0060 SPEC 2: одна резервная копия — ростер и вещи; старый код экипировки (OGC-GEAR2) «Заменить» читает как раньше
  it('резервная копия в «Ещё» → «Backup» — OGC-GEAR4, ростер и вещи; старый код OGC-GEAR2 — «Вернуть» возвращает прежнее', async () => {
    await mount({ tab: 'chars' }, {}, { gear: G([P('p1', 'helmet', speed, { SPD: 1 }, { bt: 4 })], { [caren.id]: ['p1'] }) });
    const ta = await openBackup();
    expect(ta.value.startsWith('OGC-GEAR4-')).toBe(true);
    const { encodeGear } = await import('@/features/gear/store/gearStore');
    const { decodeBackup } = await import('@/features/roster/backup');
    const b = decodeBackup(ta.value) as { roster: string[]; raw: { pieces: Record<string, { lit: object; bt: number }> } };
    expect([b.roster, b.raw.pieces.p1.lit, b.raw.pieces.p1.bt]).toEqual([[caren.id], { SPD: 1 }, 4]);
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
    const ta = await openBackup();
    ta.value = 'OGC-GEAR5-abc';
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
    expect(ta.closest('.roster-io')?.textContent).toContain('A newer page saved this code — reload the page.');
  });

  it('экипировку сохранила более новая версия (v: 4): «Надеть на…» нет, в карточке — «обнови страницу», запись не тронута', async () => {
    const newer = { v: 4, seq: 0, pieces: {}, pools: {} };
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
    expect(byText('.btabs [role="tab"]', 'Pool')?.textContent).toBe('Pool2');
    await click(byText('.btabs [role="tab"]', 'Pool'));
    await click($('.pool-row'));
    await click($('.piece .btchip'));
    expect(Object.keys(stored().pieces)).toEqual(['p1', 'p2']);
    expect(stored().pieces.p1.bt).toBe(4);
  });
});

// Core Fusion — test/roster/fusion.dom.test.ts
// Р16 (владелец 2026-09-30): вещи есть только у героев ростера. Было: звезду сняли, а вещи остались — «Вещи X · N — X не
// в ростере». Теперь: при загрузке такой герой — в ростер; звезда героя с вещами — окно «Убрать X из ростера?»
describe('вещи только у героев ростера (Р16)', () => {
  const tileStar = (name: string) => $$('#cgrid .cwrap').find((w) => w.querySelector('.ctile')?.getAttribute('title')?.split(' — ')[0] === name)?.querySelector<HTMLElement>('.star');
  const ask = () => $('.roster-ask')?.closest<HTMLElement>('.drawer') ?? null;
  const askBtn = (text: string) => byText('.roster-ask .btn', text);
  // у Caren две вещи, одна из них — та же запись, что у Rin
  const shared = () => G([P('p1', 'helmet', speed, { CHC: 1 }), P('p2', 'armor', speed, { CHC: 1 })], { [caren.id]: ['p1', 'p2'], [rin.id]: ['p2'] });

  it('загрузка: у Caren вещи, в ростере её нет — она в ростере, сообщение «Added to the roster: Caren.»', async () => {
    await mount({ tab: 'chars', charId: caren.id }, {}, { roster: [], gear: G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] }) });
    expect({ star: $('.cd-star')?.getAttribute('aria-pressed'), pool: byText('.btabs [role="tab"]', 'Pool')?.textContent, toast: $('.gear-toast span')?.textContent })
      .toEqual({ star: 'true', pool: 'Pool1', toast: 'Added to the roster: Caren.' });
  });

  it('звезда Caren с вещами — окно «Remove Caren from the roster?» с числом вещей', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear: shared() });
    await click(tileStar('Caren'));
    expect({ title: ask()?.getAttribute('aria-label'), text: $('.roster-ask p')?.textContent })
      .toEqual({ title: 'Remove Caren from the roster?', text: "Caren's gear (2) is removed from the app." });
  });

  // сообщение — только о герое: что та же запись осталась у Rin, не говорим (было: «Removed from Caren. Rin still has it.»)
  it('«Да, убрать»: Caren не в ростере, её вещи убраны, общая запись у Rin осталась; сообщение только о Caren', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear: shared() });
    await click(tileStar('Caren'));
    await click(askBtn('Yes, remove'));
    expect({ roster: roster(), pools: stored().pools, pieces: Object.keys(stored().pieces) })
      .toEqual({ roster: [rin.id, kappa.id], pools: { [rin.id]: ['p2'] }, pieces: ['p2'] });
    expect({ text: $('.gear-toast span')?.textContent, note: $('.gear-toast small'), buttons: $$('.gear-toast button').map((x) => x.textContent) })
      .toEqual({ text: 'Caren is out of the roster.', note: null, buttons: ['Undo'] });
  });

  it('«Вернуть» после «Да» — вещи и место в ростере как были', async () => {
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

  // пакетное: код ростера «Заменить» героев с вещами не убирает (убрать с вещами — звездой, через окно)
  it('код ростера «Заменить»: герои с вещами остаются — после героев из кода', async () => {
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id], gear: shared() });
    const ta = await openBackup();
    ta.value = 'kappa';
    await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));
    expect(roster()).toEqual([kappa.id, rin.id, caren.id]);
  });

  // шаг 13б (владелец 2026-09-30): кого оставили из-за вещей — строкой в тосте; никого — тоста нет
  describe('кого оставили из-за вещей — в тосте', () => {
    const carenOnly = () => G([P('p1', 'helmet', speed, { CHC: 1 })], { [caren.id]: ['p1'] });

    it('код ростера «Заменить»: Rin убрана, Caren осталась после героев кода, в тосте строка с Caren', async () => {
      await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id], gear: carenOnly() });
      const ta = await openBackup();
      ta.value = 'kappa';

      await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));

      expect({ roster: roster(), toast: $('.gear-toast span')?.textContent, note: $('.gear-toast small')?.textContent })
        .toEqual({ roster: [kappa.id, caren.id], toast: expect.stringMatching(/^Replaced: 1/), note: 'Kept in the roster — they have gear: Caren.' });
    });

    // .x/0060 SPEC 2.4: код ростера в поле копии — теперь всегда с «Вернуть» (было: без героев с вещами тоста нет)
    it('код ростера «Заменить» без героев с вещами — сообщение с «Вернуть»: ростер как был', async () => {
      await mount({ tab: 'chars' }, {}, { roster: [rin.id, kappa.id], gear: G([], {}) });
      const ta = await openBackup();
      ta.value = 'caren';

      await click([...ta.closest('.roster-io')!.querySelectorAll<HTMLElement>('.btn')].find((b) => b.textContent === 'Replace'));

      expect({ roster: roster(), toast: $('.gear-toast span')?.textContent, note: $('.gear-toast small') }).toEqual({ roster: [caren.id], toast: 'Replaced: 1', note: null });
      await click(byText('.gear-toast button', 'Undo'));
      expect(roster()).toEqual([rin.id, kappa.id]);
    });
  });

  it('«Вернуть» после «Да» точен и когда хранилище за время тоста перечитали (вернулись на страницу)', async () => {
    // у Rin — первая запись, своя у Caren — вторая: смысловое «Вернуть» поставило бы её первой среди записей
    const gear = G([P('p1', 'helmet', speed, { CHC: 1 }), P('p2', 'armor', speed, { CHC: 1 })], { [rin.id]: ['p1'], [caren.id]: ['p1', 'p2'] });
    await mount({ tab: 'chars' }, {}, { roster: [rin.id, caren.id, kappa.id], gear });
    const { restoreGear } = await import('@/features/gear/store/gearStore');
    const { createIndex } = await import('@/game/data');
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
      await startTour();
      await click(byText('.tour-strip button', 'Checking a piece'));
      await click(byText('.tour-strip button', 'Example'));
      await openMore();
      await click(byText('.more button', 'Characters'));
    };
    const text = () => JSON.stringify(mine());

    it('звезда на Core Fusion Eternal — ничего; звезда на Kappa — только ростер, вещи Eternal на месте', async () => {
      await toTourChars();
      await click(tileStar('Core Fusion Eternal'));
      expect(roster()).toEqual([caren.id, eternal.id]);
      await click(tileStar('Kappa'));
      expect({ roster: roster(), gear: localStorage.getItem('ogc.gear') }).toEqual({ roster: [caren.id, eternal.id, kappa.id], gear: text() });
    });

    // .x/0060 SPEC 2.3: в обучении резервной копии нет — ни кода, ни «Заменить» (было: код ростера «Заменить» ничего не делал)
    it('поля копии нет — только строка «после обучения»', async () => {
      await toTourChars();
      await openMore();
      await click($('#more-backup'));
      expect({ box: $('#backup-code'), note: $('.xp-b')?.textContent }).toEqual({ box: null, note: expect.stringContaining('after the tutorial') });
      expect({ roster: roster(), gear: localStorage.getItem('ogc.gear') }).toEqual({ roster: [caren.id, eternal.id], gear: text() });
    });
  });

  it('в обучении: звезда Caren с вещами — ни окна, ни удаления; вещи и ростер на месте', async () => {
    const gear = shared();
    await mount({ tab: 'eval' }, {}, { roster: [rin.id, caren.id], gear });
    await startTour();
    await click(byText('.tour-strip button', 'Checking a piece'));
    await click(byText('.tour-strip button', 'Example'));
    await openMore();
    await click(byText('.more button', 'Characters'));
    await click(tileStar('Caren'));
    expect({ ask: ask(), roster: roster(), gear: stored() }).toEqual({ ask: null, roster: [rin.id, caren.id], gear });
  });
});

// Р17 (владелец 2026-09-30): нормализация при загрузке что-то исправила — записать сразу оба ключа, сообщение один раз
describe('запись при загрузке (Р17)', () => {
  const remount = async () => {
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    const { App } = await import('@/app/App');
    const { IndexContext } = await import('@/game/data/IndexContext');
    const { createIndex } = await import('@/game/data');
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

  // .x/0085 PLAN Д11, TESTS T8.1: хранилище прежней модели — перенос в v3 записан, сообщение о переносе один раз,
  // пулы и надетое те же
  it('T8.1 хранилище v2 с «Собираю», выбранным билдом и булавкой: сообщение один раз, перенос записан, вещи и надетое те же', async () => {
    const old = { ...lone(), v: 2, worn: { [caren.id]: { helmet: 'p1' } }, marks: { [`${caren.id}/Speed`]: 'want' }, aim: { [caren.id]: `${caren.id}/Speed` }, pinned: [caren.id] };
    await mount({ tab: 'chars' }, {}, { gear: old });
    expect($('#modelnote')?.textContent).toContain('Evaluation updated: no build to pick per hero');
    expect(stored()).toEqual({ ...lone(), worn: { [caren.id]: { helmet: 'p1' } } });
    await click($('#modelnote button'));
    expect($('#modelnote')).toBeNull();
    await remount();
    expect($('#modelnote')).toBeNull();
  });

  it('новый игрок и хранилище v3 — сообщения о переносе нет', async () => {
    await mount({ tab: 'chars' }, {});
    expect($('#modelnote')).toBeNull();
    await act(async () => root?.unmount());
    localStorage.clear();
    await mount({ tab: 'chars' }, {}, { gear: lone() });
    expect($('#modelnote')).toBeNull();
  });

  it('экипировку сохранила более новая версия — ничего не пишется, и ростер тоже', async () => {
    const newer = { v: 4, seq: 0, pieces: {}, pools: {} };
    const text = JSON.stringify(newer);
    await mount({ tab: 'chars' }, {}, { roster: [char('Eternal').id, char('Core Fusion Eternal').id], gear: newer });
    expect({ gear: localStorage.getItem('ogc.gear'), roster: roster() }).toEqual({ gear: text, roster: [char('Eternal').id, char('Core Fusion Eternal').id] });
  });

  // вход опровержения: запись при загрузке стирала саб не из данных, которого эта версия не понимает
  it('чтение что-то отбросило (саб NEWSUB) — не пишется, хотя Caren добавлена в ростер в памяти', async () => {
    const gear = JSON.stringify(G([P('p1', 'helmet', speed, { CHC: 1, NEWSUB: 2 })], { [caren.id]: ['p1'] }));
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
    expect(row.querySelector('.act')?.textContent).toMatch(/^Equip — \+[\d.]+ pts$/);
    await click(row);
    expect(stored().pools[drakhan.id]).toHaveLength(1);
    // «Надето», В4: «По статам» не называется в «где стоит» — тост без «Засчитано» (было — «Counts in "By stats".»)
    expect($('.gear-toast')?.textContent).toBe('On Demiurge Drakhan: armor.Undo');
  });

  it('Caren со Speed-шлемом, Swiftness-ботинки через поиск: тост без «Засчитано» — ни в «By stats», ни в её билдах (В4)', async () => {
    await mount({ slot: 'shoes', grade: 'unique' }, { setId: set('Swiftness'), subs: { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 } },
      { gear: G([WEAK], { [caren.id]: ['p1'] }) });
    await click($('.vcard'));
    await click($('.v-equip'));
    await type($('.equip-q input') as HTMLInputElement, 'caren');
    const row = byText('.equip-row', 'Caren')!;
    expect(row.querySelector('.act')?.textContent).toMatch(/^Equip/);
    await click(row);
    expect($('.gear-toast')?.textContent).toBe('On Caren: boots.Undo');
  });

});


// «Статы + сеты» (.x/0085 PLAN Д3, TEXTS): в шапке — герой с наибольшей пользой, в «Сейчас на персонажах» — до трёх героев
// с цепочкой и тем, что вещь даёт; «Оставь» — без кнопки; материал и запас — заголовком; тихая строка — под вердиктом
describe('вердикт «статы + сеты»', () => {
  const RIN_GOOD = { setId: set('Attack'), subs: { CHC: 1, CHD: 1, SPD: 1, 'ATK%': 1 } };
  const rows = () => $$('.v-vs .vs-row').map((r) => [r.querySelector('.nm b')?.textContent, r.querySelector('.vs')?.textContent]);

  it('T5.12: четверо без вещей — названы трое с наибольшим приростом, у каждого кнопка «Надеть»', async () => {
    const [valentine, delta] = [char('Valentine'), char('Delta')];
    await mount({ slot: 'helmet', grade: 'unique' }, RIN_GOOD, { roster: [rin.id, valentine.id, delta.id, caren.id] });
    expect($('.vcard .vc-title')?.textContent).toBe('equip on Rin');
    await click($('.vcard'));
    expect(rows()).toEqual([['Rin', '+2.95 pts'], ['Valentine', '+2.95 pts'], ['Delta', '+2.45 pts']]);
    expect($$('.v-vs .vs-act').map((b) => b.textContent)).toEqual(['Equip on Rin', 'Equip on Valentine', 'Equip on Delta']);
    expect(byText('.v-vs .vs-row', 'Rin')?.textContent).toContain('Rin gets +2.95 pts');
  });

  it('T5.3: Pen-шлем у Caren в Def ×4 — «Оставь (а)»: строка «пока не надевай», вместо «Надеть» — «Отложить»', async () => {
    const def = set('Defense');
    const pcs = [P('c1', 'helmet', def, { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('c2', 'armor', def, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }),
      P('c3', 'gloves', def, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('c4', 'shoes', def, { 'DEF%': 3, CHC: 3, CHD: 1, SPD: 1 }, { bt: 4 })];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Penetration'), subs: { 'DEF%': 3, CHC: 1, CHD: 1, SPD: 1 }, t4: true },
      { gear: G(pcs, { [caren.id]: ['c1', 'c2', 'c3', 'c4'] }, { worn: { [caren.id]: { helmet: 'c1', armor: 'c2', gloves: 'c3', shoes: 'c4' } } }) });
    expect($('.vcard .stamp')?.textContent).toBe('Keep');
    expect($('.vcard .vc-title')?.textContent).toBe("Caren's best Penetration helmet");
    expect($('.vc-equip')).toBeNull();
    await click($('.vcard'));
    expect(rows()).toEqual([['Caren', 'keep']]);
    expect($('.v-vs')?.textContent).toContain("Don't equip yet: keep it for Caren until Penetration comes together.");
    expect($('.v-vs .vs-act')).toBeNull();
    expect($('.v-vs .vs-stash')?.textContent).toBe('Set aside for Caren');
  });

  // решение владельца 2026-10-06: «Оставь» и запас — кнопка «Отложить для X»; та же вещь ещё раз — «похоже, это она»
  it('«Отложить для Caren»: вещь в пуле ненадетой, тост с «Вернуть»; та же вещь ещё раз — «Looks like … set aside for Caren»', async () => {
    const def = set('Defense');
    const pcs = [P('c1', 'helmet', def, { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('c2', 'armor', def, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }),
      P('c3', 'gloves', def, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { bt: 4 }), P('c4', 'shoes', def, { 'DEF%': 3, CHC: 3, CHD: 1, SPD: 1 }, { bt: 4 })];
    const PEN = { setId: set('Penetration'), subs: { 'DEF%': 3, CHC: 1, CHD: 1, SPD: 1 } };
    await mount({ slot: 'helmet', grade: 'unique' }, PEN,
      { gear: G(pcs, { [caren.id]: ['c1', 'c2', 'c3', 'c4'] }, { worn: { [caren.id]: { helmet: 'c1', armor: 'c2', gloves: 'c3', shoes: 'c4' } } }) });
    expect($('.vc-stash')?.textContent).toBe('Set aside for Caren');
    await click($('.vc-stash'));
    expect($('.gear-toast')?.textContent).toBe('Set aside for Caren: helmet.Undo');
    expect(stored().pools[caren.id]).toEqual(['c1', 'c2', 'c3', 'c4', 'p5']);
    expect(stored().worn[caren.id].helmet).toBe('c1');
    expect(JSON.parse(localStorage.getItem('ogc.item')!).subs).toEqual({});

    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().pools[caren.id]).toEqual(['c1', 'c2', 'c3', 'c4']);
    await click($('.vc-stash'));
    // ту же вещь ввели снова
    await act(async () => { localStorage.setItem('ogc.item', JSON.stringify(PEN)); });
    await act(async () => root!.unmount());
    const { App } = await import('@/app/App');
    const { IndexContext } = await import('@/game/data/IndexContext');
    const { createIndex } = await import('@/game/data');
    root = createRoot(document.body.appendChild(document.createElement('div')));
    await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
    expect($('.vc-stash')).toBeNull();
    await click($('.vcard'));
    expect($('.v-reasons')?.textContent).toMatch(/^Looks like the Penetration helmet set aside for Caren \d\d\/\d\d\. If it is — do nothing\./);
  });

  it('T5.7: слабый Speed-шлем при начатом Speed — «Фоддер — запас для Speed-шлема Caren»', async () => {
    const ok = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
    const pcs = [P('s1', 'gloves', speed, ok, { bt: 4 }), P('s2', 'shoes', speed, ok, { bt: 4 })];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { SPD: 1, RES: 1, EFF: 1, HP: 1 } },
      { gear: G(pcs, { [caren.id]: ['s1', 's2'] }, { worn: { [caren.id]: { gloves: 's1', shoes: 's2' } } }) });
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vcard .vc-title')?.textContent).toBe("reserve for Caren's Speed helmet");
  });

  it('В1а ревью этапа 10: слабый Legendary при Epic-запасе — «Fodder — let it sit in inventory», без «Отложить»', async () => {
    const ok = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
    const pcs = [P('s1', 'gloves', speed, ok, { bt: 4 }), P('s2', 'shoes', speed, ok, { bt: 4 }), P('e1', 'helmet', speed, { SPD: 1, RES: 1, EFF: 1 }, { grade: 'rare', bt: 0 })];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { SPD: 1, RES: 1, EFF: 1, HP: 1 } },
      { gear: G(pcs, { [caren.id]: ['s1', 's2', 'e1'] }, { worn: { [caren.id]: { gloves: 's1', shoes: 's2' } } }) });
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vcard .vc-title')?.textContent).toBe('let it sit in inventory');
    expect($('.vc-stash')).toBeNull();
    await click($('.vcard'));
    expect($('.v-reasons')?.textContent).toContain("Caren already has an Epic Speed helmet set aside. Don't set this Legendary aside for anyone");
  });

  it('В6 ревью этапа 10: запас и в режиме героя — «Отложить для Caren»', async () => {
    const ok = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
    const pcs = [P('s1', 'gloves', speed, ok, { bt: 4 }), P('s2', 'shoes', speed, ok, { bt: 4 })];
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { SPD: 1, RES: 1, EFF: 1, HP: 1 } },
      { gear: G(pcs, { [caren.id]: ['s1', 's2'] }, { worn: { [caren.id]: { gloves: 's1', shoes: 's2' } } }), tryon: { charId: caren.id } });
    expect($('.tryon')).toBeTruthy();
    expect($('.vcard .stamp')?.textContent).toBe('Fodder');
    expect($('.vc-stash')?.textContent).toBe('Set aside for Caren');
  });

  it('вопрос 12: слабая вещь лучше надетой — «Фоддер» или «Разобрать», а тихая строка называет героя и что искать', async () => {
    const old = P('r1', 'helmet', set('Attack'), { CHC: 3, CHD: 2, RES: 1, EFF: 1 });
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: set('Attack'), subs: { 'ATK%': 4, CHC: 2, RES: 1, EFF: 1 } },
      { roster: [rin.id], gear: G([old], { [rin.id]: ['r1'] }, { worn: { [rin.id]: { helmet: 'r1' } } }) });
    expect(['Fodder', 'Dismantle', 'Maybe']).toContain($('.vcard .stamp')?.textContent);
    expect($('.vc-note')?.textContent).toMatch(/^Rin wears worse now \(\+[\d.]+ pts\), but this one is weak too — a good one has ATK% and CHC\.$/);
  });

  it('список вещей героя: слабый шлем рядом с сильным — «больше не нужна» и «Убрать у Caren»', async () => {
    const ps = [P('p1', 'helmet', speed, { RES: 1, EFF: 1, HP: 1, ATK: 1 }), P('p2', 'helmet', speed, { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 })];
    await mount({ tab: 'chars', charId: caren.id }, {}, { gear: G(ps, { [caren.id]: ['p1', 'p2'] }) });
    await click(byText('.btabs [role="tab"]', 'Pool'));
    expect($$('.pool li.unused')).toHaveLength(1);
    expect($('.pool li.unused .pool-why')?.textContent).toBe('no longer needed');
    expect($('.pool-unused')?.textContent).toBe('Remove from Caren');
  });
});
