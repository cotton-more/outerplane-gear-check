// The plan rows and the small texts around them (merge review fixes, MODEL.md §8): a feed row says whose piece
// it is; a recommended Legendary that wins by its passive and loses points shows the cost (owner Q6) — only when it does;
// the summary says «корм»; the look-alike question; the EN date; no-break spaces inside substat tokens.
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
import { BatchPlan, fateText, withWait } from '@/features/batch/ui/BatchPlan';
import { subsText } from '@/game/text';
import { char, idx, mk } from '../gear/statSets';

function world(roster: string[], pools: Record<string, Piece[]> = {}) {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st: GearStore = { v: 3, seq: 0, pieces: {}, pools: {}, worn: {} };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    st.worn![id] = Object.fromEntries(list.map((p) => [p.slot, p.id])) as Worn;
  }
  return { ctx, st };
}
const piece = (p: Piece): BatchEntry => ({ kind: 'piece', input: inputOfPiece(p) });
const batchOf = (items: BatchEntry[]): Batch => ({ ...NEW_BATCH, items });
const plan = (ctx: Ctx, st: GearStore, b: Batch): Plan => planBatch(ctx, st, entriesOf(b), new Set(b.skip));
function render(lang: Lang, ctx: Ctx, p: Plan): { sum: string; rows: string[]; tagged: string[] } {
  const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS[lang] },
    createElement(BatchPlan, { ctx, plan: p, onSkip: () => {}, onTwin: () => {}, onWalk: () => {} }))));
  const body = new JSDOM(`<body>${html}</body>`).window.document.body;
  return {
    sum: body.querySelector('.batch-sum')?.textContent ?? '',
    rows: [...body.querySelectorAll('.bfate')].map((x) => x.textContent ?? ''),
    tagged: [...body.querySelectorAll('.bfate .htag')].map((x) => x.textContent ?? ''),
  };
}

