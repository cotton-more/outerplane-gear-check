// Материал Breakthrough для вещи персонажа (logic/material, пул): «Разобрать» → «Фоддер», у «Фоддер» — для чего он.
// Пример из хендоффа: Legendary Speed-шлем RES% / EFF% / HP / DMG RED% при надетом на Caren · Speed шлеме на T2.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { EMPTY_GEAR, updatePiece, type Bt, type GearStore } from '../src/logic/gear';
import { poolView, putOn } from '../src/logic/pool';
import { betterThanWorn, materialFor, withMaterial } from '../src/logic/material';
import type { ItemInput } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
const WORN = helmet({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
// у Caren (Speed «Собираю») одна вещь — эта, с таким Breakthrough
const wearing = (bt: Bt | null, item = WORN, who = caren.id): GearStore => {
  const r = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, who, item);
  return updatePiece(r.st, r.id, { bt });
};
const mat = (st: GearStore, item: ItemInput) => materialFor(poolView(ctx, st), item);
const judge = (item: ItemInput, st: GearStore) => withMaterial(idx, ru, evaluate(ctx, item, { gamble: false }), mat(st, item));

describe('материал Breakthrough для надетой', () => {
  // Р1: Speed-перчатки T0 (ценность 0) раскладка Speed отдала Immunity-перчаткам — их держит только достижимая сборка.
  // Они не надеты: новые Speed-перчатки лучше, это не материал для них
  it('вещь, которую держит только достижимая сборка, — не «надета»: материала для неё нет', () => {
    const imm = D.sets.find((x) => x.short === 'Immunity')!.id;
    const A = (slot: ItemInput['slot'], setId: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId, itemKey: null, main: null, subs });
    let st: GearStore = { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } };
    const put = (x: ItemInput, bt: Bt | null = null) => { const r = putOn(ctx, st, caren.id, x); st = bt === null ? r.st : updatePiece(r.st, r.id, { bt }); return r.id; };
    put(A('helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }), 4);
    put(A('armor', speed, { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }), 4);
    const gloves = put(A('gloves', speed, { RES: 1, EFF: 1, HP: 1, ATK: 1 }), 0);
    put(A('shoes', speed, { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }));
    put(A('helmet', imm, { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }));
    put(A('gloves', imm, { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }));
    const cp = poolView(ctx, st).of(caren.id)!;
    const v = cp.variants.find((x) => x.name === 'Speed')!;
    expect([cp.asm.get(v.key)!.slots.gloves?.id === gloves, cp.reach.get(v.key)!.slots.gloves?.id === gloves]).toEqual([false, true]);

    const item = A('gloves', speed, { 'HP%': 2, CHD: 2, 'DEF%': 3, 'ATK%': 3 });
    expect(mat(st, item)).toEqual([]);
  });

  it('пример из хендоффа: Legendary с мусорными сабстатами — «Фоддер», и сказано, для какого шлема и сколько ещё', () => {
    const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
    const r = judge(junk, wearing(2));
    expect(r.v).toBe('fodder');
    expect(r.lines[0]).toBe('**Материал**: такая же вещь надета не на T4 — шлем Caren · Speed — T2, ещё 2 шт. до T4. Одна вещь — одна ступень Breakthrough, сабстаты не важны.');
  });

  it('Epic «Разобрать» — поднимается до «Фоддер»: заголовок и «Прокачка» про материал', () => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const before = evaluate(ctx, epic, { gamble: false });
    expect(before.v).toBe('junk');

    const r = judge(epic, wearing(1, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')));

    expect(r.v).toBe('fodder');
    expect(r.title).toBe('Фоддер — материал Breakthrough для шлема Caren · Speed');
    expect(r.plan).toEqual([ru.material.plan]);
  });

  // eval-only, шаг 2: запись с формы без «T4» — bt 0 (ниже T4, В4), материал Breakthrough по решению 12
  it('запись с формы без «T4» (bt 0) — такая же Epic «Разобрать» поднимается до «Фоддер»', () => {
    const epic: ItemInput = { ...helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare'), bt: 0 };
    const r0 = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'), bt: 0 });
    expect(r0.piece.bt).toBe(0);
    expect(evaluate(ctx, epic, { gamble: false }).v).toBe('junk');

    const r = judge(epic, r0.st);

    expect(r).toMatchObject({ v: 'fodder', title: 'Фоддер — материал Breakthrough для шлема Caren · Speed' });
    expect(mat(r0.st, epic)).toMatchObject([{ piece: { id: r0.id }, left: 4 }]);
  });

  it('запись с формы с «T4» (bt 4) — не материал', () => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const r0 = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'), bt: 4 });
    expect(mat(r0.st, epic)).toEqual([]);
  });

  it.each([
    ['Breakthrough не указан', null],
    ['надетая уже на T4', 4],
  ] as const)('%s — не материал, вердикт тот же', (_, bt) => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const st = wearing(bt, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'));
    expect(mat(st, epic)).toEqual([]);
    const res = evaluate(ctx, epic, { gamble: false });
    expect(withMaterial(idx, ru, res, mat(st, epic))).toBe(res);
  });

  it('другой грейд или сет — не материал', () => {
    expect(mat(wearing(1), helmet({ HP: 1 }, 'rare'))).toEqual([]);
    expect(mat(wearing(1), { ...helmet({ HP: 1 }), setId: D.sets.find((s) => s.short === 'Defense')!.id })).toEqual([]);
  });

  it('сама надетая вещь себе не материал', () => {
    expect(mat(wearing(1), WORN)).toEqual([]);
  });

  it('«Оставить» не трогаем — там это пометка в «Сейчас на персонажах»', () => {
    const good = helmet({ 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
    const res = evaluate(ctx, good, { gamble: false });
    expect(res.v).toBe('keep');
    expect(mat(wearing(1), good)).toHaveLength(1);
    expect(withMaterial(idx, ru, res, mat(wearing(1), good))).toBe(res);
  });

  // решение владельца: вещь лучше той надетой, для которой она материал, — «надень, старую — ей в Breakthrough»
  describe('лучше надеть, чем отдать', () => {
    const judgeAll = (item: ItemInput, st: GearStore, target: string | null = null, c = ctx) => {
      const view = poolView(c, st);
      const needs = materialFor(view, item);
      return withMaterial(idx, ru, evaluate(c, item), needs, { up: betterThanWorn(c, view, item, needs), target });
    };
    const WEAK = helmet({ HP: 1, DEF: 1, ATK: 1 }, 'rare'); // надета на Caren · Speed, T2
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');

    it('новая лучше надетой — «надень её», старая ей в Breakthrough; «отдай надетой» нет', () => {
      const better = helmet({ DEF: 1, CHC: 1, HP: 1 }, 'rare');
      const r = judgeAll(better, wearing(2, WEAK));
      expect(r.v).toBe('fodder');
      expect(r.title).toBe(ru.material.titleWear(ru.ui.slotGen.helmet, 'Caren · Speed'));
      expect(r.lines[0]).toBe(ru.material.lineWear('шлем Caren · Speed — T2, ещё 2 шт. до T4'));
      expect(r.plan[0]).toBe(ru.material.planReplace('Caren · Speed'));
      expect(r.plan).not.toContain(ru.material.plan);
    });

    // Н3: «надень» — по вещам как есть. Было: у свежей 6 Reforge впереди, у надетой (4 оранжевых) — 2, и новая «лучше»
    it('как есть: надетая с оранжевыми лучше новой — «надень» нет, только материал', () => {
      const r = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, helmet({ 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }));
      const st = updatePiece(r.st, r.id, { bt: 2, lit: { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 1 } });
      const item = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });
      const view = poolView(ctx, st);

      const needs = materialFor(view, item);

      expect(needs).toHaveLength(1);
      expect(betterThanWorn(ctx, view, item, needs)).toEqual([]);
    });

    it('в примерке у цели слот пуст — «надень её на Caren · Speed/Immu», а не «отдай надетой»', () => {
      const r = judgeAll(epic, wearing(2, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')), 'Caren · Speed/Immu');
      expect(r.plan[0]).toBe(ru.material.planWear('Caren · Speed/Immu'));
    });

    it('с кубиком Reforge: «не прокачивай (кроме одного Reforge на удачу)», и строка кубика — следом', () => {
      const r = judgeAll(epic, wearing(2, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')));
      expect(r.gamble).toBeTruthy();
      expect(r.plan).toEqual([ru.material.planGamble, ru.plan.gamble('junk')]);
    });

    it('настройка «Фоддер» выключена: «Включи — станут «Фоддер»» у поднятого штампа не остаётся', () => {
      const off = makeCtx(idx, { rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
      const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
      expect(evaluate(off, junk).lines).toContain(ru.armor.enableFodder('Speed'));
      const r = judgeAll(junk, wearing(2), null, off);
      expect(r.v).toBe('fodder');
      expect(r.lines).not.toContain(ru.armor.enableFodder('Speed'));
    });

    it('вещь у персонажа, которого нет в данных, — не материал (её нигде не видно)', () => {
      const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
      expect(mat(wearing(2, WORN, '999999'), junk)).toEqual([]);
      expect(mat(wearing(2), junk)).toHaveLength(1);
    });
  });

  it('оружие: тот же предмет — материал; Epic без предмета — никогда', () => {
    const w = caren.builds[0].weapons[0];
    const weapon: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: w.key, main: w.mains[0], subs: { HP: 1 } };
    const st = wearing(0, { ...weapon, subs: { CHC: 1 } });
    expect(mat(st, weapon)).toHaveLength(1);
    const epicW: ItemInput = { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { HP: 1 } };
    expect(mat(wearing(0, { ...epicW, subs: { CHC: 1 } }), epicW)).toEqual([]);
  });
});
