// Режим «для героя» (features/tryon/tryon): что хранится, что подставляется на форму и заголовок вердикта — штамп общий,
// а строка после « — » говорит и про других, и про героя (лучший исход по всем его билдам). Предустановки формы по билду
// больше нет (этап 7 stat-sets): старые build и combo из хранилища читаются и отбрасываются.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx } from '@/game/context';
import { EMPTY_GEAR, type GearStore, type Piece } from '@/features/gear/model/gear';
import { poolView, putOn } from '@/features/gear/pool';
import { charVs } from '@/features/gear/model/poolVs';
import { heroNote, heroTarget, heroTitle, restoreTryOn, tryOnPreset } from '@/features/tryon/tryon';
import type { Verdict } from '@/features/eval/verdict/verdict';
import type { ItemInput } from '@/game/item/item';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const armor = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
const NEW = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
const OLD = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });

describe('режим «для героя»: что хранится', () => {
  it('персонаж из данных — режим героя; старые build и combo отброшены', () => {
    expect(restoreTryOn({ charId: caren.id }, idx)).toEqual({ charId: caren.id });
    expect(restoreTryOn({ charId: caren.id, build: 'Pen', combo: '11x4' }, idx)).toEqual({ charId: caren.id });
    expect(restoreTryOn({ charId: caren.id, build: 3 }, idx)).toEqual({ charId: caren.id });
  });

  it.each([
    ['персонажа больше нет', { charId: '999', build: 'Speed' }],
    ['charId не строка', { charId: 5 }],
    ['не объект', 'Caren'],
    ['пусто', null],
  ])('%s — режима героя нет', (_, raw) => {
    expect(restoreTryOn(raw, idx)).toBeNull();
  });

  it('replace — читается строка; не строка или пустая — отброшена, режим героя остаётся', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Speed', replace: 'p7' }, idx)).toEqual({ charId: caren.id, replace: 'p7' });
    expect(restoreTryOn({ charId: caren.id, replace: 7 }, idx)).toEqual({ charId: caren.id });
    expect(restoreTryOn({ charId: caren.id, replace: '' }, idx)).toEqual({ charId: caren.id });
  });

  it('heroTarget: герой; нет режима — null; герой без билдов (в хранилище бывает от старых данных) — null', () => {
    expect(heroTarget(idx, { charId: caren.id })).toEqual({ c: caren });
    expect(heroTarget(idx, null)).toBeNull();
    const none = D.chars.find((c) => !c.builds.length)!;
    expect(heroTarget(idx, { charId: none.id })).toBeNull();
  });
});

describe('режим «для героя»: что встаёт на форму', () => {
  it('слот; у брони — сет «Примерить замену», иначе никакого', () => {
    const helmet = { setId: set('Immunity') } as Piece;
    expect(tryOnPreset('gloves')).toEqual({ slot: 'gloves', setId: null });
    expect(tryOnPreset('helmet', helmet)).toEqual({ slot: 'helmet', setId: set('Immunity') });
  });

  it('оружие — без сета, даже если заменяют вещь с сетом', () => {
    expect(tryOnPreset('weapon', { setId: set('Immunity') } as Piece)).toEqual({ slot: 'weapon', setId: null });
  });
});

// Заголовок и строка под карточкой в режиме героя («статы + сеты»): штамп общий, после « — » — его причина и исход героя
describe('режим «для героя»: заголовок', () => {
  const V = (v: Verdict['v'], title: string) => ({ v, title } as Verdict);
  const worn = (x: ItemInput) => { const r = putOn(ctx, EMPTY_GEAR, caren.id, x); return r.st; };
  const vsOf = (st: GearStore, item: ItemInput) => charVs(ctx, poolView(ctx, st), caren.id, item, { wear: true });

  it('вердикт уже про героя (он первый названный) — заголовок как есть', () => {
    const vs = vsOf(worn(OLD), NEW);
    expect(heroTitle(ru, V('keep', 'Оставляй — лучше, чем на Caren'), caren, vs, caren.id)).toBe('Оставляй — лучше, чем на Caren');
  });

  it('вердикт про другого, герою вещь «Надень» вместо надетой — «…; лучше, чем на Caren»', () => {
    const vs = vsOf(worn(OLD), armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }))!;
    expect(vs.h.kind).toBe('wear');
    expect(heroTitle(ru, V('keep', 'Оставляй — надень на Rin'), caren, vs, 'rin')).toBe('Оставляй — надень на Rin; лучше, чем на Caren');
  });

  it('«Разобрать», а герою она «Надень» в пустой слот — «но у Caren слот пуст: надень, пока нет лучше»', () => {
    const vs = vsOf(EMPTY_GEAR, armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }))!;
    expect(heroTitle(ru, V('junk', 'Разбирай — сабстаты мимо'), caren, vs, null)).toBe('Разбирай — но у Caren слот пуст: надень, пока нет лучше');
  });

  it('герою не лучше — «на Caren уже не хуже»; слабая — «для Caren слабая»; без « — » — через «;»', () => {
    const st = worn(armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }));
    const same = vsOf(st, armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }));
    expect(heroTitle(ru, V('keep', 'Оставляй — надень на Rin'), caren, same, null)).toBe('Оставляй — надень на Rin; на Caren уже не хуже');
    const weak = vsOf(st, armor('helmet', 'Speed', { HP: 1, RES: 1, EFF: 1, ATK: 1 }));
    expect(heroTitle(ru, V('maybe', 'Твоим не подходит, но предмет хороший'), caren, weak, null)).toBe('Твоим не подходит, но предмет хороший; для Caren слабая');
  });

  it('вердикта ещё нет — заголовок как был', () => {
    expect(heroTitle(ru, V('idle', 'Выбери сет'), caren, vsOf(EMPTY_GEAR, NEW), null)).toBe('Выбери сет');
  });
});

describe('режим «для героя»: строка под карточкой', () => {
  const note = (item: ItemInput, st: GearStore = EMPTY_GEAR) => heroNote(ru, ctx, caren, item, charVs(ctx, poolView(ctx, st), caren.id, item, { wear: true }));

  it('сета нет в билдах героя и она ему не «Надень» — «Caren она не нужна: Attack нет в билдах Caren.»', () => {
    const st = putOn(ctx, EMPTY_GEAR, caren.id, armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 })).st;
    expect(note(armor('helmet', 'Attack', { 'DEF%': 1, CHC: 1, HP: 1, RES: 1 }), st)).toBe(ru.tryon.offHero('Caren', 'Attack'));
  });

  it('сета нет в билдах, а по статам ей «Надень» — «подходит по статам, не по билду»', () => {
    expect(note(armor('helmet', 'Attack', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }))).toBe(ru.tryon.offStats('Caren'));
  });

  it('полезных ей статов нет — «ничего не даст»; вещь её сета — строки нет', () => {
    expect(note(armor('helmet', 'Speed', { HP: 1, RES: 1, EFF: 1, ATK: 1 }))).toBe(ru.tryon.noStats('Caren'));
    expect(note(NEW)).toBeNull();
  });

  it('оружие не для её класса — «не носит»', () => {
    const item = D.weapons.find((i) => i.classLimits.length && !i.classLimits.includes(caren.class))!;
    expect(note({ slot: 'weapon', grade: 'unique', setId: null, itemKey: item.key, main: item.mains[0], subs: { CHC: 1 } })).toBe(ru.tryon.noClass('Caren'));
  });
});