describe('Q6: a recommended Legendary that wins by rank and loses points names the cost', () => {
  // Roxie wears an Epic weapon with strong substats (T4); the batch's Legendary Thumping Odyssey is recommended, its substats are weak
  const make = () => {
    const epic = mk('ew', 'weapon', null, { CHC: 3, CHD: 3, SPD: 3 }, 4, { grade: 'rare', main: 'ATK%' });
    const { ctx, st } = world(['Roxie'], { Roxie: [epic] });
    const b = batchOf([piece(mk('lw', 'weapon', null, { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0, { itemKey: '17', main: 'ATK%' }))]);
    return { ctx, st, p: plan(ctx, st, b) };
  };
  it('the plan row: «… вместо оружия · −6,7 очк., пассивка лучше»', () => {
    const { ctx, p } = make();
    const f = p.lines[0].fate;
    expect(f).toMatchObject({ kind: 'wear', rankUp: true });
    expect((f as Extract<Fate, { kind: 'wear' }>).dV).toBeLessThan(0);
    expect(render('ru', ctx, p).rows[0]).toMatch(/^Надень на Roxie — вместо оружия · −\d+(,\d)? очк\., пассивка лучше$/);
    expect(render('en', ctx, p).rows[0]).toMatch(/^Equip on Roxie — instead of the weapon · −\d+(\.\d)? pts, better passive$/);
  });
  it('the number is the plan\'s dV with one decimal', () => {
    const { ctx, p } = make();
    const dV = (p.lines[0].fate as Extract<Fate, { kind: 'wear' }>).dV;
    const n = Math.round(-dV * 10) / 10;
    expect(render('en', ctx, p).rows[0]).toBe(`Equip on Roxie — instead of the weapon · −${n} pts, better passive`);
    expect(render('ru', ctx, p).rows[0]).toBe(`Надень на Roxie — вместо оружия · −${String(n).replace('.', ',')} очк., пассивка лучше`);
  });
  it('a reserve says what it waits for: the item with the mains the hero\'s builds want; armor — a good piece of its set and slot (owner 2026-10-10, A)', () => {
    const { ctx, p } = make();
    const maxwell = char('Maxwell');
    const ref = maxwell.builds.flatMap((b) => b.amulets)[0];
    const name = idx.ITEM.accessory[ref.key].name;
    const x = { ...p.lines[0].input, slot: 'accessory' as const, itemKey: ref.key, main: 'HP%' };
    const mains = [...new Set(maxwell.builds.flatMap((b) => b.amulets).filter((g) => g.key === ref.key).flatMap((g) => g.mains))];
    expect(fateText(TEXTS.ru, { kind: 'reserve', c: maxwell }, p, ctx, x)).toBe(`Отложи для Maxwell — запас: корм, когда выпадет ${name}\u00A0·\u00A0${mains.join('/')}`);
    expect(fateText(TEXTS.en, { kind: 'reserve', c: maxwell }, p, ctx, x)).toBe(`Set aside for Maxwell — reserve: feed once a ${name}\u00A0·\u00A0${mains.join('/')} drops`);
    // the awaited item in the Legendary colour, the hero still tagged (owner 2026-10-10)
    const text = fateText(TEXTS.ru, { kind: 'reserve', c: maxwell }, p, ctx, x);
    const doc = new JSDOM(`<body>${renderToStaticMarkup(createElement('span', null, withWait(text, maxwell, TEXTS.ru, ctx, x)))}</body>`).window.document;
    expect([doc.querySelector('.gname')?.className, doc.querySelector('.gname')?.textContent, doc.querySelector('.htag')?.textContent])
      .toEqual(['gname legend', `${name}\u00A0·\u00A0${mains.join('/')}`, 'Maxwell']);
    const speed = idx.D.sets.find((s) => s.short === 'Speed')!.id;
    const helm = { ...x, slot: 'helmet' as const, itemKey: null, main: null, setId: speed };
    expect(fateText(TEXTS.ru, { kind: 'reserve', c: maxwell }, p, ctx, helm)).toBe('Отложи для Maxwell — запас: корм, когда выпадет хороший шлем Speed');
    expect(TEXTS.ru.batch.waitArmor('Speed', 'armor')).toBe('хорошая броня Speed');
    expect(TEXTS.en.batch.keptReserve('Caren', 'good Speed helmet')).toBe('for Caren\u00A0·\u00A0reserve: feed once a good Speed helmet drops');
  });
  it('no cost for a tie, a gain, or a loss that rounds to zero; the T4 suffix still follows', () => {
    const { ctx, p } = make();
    const base = p.lines[0].fate as Extract<Fate, { kind: 'wear' }>;
    const row = (lang: Lang, o: Partial<typeof base>) => fateText(TEXTS[lang], { ...base, ...o }, p, ctx, p.lines[0].input);
    expect(row('ru', { dV: 0 })).toBe('Надень на Roxie — вместо оружия');
    expect(row('ru', { dV: 2.4 })).toBe('Надень на Roxie — вместо оружия');
    expect(row('en', { dV: -0.03 })).toBe('Equip on Roxie — instead of the weapon');
    expect(row('en', { dV: -4.9, rankUp: false })).toBe('Equip on Roxie — instead of the weapon');   // not a passive swap: nothing to explain
    expect(row('ru', { dV: -4.9, t4: true })).toBe('Надень на Roxie — вместо оружия · −4,9 очк., пассивка лучше · T4 после корма');
    expect(row('en', { dV: -4.9 })).toBe('Equip on Roxie — instead of the weapon · −4.9 pts, better passive');
  });
});

describe('«Корм для #n» says whose piece it is', () => {
  // the weak Legendary helmet feeds the good one that goes on Caren
  const make = () => {
    const sG = mk('sG', 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const sB = mk('sB', 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const eH = mk('eH', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' });
    const { ctx, st } = world(['Caren'], { Caren: [sG, sB, eH] });
    const b = batchOf([piece(mk('w', 'helmet', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0)), piece(mk('g', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0))]);
    return { ctx, p: plan(ctx, st, b) };
  };
  it('«Feed to #2 · Caren\'s helmet», the hero tagged; RU «Корм для #2 · шлем Caren»', () => {
    const { ctx, p } = make();
    expect(render('en', ctx, p).rows[0]).toBe("Feed to #2 · Caren's helmet");
    expect(render('ru', ctx, p).rows[0]).toBe('Корм для #2 · шлем Caren');
    expect(render('en', ctx, p).tagged).toContain('Caren');
  });
  it('the texts, and the fallback when the target has no hero', () => {
    expect(TEXTS.ru.batch.feedEntry(17, 'gloves', 'Saeran')).toBe('Корм для #17 · перчатки Saeran');
    expect(TEXTS.en.batch.feedEntry(17, 'gloves', 'Saeran')).toBe("Feed to #17 · Saeran's gloves");
    expect([TEXTS.ru.batch.feedEntry(17, null, null), TEXTS.en.batch.feedEntry(17, null, null)]).toEqual(['Корм для #17', 'Feed to #17']);
  });
});

describe('small plan texts', () => {
  it('the summary says «корм» / "feed", not Breakthrough', () => {
    expect(TEXTS.ru.batch.summary(1, 8, 4, 7)).toBe('надеть 1 · отложить 8 · корм 4 · разобрать 7');
    expect(TEXTS.en.batch.summary(1, 8, 4, 7)).toBe('equip 1 · set aside 8 · feed 4 · dismantle 7');
  });
  it('no «Спорно» in the batch: no «Реши до обхода», no «Отложить / Разобрать» chips (owner 2026-10-10)', () => {
    for (const k of ['decide', 'keepIt', 'junkIt', 'walkOff', 'maybe', 'keptMaybe']) expect(k in TEXTS.ru.batch || k in TEXTS.en.batch).toBe(false);
  });
  it('the look-alike of a set-aside piece is a question, the gender follows the slot', () => {
    const [ru, en] = [TEXTS.ru.batch, TEXTS.en.batch];
    expect(ru.same('gloves', 'Hilde', '05.10')).toBe('Как отложенные для Hilde (05.10)? Тогда ничего не делай.');
    expect(ru.same('helmet', 'Hilde', '05.10')).toBe('Как отложенный для Hilde (05.10)? Тогда ничего не делай.');
    expect(ru.same('helmet', 'Hilde', '')).toBe('Как отложенный для Hilde? Тогда ничего не делай.');
    expect(en.same('helmet', 'Hilde', 'Oct 5')).toBe("Same as Hilde's set-aside (Oct 5)? Then do nothing.");
  });
  it('the EN date is a month and a day («Oct 5»), the RU one stays DD.MM; the date sits in parentheses in EN verdict lines', () => {
    expect(TEXTS.en.fit.date('2026-10-05')).toBe('Oct 5');
    expect(TEXTS.en.fit.date('2026-12-31')).toBe('Dec 31');
    expect(TEXTS.en.fit.date('')).toBe('');
    expect(TEXTS.ru.fit.date('2026-10-05')).toBe('05.10');
    expect(TEXTS.en.fit.same('helmet', 'Speed helmet', 'Hilde', 'Oct 5')).toBe('Looks like the Speed helmet set aside for Hilde (Oct 5). If it is — do nothing.');
    expect(TEXTS.en.fit.stashedOne('helmet', 'Speed helmet', 'SPD 1', 'Oct 5')).toBe("It's the Speed helmet · SPD 1, set aside (Oct 5).");
  });
  it('a substat token has a no-break space inside: «DMG RED% 1» never wraps between its parts', () => {
    const NB = ' ';
    expect(subsText({ 'DMG RED%': 1, EFF: 2, SPD: 3 })).toBe(`DMG${NB}RED%${NB}1, EFF%${NB}2, SPD${NB}3`);
    expect(subsText({ 'DMG UP%': 3 }).split(', ').every((tok) => !tok.includes(' '))).toBe(true);
  });
});
