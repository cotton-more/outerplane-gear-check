// Breakthrough у Epic оружия и аксессуара (.x/0060-share-code SPEC 4): «T4» как у Legendary, материал — любой Steel Sword
// (Steel Necklace) с любым main; «не указан» — ниже T4 у любой вещи; снятая Legendary — не материал, «сначала оцени».
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { upgradePlan } from '@/features/eval/verdict/upgrade';
import type { Verdict } from '@/features/eval/verdict/verdict';
import { encodeItem } from '@/features/eval/code/codec';
import { EMPTY_GEAR, updateIn, updatePiece, type GearStore, type Piece } from '@/features/gear/model/gear';
import { poolView, putOn, outcomeFor } from '@/features/gear/pool';
import { betterThanWorn, materialFor, oldFate, withMaterial } from '@/features/gear/model/material';
import { fromPersisted, reducer } from '@/app/appState';
import { itemInput } from '@/features/eval/form/formState';
import type { Bt, ItemInput } from '@/game/item/item';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const MARKS = { [`${caren.id}/Speed`]: 'want' as const };

const epic = (slot: 'weapon' | 'accessory', main: string, subs: Record<string, number>, bt?: 0 | 4): ItemInput =>
  ({ slot, grade: 'rare', setId: null, itemKey: null, main, subs, ...(bt !== undefined ? { bt } : {}) });
// у Caren надето одно: эта вещь с таким Breakthrough
const wearing = (item: ItemInput, bt: Bt | null): GearStore => {
  const r = putOn(ctx, { ...EMPTY_GEAR, marks: MARKS }, caren.id, item);
  return updatePiece(r.st, r.id, { bt });
};
const judge = (item: ItemInput, st: GearStore) => {
  const view = poolView(ctx, st), needs = materialFor(view, item);
  return withMaterial(idx, ru, evaluate(ctx, item), needs, { up: betterThanWorn(ctx, view, item, needs), target: null, t4: item.bt === 4 });
};
// Epic оружие Caren носит в «По статам»: у Speed свой Legendary предмет
const WHO = 'Caren · По статам';
const WORN_W = epic('weapon', 'DEF%', { RES: 1, EFF: 1, HP: 1 });
const JUNK_W = epic('weapon', 'ATK%', { RES: 1, EFF: 1, HP: 1 });

describe('4.1 «T4» на форме у Epic оружия и аксессуара', () => {
  it.each(['weapon', 'accessory'] as const)('%s: T переключает, «Надеть» с нажатой — T4, без неё — T0–T3', (slot) => {
    const s = { ...fromPersisted(null, idx), slot, grade: 'rare' as const, main: 'ATK%' };
    const on = reducer(s, { type: 't4' });
    expect(on.t4).toBe(true);
    expect(itemInput(on).bt).toBe(4);
    expect(itemInput(reducer(on, { type: 't4' })).bt).toBe(0);
  });
});

describe('4.2 шторка надетого Epic оружия', () => {
  it('«T4» переключает T4 ↔ T0–T3, и у старой записи «не указан» тоже', () => {
    const st = wearing(WORN_W, null);
    const id = st.pools[caren.id][0];
    const on = updateIn(idx, st, caren.id, id, { bt: 4 });
    expect(on.st.pieces[on.id].bt).toBe(4);
    expect(updateIn(idx, on.st, caren.id, on.id, { bt: 0 }).st.pieces[on.id].bt).toBe(0);
  });
});

describe('4.3 материал для Epic оружия', () => {
  it.each([[0, 'fodder'], [null, 'fodder'], [4, 'junk']] as const)('надето Epic оружие bt %s, новое с другим main и мусором → %s', (bt, v) => {
    expect(evaluate(ctx, JUNK_W).v).toBe('junk');

    const r = judge(JUNK_W, wearing(WORN_W, bt));

    expect(r.v).toBe(v);
    if (v === 'fodder') expect(r.title).toBe(`Фоддер — материал Breakthrough для оружия ${WHO}`);
  });

  it('4.4 Epic аксессуар не материал для Epic оружия, и наоборот', () => {
    const acc = epic('accessory', 'ATK%', { CHC: 2, CHD: 2 });
    expect(materialFor(poolView(ctx, wearing(WORN_W, 0)), acc)).toEqual([]);
    expect(materialFor(poolView(ctx, wearing(acc, 0)), JUNK_W)).toEqual([]);
  });

  it('Legendary оружие не материал для Epic, Epic — не для Legendary', () => {
    const ref = caren.builds[0].weapons[0];
    const leg: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: ref.key, main: ref.mains[0], subs: { HP: 1 } };
    expect(materialFor(poolView(ctx, wearing(WORN_W, 0)), leg)).toEqual([]);
    expect(materialFor(poolView(ctx, wearing(leg, 0)), JUNK_W)).toEqual([]);
  });
});

