// The texts of the walk's steps (MODEL.md §8 item 7; owner decision 2026-10-10, equip title variant B): the equip title is
// «Hero → caption» with the position in the hero's slot list as a quiet hint on the right; a taken-off piece is named by
// its hero and described once; the lock step carries the position and the piece's caption, then for whom.
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeCtx, type Ctx } from '@/game/context';
import { IndexContext } from '@/game/data/IndexContext';
import { LangContext, TEXTS, type Lang } from '@/i18n';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { entriesOf, NEW_BATCH, type Batch, type BatchEntry } from '@/features/batch/batch';
import { inputOfPiece, planBatch, type Plan } from '@/features/batch/plan';
import { walkOf, type Walk } from '@/features/batch/walk';
import { BatchPlan } from '@/features/batch/ui/BatchPlan';
import { BatchWalk } from '@/features/batch/ui/BatchWalk';
import { char, idx, mk } from '../gear/statSets';

function world(roster: string[], pools: Record<string, Piece[]> = {}, worn?: Record<string, string[]>) {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st: GearStore = { v: 3, seq: 0, pieces: {}, pools: {}, worn: {} };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    const on = worn?.[name] ?? list.map((p) => p.id);
    st.worn![id] = Object.fromEntries(list.filter((p) => on.includes(p.id)).map((p) => [p.slot, p.id])) as Worn;
  }
  st.seq = Object.keys(st.pieces).length;
  return { ctx, st };
}
const piece = (p: Piece): BatchEntry => ({ kind: 'piece', input: inputOfPiece(p) });
const batchOf = (items: BatchEntry[]): Batch => ({ ...NEW_BATCH, items });
const sG = (id = 'sG') => mk(id, 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const sB = (id = 'sB') => mk(id, 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const epicHelm = (id = 'eH') => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' });
const weak = (id: string) => mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0);
const good = (id: string) => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);
const W = (id: string, main: string, lit: Record<string, number>, bt: 0 | 4 | null = 0) => mk(id, 'weapon', null, lit, bt, { itemKey: '17', main });
const plan = (ctx: Ctx, st: GearStore, b: Batch): Plan => planBatch(ctx, st, entriesOf(b), new Set(b.skip));

// the walk steps as the player reads them: title, then the lines under it (caption, for whom, substat column…)
function steps(lang: Lang, ctx: Ctx, b: Batch, p: Plan, walk: Walk = walkOf(b, p)): string[][] {
  const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS[lang] },
    createElement(BatchWalk, { ctx, batch: b, plan: p, walk, what: '', onTick: () => {}, onDone: () => {} }))));
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  return [...body.querySelectorAll('.bstep-t')].map((s) => [...s.children].map((c) => (c.classList.contains('bstep-h') ? c.querySelector('b') : c)?.textContent ?? ''));
}
// the quiet position hint of each step (null: none), and the coloured tail of the title (the caption's class)
function head(lang: Lang, walk: Walk, ctx: Ctx, b: Batch, p: Plan): { hint: string | null; tail: string | null; cls: string | null; line: string }[] {
  const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS[lang] },
    createElement(BatchWalk, { ctx, batch: b, plan: p, walk, what: '', onTick: () => {}, onDone: () => {} }))));
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  return [...body.querySelectorAll('.bstep-h')].map((h) => ({
    hint: h.querySelector('.bstep-no')?.textContent ?? null, tail: h.querySelector('b .gname')?.textContent ?? null,
    cls: h.querySelector('b .gname')?.className ?? null, line: h.textContent ?? '' }));
}
function planRows(lang: Lang, ctx: Ctx, p: Plan): string[] {
  const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS[lang] },
    createElement(BatchPlan, { ctx, plan: p, choice: {}, undecided: 0, onSkip: () => {}, onTwin: () => {}, onChoose: () => {}, onWalk: () => {} }))));
  return [...new JSDOM(`<body>${html}</body>`).window.document.body.querySelectorAll('.bfate, .boff-n')].map((x) => x.textContent ?? '');
}
const NB = ' ';
// the caption's «·» hangs on both neighbours (itemCaption)
const nb = (x: string) => x.replace(/ · /g, `${NB}·${NB}`);

