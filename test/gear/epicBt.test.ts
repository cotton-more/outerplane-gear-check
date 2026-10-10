// Breakthrough у Epic оружия и аксессуара (MODEL.md §4): «T4» как у Legendary, материал — любой Steel Sword
// (Steel Necklace) с любым main; «не указан» — ниже T4 у любой вещи; снятая Legendary — не материал, «сначала оцени».
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx } from '@/game/context';
import { upgradePlan } from '@/features/eval/verdict/upgrade';
import type { Verdict } from '@/features/eval/verdict/verdict';
import { encodeItem } from '@/features/eval/code/codec';
import { EMPTY_GEAR, updateIn, updatePiece, type GearStore, type Piece } from '@/features/gear/model/gear';
import { poolView, putOn } from '@/features/gear/pool';
import { oldFate } from '@/features/gear/model/material';
import { verdictOf } from '@/features/gear/verdict';
import { fromPersisted, reducer } from '@/app/appState';
import { itemInput } from '@/features/eval/form/formState';
import type { Bt, ItemInput } from '@/game/item/item';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
// вердикт по ростеру {Caren} («статы + сеты», features/gear/verdict)
const mine = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set([caren.id]), ru);

const epic = (slot: 'weapon' | 'accessory', main: string, subs: Record<string, number>, bt?: 0 | 4): ItemInput =>
  ({ slot, grade: 'rare', setId: null, itemKey: null, main, subs, ...(bt !== undefined ? { bt } : {}) });
// у Caren надето одно: эта вещь с таким Breakthrough
const wearing = (item: ItemInput, bt: Bt | null): GearStore => {
  const r = putOn(ctx, EMPTY_GEAR, caren.id, item);
  return updatePiece(r.st, r.id, { bt });
};
const judge = (item: ItemInput, st: GearStore) => verdictOf(mine, poolView(mine, st).hero, item)!;
// Epic оружие Caren по временному правилу: main из её билдов, сабстаты хорошие — годное
const WORN_W = epic('weapon', 'DEF%', { CHC: 2, CHD: 2, SPD: 1 });
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
  // owner 2026-10-09: a weapon or accessory gets a Breakthrough only when it is «Оставить»; an Epic one is a stopgap
  it.each([0, null, 4] as const)('надето годное Epic оружие bt %s, новое с другим main и мусором → junk: стопгап не кормим', (bt) => {
    const r = judge(JUNK_W, wearing(WORN_W, bt));
    expect(r.kind).toBe('junk');
    expect(r.now).toEqual([]);
  });

  it('Legendary из списка героя с нужным main — копия с мусором её корм; с не тем main (стопгап) — нет', () => {
    const ref = caren.builds.flatMap((b) => b.weapons).find((g) => g.mains.length)!;
    const leg = (main: string, subs: Record<string, number>): ItemInput => ({ slot: 'weapon', grade: 'unique', setId: null, itemKey: ref.key, main, subs });
    const junk = { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 };
    const good = { CHC: 3, CHD: 3, SPD: 2, 'ATK%': 1 };
    const r = judge(leg(ref.mains[0], junk), wearing(leg(ref.mains[0], good), 0));
    expect(r.now.map((n) => n.c.name)).toEqual(['Caren']);
    const off = ['ATK%', 'DEF%', 'HP%', 'CHC', 'CHD', 'EFF', 'RES', 'SPD'].find((m) => !ref.mains.includes(m))!;
    expect(judge(leg(ref.mains[0], junk), wearing(leg(off, good), 0)).now).toEqual([]);
  });

  it('4.4 Epic аксессуар не материал для Epic оружия, и наоборот', () => {
    const acc = epic('accessory', 'ATK%', { CHC: 2, CHD: 2, HP: 1 });
    expect(judge(acc, wearing(WORN_W, 0)).now).toEqual([]);
    expect(judge(JUNK_W, wearing(epic('accessory', 'DEF%', { CHC: 2, CHD: 2, SPD: 1 }), 0)).now).toEqual([]);
  });

  it('Legendary оружие не материал для Epic, Epic — не для Legendary', () => {
    const ref = caren.builds[0].weapons[0];
    const leg: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: ref.key, main: ref.mains[0], subs: { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 } };
    expect(judge(leg, wearing(WORN_W, 0)).now).toEqual([]);
    expect(judge(JUNK_W, wearing(leg, 0)).now).toEqual([]);
  });
});

describe('4.3а «не указан» = ниже T4 у любой вещи', () => {
  const helmet = (subs: Record<string, number>, grade: ItemInput['grade']): ItemInput => ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
  it.each([['unique', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, { RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 }], ['rare', { 'DEF%': 3, CHC: 2, SPD: 2 }, { RES: 1, EFF: 1, HP: 1 }]] as const)(
    'шлем %s «не указан» + такой же с мусором → «Фоддер — Breakthrough для шлема Caren»', (grade, worn, junk) => {
      const r = judge(helmet(junk, grade), wearing(helmet(worn, grade), null));
      expect(r.kind).toBe('material');
      expect(r.sub).toBe('now');
      expect(ru.fit.btNow('helmet', 'Caren')).toBe('Фоддер — Breakthrough для шлема Caren');
    });
});

describe('4.5 лучше надетой такой же', () => {
  it('Epic: новое оружие лучше надетого на 1+ очко — «Надень» вместо надетого', () => {
    const r = judge(epic('weapon', 'DEF%', { CHC: 4, CHD: 3, SPD: 2 }), wearing(WORN_W, 0));
    expect(r.kind).toBe('wear');
    expect(r.named[0].replaced?.slot).toBe('weapon');
  });
});

describe('4.5а/4.5в что сказать о снятой с формы', () => {
  const P = (x: Partial<Piece>): Piece => ({ id: 'p', slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', yellow: {}, lit: {}, bt: 0, at: '', ...x });

  it.each([0, 4, null] as const)('снято Epic оружие (bt %s) — строки нет: Epic оружие не кормим', (bt) => {
    expect(oldFate(P({ bt }), P({ main: 'DEF%', bt: 0 }))).toBe(null);
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
  it('Epic оружие и аксессуар «Временно» — Breakthrough не вкладывай (владелец 2026-10-09)', () => {
    expect(upgradePlan(ctx, JUNK_W, temp)).toEqual([ru.plan.enhance, ru.plan.tempNoInvest]);
    expect(upgradePlan(ctx, epic('accessory', 'ATK%', {}), temp)).toEqual([ru.plan.enhance, ru.plan.tempNoInvest]);
  });

  it('броня «Временно» — Breakthrough можно (Q1); Legendary оружие «Временно» — прежняя строка; Epic оружие «Разобрать» — без новой', () => {
    const helmet: ItemInput = { slot: 'helmet', grade: 'rare', setId: speed, itemKey: null, main: null, subs: {} };
    expect(upgradePlan(ctx, helmet, temp)).toEqual([ru.plan.enhance, ru.plan.tempArmor]);
    expect(upgradePlan(ctx, { ...JUNK_W, grade: 'unique', itemKey: '781' }, temp)).toEqual([ru.plan.enhance, ru.plan.tempNoInvest]);
    expect(upgradePlan(ctx, JUNK_W, { v: 'junk' } as Verdict)).toEqual([]);
  });
});

it('4.8 код вещи для чата у Epic оружия на T4 — тот же, что без T4', () => {
  expect(encodeItem({ ...WORN_W, bt: 4 })).toBe(encodeItem({ ...WORN_W, bt: 0 }));
});
