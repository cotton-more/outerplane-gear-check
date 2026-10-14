// @vitest-environment jsdom
// Вкладка «Надето» в карточке персонажа (шаг 6, stat-sets этап 6): вкладки и вкладка по умолчанию, «Ввести» у пустого слота,
// «Да, всё надето», «Переодеть» и «Надеть» (в шторке и в карточке вещи), «надета» во вкладке «Пул». Данные — только из
// test/fixtures, не владельца. Логика — test/worn/wearing.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 };
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const WEAK = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4 });
// лучше WEAK больше чем на 1 очк. (порог совета, R10.8)
const BETTER = P('p2', 'helmet', speed, NEW, { lit: { 'DEF%': 6, CHC: 6, CHD: 6, HP: 6 } });
const SLOT6 = ['weapon', 'accessory', 'helmet', 'armor', 'gloves', 'shoes'];
const six = SLOT6.map((slot, i) => P('s' + (i + 1), slot, ['helmet', 'armor', 'gloves', 'shoes'].includes(slot) ? speed : null, { CHC: 2, SPD: 2 }, slot === 'weapon' || slot === 'accessory' ? { grade: 'rare' } : {}));

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

async function mount(extra: Record<string, unknown>, state: Record<string, unknown> = {}, item: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars', charId: caren.id, ...state }, item, ...extra };
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
const tabs = () => $$('.btabs [role="tab"]').map((b) => b.textContent);
const selected = () => $('.btabs [role="tab"][aria-selected="true"]')?.textContent;

describe('вкладка «Надето»: порядок и вкладка по умолчанию', () => {
  it('герой ростера: «Надето» — первая вкладка, счётчик k/6', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect(tabs()[0]).toBe('Worn1/6');
  });

  it('что-то надето — вкладка «Надето» открывается сама', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect(selected()).toBe('Worn1/6');
  });

  // stat-sets этап 6: вкладки «Надето · Пул · Билды» — карточка открывается на «Надето» всегда
  it('ничего не надето — тоже «Надето 0/6»', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }) });
    expect(tabs()).toEqual(['Worn0/6', 'Pool1', 'Builds']);
    expect(selected()).toBe('Worn0/6');
  });

  it('героя нет в ростере и вещей нет — открыты «Билды»', async () => {
    await mount({ roster: [] });
    expect(selected()).toBe('Builds');
  });

  it('пустая вкладка: подсказка, строки билда нет', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }) });
    expect($('.worn-hint')?.textContent).toBe('Mark what Caren wears in game now.');
    expect($('.worn-aim')).toBeNull();
  });
});

describe('«Ввести» у пустого слота', () => {
  it('режим героя на этот слот: грейд прежний, сет, сабстаты пусты', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) },
      { grade: 'rare', slot: 'helmet' }, { setId: speed, subs: NEW });
    const enter = $$('.bgear-empty').find((li) => li.textContent?.includes('Armor'))!.querySelector('button') as HTMLElement;
    await click(enter);

    const st = JSON.parse(localStorage.getItem('ogc.state')!), item = JSON.parse(localStorage.getItem('ogc.item')!);
    expect({ tab: st.tab, slot: st.slot, grade: st.grade, setId: item.setId ?? null, subs: item.subs }).toEqual({ tab: 'eval', slot: 'armor', grade: 'rare', setId: null, subs: {} });
    expect(JSON.parse(localStorage.getItem('ogc.tryon')!)).toMatchObject({ charId: caren.id });
    expect($('.tryon .tryon-n')?.textContent).toBe('Caren');
  });
});

describe('«Да, всё надето»', () => {
  const askShown = () => !!byText('.bgear-none button', 'Yes, all worn');

  it('по одной вещи на слот: кнопка есть, нажатие надевает всё, тост и «Вернуть»', async () => {
    await mount({ gear: G(six, { [caren.id]: six.map((p) => p.id as string) }) });
    expect($('.bgear-none p')?.textContent).toBe('Caren has 6 pieces, at most one per slot. Are all of them worn now?');
    await click(byText('.bgear-none button', 'Yes, all worn'));

    expect(Object.keys(stored().worn[caren.id])).toHaveLength(6);
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: 6 pieces');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn?.[caren.id]).toBeUndefined();
  });

  it('пять вещей без брони — кнопка есть', async () => {
    const five = six.filter((p) => p.slot !== 'armor');
    await mount({ gear: G(five, { [caren.id]: five.map((p) => p.id as string) }) });
    await click(byText('.btabs [role="tab"]', 'Worn'));
    expect(askShown()).toBe(true);
  });

  it('два шлема в вещах — кнопки нет', async () => {
    await mount({ gear: G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }) });
    await click(byText('.btabs [role="tab"]', 'Worn'));
    expect(askShown()).toBe(false);
  });

  it('что-то уже надето — блока нет', async () => {
    await mount({ gear: G(six, { [caren.id]: six.map((p) => p.id as string) }, { worn: { [caren.id]: { helmet: 's3' } } }) });
    expect(askShown()).toBe(false);
  });
});

