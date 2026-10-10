// @vitest-environment jsdom
// «Партия» on a phone (360px, .x/0110-batch): «Ещё» → «Партия», pieces in a row without a verdict, the list (fix,
// remove), the plan («Не брать»), «Записать план» with «Вернуть», the batch saved across a reload, ✕ asks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { moreButton, openMore } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren');
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, lit: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: lit, lit, bt: 4, at: '2026-10-07', ...o });
const ok = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
// Caren wears Speed gloves and boots (T4) and an Epic Speed helmet
const GEAR = {
  v: 3, seq: 3,
  pieces: { g: P('g', 'gloves', ok), b: P('b', 'shoes', ok), h: P('h', 'helmet', { 'DEF%': 3, CHC: 3, CHD: 2 }, { grade: 'rare', bt: 0 }) },
  pools: { [caren.id]: ['g', 'b', 'h'] }, worn: { [caren.id]: { gloves: 'g', shoes: 'b', helmet: 'h' } },
};
const GOOD = { setId: speed, subs: { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 } };
const WEAK = { setId: speed, subs: { SPD: 1, RES: 1, EFF: 1, HP: 1 } };

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
  history.replaceState(null, '', location.pathname);   // the character card wrote its #slug
});

async function mount(item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], gear: GEAR, state: { tab: 'eval', slot: 'helmet', grade: 'unique' }, item, ...extra };
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
const batch = () => JSON.parse(localStorage.getItem('ogc.batch') ?? 'null');
const gear = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');
async function start() {
  await openMore();
  await click(moreButton('Batch'));
}

