// Материал Breakthrough для надетой вещи (logic/material): «Разобрать» → «Фоддер», у «Фоддер» — для чего он.
// Пример из хендоффа: Legendary Speed-шлем RES% / EFF% / HP / DMG RED% при надетом на Caren · Speed шлеме на T2.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { buildKey, EMPTY_GEAR, equip, updatePiece, type Bt, type GearStore } from '../src/logic/gear';
import { materialFor, withMaterial } from '../src/logic/material';
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
const wearing = (bt: Bt | null, item = WORN): GearStore => {
  const r = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), item);
  return updatePiece(r.store, r.piece.id, { bt });
};
const judge = (item: ItemInput, st: GearStore) => withMaterial(idx, ru, evaluate(ctx, item, { gamble: false }), materialFor(st, item));

describe('материал Breakthrough для надетой', () => {
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

  it.each([
    ['Breakthrough не указан', null],
    ['надетая уже на T4', 4],
  ] as const)('%s — не материал, вердикт тот же', (_, bt) => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const st = wearing(bt, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'));
    expect(materialFor(st, epic)).toEqual([]);
    const res = evaluate(ctx, epic, { gamble: false });
    expect(withMaterial(idx, ru, res, materialFor(st, epic))).toBe(res);
  });

  it('другой грейд или сет — не материал', () => {
    expect(materialFor(wearing(1), helmet({ HP: 1 }, 'rare'))).toEqual([]);
    expect(materialFor(wearing(1), { ...helmet({ HP: 1 }), setId: D.sets.find((s) => s.short === 'Defense')!.id })).toEqual([]);
  });

  it('сама надетая вещь себе не материал', () => {
    expect(materialFor(wearing(1), WORN)).toEqual([]);
  });

  it('«Оставить» не трогаем — там это пометка в «Сейчас на персонажах»', () => {
    const good = helmet({ 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
    const res = evaluate(ctx, good, { gamble: false });
    expect(res.v).toBe('keep');
    expect(materialFor(wearing(1), good)).toHaveLength(1);
    expect(withMaterial(idx, ru, res, materialFor(wearing(1), good))).toBe(res);
  });

  it('оружие: тот же предмет — материал; Epic без предмета — никогда', () => {
    const w = caren.builds[0].weapons[0];
    const weapon: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: w.key, main: w.mains[0], subs: { HP: 1 } };
    const st = wearing(0, { ...weapon, subs: { CHC: 1 } });
    expect(materialFor(st, weapon)).toHaveLength(1);
    const epicW: ItemInput = { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { HP: 1 } };
    expect(materialFor(wearing(0, { ...epicW, subs: { CHC: 1 } }), epicW)).toEqual([]);
  });
});