describe('«Переодеть» и «Надеть»', () => {
  it('лучший шлем в вещах: «Re-dress: +N pts», в шторке «Wear» ставит его, тост, «Вернуть» — прежний', async () => {
    await mount({ gear: G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    expect($('.redress')?.textContent).toMatch(/^Re-dress: \+[\d.]+ pts▸$/);
    await click($('.redress'));
    expect($('.rd-was')?.textContent).toBe('instead of the Speed helmet');
    await click(byText('.drawer .rd-row button', 'Wear'));

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: Helmet');
    expect($('.redress')).toBeNull();
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[caren.id].helmet).toBe('p1');
  });

  it('пустой слот, своя вещь есть: в «Переодеть» — без «instead of»', async () => {
    const gloves = P('g', 'gloves', speed, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    await mount({ gear: G([WEAK, BETTER, gloves], { [caren.id]: ['p1', 'p2', 'g'] }, { worn: { [caren.id]: { helmet: 'p2' } } }) });
    await click($('.redress'));
    expect($$('.drawer .rd-row')).toHaveLength(1);
    expect($('.drawer .rd-was')).toBeNull();
  });
});

// «Пул» without the worn pieces (owner 2026-10-14): they are on «Надето»; the tab counts only the rest
describe('«Надеть» в карточке вещи; «Пул» без надетых', () => {
  const pool = () => G([WEAK, BETTER], { [caren.id]: ['p1', 'p2'] }, { worn: { [caren.id]: { helmet: 'p1' } } });
  const toPool = () => click(byText('.btabs [role="tab"]', 'Pool'));

  it('«Пул» — только ненадетая вещь, со своей причиной; счётчик вкладки — 1', async () => {
    await mount({ gear: pool() });
    expect(byText('.btabs [role="tab"]', 'Pool')?.textContent).toBe('Pool1');
    await toPool();
    expect($$('.pool-row')).toHaveLength(1);
    expect($('.pool-why')?.textContent).not.toBe('worn');
  });

  it('всё надето: «Пул» пуст — строка вместо списка, «Оценить вещь» остаётся', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await toPool();
    expect($$('.pool-row')).toHaveLength(0);
    expect($('.pool .cd-empty')?.textContent).toBe('Nothing besides what is worn.');
    expect($('.pool-rate')?.textContent).toBe('Rate a piece for Caren');
  });

  it('ненадетая вещь: «Wear» в карточке надевает её, тост, «Вернуть»', async () => {
    await mount({ gear: pool() });
    await toPool();
    await click($$('.pool-row')[0]);
    await click(byText('.piece-act button', 'Wear'));

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.gear-toast')?.textContent).toContain('Now worn by Caren: Helmet');
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[caren.id].helmet).toBe('p1');
  });

  it('надетая вещь (с «Надето»): кнопки «Wear» в карточке нет', async () => {
    await mount({ gear: pool() });
    await click($$('.bgear-row')[0]);
    expect($('.piece')?.textContent).toContain('worn');
    expect(byText('.piece-act button', 'Wear')).toBeUndefined();
  });
});

