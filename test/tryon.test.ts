// Примерка (logic/tryon): что хранится, что подставляется на форму и заголовок вердикта — штамп общий, а строка
// после « — » говорит и про других, и про того, для кого примеряем.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { buildKey, EMPTY_GEAR, equip, updatePiece } from '../src/logic/gear';
import { restoreTryOn, tryOnPreset, tryOnTarget, tryOnTitle } from '../src/logic/tryon';
import type { ItemInput } from '../src/logic/verdict';
import { compareFor } from '../src/logic/vs';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const build = (name: string) => caren.builds.find((b) => b.name === name)!;
const armor = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
const NEW = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
const OLD = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });

describe('примерка: что хранится', () => {
  it('персонаж и билд из данных — примерка есть', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Pen' }, idx)).toEqual({ charId: caren.id, build: 'Pen' });
  });

  it.each([
    ['билда больше нет', { charId: caren.id, build: 'Old' }],
    ['персонажа больше нет', { charId: '999', build: 'Speed' }],
    ['не объект', 'Caren'],
    ['пусто', null],
  ])('%s — примерки нет', (_, raw) => {
    expect(restoreTryOn(raw, idx)).toBeNull();
  });

  it('цель — персонаж и его билд', () => {
    expect(tryOnTarget(idx, { charId: caren.id, build: 'Pen' })).toMatchObject({ c: { name: 'Caren' }, b: { name: 'Pen' } });
    expect(tryOnTarget(idx, null)).toBeNull();
  });
});

describe('примерка: что встаёт на форму', () => {
  it('пустой слот брони — сет билда', () => {
    expect(tryOnPreset(EMPTY_GEAR, buildKey(caren.id, 'Speed'), build('Speed'), 'gloves')).toEqual({ slot: 'gloves', setId: set('Speed') });
  });

  it('2+2: сет, которого не хватает, — в связке уже два Speed, значит Immunity', () => {
    const key = buildKey(caren.id, 'Speed/Immu');
    let st = equip(EMPTY_GEAR, key, armor('helmet', 'Speed', { CHC: 1 })).store;
    st = equip(st, key, armor('armor', 'Speed', { CHC: 1 })).store;
    expect(tryOnPreset(st, key, build('Speed/Immu'), 'gloves').setId).toBe(set('Immunity'));
  });

  it('«Примерить замену» — сет надетой; оружие — без сета', () => {
    const r = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed/Immu'), armor('helmet', 'Immunity', { CHC: 1 }));
    expect(tryOnPreset(r.store, buildKey(caren.id, 'Speed/Immu'), build('Speed/Immu'), 'helmet', r.piece).setId).toBe(set('Immunity'));
    expect(tryOnPreset(EMPTY_GEAR, buildKey(caren.id, 'Speed'), build('Speed'), 'weapon')).toEqual({ slot: 'weapon', setId: null });
  });
});

describe('примерка: заголовок вердикта', () => {
  const on = (item: ItemInput, wornLit?: Record<string, number>) => {
    const r = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), OLD);
    const st = wornLit ? updatePiece(r.store, r.piece.id, { lit: wornLit, bt: 4 }) : EMPTY_GEAR;
    const res = evaluate(ctx, item, { gamble: false });
    return { res, title: tryOnTitle(ru, res, compareFor(ctx, st, caren, build('Speed'), item)) };
  };

  it('«Оставить», ей лучше: слово вердикта то же, дальше — кому ещё нужна и «лучше, чем на Caren»', () => {
    const { res, title } = on(NEW, { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 });
    expect(res.v).toBe('keep');
    expect(title).toMatch(/^Оставляй — нужна .+; лучше, чем на Caren$/);
    expect(title).not.toMatch(/нужна[^;]*Caren/);
  });

  it('на ней уже лучше — «на Caren уже лучше»', () => {
    const { title } = on(NEW, { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 });
    expect(title).toMatch(/; на Caren уже лучше$/);
  });

  it('слот пуст — «у Caren слот пуст»', () => {
    expect(on(NEW).title).toMatch(/; у Caren слот пуст$/);
  });

  it('не её сет — «Caren · Speed — не по билду»', () => {
    const { title } = on(armor('helmet', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 }));
    expect(title).toMatch(/Caren · Speed — не по билду$/);
  });

  it('«Разобрать», а ей слот пуст — «но у Caren слот пуст: надень, пока нет лучше»', () => {
    const junk = armor('helmet', 'Speed', { HP: 1, 'DMG RED%': 1, RES: 1, EFF: 1 });
    const { res, title } = on(junk);
    expect(res.v === 'junk' || res.v === 'fodder').toBe(true);
    expect(title).toBe(`${res.title.split(' — ')[0]} — но у Caren слот пуст: надень, пока нет лучше`);
  });

  it('«Разобрать», а на ней лучше — причина вердикта остаётся, к ней — про неё', () => {
    const junk = armor('helmet', 'Speed', { HP: 1, 'DMG RED%': 1, RES: 1, EFF: 1 });
    const { res, title } = on(junk, { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 });
    expect(title).toBe(`${res.title}; на Caren уже лучше`);
  });

  it('вердикта ещё нет — заголовок как был', () => {
    const res = evaluate(ctx, { ...NEW, subs: {} }, { gamble: false });
    expect(res.v).toBe('idle');
    expect(tryOnTitle(ru, res, compareFor(ctx, EMPTY_GEAR, caren, build('Speed'), NEW))).toBe(res.title);
  });
});
