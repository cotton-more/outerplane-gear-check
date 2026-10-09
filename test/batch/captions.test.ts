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

describe('the caption helper', () => {
  it('Epic weapon and accessory: the game\'s name and the main; main unknown — the name alone', () => {
    expect(itemCaption(idx, epicW('ATK%'))).toBe('Steel Sword · ATK%');
    expect(itemCaption(idx, epicA('SPD'))).toBe('Steel Necklace · SPD');
    expect(itemCaption(idx, epicW(null))).toBe('Steel Sword');
  });
  it('Legendary: the item and the main (the main may be missing)', () => {
    expect(itemCaption(idx, legendW('ATK%'))).toBe(`${name17} · ATK%`);
    expect(itemCaption(idx, legendW(null))).toBe(name17);
  });
  it('every place that names a piece uses it: pieceText, pieceLabel, the card row', () => {
    const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
    const en = TEXTS.en;
    expect(pieceText(ctx, epicW('ATK%'))).toBe('Steel Sword · ATK%');
    expect(pieceLabel(en, idx)(epicW('ATK%'))).toBe('Steel Sword · ATK%');
    expect(pieceLabel(en, idx)(legendW('HP%'))).toBe(`${name17} · HP%`);
    expect(pieceLabel(en, idx)(gloves())).toBe('Speed gloves');               // armor in a phrase keeps its set
    const row = new JSDOM(`<body>${renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(LangContext.Provider, { value: en },
      createElement(PieceName, { ctx, p: epicW('ATK%') }))))}</body>`).window.document.body;
    expect(row.querySelector('.gl')?.textContent).toBe('E');                 // the card keeps its chip
    expect([row.querySelector('.pn')?.textContent, row.querySelector('.pm')?.textContent]).toEqual(['Steel Sword', '· ATK%']);
  });
  it('batch caption: a Legendary at T4 says T4; armor is its slot word, «T4» only at T4', () => {
    for (const lang of ['ru', 'en'] as const) {
      const t = TEXTS[lang];
      expect(batchCaption(t, idx, legendW('ATK%', 4))).toBe(`${name17} · ATK% · T4`);
      expect(batchCaption(t, idx, legendW('ATK%', 0))).toBe(`${name17} · ATK%`);
      expect(batchCaption(t, idx, epicW('ATK%', null))).toBe('Steel Sword · ATK%');
    }
    expect([batchCaption(TEXTS.ru, idx, gloves()), batchCaption(TEXTS.ru, idx, gloves(4))]).toEqual(['перчатки', 'перчатки · T4']);
    expect([batchCaption(TEXTS.en, idx, gloves()), batchCaption(TEXTS.en, idx, gloves(4, 'rare'))]).toEqual(['gloves', 'gloves · T4']);
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