// A worn set on its own header line (owner 2026-10-10): a one-row set stays on one line with its value on the right, a
// multi-row set gets its head line (with the value) and its rows under it; a set worth 0 prints no number
describe('worn sets: header line and rows', () => {
  const ARMOR4 = ['helmet', 'armor', 'gloves', 'shoes'];
  const attack = D.sets.find((s) => s.short === 'Attack')!.id;
  const four = (setId: string, bt: number) => ARMOR4.map((slot, i) => P('a' + i, slot, setId, { CHC: 2, CHD: 2 }, { bt }));
  const worn = (ps: Pc[]) => G(ps, { [caren.id]: ps.map((p) => p.id as string) }, { worn: { [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });

  it('one row (Speed ×4 at T0–T3): head, text and value on one line', async () => {
    await mount({ gear: worn(four(speed, 0)) });
    expect($$('.wset')).toHaveLength(1);
    expect($('.wset-h span')?.textContent).toBe('Speed ×4 · Speed +25%');
    expect($('.wset-h .wpts')?.textContent).toMatch(/^\+\d+(\.\d)?$/);
    expect($('.wset-b')).toBeNull();
  });

  it('two rows (Attack ×4): head line with the value, rows under it, no «T0–T3»', async () => {
    await mount({ gear: worn(four(attack, 0)) });
    expect($('.wset-h span')?.textContent).toBe('Attack ×4');
    expect($('.wset-b')?.textContent).toBe('Attack +30% · Attack +20%');
    expect($('.bgear-set')?.textContent).not.toContain('T0–T3');
  });

  it('T4 on every piece: «T4» in the head', async () => {
    await mount({ gear: worn(four(attack, 4)) });
    expect($('.wset-h span')?.textContent).toBe('Attack ×4 · T4');
    expect($('.wset-b')?.textContent).toBe('Attack +35% · Attack +25%');
  });

  it('Breakthrough unknown: «T?» in the head, «mark Breakthrough» ends the rows', async () => {
    const ps = four(attack, 0).map((p, i) => (i < 2 ? { ...p, bt: null } : p));
    await mount({ gear: worn(ps) });
    expect($('.wset-h span')?.textContent).toBe('Attack ×4 · T?');
    expect($('.wset-b')?.textContent).toBe('Attack +30% · Attack +20% · mark Breakthrough');
  });

  it('a set outside the hero\'s builds is worth 0: its line has no number', async () => {
    const lifesteal = D.sets.find((s) => s.short === 'Lifesteal')!.id;
    await mount({ gear: worn(four(lifesteal, 0)) });
    expect($('.wset-h span')?.textContent).toBe('Lifesteal ×4');
    expect($('.wset-h .wpts')).toBeNull();
  });

  it('no active row (two Speed pieces) — no set block', async () => {
    await mount({ gear: worn(four(speed, 0).slice(0, 2)) });
    expect($('.bgear-set .wset:not(.pot)')).toBeNull();
  });
});

// «What to look for»: the row ends with what completing the set is worth; a set that would add nothing is not listed (and with no
// rows left the block, title included, is gone)
describe('«What to look for»: value of the row', () => {
  const ARMOR2 = ['helmet', 'armor'];
  const speedPair = (bt: number) => ARMOR2.map((slot, i) => P('s' + i, slot, speed, { CHC: 2, CHD: 2 }, { bt }));
  const worn = (ps: Pc[]) => G(ps, { [caren.id]: ps.map((p) => p.id as string) }, { worn: { [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });

  it('the value follows the sentence in the same span as the set lines', async () => {
    await mount({ gear: worn(speedPair(0)) });
    const row = byText('.seek-row', 'Speed ×4');
    expect(row?.textContent).toMatch(/^Speed ×4: 2 of 4 — need gloves, boots \+\d+(\.\d)?$/);
    expect(row?.querySelector('.wpts')?.textContent).toMatch(/^\+\d/);
  });

  it('no rows — no block at all (the gain filter itself is tested in wearing.test.ts)', async () => {
    // two pieces of a set outside Caren's builds: none of her sets has 1–3 of 4, so there are no rows; the block (title too) is gone
    const lifesteal = D.sets.find((s) => s.short === 'Lifesteal')!.id;
    await mount({ gear: worn(ARMOR2.map((slot, i) => P('l' + i, slot, lifesteal, { CHC: 2 }, { bt: 0 }))) });
    expect($('.seek')).toBeNull();
  });
});

// What Breakthrough T4 on worn armor would add: a faint two-line block after the sets, not on the shared card (share.dom.test.ts)
describe('T4 line', () => {
  const pair = (bt: number) => ['helmet', 'armor'].map((slot, i) => P('t' + i, slot, speed, { CHC: 2, CHD: 2 }, { bt }));
  const worn = (ps: Pc[]) => G(ps, { [caren.id]: ps.map((p) => p.id as string) }, { worn: { [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });

  it('Speed ×2 at T0–T3: head with the bonus and the value, then the pieces that need T4', async () => {
    await mount({ gear: worn(pair(0)) });
    const pot = $('.bgear-set .pot')!;
    expect(pot.querySelector('.wset-h span')?.textContent).toBe('Speed ×2 at T4 · Speed +13%');
    expect(pot.querySelector('.wpts')?.textContent).toMatch(/^\+\d+(\.\d)?$/);
    expect(pot.querySelector('.wset-b')?.textContent).toBe('needs T4 on helmet and armor');
    expect(pot.querySelector('button, a')).toBeNull(); // not tappable
  });

  it('in Russian: «на T4» and «нужен T4 у шлема и брони»', async () => {
    await mount({ gear: worn(pair(0)), lang: 'ru' });
    const pot = $('.bgear-set .pot')!;
    expect(pot.querySelector('.wset-h span')?.textContent).toBe('Speed ×2 на T4 · Speed +13%');
    expect(pot.querySelector('.wset-b')?.textContent).toBe('нужен T4 у шлема и брони');
  });

  it('all pieces at T4 — no line', async () => {
    await mount({ gear: worn(pair(4)) });
    expect($('.pot')).toBeNull();
  });
});

// The Worn heading opens into where the points come from (owner 2026-10-10): Stats, Sets, Passive; closed on every visit
describe('worn budget', () => {
  const four = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => P('b' + i, slot, speed, { CHC: 2, CHD: 2 }, { bt: 0 }));
  const gearOf = (ps: Pc[], hero = caren.id) => G(ps, { [hero]: ps.map((p) => p.id as string) }, { worn: { [hero]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });
  const toggle = () => $('.worn-h .worn-t');
  const num = (s: string | null | undefined) => Number((s ?? '').replace(/[^\d.]/g, ''));

  it('closed by default: the heading is a button with aria-expanded=false and no panel', async () => {
    await mount({ gear: gearOf(four) });
    expect(toggle()?.tagName).toBe('BUTTON');
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle()?.getAttribute('aria-controls')).toBe('worn-budget');
    expect(toggle()?.classList.contains('hit')).toBe(true);
    expect(toggle()?.textContent).toMatch(/^Worn · 4 of 6 · [\d.]+ pts▾$/);
    expect($('#worn-budget')).toBeNull();
    expect(toggle()?.closest('[data-tour]')?.getAttribute('data-tour')).toBe('wbudget');
  });

  it('a tap opens it, a second one closes; the arrow follows', async () => {
    await mount({ gear: gearOf(four) });
    await click(toggle());
    expect(toggle()?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle()?.textContent).toMatch(/▴$/);
    expect($('#worn-budget')).not.toBeNull();
    await click(toggle());
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false');
    expect($('#worn-budget')).toBeNull();
  });

  it('Stats and Sets add up to the heading; one set stands on the Sets line, a chip per worn slot', async () => {
    await mount({ gear: gearOf(four) });
    await click(toggle());
    const rows = $$('#worn-budget > div');
    const [stats, sets] = rows;
    expect(stats.querySelector('dt')?.textContent).toBe('Stats');
    expect(sets.querySelector('dt')?.textContent).toBe('Sets · Speed ×4');
    const total = num($('.worn-t .wtotal')?.textContent);
    expect(num(stats.querySelector('dd')?.textContent) + num(sets.querySelector('dd')?.textContent)).toBeCloseTo(total, 9);
    expect(stats.querySelectorAll('.wbud-chip')).toHaveLength(4);
    expect(stats.querySelector('.wbud-chip .sr-only')?.textContent).toBe('Helmet'); // the icon is named for a screen reader
    expect(rows.some((r) => r.querySelector('dt')?.textContent === 'Passive')).toBe(false); // no weapon, no accessory
  });

  it('two sets: the sum on the Sets line, a line per set under it', async () => {
    const defense = D.sets.find((s) => s.short === 'Defense')!.id;
    const two = [P('c0', 'helmet', speed, { CHC: 2 }, { bt: 4 }), P('c1', 'armor', speed, { CHC: 2 }, { bt: 4 }), P('c2', 'gloves', defense, { CHC: 2 }, { bt: 0 }), P('c3', 'shoes', defense, { CHC: 2 }, { bt: 0 })];
    await mount({ gear: gearOf(two) });
    await click(toggle());
    const sets = $$('#worn-budget > div')[1];
    expect(sets.querySelector('dt')?.textContent).toBe('Sets');
    const lines = [...sets.querySelectorAll('.wbud-set')].map((l) => l.querySelector('span')?.textContent);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.every((l) => /×2$/.test(l ?? ''))).toBe(true);
  });

  // Passive: the rank of the worn accessory as a word (Fran's pieces are the ones test/gear/layout.test.ts T4.5a uses)
  const fran = D.chars.find((c) => c.name === 'Fran')!;
  const accessory = (id: string, lit: Record<string, number>, o: Pc) => P(id, 'accessory', null, lit, { main: 'SPD', ...o });
  for (const [label, piece] of [
    ['recommended', accessory('a2', { RES: 2, DEF: 1, 'DMG RED%': 1, HP: 1 }, { itemKey: '1017', bt: 4 })],
    ['stopgap', accessory('a178', { CHC: 2, RES: 2, 'HP%': 3 }, { grade: 'rare', bt: 0 })],
    ['not in builds', accessory('a93', { DEF: 2, EFF: 3, HP: 2 }, { grade: 'rare', bt: 0, main: 'HP%' })], // SPD would be a filler («stopgap»)
  ] as const) {
    it(`Passive: a worn accessory reads «${label}»`, async () => {
      await mount({ gear: gearOf([piece], fran.id), roster: [fran.id] }, { charId: fran.id });
      await click(toggle());
      const row = $$('#worn-budget > div').find((r) => r.querySelector('dt')?.textContent === 'Passive')!;
      expect(row.querySelector('.wbud-chip')?.textContent).toBe('Accessory' + label);
    });
  }

  it('plain heading (no button) on an empty tab', async () => {
    await mount({ gear: G([], { [caren.id]: [] }) });
    expect($('.worn-h h4')?.textContent).toBe('Worn · 0 of 6');
    expect($('.worn-h .worn-t')).toBeNull();
  });

});

// «Crit» (crit soft cap, decision 5): the line under the chain, amber from N − 15, tap → the hero's N
describe('«Надето»: the hero\'s crit «Crit: 45%»', () => {
  const worn = (ps: Pc[], hero = caren.id, o: Pc = {}) => G(ps, { [hero]: ps.map((p) => p.id as string) }, { worn: { [hero]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) }, ...o });
  const line = () => $('.bgear.worn .wcrit:not(.weff)');
  const type = async (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };

  it('Caren (Striker): 5 base + 5 class + 10 quirks + CHC 2 on the helmet = 26%; under N − 15 — not amber', async () => {
    await mount({ gear: worn([WEAK]) });
    expect(line()?.textContent).toBe('Crit: 26%▸');
    expect(line()?.classList.contains('near')).toBe(false);
  });

  it('a lower N turns the line amber from N − 15', async () => {
    await mount({ gear: worn([WEAK], caren.id, { crit: { [caren.id]: 41 } }) });
    expect(line()?.classList.contains('near')).toBe(true);
  });

  it('tap → the sheet: type 85, Done — stored; Reset and Done — back to 100, the record is gone', async () => {
    await mount({ gear: worn([WEAK]) });
    await click(line());
    expect($('.critsheet .crit-split')?.textContent).toBe('Hero 20% · gear 6%');
    const input = $('.critsheet input') as HTMLInputElement;
    expect(input.value).toBe('100');
    await type(input, '85');
    await click(byText('.critsheet .btn.primary', 'Done'));
    expect(stored().crit).toEqual({ [caren.id]: 85 });
    expect($('.critsheet')).toBeNull();
    await click(line());
    expect(($('.critsheet input') as HTMLInputElement).value).toBe('85');
    await click(byText('.critsheet .linkbtn', 'Reset'));
    await click(byText('.critsheet .crit-step', '−'));
    await click(byText('.critsheet .btn.primary', 'Done'));
    expect(stored().crit).toEqual({ [caren.id]: 99 });
  });

  it('no line for a hero without CHC in the chain, and with nothing worn', async () => {
    const akari = D.chars.find((c) => c.name === 'Akari')!;
    await mount({ gear: worn([WEAK], akari.id), roster: [akari.id] }, { charId: akari.id });
    expect($('.bgear.worn')).not.toBeNull();
    expect(line()).toBeNull();
  });

  it('nothing worn — no line', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }) });
    expect(line()).toBeNull();
  });
});

