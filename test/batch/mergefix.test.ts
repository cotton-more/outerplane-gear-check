// Merge review fixes on the batch walk (.x/0160-merge-review REVIEW A1, A2, A3, A5; .x/0165-merge-fixes TEXTS.md): a
// set-aside Breakthrough target is named as set aside; the dismantle step says to unlock locked pieces and lists the
// leftover feed; the Breakthrough and dismantle stages name pieces by stats, no «#n»; the RU plural of «отложенных».
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeCtx, type Ctx } from '@/game/context';
import { IndexContext } from '@/game/data/IndexContext';
import { LangContext, TEXTS, type Lang } from '@/i18n';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { entriesOf, NEW_BATCH, type Batch, type BatchEntry } from '@/features/batch/batch';
import { inputOfPiece, planBatch, type Fate, type Plan } from '@/features/batch/plan';
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
const weak = (id: string, i = 0) => mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1 + (i % 3), EFF: 1 + Math.floor(i / 3), HP: 1 }, 0);
const good = (id: string) => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);

const plan = (ctx: Ctx, st: GearStore, b: Batch): Plan => planBatch(ctx, st, entriesOf(b), new Set(b.skip));
const fate = (p: Plan, id: string): Fate => p.lines.find((l) => l.id === id)!.fate;

// the plan rows and the walk steps as the player reads them: a row's text; a step's title and the lines under it
function screens(lang: Lang, ctx: Ctx, b: Batch, p: Plan, walk: Walk): { plan: string[]; walk: string[][]; notes: string[] } {
  const wrap = (el: ReturnType<typeof createElement>) => {
    return new JSDOM(`<body>${renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS[lang] }, el)))}</body>`).window.document.body;
  };
  const noop = () => {};
  const pl = wrap(createElement(BatchPlan, { ctx, plan: p, choice: {}, undecided: 0, onSkip: noop, onTwin: noop, onChoose: noop, onWalk: noop }));
  const wk = wrap(createElement(BatchWalk, { ctx, batch: b, plan: p, walk, what: '', onTick: noop, onDone: noop }));
  return {
    plan: [...pl.querySelectorAll('.brow')].map((r) => r.textContent ?? ''),
    walk: [...wk.querySelectorAll('.bstep-t')].map((s) => [...s.children].map((c) => c.textContent ?? '')),
    notes: [...wk.querySelectorAll('.bstage > p')].map((x) => x.textContent ?? ''),
  };
}

