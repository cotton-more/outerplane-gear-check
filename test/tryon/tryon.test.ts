// Режим «для героя» (features/tryon/tryon, пул GEARPOOL; прежде — примерка билда): что хранится, какой вариант предустановки,
// что подставляется на форму и заголовок вердикта — штамп общий, а строка после « — » говорит и про других, и про
// героя (лучший исход по всем его билдам). Шаг 10: tryOnTarget/tryOnTitle/targetName удалены — те же случаи через
// heroTarget/heroTitle; случаи «не по билду» (цель — один вариант) ушли вместе с примеркой билда (В10)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx, type Ctx } from '@/game/context';
import { EMPTY_GEAR, type GearStore } from '@/features/gear/model/gear';
import { isStats, poolView, putOn, STATS } from '@/features/gear/pool';
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
const all = (items: ItemInput[], c: Ctx = ctx) => items.reduce<GearStore>((s, x) => putOn(c, s, caren.id, x).st, EMPTY_GEAR);
// герой с предустановкой билда (вариант — для формы)
const target = (build: string, st: GearStore = EMPTY_GEAR, combo?: string) => heroTarget(idx, { charId: caren.id, build, ...(combo ? { combo } : {}) }, poolView(ctx, st))!;

describe('примерка: что хранится', () => {
  it('персонаж и билд из данных — примерка есть; связка варианта — тоже', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Pen' }, idx)).toEqual({ charId: caren.id, build: 'Pen' });
    expect(restoreTryOn({ charId: caren.id, build: 'Pen', combo: '11x4' }, idx)).toEqual({ charId: caren.id, build: 'Pen', combo: '11x4' });
  });

  // шаг 6 (В10): билда больше нет — режим героя без предустановки, а не «примерки нет»
  it('билда больше нет — режим героя без предустановки: build и combo отброшены', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Old', combo: '11x4' }, idx)).toEqual({ charId: caren.id });
  });

  it.each([
    ['персонажа больше нет', { charId: '999', build: 'Speed' }],
    ['charId не строка', { charId: 5 }],
    ['не объект', 'Caren'],
    ['пусто', null],
  ])('%s — режима героя нет', (_, raw) => {
    expect(restoreTryOn(raw, idx)).toBeNull();
  });

  it('цель — персонаж и вариант предустановки', () => {
    expect(target('Pen')).toMatchObject({ c: { name: 'Caren' }, v: { key: `${caren.id}/Pen`, parent: { name: 'Pen' } } });
    expect(heroTarget(idx, null)).toBeNull();
  });

  // шаг 10: героя без билдов не с чем сравнивать — режима героя нет (в хранилище бывает от старых данных)
  it('герой без билдов — режима героя нет', () => {
    const none = D.chars.find((c) => !c.builds.length)!;
    expect(heroTarget(idx, { charId: none.id })).toBeNull();
  });

  it('билд с несколькими связками: combo — тот вариант; нет или устарел — самый собранный, при равенстве первый', () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const tg = (combo?: string, st: GearStore = EMPTY_GEAR) => heroTarget(idx, { charId: anarky.id, build: 'Defense mix', ...(combo ? { combo } : {}) }, poolView(ctx, st))!.v!.name;
    expect(tg()).toBe('Defense mix · Penetration');
    expect(tg('2x2+19x2')).toBe('Defense mix · Swiftness');
    expect(tg('9x9')).toBe('Defense mix · Penetration');
    const immu = putOn(ctx, EMPTY_GEAR, anarky.id, armor('helmet', 'Immunity', { CHC: 1 })).st;
    expect(tg(undefined, immu)).toBe('Defense mix · Immunity');
  });
});