describe('equip title: «Hero → caption», the position as a quiet hint on the right', () => {
  // a step built by hand: the title and the hint do not depend on the verdicts
  const stepOf = (c: string, x: Piece, k: number | null, n = 1) => ({ key: `eq:${x.id}`, stage: 1 as const, c: char(c), slot: x.slot, k, where: { n }, subs: x.lit, input: inputOfPiece(x) });
  const render = (lang: Lang, step: ReturnType<typeof stepOf>) => {
    const { ctx, st } = world([step.c.name]);
    const b = batchOf([]);
    const p = plan(ctx, st, b);
    const walk: Walk = { steps: [step], undecided: 0 };
    return { title: steps(lang, ctx, b, p, walk)[0][0], h: head(lang, walk, ctx, b, p)[0], lines: steps(lang, ctx, b, p, walk)[0] };
  };
  const epicW = (bt: 0 | 4 = 0) => mk('ew', 'weapon', null, { CHC: 3, SPD: 3 }, bt, { grade: 'rare', itemKey: null, main: 'ATK%' });
  it('weapon: «Lambda → Steel Sword · ATK%» in the grade colour, the hint «№ 1» / «No. 1» apart from the title', () => {
    const ru = render('ru', stepOf('Lambda', epicW(), 1)), en = render('en', stepOf('Lambda', epicW(), 1));
    expect(ru.title).toBe(nb('Lambda → Steel Sword · ATK%'));
    expect(ru.h).toMatchObject({ hint: `№${NB}1`, tail: nb('Steel Sword · ATK%'), cls: 'gname epic' });
    expect(en.title).toBe(nb('Lambda → Steel Sword · ATK%'));
    expect(en.h).toMatchObject({ hint: `No.${NB}1`, tail: nb('Steel Sword · ATK%') });
    expect(ru.lines.slice(0, 2)).toEqual([ru.title, expect.stringMatching(/^LV 3 /)]);     // no caption line under the title: it moved into it
  });
  it('a Legendary weapon: the item name, the Legendary colour', () => {
    const r = render('en', stepOf('Lambda', mk('lw', 'weapon', null, { CHC: 3, SPD: 3 }, 0, { itemKey: '17', main: 'DEF%' }), 4));
    expect(r.title).toBe(nb('Lambda → Thumping Odyssey · DEF%'));
    expect(r.h).toMatchObject({ hint: `No.${NB}4`, cls: 'gname legend' });
  });
  it('armor: «Eliza → броня» / «Eliza → armor» — the slot word, no item, hint «№ 3»', () => {
    const a = mk('ea', 'armor', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);
    const ru = render('ru', stepOf('Eliza', a, 3, 9)), en = render('en', stepOf('Eliza', a, 3, 9));
    expect(ru.title).toBe('Eliza → броня');
    expect(ru.h).toMatchObject({ hint: `№${NB}3`, tail: 'броня' });
    expect(en.title).toBe('Eliza → armor');
    expect(en.h.hint).toBe(`No.${NB}3`);
    for (const x of [ru.title, en.title]) expect(x).not.toMatch(/#|в списке|in the list/);
  });
  it('T4: « · T4» ends the caption — a weapon and armor', () => {
    expect(render('ru', stepOf('Lambda', epicW(4), 1)).title).toBe(`Lambda → Steel Sword${NB}·${NB}ATK%${NB}·${NB}T4`);
    expect(render('en', stepOf('Eliza', mk('a4', 'armor', 'Speed', { SPD: 3 }, 4), 2)).title).toBe(`Eliza → armor${NB}·${NB}T4`);
  });
  it('no hint when the piece has no position in the hero\'s list', () => {
    expect(render('en', stepOf('Lambda', epicW(), null)).h.hint).toBeNull();
  });
  it('the title texts: both languages', () => {
    const [ru, en] = [TEXTS.ru.batch, TEXTS.en.batch];
    expect(ru.equipTo('Eliza', 'шлем')).toBe('Eliza → шлем');
    expect(en.equipTo('Eliza', 'helmet')).toBe('Eliza → helmet');
    expect(ru.equipNo(17)).toBe(`№${NB}17`);
    expect(en.equipNo(17)).toBe(`No.${NB}17`);
    expect(ru.lockStep(2, 5, 15)).toBe(`Ряд 2, 5-й${NB}·${NB}#15`);
    expect(en.lockStep(2, 5, 15)).toBe(`Row 2, no.${NB}5${NB}·${NB}#15`);
  });
  it('from a real plan: a helmet that is Caren\'s first helmet — «Caren → helmet» + «No. 1»; the position counts the slot, not the batch', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const b = batchOf([{ kind: 'lock', slot: 'gloves' }, piece(good('g'))]);
    const p = plan(ctx, st, b);
    expect(steps('en', ctx, b, p)[0][0]).toBe('Caren → helmet');
    expect(head('en', walkOf(b, p), ctx, b, p)[0].hint).toBe(`No.${NB}1`);
    expect(head('ru', walkOf(b, p), ctx, b, p)[0].hint).toBe(`№${NB}1`);
  });
});