// «EFF» (HISTORY.md 0200-boss stage D): the line under crit for heroes who need EFF (rule R), «≈» until the game's number is typed;
// tap → «EFF for X»: the typed value is kept as a factor over the app's count
describe('«Надето»: the hero\'s EFF «EFF: ≈ 233»', () => {
  const akari = D.chars.find((c) => c.name === 'Akari')!;
  const worn = (ps: Pc[], hero = akari.id, o: Pc = {}) => G(ps, { [hero]: ps.map((p) => p.id as string) }, { worn: { [hero]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) }, ...o });
  const line = () => $('.bgear.worn .weff');
  const type = async (el: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  // Akari (Ranger, Lv 100, Quirks): W 120 + node 50; the helmet's EFF% 3 segments = 7.5 % of W → ⌊120 × 1.075⌋ = 129 → 179
  const mountAkari = (o: Pc = {}) => mount({ gear: worn([WEAK], akari.id, o), roster: [akari.id] }, { charId: akari.id });

  it('Akari: «EFF: ≈ 179» — W 120, Ranger node 50, EFF% on the helmet; the sign has a word for screen readers', async () => {
    await mountAkari();
    expect(line()?.textContent).toBe('EFF: ≈\u2009about 179▸');
    expect(line()?.querySelector('b [aria-hidden="true"]')?.textContent).toBe('≈\u2009');
  });

  it('no line for a hero who doesn\'t need EFF (Caren) and with nothing worn', async () => {
    await mount({ gear: worn([WEAK], caren.id) });
    expect(line()).toBeNull();
    await act(async () => root?.unmount());
    root = null;
    await mount({ gear: G([WEAK], { [akari.id]: ['p1'] }), roster: [akari.id] }, { charId: akari.id });
    expect(line()).toBeNull();
  });

  it('tap → the sheet: type 358, Done — stored with the app\'s 179, the line shows 358 without ≈; Reset and Done — gone', async () => {
    await mountAkari();
    await click(line());
    expect($('.effsheet .eff-split')?.textContent).toBe('Hero 170 · gear 9');
    const input = $('.effsheet input') as HTMLInputElement;
    expect([input.value, input.placeholder]).toEqual(['', '179']);
    expect(($$('.effsheet .linkbtn').find((b) => b.textContent === 'Reset') as HTMLButtonElement).disabled).toBe(true);
    await type(input, '358');
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(stored().eff).toEqual({ [akari.id]: { typed: 358, at: 179 } });
    expect(line()?.textContent).toBe('EFF: 358▸');
    await click(line());
    expect($('.effsheet .eff-split')?.textContent).toBe('Hero 170 · gear 9 · ×2');
    expect($('.effsheet .eff-stale')).toBeNull();
    await click(byText('.effsheet .linkbtn', 'Reset'));
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(stored().eff).toBeUndefined();
  });

  it('Done with a text that is not a number in 1…9999 («0») changes nothing; empty forgets the value', async () => {
    await mountAkari({ eff: { [akari.id]: { typed: 358, at: 179 } } });
    await click(line());
    await type($('.effsheet input') as HTMLInputElement, '0');
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect($('.effsheet')).toBeNull();
    expect(stored().eff).toEqual({ [akari.id]: { typed: 358, at: 179 } });
    await click(line());
    await type($('.effsheet input') as HTMLInputElement, '');
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(stored().eff).toBeUndefined();
  });

  it('gear changed since typing: the factor follows (357 typed at 170, now 179: 179 × 357 / 170 = 376), «≈» again, the quiet line; Done untouched — nothing re-anchored', async () => {
    await mountAkari({ eff: { [akari.id]: { typed: 357, at: 170 } } });
    expect(line()?.textContent).toBe('EFF: ≈\u2009about 376▸');
    await click(line());
    expect($('.effsheet .eff-stale')?.textContent).toBe('Gear changed since you typed it: the number is an estimate.');
    expect(($('.effsheet input') as HTMLInputElement).value).toBe('357');
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(stored().eff).toEqual({ [akari.id]: { typed: 357, at: 170 } });
  });
});