describe('4.3а «не указан» = ниже T4 у любой вещи', () => {
  const helmet = (subs: Record<string, number>, grade: ItemInput['grade']): ItemInput => ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
  it.each(['unique', 'rare'] as const)('шлем %s «не указан» + такая же с мусором → «Фоддер — материал для …»', (grade) => {
    const st = wearing(helmet({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, grade), null);
    const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 }, grade);

    const r = judge(junk, st);

    expect(r).toMatchObject({ v: 'fodder' });
    expect(r.lines[0]).toBe(ru.material.line('шлем Caren · Speed'));
  });

  it('в «Сейчас на персонажах» — пометка «ниже T4»: пара отмечена материалом', () => {
    const st = wearing(helmet({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 'unique'), null);
    const o = outcomeFor(ctx, poolView(ctx, st), caren.id, helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 }, 'unique'))!;
    expect(o.rows.find((r) => r.v.name === 'Speed')?.pair?.material).toBe(true);
  });

  it('у Epic оружия «не указан» — тоже пометка', () => {
    const o = outcomeFor(ctx, poolView(ctx, wearing(WORN_W, null)), caren.id, WORN_W)!;
    expect(o.rows.some((r) => r.pair?.material)).toBe(true);
  });
});

describe('4.5 лучше надетой такой же', () => {
  const WEAK_W = WORN_W;
  const BETTER_W = epic('weapon', 'DEF%', { CHC: 2, CHD: 1, HP: 1 });

  it('Epic: новое оружие лучше надетого T0–T3 — «надень её, а старую — ей в Breakthrough»', () => {
    const r = judge(BETTER_W, wearing(WEAK_W, 0));
    expect(r).toMatchObject({ v: 'keep', title: ru.material.titleWear('weapon', WHO) });
    expect(r.plan).toEqual([ru.material.planReplace(WHO)]);
  });

  it('Epic: новое на T4 — «надень её»', () => {
    const r = judge({ ...BETTER_W, bt: 4 }, wearing(WEAK_W, 0));
    expect(r.title).toBe(ru.material.titleWearT4('weapon', WHO));
  });

  // 4.5б: снятая Legendary — не материал (может подойти другому)
  const helmet = (subs: Record<string, number>, grade: ItemInput['grade']): ItemInput => ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
  it('Legendary шлем лучше надетого такого же T0–T3 — «надень её» без хвоста, строка и «Прокачка» — как у новой на T4', () => {
    const r = judge(helmet({ CHC: 1, RES: 1, HP: 1, EFF: 1 }, 'unique'), wearing(helmet({ HP: 1, DEF: 1, ATK: 1, RES: 1 }, 'unique'), 2));

    expect(r).toMatchObject({ v: 'keep', title: 'Оставляй — лучше надетого шлема Caren · Speed: надень её' });
    expect(r.lines[0]).toBe(ru.material.lineWearT4('шлем Caren · Speed — T2, ещё 2 шт. до T4'));
    expect(r.plan).toEqual([ru.material.planWear('Caren · Speed')]);
  });

  it('Epic шлем — по-прежнему «…надень её, а старую — ей в Breakthrough»', () => {
    const r = judge(helmet({ DEF: 1, CHC: 1, HP: 1 }, 'rare'), wearing(helmet({ HP: 1, DEF: 1, ATK: 1 }, 'rare'), 2));
    expect(r.title).toBe('Оставляй — лучше надетого шлема Caren · Speed: надень её, а старую — ей в Breakthrough');
  });

  it('4.5г новая Legendary с мусором при надетой такой же ниже T4 — «Фоддер — материал для …»', () => {
    const r = judge(helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 }, 'unique'), wearing(helmet({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 'unique'), 2));
    expect(r.v).toBe('fodder');
  });
});