describe('a piece taken off another hero', () => {
  // Roxie wears a DEF% weapon; the batch's ATK% weapon goes on her, and hers goes to Gnosis Domine
  const make = () => {
    const { ctx, st } = world(['Roxie', 'Gnosis Domine'], { Roxie: [W('w1', 'DEF%', { CHD: 4, SPD: 4, CHC: 4, HP: 4 })], 'Gnosis Domine': [] });
    const b = batchOf([piece(W('a', 'ATK%', { CHD: 5, SPD: 6, CHC: 5, HP: 3 }))]);
    const p = plan(ctx, st, b);
    return { ctx, b, p };
  };
  it('the equip title names it by its hero («Roxie\'s removed weapon»), then the caption line, then the game-format substats — once', () => {
    const { ctx, b, p } = make();
    const en = steps('en', ctx, b, p).find((s) => s[0].startsWith('Gnosis Domine'))!, ru = steps('ru', ctx, b, p).find((s) => s[0].startsWith('Gnosis Domine'))!;
    expect(en.slice(0, 2)).toEqual(["Gnosis Domine → Roxie's removed weapon", nb('Thumping Odyssey · DEF%')]);
    expect(en[2]).toMatch(/^LV 4 Crit DMG \+16\.0%LV 4 Speed/);
    expect(ru.slice(0, 2)).toEqual(['Gnosis Domine → снятое оружие Roxie', nb('Thumping Odyssey · DEF%')]);
    const h = head('en', walkOf(b, p), ctx, b, p).find((x) => x.line.startsWith('Gnosis Domine'))!;
    expect(h.hint).toBeNull();                                        // a piece with no position: no hint
    expect(h.tail).toBeNull();                                        // and no coloured tail: the caption is its own line
    expect(en.join('|')).not.toContain('(');                          // no abbreviated substats in a parenthesis
  });
  it('the plan row carries the item\'s name too', () => {
    const { ctx, p } = make();
    expect(planRows('en', ctx, p).filter((x) => x.includes('removed'))).toEqual([nb("Roxie's removed weapon — Thumping Odyssey · DEF%")]);
    expect(planRows('ru', ctx, p).filter((x) => x.includes('Снятое'))).toEqual([nb('Снятое оружие Roxie — Thumping Odyssey · DEF%')]);
  });
  it('offAt: removed and set aside, by gender in RU', () => {
    const [ru, en] = [TEXTS.ru.batch, TEXTS.en.batch];
    expect([ru.offAt('weapon', 'Tamara', false), ru.offAt('helmet', 'Caren', true), ru.offAt('gloves', 'Caren', false), ru.offAt('armor', 'Caren', true)]).toEqual([
      'снятое оружие Tamara', 'отложенный шлем Caren', 'снятые перчатки Caren', 'отложенная броня Caren']);
    expect([en.offAt('weapon', 'Tamara', false), en.offAt('helmet', 'Caren', true)]).toEqual(["Tamara's removed weapon", "Caren's set-aside helmet"]);
  });
  it('a set-aside weapon target: the hero stays a hero, the item follows the word «weapon» (EN and RU)', () => {
    // Roxie wears w1; w2 (better) is set aside; the batch feeds it
    const { ctx, st } = world(['Roxie'], { Roxie: [W('w1', 'ATK%', { CHD: 3, SPD: 5, CHC: 4, HP: 3 }), W('w2', 'ATK%', { CHD: 4, SPD: 5, CHC: 5, HP: 3 })] }, { Roxie: ['w1'] });
    const b = batchOf([piece(W('a', 'DEF%', { 'ATK%': 1, RES: 1, CHC: 2, SPD: 2 })), piece(W('b', 'ATK%', { CHC: 1, 'DMG UP%': 4, SPD: 1, 'DMG RED%': 2 }))]);
    const p = plan(ctx, st, b);
    expect(steps('en', ctx, b, p).find((s) => s[0].includes('→ Breakthrough'))![0].replace(/\u00A0/g, ' '))
      .toBe("Roxie's set-aside weapon — Thumping Odyssey · ATK% (CHD 4, SPD 5, CHC 5, HP 3) → Breakthrough: up to 2");
    expect(TEXTS.en.batch.offStash('weapon', 'Roxie', 'CHD 4', 'Thumping Odyssey · ATK%')).toBe("Roxie's set-aside weapon — Thumping Odyssey · ATK% (CHD 4)");
    expect(TEXTS.en.batch.off('helmet', 'Caren')).toBe("Caren's removed helmet");          // armor: no caption, as before
    expect(TEXTS.ru.batch.off('weapon', 'Delta', 'Steel Sword · ATK%')).toBe('Снятое оружие Delta — Steel Sword · ATK%');
  });
});