// Hero stars (PLAN 0190; at the name since 0197): six small stars next to the hero's name in the card header → the star sheet; crit from stars joins «Crit»
describe('«Надето»: the hero\'s stars', () => {
  const regina = D.chars.find((c) => c.name === 'Poolside Trickster Regina')!;
  const worn = (ps: Pc[], hero: string, o: Pc = {}) => G(ps, { [hero]: ps.map((p) => p.id as string) }, { worn: { [hero]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) }, ...o });
  const lit = () => $$('.cd-head .cd-stars .hs-mini .on').length;
  const line = () => $('.bgear.worn .wcrit:not(.weff)')?.textContent;

  it('a roster hero without stored ★: a button with her minimum ★3 lit (base rarity) and its aria; not in the roster — nothing', async () => {
    await mount({ gear: worn([WEAK], caren.id) });
    const b = $('.cd-head button.cd-stars')!;
    expect([b.getAttribute('aria-label'), lit()]).toEqual(['Caren’s stars: ★3 — change or remove from roster', 3]);
    expect($$('.cd-head .cd-stars .hs-mini i')).toHaveLength(6);
  });

  it('the star sheet locks the stars below the hero\'s minimum (Caren ★3: ★1, ★2)', async () => {
    await mount({ gear: worn([WEAK], caren.id) });
    await click($('.cd-head button.cd-stars'));
    expect($$('.drawer.hs-sheet .hs-big button').map((b) => (b as HTMLButtonElement).disabled)).toEqual([true, true, false, false, false, false]);
  });

  it('a hero not in the roster has no stars', async () => {
    await mount({ roster: [] });
    expect($('.cd-head .cd-stars')).toBeNull();
  });

  it('tap → the sheet «Stars and level: Regina»; ★5 → saved, the sheet closes, the line and the crit sheet count 65%', async () => {
    await mount({ gear: worn([WEAK], regina.id), roster: [regina.id] }, { charId: regina.id });
    const before = line();
    await click($('.cd-head button.cd-stars'));
    expect($('.drawer.hs-sheet .drawer-title, .drawer.hs-sheet h3, .drawer.hs-sheet h2')?.textContent).toBe('Stars and level: Poolside Trickster Regina');
    expect($('.hs-crit')).toBeNull(); // the sheet only picks the stars; what they give is not shown
    await click($$('.drawer.hs-sheet .hs-big button')[4]);
    expect($('.drawer.hs-sheet')).toBeNull();
    expect(stored().stars).toEqual({ [regina.id]: 5 });
    expect([lit(), $('.cd-head button.cd-stars')?.getAttribute('aria-label')]).toEqual([5, 'Poolside Trickster Regina’s stars: ★5 — change or remove from roster']);
    const crit = (t: string | undefined) => Number(/(\d+)%/.exec(t ?? '')?.[1]);
    expect(crit(line())).toBe(crit(before) + 65);
    await click($('.bgear.worn .wcrit:not(.weff)'));
    expect($('.critsheet .crit-split')?.textContent).toMatch(/^Hero 20% · stars 65% · gear \d+%$/);
  });

  it('a stored ★ shows at once and is marked in the sheet; ★4 counts less crit than ★5', async () => {
    await mount({ gear: worn([WEAK], regina.id, { stars: { [regina.id]: 5 } }), roster: [regina.id] }, { charId: regina.id });
    expect(lit()).toBe(5);
    await click($('.cd-head button.cd-stars'));
    expect($$('.drawer.hs-sheet .hs-big [aria-pressed="true"]').map((b) => b.getAttribute('aria-label'))).toEqual(['★5']);
    const crit5 = Number(/(\d+)%/.exec(line() ?? '')?.[1]);
    await click($$('.drawer.hs-sheet .hs-big button')[3]);
    expect(Number(/(\d+)%/.exec(line() ?? '')?.[1])).toBe(crit5 - 65);
  });

  it('a hero whose stars give no crit: no crit part in the split', async () => {
    await mount({ gear: worn([WEAK], caren.id, { stars: { [caren.id]: 6 } }) });
    await click($('.cd-head button.cd-stars'));
    await click($$('.drawer.hs-sheet .hs-big button')[5]);
    await click($('.bgear.worn .wcrit:not(.weff)'));
    expect($('.critsheet .crit-split')?.textContent).toBe('Hero 20% · gear 6%');
  });
});