describe('A1: a Breakthrough target that is a set-aside piece', () => {
  // FA: Caren wears cA; cK (better, same set and grade) is set aside; two weak helmets feed cK
  const make = () => {
    const cA = mk('cA', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, 0);
    const cK = mk('cK', 'helmet', 'Speed', { 'DEF%': 4, CHC: 4, CHD: 3, SPD: 3 }, 0);
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), cA, cK] }, { Caren: ['sG', 'sB', 'cA'] });
    const b = batchOf([piece(weak('w1')), piece(weak('w2', 1))]);
    const p = plan(ctx, st, b);
    return { ctx, b, p, walk: walkOf(b, p) };
  };
  it("the plan feeds the set-aside cK, the walk names it set aside — not «Caren's helmet»", () => {
    const { ctx, b, p, walk } = make();
    expect(fate(p, '1')).toMatchObject({ kind: 'feed', to: { c: { name: 'Caren' }, piece: { id: 'cK' } } });
    expect(fate(p, '2')).toMatchObject({ kind: 'feed', to: { piece: { id: 'cK' } } });
    const bt = walk.steps.filter((s) => s.stage === 3);
    expect(bt).toHaveLength(1);
    expect(bt[0]).toMatchObject({ n: 2, target: { where: { off: { id: 'cK' }, c: { name: 'Caren' }, was: 'stash' } } });
    const en = screens('en', ctx, b, p, walk), ru = screens('ru', ctx, b, p, walk);
    expect(en.walk.find((s) => s[0].includes('Breakthrough'))![0]).toBe("Caren's set-aside helmet (DEF% 4, CHC 4, CHD 3, SPD 3) → Breakthrough: up to 2");
    expect(ru.walk.find((s) => s[0].includes('Breakthrough'))![0]).toBe('Отложенный шлем Caren (DEF% 4, CHC 4, CHD 3, SPD 3) → Breakthrough: до 2');
    expect(en.plan.filter((r) => r.includes('Feed to'))).toHaveLength(2);
    expect(en.plan.every((r) => !r.includes('Feed to') || r.includes("Feed to Caren's set-aside helmet"))).toBe(true);
    expect(ru.plan.every((r) => !r.includes('Корм для') || r.includes('Корм для отложенного шлема Caren'))).toBe(true);
  });
  it("a worn target is still «Caren's helmet», the plan row «Feed to Caren's helmet»", () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), mk('cA', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, 0)] });
    const b = batchOf([piece(weak('w1'))]);
    const p = plan(ctx, st, b);
    const en = screens('en', ctx, b, p, walkOf(b, p));
    expect(en.walk.find((s) => s[0].includes('Breakthrough'))![0]).toBe("Caren's helmet → Breakthrough: up to 1");
    expect(en.plan.some((r) => r.includes("Feed to Caren's helmet"))).toBe(true);
  });
  it('the slot gender in RU: «отложенной брони», «отложенных перчаток», «отложенного оружия»', () => {
    const t = TEXTS.ru.batch;
    expect([t.feedStash('armor', 'Caren'), t.feedStash('gloves', 'Caren'), t.feedStash('weapon', 'Caren'), t.feedStash('helmet', 'Caren')]).toEqual([
      'Корм для отложенной брони Caren', 'Корм для отложенных перчаток Caren', 'Корм для отложенного оружия Caren', 'Корм для отложенного шлема Caren']);
    expect(TEXTS.en.batch.feedStash('helmet', 'Caren')).toBe("Feed to Caren's set-aside helmet");
  });
  it('a target of this batch that is kept — named by its hero and stats, no row and place', () => {
    // a new Legendary helmet set aside for Caren (she wears a better one) is fed by two weak ones
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), mk('cA', 'helmet', 'Speed', { 'DEF%': 4, CHC: 4, CHD: 3, SPD: 3 }, 0)] });
    const b = batchOf([piece(good('g')), piece(weak('w1')), piece(weak('w2', 1))]);
    const p = plan(ctx, st, b);
    const walk = walkOf(b, p);
    const en = screens('en', ctx, b, p, walk);
    const titles = en.walk.map((s) => s[0]).filter((x) => x.includes('→ Breakthrough'));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.join('|')).not.toMatch(/Row \d|no\. \d|#\d/);
    expect(titles.every((x) => /^Caren's (set-aside )?helmet( \(.*\))? → Breakthrough: up to \d$/.test(x))).toBe(true);
  });
});

describe('weapons: the item is named once, by stats', () => {
  const W = (id: string, main: string, lit: Record<string, number>) => mk(id, 'weapon', null, lit, 0, { itemKey: '17', main });
  it('a worn target: a bare caption line (no «это») under the title; the feed lines without «#n»', () => {
    // FC: #2 goes on Roxie, #1 and her taken-off weapon feed it
    const { ctx, st } = world(['Gnosis Domine', 'Roxie'], { 'Gnosis Domine': [], Roxie: [{ ...W('q2', 'ATK%', { CHD: 3, SPD: 5, CHC: 4, HP: 3 }), bt: null }] });
    const b = batchOf([piece(W('a', 'DEF%', { 'ATK%': 1, RES: 1, CHC: 2, SPD: 2 })), piece(W('b', 'ATK%', { CHC: 5, 'DMG UP%': 4, SPD: 6, 'DMG RED%': 2 })), piece(W('c', 'DEF%', { CHC: 1, DEF: 4, EFF: 3, 'HP%': 4 }))]);
    const p = plan(ctx, st, b);
    const bt = screens('ru', ctx, b, p, walkOf(b, p)).walk.find((s) => s[0].includes('→ Breakthrough'))!;
    expect(bt).toEqual(['Оружие Roxie → Breakthrough: до 2', 'Thumping Odyssey · ATK%', 'корм:', 'Thumping Odyssey · DEF% · ATK% 1, RES% 1, CHC 2, SPD 2',
      'Снятое оружие Roxie — Thumping Odyssey · ATK% (CHD 3, SPD 5, CHC 4, HP 3)']);
  });
  it('a set-aside target: the title names hero, item and stats, and there is no separate caption line', () => {
    const { ctx, st } = world(['Roxie'], { Roxie: [W('w1', 'ATK%', { CHD: 3, SPD: 5, CHC: 4, HP: 3 }), W('w2', 'ATK%', { CHD: 4, SPD: 5, CHC: 5, HP: 3 })] }, { Roxie: ['w1'] });
    const b = batchOf([piece(W('a', 'DEF%', { 'ATK%': 1, RES: 1, CHC: 2, SPD: 2 })), piece(W('b', 'ATK%', { CHC: 1, 'DMG UP%': 4, SPD: 1, 'DMG RED%': 2 }))]);
    const p = plan(ctx, st, b);
    const bt = screens('ru', ctx, b, p, walkOf(b, p)).walk.find((s) => s[0].includes('→ Breakthrough'))!;
    expect(bt[0]).toBe('Отложенное оружие Roxie — Thumping Odyssey · ATK% (CHD 4, SPD 5, CHC 5, HP 3) → Breakthrough: до 2');
    expect(bt[1]).toBe('корм:');
  });
});