describe('the lock step', () => {
  it('armor: «Ряд 1, 1-й · #1», then for whom — no piece, no number, no caption', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const b = batchOf([piece(weak('w'))]);
    const p = plan(ctx, st, b);
    expect(steps('en', ctx, b, p).find((s) => s[0].startsWith('Row'))!.slice(0, 2)).toEqual([`Row 1, no.${NB}1${NB}·${NB}#1`, `for Caren${NB}·${NB}reserve`]);
    expect(steps('ru', ctx, b, p).find((s) => s[0].startsWith('Ряд'))!.slice(0, 2)).toEqual([`Ряд 1, 1-й${NB}·${NB}#1`, `для Caren${NB}·${NB}запас`]);
  });
  it('a weapon: the caption line sits between the position and for whom', () => {
    const { ctx, st } = world(['Roxie'], { Roxie: [W('w1', 'ATK%', { CHD: 5, SPD: 6, CHC: 5, HP: 3 })] });
    const input = inputOfPiece(W('k', 'ATK%', { CHD: 4, SPD: 4, CHC: 4, HP: 4 }, 4));
    const b = batchOf([{ kind: 'piece', input }]);
    const p = plan(ctx, st, b);
    const walk: Walk = { undecided: 0, steps: [{ key: 'lk:1', stage: 2, where: { n: 1 }, kept: { n: 1, input, c: char('Roxie'), why: 'keep' } },
      { key: 'lk:2', stage: 2, where: { n: 2 }, kept: { n: 2, input, c: null, why: 'maybe' } }] };
    expect(steps('en', ctx, b, p, walk).map((s) => s.slice(0, 3))).toEqual([
      [`Row 1, no.${NB}1${NB}·${NB}#1`, nb('Thumping Odyssey · ATK% · T4'), 'for Roxie'],
      [`Row 1, no.${NB}2${NB}·${NB}#2`, nb('Thumping Odyssey · ATK% · T4'), 'Maybe, set aside']]);
    expect(steps('ru', ctx, b, p, walk)[1].slice(0, 3)).toEqual([`Ряд 1, 2-й${NB}·${NB}#2`, nb('Thumping Odyssey · ATK% · T4'), 'Спорно, отложено']);
  });
  it('the texts: no «Замок:» prefix on a taken-off piece, one «· запас» form', () => {
    expect(TEXTS.ru.batch.lockStepAt('Снятый шлем Caren (SPD 1)')).toBe('Снятый шлем Caren (SPD 1)');
    expect(TEXTS.en.batch.lockStepAt("Caren's removed helmet (SPD 1)")).toBe("Caren's removed helmet (SPD 1)");
    expect([TEXTS.ru.batch.keptFor('Gnosis Domine'), TEXTS.ru.batch.keptReserve('Valentine'), TEXTS.ru.batch.keptMaybe]).toEqual(['для Gnosis Domine', `для Valentine${NB}·${NB}запас`, 'Спорно, отложено']);
    expect([TEXTS.en.batch.keptFor('Gnosis Domine'), TEXTS.en.batch.keptReserve('Valentine'), TEXTS.en.batch.keptMaybe]).toEqual(['for Gnosis Domine', `for Valentine${NB}·${NB}reserve`, 'Maybe, set aside']);
  });
});