describe('примерка: что встаёт на форму', () => {
  it('пустой слот брони — сет варианта', () => {
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), target('Speed'), 'gloves')).toEqual({ slot: 'gloves', setId: set('Speed') });
  });

  it('2+2: сет, которого не хватает, — в сборке уже два Speed, значит Immunity', () => {
    const st = all([armor('helmet', 'Speed', { CHC: 1 }), armor('armor', 'Speed', { CHC: 1 })]);
    expect(tryOnPreset(poolView(ctx, st), target('Speed/Immu', st), 'gloves').setId).toBe(set('Immunity'));
  });

  it('«Примерить замену» — сет той вещи; оружие — без сета', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('helmet', 'Immunity', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), target('Speed/Immu', r.st), 'helmet', r.piece).setId).toBe(set('Immunity'));
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), target('Speed'), 'weapon')).toEqual({ slot: 'weapon', setId: null });
  });

  it('«Примерить замену» у вещи не из связки (Defense в Speed) — сет варианта, а не её', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('shoes', 'Defense', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), target('Speed', r.st), 'shoes', r.piece).setId).toBe(set('Speed'));
  });
});

describe('примерка «По статам»', () => {
  const stats = (st: GearStore = EMPTY_GEAR) => heroTarget(idx, { charId: caren.id, build: STATS }, poolView(ctx, st))!;

  it('восстанавливается из хранилища; вариант предустановки — «По статам»', () => {
    const t = restoreTryOn({ charId: caren.id, build: STATS }, idx);
    expect(t).toEqual({ charId: caren.id, build: STATS });
    expect(isStats(stats().v!)).toBe(true);
  });

  // шаг 6 (В10): у героя без билдов «По статам» нет — режим героя без предустановки
  it('у персонажа без билдов «По статам» нет — режим героя без предустановки', () => {
    const none = D.chars.find((c) => !c.builds.length)!;
    expect(restoreTryOn({ charId: none.id, build: STATS }, idx)).toEqual({ charId: none.id });
  });

  it('на форму: слот; у брони — сет той вещи или никакого (связки нет)', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('helmet', 'Immunity', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), stats(r.st), 'helmet', r.piece)).toEqual({ slot: 'helmet', setId: set('Immunity') });
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), stats(), 'gloves')).toEqual({ slot: 'gloves', setId: null });
  });
});

// Шаг 6 «Оценка — единственный ввод»: режим «для героя» (В7, В10) — цель герой, а не билд; build и combo — только
// предустановка формы; replace — запись из «Примерить замену»
describe('режим «для героя»: что хранится', () => {
  it('без build — режим героя', () => {
    expect(restoreTryOn({ charId: caren.id }, idx)).toEqual({ charId: caren.id });
  });

  it('старый { charId, build, combo } — режим героя с предустановкой', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Pen', combo: '11x4' }, idx)).toEqual({ charId: caren.id, build: 'Pen', combo: '11x4' });
  });

  it('replace — читается строка; не строка или пустая — отброшена, режим героя остаётся', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Speed', replace: 'p7' }, idx)).toEqual({ charId: caren.id, build: 'Speed', replace: 'p7' });
    expect(restoreTryOn({ charId: caren.id, replace: 7 }, idx)).toEqual({ charId: caren.id });
    expect(restoreTryOn({ charId: caren.id, replace: '' }, idx)).toEqual({ charId: caren.id });
  });

  it('build не строка — режим героя без предустановки', () => {
    expect(restoreTryOn({ charId: caren.id, build: 3, combo: '11x4' }, idx)).toEqual({ charId: caren.id });
  });

  it('heroTarget: с build — герой и вариант предустановки; без build — только герой; нет режима — null', () => {
    expect(heroTarget(idx, { charId: caren.id, build: 'Pen' })).toMatchObject({ c: { name: 'Caren' }, v: { key: `${caren.id}/Pen` } });
    expect(heroTarget(idx, { charId: caren.id })).toEqual({ c: caren });
    expect(heroTarget(idx, { charId: caren.id, build: 'Old' })).toEqual({ c: caren });
    expect(heroTarget(idx, null)).toBeNull();
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