// The hero's level (HISTORY.md 0205): «Level [100][120][default]» in the star sheet; a mark keeps the level when the settings default
// flips; «· Lv 120» after the stars; EFF and flat vs % follow it
describe('«Надето»: the hero\'s level', () => {
  const akari = D.chars.find((c) => c.name === 'Akari')!;
  const worn = (ps: Pc[], hero: string, o: Pc = {}) => G(ps, { [hero]: ps.map((p) => p.id as string) }, { worn: { [hero]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) }, ...o });
  // the lit segments of the pill: «default» (chosen), a level — bright (chosen) or pale (what the default gives)
  const pressed = () => $$('.drawer.hs-sheet .lv-seg.on').map((b) => `${b.textContent}${b.classList.contains('soft') ? ' soft' : ''}`);
  const def = () => $('.drawer.hs-sheet .lv-auto');
  const eff = () => $('.bgear.worn .weff')?.textContent;

  it('not marked: the default (Lv 100) pressed with «default»; 120 → stored, «· Lv 120» in the header, EFF at W 140; the sheet stays', async () => {
    await mount({ gear: worn([WEAK], akari.id), roster: [akari.id] }, { charId: akari.id });
    expect(eff()).toBe('EFF: ≈\u2009about 179▸'); // W 120 at Lv 100
    expect($('.cd-head .cd-lv')).toBeNull();
    await click($('.cd-head button.cd-stars'));
    expect(pressed()).toEqual(['default', 'Lv100 soft']);
    await click(byText('.drawer.hs-sheet .lv-seg', '120'));
    expect(stored().lv).toEqual({ [akari.id]: 120 });
    expect(pressed()).toEqual(['Lv120']);
    expect($('.cd-head .cd-lv')?.textContent).toBe('· Lv 120');
    expect($('.cd-head button.cd-stars')?.getAttribute('aria-label')).toBe('Akari’s stars: ★3, Lv 120 — change or remove from roster');
    expect(eff()).toBe('EFF: ≈\u2009about 200▸'); // ⌊140 × 1.075⌋ = 150 + 50
    await click(def());
    expect(stored().lv).toBeUndefined();
    expect(pressed()).toEqual(['default', 'Lv100 soft']);
    await click(byText('.drawer.hs-sheet .lv-seg', '100')); // the same level as the default, but marked
    expect([stored().lv, pressed()]).toEqual([{ [akari.id]: 100 }, ['Lv100']]);
  });

  it('a hero marked 100 stays at 100 when the default is 120; an unmarked one follows it', async () => {
    await mount({ gear: worn([WEAK], akari.id, { lv: { [akari.id]: 100 } }), roster: [akari.id] }, { charId: akari.id, lv120: true });
    expect(eff()).toBe('EFF: ≈\u2009about 179▸');
    expect($('.cd-head .cd-lv')).toBeNull();
    await click($('.cd-head button.cd-stars'));
    expect(pressed()).toEqual(['Lv100']);
  });
});