describe('«Партия» on a phone', () => {
  it('«Ещё» → «Партия»: the strip, no verdict; «Add · #1» adds the piece and clears the form', async () => {
    await mount(GOOD);
    expect($('.vcard')).toBeTruthy();                     // the usual verdict card first
    await start();
    expect($('.batch-strip .tryon-k')?.textContent).toBe('Batch · 0');
    expect($('.vcard')).toBeNull();                       // no verdict in the mode
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #1 · helmet');
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(1);
    expect(batch().items[0]).toMatchObject({ kind: 'piece', input: { slot: 'helmet', grade: 'unique', setId: speed, subs: GOOD.subs, bt: 0 } });
    expect($('.batch-strip .tryon-k')?.textContent).toBe('Batch · 1');
    // the next piece asks its slot again (owner 2026-10-09): nothing pressed, «Add» waits; the grade is the batch's —
    // the first piece's, the other one is off
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #2');
    expect($('.slotrow.need')).toBeTruthy();
    expect($('.gradesw.need')).toBeNull();
    expect($('[data-tour="grade"] [data-tour-item="rare"]')?.getAttribute('aria-disabled')).toBe('true');
    await click($('.vbar .vb-reset'));
    expect($('.batch-toast')?.textContent).toBe('Pick the slot first — as on the piece in the game.');
    await click($('[data-tour="grade"] [data-tour-item="rare"]'));
    expect($('.batch-toast')?.textContent).toBe('This batch is Legendary Speed. Anything else — a new batch.');
    await click($('[data-tour="slot"] [data-tour-item="helmet"]'));
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #2 · helmet');
    expect($('.slotrow.need')).toBeNull();
    expect(JSON.parse(localStorage.getItem('ogc.item') ?? '{}').subs ?? {}).toEqual({});
  });

  it('an incomplete piece is not added: the note says why', async () => {
    await mount({ setId: speed, subs: { SPD: 1 } });
    await start();
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(0);
    expect($('.batch-toast')?.textContent).toBe('Not all substats entered — not added.');
  });

  it('a piece with an early verdict but not all substats is not added either', async () => {
    await mount({ setId: speed, subs: { CHC: 3, CHD: 3, SPD: 3 } });   // a Legendary: 3 of 4, already «Keep» by thresholds
    await start();
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(0);
    expect($('.batch-toast')?.textContent).toBe('Not all substats entered — not added.');
  });

  it('no roster: no «Batch» in «More»; a saved batch waits — no strip, the usual verdict', async () => {
    await mount(GOOD, { roster: [], gear: { v: 3, seq: 0, pieces: {}, pools: {} } });
    await openMore();
    expect(moreButton('Batch')).toBeFalsy();
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    const saved = { v: 1, items: [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK }], skip: [], twin: [] };
    await mount(GOOD, { roster: [], gear: { v: 3, seq: 0, pieces: {}, pools: {} }, batch: saved });
    expect($('.batch-strip')).toBeNull();
    expect($('.vcard')).toBeTruthy();
    expect(batch()).toEqual(saved);
  });

  it('during a batch the character card keeps «Yes, all worn»; hero-mode «Enter» is off', async () => {
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK }];
    await mount(GOOD, { gear: { ...GEAR, worn: {} }, state: { tab: 'chars', slot: 'helmet', grade: 'unique', charId: caren.id }, batch: { v: 1, items, skip: [], twin: [] } });
    expect(byText('button', 'Yes, all worn')).toBeTruthy();
    expect($$('button').filter((b) => b.textContent === 'Enter')).toHaveLength(0);
  });

  it('the list: a tap loads the piece to fix it («Save #1»), ✕ removes it', async () => {
    await mount(GOOD, { batch: { v: 1, items: [{ slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, subs: WEAK.subs, bt: 0 }], skip: [], twin: [] } });
    expect($('.batch-strip')).toBeTruthy();               // the saved batch is back after a reload
    await click($('.batch-strip .batch-list'));
    expect($$('.batch-items .brow')).toHaveLength(1);
    await click($('.batch-items .brow-fix'));
    expect($('.vbar .vb-reset')?.textContent).toBe('Save #1');
    await click($('.batch-strip .batch-list'));
    await click($('.batch-items .brow-x'));
    expect(batch().items).toHaveLength(0);
  });

  it('✕ removes at once, the message «Removed #1 · Undo» puts the entry back at its place with its marks', async () => {
    const piece = (x: Record<string, unknown>) => ({ kind: 'piece', input: { slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...x } });
    const marks = { skip: [`1>${caren.id}`, `2>${caren.id}`], twin: [1, 3], choice: { '1': 'keep', '3~1': 'junk' }, done: [] };
    const saved = { v: 2, items: [piece(WEAK), piece(GOOD), piece(WEAK)], ...marks };
    await mount(GOOD, { batch: saved });
    await click($('.batch-strip .batch-list'));
    await click($('.batch-items .brow-x'));
    expect(batch().items).toHaveLength(2);
    expect(batch()).toMatchObject({ skip: [`1>${caren.id}`], twin: [2], choice: { '2~1': 'junk' } });   // #1's marks are gone, the others moved up
    expect($('.gear-toast')?.textContent).toBe('Removed #1Undo');
    await click(byText('.gear-toast button', 'Undo'));
    const back = batch();                                 // the entry at its place, every mark back, the later ones moved down again
    expect(back.items.map((e: { input: { subs: unknown } }) => e.input.subs)).toEqual([WEAK.subs, GOOD.subs, WEAK.subs]);
    expect({ skip: [...back.skip].sort(), twin: [...back.twin].sort(), choice: back.choice }).toEqual({ skip: [...marks.skip].sort(), twin: marks.twin, choice: marks.choice });
    expect($$('.batch-items .brow')).toHaveLength(3);
    expect($('.gear-toast')).toBeNull();
  });

  it('the plan: the good Legendary goes on Caren, the weak one feeds it; recorded only at the walk\'s end, after a confirm; «Undo» brings all back', async () => {
    const items = [WEAK, GOOD].map((x) => ({ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...x }));
    await mount({ setId: speed, subs: {} }, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .batch-list'));
    expect($('.drawer-h h3')?.textContent).toBe('Batch · 2 · Legendary Speed');       // the kind once, in the title (Q4)
    await click(byText('.batch button', 'Plan it'));
    expect($('.drawer-h h3')?.textContent).toBe('Batch plan · Legendary Speed');
    const lines = $$('.batch-plan .brow').map((l) => l.querySelector('.bfate')?.textContent);
    expect(lines.slice(0, 2)).toEqual(["Feed to #2 · Caren's helmet", 'Equip on Caren — instead of the helmet']);   // the feed row says whose piece
    expect($('.batch-sum')?.textContent).toMatch(/^equip\u00A01 · set\u00A0aside\u00A00 · feed\u00A01 · dismantle\u00A0\d$/);
    const before = gear();
    expect(byText('.batch button', 'Record the plan')).toBeUndefined(); // no recording from the plan (owner 2026-10-09)
    for (const b of $$('.bdecide button').filter((x) => x.textContent === 'Dismantle')) await click(b);
    await click(byText('.batch button', 'Walk ▸'));
    expect($('.batch-full')).toBeTruthy();                // the walk takes the whole screen
    expect($('.bwalk > p')?.textContent).toBe('Game filter: Legendary Speed · worn shown · by date. Substats differ — fix the batch.');
    await click(byText('.batch button', 'All done — Record the plan'));
    expect(batch()).not.toBeNull();                       // asks first: an accidental tap records nothing
    // one paragraph: how many steps are not ticked, what will be recorded, the undo hint
    const steps = $$('.bwalk .bstep').length;
    expect($('.drawer.ask p')?.textContent).toBe(`Not ticked: ${steps} of ${steps} step${steps === 1 ? '' : 's'}. I'll record on the heroes: equipped 1, set aside 0. Right after, you can "Undo" in the message.`);
    await click(byText('.drawer.ask button', 'Cancel'));
    expect(gear()).toEqual(before);
    for (const b of $$('.bwalk .bstep input')) await click(b);
    await click(byText('.batch button', 'All done — Record the plan'));
    expect($('.drawer.ask p')?.textContent).toBe('I\'ll record on the heroes: equipped 1, set aside 0. Right after, you can "Undo" in the message.');   // all ticked: no first sentence
    await click(byText('.drawer.ask button', 'Record'));
    expect(batch()).toBeNull();
    expect($('.batch-strip')).toBeNull();
    const after = gear();
    expect(after.pools[caren.id]).toHaveLength(3);        // the new helmet in, the Epic one out
    expect(Object.values(after.worn[caren.id])).not.toContain('h');
    expect($('.gear-toast')?.textContent).toContain('Batch recorded: 1 equipped, 0 set aside.');
    await click(byText('.gear-toast button', 'Undo'));
    expect(gear().pools).toEqual(before.pools);
    expect(gear().worn).toEqual(before.worn);
    expect(batch().items).toHaveLength(2);                // the batch is back
  });

  it('a set-aside reserve the new piece eats has its own line: «Caren\'s set-aside helmet (…)» — «Feed to #1»', async () => {
    const gear = { ...GEAR, seq: 4, pieces: { ...GEAR.pieces, r: P('r', 'helmet', WEAK.subs, { bt: 0 }) }, pools: { [caren.id]: ['g', 'b', 'h', 'r'] } };
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...GOOD }];
    await mount({ setId: speed, subs: {} }, { gear, batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    const row = byText('.batch-plan .brow', "Caren's set-aside helmet (SPD\u00A01, RES%\u00A01, EFF%\u00A01, HP\u00A01)");
    expect(row?.querySelector('.bfate')?.textContent).toBe("Feed to #1 · Caren's helmet");
    expect($('.batch-sum')?.textContent).toMatch(/· feed\u00A01 ·/);
  });

  it('«Don\'t take» plans the line again without that hero', async () => {
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...GOOD }];
    await mount({ setId: speed, subs: {} }, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    expect($('.batch-plan .bfate')?.textContent).toMatch(/^Equip on Caren/);
    await click(byText('.batch-plan button', "Don't take"));
    expect(batch().skip).toEqual([`1>${caren.id}`]);
    expect($('.batch-plan .bfate')?.textContent).not.toMatch(/Caren/);
  });

  it('✕ with pieces asks; «End» clears the batch', async () => {
    const items = [{ slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK }];
    await mount(GOOD, { batch: { v: 1, items, skip: [], twin: [] } });
    await click($('.batch-strip .tryon-x'));
    expect(byText('.drawer', 'End the batch? Pieces not planned: 1.')).toBeTruthy();
    await click(byText('.drawer button', 'End'));
    expect(batch()).toBeNull();
    expect($('.batch-strip')).toBeNull();
    expect($('.vcard')).toBeTruthy();                     // the verdict is back
  });
});