describe('the confirm of the walk (TEXTS §6)', () => {
  it('«Не отмечено: k из n шагов» — the noun agrees with the total: 1 of 1, 3 of 11, 5 of 21, 2 of 3', () => {
    const ru = TEXTS.ru.batch.recordUnticked, en = TEXTS.en.batch.recordUnticked;
    expect([ru(1, 1), ru(3, 11), ru(5, 21), ru(2, 3), ru(7, 22)]).toEqual([
      'Не отмечено: 1 из 1 шага.', 'Не отмечено: 3 из 11 шагов.', 'Не отмечено: 5 из 21 шага.', 'Не отмечено: 2 из 3 шагов.', 'Не отмечено: 7 из 22 шагов.']);
    expect([en(1, 1), en(3, 11), en(5, 21)]).toEqual(['Not ticked: 1 of 1 step.', 'Not ticked: 3 of 11 steps.', 'Not ticked: 5 of 21 steps.']);
  });
  it('the other two sentences use participles, like the toast', () => {
    const [ru, en] = [TEXTS.ru.batch, TEXTS.en.batch];
    expect(ru.recordText(1, 8)).toBe('Запишу у героев: надето 1, отложено 8.');
    expect(en.recordText(1, 8)).toBe("I'll record on the heroes: equipped 1, set aside 8.");
    expect(ru.recordUndo).toBe('Сразу после можно «Вернуть» в сообщении.');
    expect(en.recordUndo).toBe('Right after, you can "Undo" in the message.');
    expect(ru.recorded(1, 8)).toBe('Партия записана: надето 1, отложено 8.');
    expect([ru.removed(5), en.removed(5)]).toEqual(['Убрано #5', 'Removed #5']);
  });
});

describe('Help: «Партия» is two items; Breakthrough and dismantle are found by stats', () => {
  for (const lang of ['ru', 'en'] as const) {
    it(lang, () => {
      const items = TEXTS[lang].ui.helpRoutineItems;
      const at = items.findIndex((x) => x.startsWith(lang === 'ru' ? '**Партия**' : '**Batch**'));
      expect(at).toBeGreaterThan(0);
      const walk = items[at + 1];
      expect(walk.startsWith(lang === 'ru' ? '**Обход ▸**' : '**Walk ▸**')).toBe(true);
      expect(walk).toContain(lang === 'ru' ? 'ищи вещи по сабстатам; одинаковых несколько — бери первую' : 'find the pieces by their substats; several identical — take the first');
      expect(walk).not.toMatch(/#18|#9\b/);                       // no batch numbers in the Breakthrough and dismantle examples
      expect(TEXTS[lang].ui.helpVerdicts.some((x) => /до 4|up to 4/.test(x) && /не больше 8|at most 8/.test(x) && /T4/.test(x))).toBe(true);   // Fodder: the reserve caps, T4 = material
    });
  }
});