describe('«Надето»: the hero\'s crit on old data', () => {
  it('a snapshot without the hero\'s CHC or main values — no line (the number would be far below the game\'s)', async () => {
    const old = { ...D, mainValues: undefined };
    const { wornView } = await import('@/features/worn/wearing');
    const { createIndex } = await import('@/game/data');
    const { makeCtx } = await import('@/game/context');
    const { heroPool } = await import('@/features/gear/verdict');
    const view = (data: Dataset) => {
      const ctx = makeCtx(createIndex(data), { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set([caren.id]));
      const st = G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) as never;
      const c = ctx.idx.CHAR[caren.id];
      return wornView(ctx, c, st, heroPool(ctx, c, [WEAK as never], new Set(['p1'])));
    };
    expect(view(D).crit).toEqual({ total: 26, own: 20, stars: 0, need: 100 });
    expect(view(old).crit).toBeNull();
    expect(view({ ...D, chars: D.chars.map((c) => ({ ...c, chc: undefined })) }).crit).toBeNull();
  });
});

// the budget's crit row (crit soft cap, decision 9): Stats + Sets − Extra crit = the heading
describe('«Надето»: Extra crit in the budget', () => {
  it('Caren at 119 %: a row «Extra crit −x», and the panel adds up to the heading', async () => {
    const crit = D.sets.find((s) => s.short === 'Critical Hit')!.id;
    const ps = [
      P('a1', 'accessory', null, { CHD: 5, 'ATK%': 2, SPD: 1, HP: 1 }, { itemKey: '1036', main: 'CHC', bt: 4 }),
      P('a2', 'helmet', crit, { CHC: 3, CHD: 3, SPD: 2, 'ATK%': 1 }, { bt: 4 }),
      P('a3', 'armor', crit, { CHD: 4, 'ATK%': 3, DEF: 1, SPD: 1 }, { bt: 4 }),
      P('a4', 'gloves', crit, { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 2 }, { bt: 4 }),
      P('a5', 'shoes', crit, { SPD: 4, CHD: 2, 'ATK%': 2, HP: 1 }, { bt: 4 }),
    ];
    await mount({ gear: G(ps, { [caren.id]: ps.map((p) => p.id as string) }, { worn: { [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } }) });
    await click($('.worn-h .worn-t'));
    const rows = $$('#worn-budget > div').map((d) => [d.querySelector('dt')?.textContent ?? '', d.querySelector('dd.wpts')?.textContent ?? '']);
    const row = rows.find(([dt]) => dt === 'Extra crit');
    expect(row?.[1]).toMatch(/^−\d+(\.\d)?$/);
    const num = (s: string) => Number(s.replace('−', '-'));
    const head = Number(/· ([\d.]+) pts/.exec($('.worn-h h4')!.textContent!)![1]);
    const sum = rows.filter(([, v]) => v).reduce((n, [, v]) => n + num(v), 0);
    expect(Math.round(sum * 10)).toBe(Math.round(head * 10));
  });

  it('no crit loss — no row', async () => {
    await mount({ gear: G([WEAK], { [caren.id]: ['p1'] }, { worn: { [caren.id]: { helmet: 'p1' } } }) });
    await click($('.worn-h .worn-t'));
    expect($$('#worn-budget dt').map((d) => d.textContent)).not.toContain('Extra crit');
  });
});
