// One caption rule everywhere a piece is named (.x/0165-merge-fixes TEXTS.md §12, owner Q4): a Legendary weapon or
// accessory «item · main», an Epic one «Steel Sword · ATK%» (the game's name, EPIC_NAME), armor in a batch — its slot word.
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import { IndexContext } from '@/game/data/IndexContext';
import { LangContext, TEXTS } from '@/i18n';
import type { BatchEntry } from '@/features/batch/batch';
import { BatchList } from '@/features/batch/ui/BatchList';
import { batchCaption, itemCaption, pieceLabel, pieceText, PieceName } from '@/features/gear/ui/pieceText';
import { inputOfPiece } from '@/features/batch/plan';
import { idx, mk } from '../gear/statSets';

const subs = { SPD: 2, CHC: 2, CHD: 1, 'DMG UP%': 1 };
const legendW = (main: string | null, bt: 0 | 4 | null = 0) => mk('lw', 'weapon', null, subs, bt, { itemKey: '17', main });
const epicSubs = { CHC: 1, CHD: 1, HP: 1 };
const epicW = (main: string | null, bt: 0 | 4 | null = 0) => mk('ew', 'weapon', null, epicSubs, bt, { grade: 'rare', itemKey: null, main });
const epicA = (main: string | null) => mk('ea', 'accessory', null, epicSubs, 0, { grade: 'rare', itemKey: null, main });
const gloves = (bt: 0 | 4 = 0, grade: 'unique' | 'rare' = 'unique') => mk('g', 'gloves', 'Speed', grade === 'rare' ? { 'DEF%': 2, CHC: 2, CHD: 1 } : { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, bt, { grade });
const name17 = idx.ITEM.weapon['17'].name;
// the caption's «·» hangs on both neighbours with no-break spaces (itemCaption)
const nb = (x: string) => x.replace(/ · /g, ' · ');

describe('the caption helper', () => {
  it('Epic weapon and accessory: the game\'s name and the main; main unknown — the name alone', () => {
    expect(itemCaption(idx, epicW('ATK%'))).toBe(nb('Steel Sword · ATK%'));
    expect(itemCaption(idx, epicA('SPD'))).toBe(nb('Steel Necklace · SPD'));
    expect(itemCaption(idx, epicW(null))).toBe('Steel Sword');
  });
  it('Legendary: the item and the main (the main may be missing)', () => {
    expect(itemCaption(idx, legendW('ATK%'))).toBe(nb(`${name17} · ATK%`));
    expect(itemCaption(idx, legendW(null))).toBe(name17);
  });
  it('every place that names a piece uses it: pieceText, pieceLabel, the card row', () => {
    const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
    const en = TEXTS.en;
    expect(pieceText(ctx, epicW('ATK%'))).toBe(nb('Steel Sword · ATK%'));
    expect(pieceLabel(en, idx)(epicW('ATK%'))).toBe(nb('Steel Sword · ATK%'));
    expect(pieceLabel(en, idx)(legendW('HP%'))).toBe(nb(`${name17} · HP%`));
    expect(pieceLabel(en, idx)(gloves())).toBe('Speed gloves');               // armor in a phrase keeps its set
    const row = new JSDOM(`<body>${renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: en },
      createElement(PieceName, { ctx, p: epicW('ATK%') }))))}</body>`).window.document.body;
    expect(row.querySelector('.gl')?.textContent).toBe('E');                 // the card keeps its chip
    expect([row.querySelector('.pn')?.textContent, row.querySelector('.pm')?.textContent]).toEqual(['Steel Sword', '· ATK%']);
  });
  it('batch caption: a Legendary at T4 says T4; armor is its slot word, «T4» only at T4', () => {
    for (const lang of ['ru', 'en'] as const) {
      const t = TEXTS[lang];
      expect(batchCaption(t, idx, legendW('ATK%', 4))).toBe(nb(`${name17} · ATK% · T4`));
      expect(batchCaption(t, idx, legendW('ATK%', 0))).toBe(nb(`${name17} · ATK%`));
      expect(batchCaption(t, idx, epicW('ATK%', null))).toBe(nb('Steel Sword · ATK%'));
    }
    expect([batchCaption(TEXTS.ru, idx, gloves()), batchCaption(TEXTS.ru, idx, gloves(4))]).toEqual(['перчатки', nb('перчатки · T4')]);
    expect([batchCaption(TEXTS.en, idx, gloves()), batchCaption(TEXTS.en, idx, gloves(4, 'rare'))]).toEqual(['gloves', nb('gloves · T4')]);
  });
});

describe('batch rows', () => {
  const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
  const rows = (...ps: ReturnType<typeof mk>[]) => {
    const items: BatchEntry[] = ps.map((p) => ({ kind: 'piece', input: inputOfPiece(p) }));
    const noop = () => {};
    const body = new JSDOM(`<body>${renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: TEXTS.en },
      createElement(BatchList, { ctx, items, editing: null, wornOf: () => null, onFix: noop, onRemove: noop, onPlan: noop }))))}</body>`).window.document.body;
    return [...body.querySelectorAll('.brow')];
  };
  it('no grade chip, no set, no T0–T3; the caption is in the grade\'s colour; T4 only at T4', () => {
    const [ew, lw, g0, g4] = rows(epicW('ATK%'), legendW('HP%', 4), gloves(0), gloves(4, 'rare'));
    expect([ew, lw, g0, g4].map((r) => r.querySelector('.gl'))).toEqual([null, null, null, null]);
    expect([ew, lw, g0, g4].map((r) => r.querySelector('.bgear-n')?.textContent)).toEqual([
      '#1Steel Sword· ATK%', `#2${name17}· HP%`, '#3gloves', '#4gloves']);
    expect(ew.querySelector('.pn.gname.epic')?.textContent).toBe('Steel Sword');
    expect(ew.querySelector('.pm.gname.epic')).toBeTruthy();
    expect(lw.querySelector('.pn.gname.legend')?.textContent).toBe(name17);
    expect(g0.querySelector('.pn.gname.legend')?.textContent).toBe('gloves');
    expect(g4.querySelector('.pn.gname.epic')?.textContent).toBe('gloves');
    expect([ew, lw, g0, g4].map((r) => r.querySelector('.bgear-m')?.textContent ?? null)).toEqual([null, 'T4', null, 'T4']);
  });
});

describe('the batch\'s kind in titles and notes (TEXTS §5, §9)', () => {
  const set = { set: 'Speed' };
  it.each([
    ['Epic Speed armor', set, 'rare', 'Epic Speed', 'Epic Speed'],
    ['Legendary Swiftness armor', { set: 'Swiftness' }, 'unique', 'Legendary Swiftness', 'Legendary Swiftness'],
    ['Legendary weapons', 'weapon', 'unique', 'Legendary оружие', 'Legendary weapons'],
    ['Epic accessories', 'accessory', 'rare', 'Epic аксессуары', 'Epic accessories'],
    ['no grade yet', set, null, 'Speed', 'Speed'],
    ['nothing known', null, null, '', ''],
  ] as const)('%s', (_name, kind, grade, ru, en) => {
    expect([TEXTS.ru.batch.what(kind, grade), TEXTS.en.batch.what(kind, grade)]).toEqual([ru, en]);
  });
  it('list title, plan title, walk note and the notes use it', () => {
    const [ru, en] = [TEXTS.ru.batch, TEXTS.en.batch];
    expect([ru.listTitle(20, 'Epic Speed'), ru.listTitle(8, 'Legendary оружие'), ru.listTitle(2, '')]).toEqual(['Партия · 20 · Epic Speed', 'Партия · 8 · Legendary оружие', 'Партия · 2']);
    expect([en.listTitle(20, 'Epic Speed'), en.listTitle(8, 'Legendary weapons'), en.listTitle(2, '')]).toEqual(['Batch · 20 · Epic Speed', 'Batch · 8 · Legendary weapons', 'Batch · 2']);
    expect([ru.title('Epic Speed'), ru.title(''), en.title('Epic Speed'), en.title('')]).toEqual(['План партии · Epic Speed', 'План партии', 'Batch plan · Epic Speed', 'Batch plan']);
    expect(ru.walkNote('Epic Speed')).toBe('Фильтр в игре: Epic Speed · надетые показывать · по дате. Сабстаты не те — исправь партию.');
    expect(en.walkNote('Epic Speed')).toBe('Game filter: Epic Speed · worn shown · by date. Substats differ — fix the batch.');
    expect(ru.walkNote('')).toBe('Сабстаты не те — исправь партию.');
    expect(ru.otherKind('Legendary Speed')).toBe('В этой партии — Legendary Speed. Другое — новой партией.');
    expect(en.otherKind('Legendary Speed')).toBe('This batch is Legendary Speed. Anything else — a new batch.');
    expect(ru.whoseNone('Epic оружие')).toBe('Никто из твоих героев не носит здесь Epic оружие.');
    expect(en.whoseNone('Epic weapons')).toBe('None of your heroes wears Epic weapons here.');
  });
});