// The step-by-step walk (.x/0140-batch-walk): «E» and «🔒» entries, one filter per batch, «Спорно» decided first, steps
describe('«Партия»: обход по шагам', () => {
  it('«E · worn» → «Whose piece?» lists Caren (she wears a Speed helmet) → a row of her helmet + her portrait and name; «🔒» adds a locked helmet', async () => {
    await mount({ setId: speed, subs: {} }, { batch: { v: 2, items: [], skip: [], twin: [], choice: {}, done: [] } });
    await click(byText('.batch-marks button', 'E · worn'));
    await click(byText('.batch-whose button', 'Caren'));
    await click(byText('.batch-marks button', 'set aside'));             // the slot is asked first after «E»
    expect(batch().items).toHaveLength(1);
    await click($('[data-tour="slot"] [data-tour-item="helmet"]'));
    await click(byText('.batch-marks button', 'set aside'));
    expect(batch().items).toEqual([{ kind: 'worn', c: caren.id, slot: 'helmet' }, { kind: 'lock', slot: 'helmet' }]);
    await click($('.batch-strip .batch-list'));
    const rows = $$('.batch-items .brow');
    expect(rows.map((r) => r.querySelector('.bgear-n')?.textContent)).toEqual(['#1helmet', '#2🔒 helmet']); // armor in a batch row: the slot word alone — no grade chip, no set (Q4)
    expect(rows[0].querySelector('.bworn')?.textContent).toBe('Caren');
    expect(rows[0].querySelectorAll('.bgear-t .tok')).toHaveLength(3);                                         // her helmet's substats
  });

  it('one filter per batch: a form with another set takes the batch\'s set by itself', async () => {
    const attack = D.sets.find((s) => s.short === 'Attack')!.id;
    const items = [{ kind: 'piece', input: { slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK } }];
    await mount({ setId: attack, subs: GOOD.subs }, { batch: { v: 2, items, skip: [], twin: [], choice: {}, done: [] } });
    expect($('[data-tour="pick"]')?.textContent).toContain('Speed');
    await click($('.vbar .vb-reset'));
    expect(batch().items[1].input.setId).toBe(speed);
  });

  it('a weapon batch: after «Add» the main and the item clear, the slot stays weapon, the grade is locked — nothing to pick', async () => {
    const w = D.weapons.find((i) => i.grade === 'unique' && i.star === 6)!;
    await mount({ itemKey: w.key, main: w.mains[0], subs: { SPD: 2, CHC: 2, CHD: 1, 'DMG UP%': 1 } },
      { state: { tab: 'eval', slot: 'weapon', grade: 'unique' }, batch: { v: 2, items: [], skip: [], twin: [], choice: {}, done: [] } });
    await click($('.vbar .vb-reset'));
    expect(batch().items).toHaveLength(1);
    const form = JSON.parse(localStorage.getItem('ogc.item') ?? '{}');
    expect([form.main ?? null, form.itemKey ?? null]).toEqual([null, null]);
    expect($('.slotrow.need')).toBeNull();
    expect($('[data-tour="slot"] [data-tour-item="weapon"]')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.gradesw.need')).toBeNull();
    expect($('[data-tour="grade"] [data-tour-item="unique"]')?.getAttribute('aria-pressed')).toBe('true');
    expect($('.vbar .vb-reset')?.textContent).toBe('Add · #2 · weapon');
  });

  it('a weapon\'s walk step says the item and its main: «Surefire Greatsword · ATK%»', async () => {
    const ref = caren.builds[0].weapons[0];
    const w = D.weapons.find((i) => i.key === ref.key)!;
    const input = { slot: 'weapon', grade: 'unique', setId: null, itemKey: w.key, main: ref.mains[0], unlisted: false, subs: { CHC: 3, CHD: 3, SPD: 2, 'DMG UP%': 2 }, bt: 0 };
    await mount({ setId: speed, subs: {} }, { state: { tab: 'eval', slot: 'weapon', grade: 'unique' }, batch: { v: 2, items: [{ kind: 'piece', input }], skip: [], twin: [], choice: {}, done: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    await click(byText('.batch button', 'Walk ▸'));
    expect($('.bwalk .bstep')?.textContent).toContain(`${w.name}\u00A0·\u00A0${ref.mains[0]}`);
  });

  it('the form is locked to the batch: in a Speed armor batch weapon slots and other sets are off, hotkeys too', async () => {
    const items = [{ kind: 'piece', input: { slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...WEAK } }];
    await mount({ setId: speed, subs: {} }, { batch: { v: 2, items, skip: [], twin: [], choice: {}, done: [] } });
    const slot = (id: string) => $(`[data-tour="slot"] [data-tour-item="${id}"]`) as HTMLButtonElement;
    expect(['weapon', 'accessory', 'gloves'].map((id) => slot(id).getAttribute('aria-disabled'))).toEqual(['true', 'true', null]);
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); });
    expect(slot('helmet').getAttribute('aria-pressed')).toBe('true');   // «1» (weapon) did nothing
    await click(slot('weapon'));                                        // a tap says why, the slot stays
    expect(slot('helmet').getAttribute('aria-pressed')).toBe('true');
    expect($('.batch-toast')?.textContent).toBe('This batch is Legendary Speed. Anything else — a new batch.');
    // the set is fixed: no ▾, a tap opens nothing
    expect($('[data-tour="pick"]')?.classList.contains('locked')).toBe(true);
    await click($('[data-tour="pick"]'));
    expect($('.drawer .sets')).toBeNull();
  });

  it('the walk: equip at Caren by her slot list (E entry counts), substats as in the game, Breakthrough with the weak one; ✓ is saved', async () => {
    const piece = (x: Record<string, unknown>) => ({ kind: 'piece', input: { slot: 'helmet', grade: 'unique', itemKey: null, main: null, bt: 0, ...x } });
    const items = [{ kind: 'worn', c: caren.id, slot: 'helmet' }, piece(WEAK), piece(GOOD)];
    await mount({ setId: speed, subs: {} }, { batch: { v: 2, items, skip: [], twin: [], choice: {}, done: [] } });
    await click($('.batch-strip .batch-list'));
    await click(byText('.batch button', 'Plan it'));
    // Caren's removed Epic helmet is «Maybe»: the walk waits until it is decided
    expect(byText('.batch button', 'Walk ▸')?.hasAttribute('disabled')).toBe(true);
    await click(byText('.bdecide button', 'Dismantle'));
    expect(batch().choice).toEqual({ '3~1': 'junk' });
    await click(byText('.batch button', 'Walk ▸'));
    const steps = $$('.bwalk .bstep');
    expect(steps.map((s) => s.querySelector('.bstep-t > b')?.textContent)).toEqual([
      'Caren → helmet → No.\u00A03',                           // her slot list: the «E» entry (#1), the weak one (#2), this (#3) — the same as #3: said once
      "Caren's helmet → Breakthrough: up\u00A0to\u00A01",
      'Select in the game: 1',                             // last: nothing meant as feed is dismantled (owner 2026-10-09)
    ]);
    expect(steps[0].textContent).toContain('LV 3 Defense +');
    expect(steps[1].textContent).toContain('feed:SPD\u00A01');                                    // the feed, piece by piece: its stats — no number, armor has no name
    expect($$('.bwalk .bstage > p').map((x) => x.textContent)).toEqual(["Any piece from the game's list works. What the game doesn't take — dismantle."]);   // once, under «Breakthrough»
    expect(steps[2].textContent).toContain('DEF%\u00A03');                    // the taken-off helmet, by its stats (no «#n» at this stage)
    expect(steps[2].textContent).not.toContain('#');
    expect(steps[2].textContent?.endsWith("+ feed the Breakthrough didn't take")).toBe(true);
    expect($('.drawer-h h3')?.textContent).toBe('Walk · 0 of 3');
    // the whole card is the checkbox's label: a tap on the step's text ticks it, a second one unticks it
    await click(steps[0].querySelector('.bstep-t > b'));
    expect(batch().done).toEqual(['eq:3']);
    expect($('.drawer-h h3')?.textContent).toBe('Walk · 1 of 3');
    expect((document.querySelector('.bwalk .bstep input') as HTMLInputElement).checked).toBe(true);
    expect($('.bwalk .bstep input')?.getAttribute('aria-label')).toBe(steps[0].querySelector('.bstep-t > b')?.textContent);
    await click(steps[0].querySelector('.bstep-t > b'));
    expect(batch().done).toEqual([]);
    await click(steps[0].querySelector('.bstep-t > b'));
  });
});