describe('4.5а/4.5в что сказать о снятой с формы', () => {
  const P = (x: Partial<Piece>): Piece => ({ id: 'p', slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', yellow: {}, lit: {}, bt: 0, at: '', ...x });

  it.each([0, 4, null] as const)('снято Epic оружие (bt %s), новое без «T4» — материал нового', (bt) => {
    expect(oldFate(P({ bt }), P({ main: 'DEF%', bt: 0 }))).toBe('material');
  });

  it('новое Epic оружие на T4 — строки нет', () => {
    expect(oldFate(P({}), P({ bt: 4 }))).toBe(null);
  });

  it('снят Epic аксессуар при новом оружии — строки нет', () => {
    expect(oldFate(P({ slot: 'accessory' }), P({}))).toBe(null);
  });

  it.each([0, 4] as const)('снята такая же Legendary (bt %s) — «сначала оцени»', (bt) => {
    const leg = { grade: 'unique' as const, itemKey: '781' };
    expect(oldFate(P({ ...leg, bt }), P({ ...leg, bt: 0 }))).toBe('evaluate');
    const arm = { slot: 'armor' as const, grade: 'unique' as const, setId: speed, main: null };
    expect(oldFate(P({ ...arm, bt }), P({ ...arm, bt: 4 }))).toBe('evaluate');
  });

  it('Epic броня того же сета — материал; другого сета или грейда — ничего', () => {
    const arm = { slot: 'armor' as const, setId: speed, main: null };
    expect(oldFate(P(arm), P(arm))).toBe('material');
    expect(oldFate(P(arm), P({ ...arm, setId: '1' }))).toBe(null);
    expect(oldFate(P(arm), P({ ...arm, grade: 'unique' }))).toBe(null);
  });

  it('тексты «сначала оцени»: род по слоту', () => {
    expect(['weapon', 'helmet', 'armor', 'gloves'].map((s) => ru.ui.oldEvaluate(s))).toEqual([
      'Старое оружие — сначала оцени его: может подойти другому герою.',
      'Старый шлем — сначала оцени его: может подойти другому герою.',
      'Старая броня — сначала оцени её: может подойти другому герою.',
      'Старые перчатки — сначала оцени их: может подойти другому герою.',
    ]);
    expect(TEXTS.en.ui.oldEvaluate('weapon')).toBe('Old weapon — evaluate it first: it may suit another hero.');
  });
});

describe('4.6 «Прокачка»', () => {
  const temp = { v: 'temp' } as Verdict;
  it('Epic оружие «Временно» — строка со Steel Sword, аксессуар — со Steel Necklace', () => {
    expect(upgradePlan(ctx, JUNK_W, temp)).toEqual([ru.plan.enhance, ru.plan.btTempEpic('Steel Sword')]);
    expect(upgradePlan(ctx, epic('accessory', 'ATK%', {}), temp)).toEqual([ru.plan.enhance, ru.plan.btTempEpic('Steel Necklace')]);
    expect(ru.plan.btTempEpic('Steel Sword')).toBe('**Breakthrough** — только вещами из разбора: любой Steel Sword с любым main — ступень. Glunite не трать: вещь на замену.');
  });

  it('броня и Legendary «Временно» — прежняя строка; Epic оружие «Разобрать» — без новой', () => {
    const helmet: ItemInput = { slot: 'helmet', grade: 'rare', setId: speed, itemKey: null, main: null, subs: {} };
    expect(upgradePlan(ctx, helmet, temp)).toEqual([ru.plan.enhance, ru.plan.tempNoInvest]);
    expect(upgradePlan(ctx, { ...JUNK_W, grade: 'unique', itemKey: '781' }, temp)).toEqual([ru.plan.enhance, ru.plan.tempNoInvest]);
    expect(upgradePlan(ctx, JUNK_W, { v: 'junk' } as Verdict)).toEqual([]);
  });
});

it('4.8 код вещи для чата у Epic оружия на T4 — тот же, что без T4', () => {
  expect(encodeItem({ ...WORN_W, bt: 4 })).toBe(encodeItem({ ...WORN_W, bt: 0 }));
});