describe('A2 / A3: the dismantle step', () => {
  // FB: Caren's set-aside weak helmet cR is pushed out by the new helmet that already has four feeds
  const make = () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), weak('cR')] }, { Caren: ['sG', 'sB'] });
    const b = batchOf([piece(good('g')), ...['x1', 'x2', 'x3', 'x4'].map((id, i) => piece(weak(id, i + 3)))]);
    const p = plan(ctx, st, b);
    return { ctx, b, p, walk: walkOf(b, p) };
  };
  it('a set-aside piece in the dismantle is locked: «first unlock 1 set-aside» comes first; the leftover feed line last', () => {
    const { ctx, b, p, walk } = make();
    expect(walk.steps.find((s) => s.stage === 4)).toMatchObject({ unlock: 1, left: true });
    const en = screens('en', ctx, b, p, walk), ru = screens('ru', ctx, b, p, walk);
    const dz = en.walk.find((s) => s[0].startsWith('Select in the game'))!;
    expect(dz.slice(1)).toEqual(['first unlock 1 set-aside', "Caren's set-aside helmet (SPD 1, RES% 1, EFF% 1, HP 1)", "+ feed the Breakthrough didn't take"]);
    expect(ru.walk.find((s) => s[0].startsWith('Отметь в игре'))!.slice(1)).toEqual([
      'сначала сними замок с 1 отложенной', 'Отложенный шлем Caren (SPD 1, RES% 1, EFF% 1, HP 1)', '+ корм, который Breakthrough не взял']);
  });
  it('no Breakthrough step — no «leftover feed» line, and nothing locked — no unlock line', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), mk('eH', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' })] });
    const b = batchOf([piece(mk('j', 'weapon', null, { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0, { grade: 'rare', itemKey: '9950001', main: 'ATK%' }))]);   // an Epic weapon: never fed
    const p = plan(ctx, st, b);
    const walk = walkOf(b, p);
    expect(walk.steps.some((s) => s.stage === 3)).toBe(false);
    const dz = walk.steps.find((s) => s.stage === 4);
    expect(dz).toBeTruthy();
    expect(dz).toMatchObject({ unlock: 0, left: false });
    const en = screens('en', ctx, b, p, walk);
    expect(en.walk.find((s) => s[0].startsWith('Select in the game'))!.join('|')).not.toMatch(/unlock|didn't take/);
    expect(en.notes).toEqual([]);                                                    // no Breakthrough stage — no note
  });
  it('the Breakthrough note is once, under the heading', () => {
    const { ctx, b, p, walk } = make();
    expect(screens('ru', ctx, b, p, walk).notes).toEqual(['Подойдёт любая вещь из списка игры. Что не вошло — в разбор.']);
    expect(screens('en', ctx, b, p, walk).notes).toEqual(["Any piece from the game's list works. What the game doesn't take — dismantle."]);
  });
  it('no «#n» in the Breakthrough feed lines and in the dismantle lines; equip keeps its number', () => {
    const { ctx, b, p, walk } = make();
    const en = screens('en', ctx, b, p, walk);
    const stage = (re: RegExp) => en.walk.filter((s) => re.test(s[0]));
    expect(stage(/→ Breakthrough/).flat().join('\n')).not.toMatch(/#\d/);
    expect(stage(/^Select in the game/).flat().join('\n')).not.toMatch(/#\d/);
    expect(stage(/ → helmet → No\. 1$/)).toHaveLength(1);                     // #1 is also her first helmet: the number once
    const bt = stage(/→ Breakthrough/)[0];
    expect(bt.slice(1, 2)).toEqual(['feed:']);
    expect(bt.slice(2).every((x) => /^[A-Z%]+ \d/.test(x))).toBe(true);   // armor: the substats alone
  });
});

describe('A5: batch.btUnlock RU plural', () => {
  it.each([[1, 'с 1 отложенной'], [2, 'с 2 отложенных'], [5, 'с 5 отложенных'], [11, 'с 11 отложенных'], [21, 'с 21 отложенной'], [22, 'с 22 отложенных']])('%i', (k, want) => {
    expect(TEXTS.ru.batch.btUnlock(k)).toBe(`сначала сними замок ${want}`);
    expect(TEXTS.en.batch.btUnlock(k)).toBe(`first unlock ${k} set-aside`);
  });
});
