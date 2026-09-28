// Кубик Reforge: какой 4-й сабстат от первого Reforge вытянет свежую Epic с тремя сабстатами (logic/gamble).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex, isArmor } from '../src/data';
import type { Dataset } from '../src/data/types';
import { makeCtx, type Settings } from '../src/logic/context';
import { evalArmor } from '../src/logic/evalArmor';
import { evalGear } from '../src/logic/evalGear';
import { evaluate } from '../src/logic/evaluate';
import { fourthPool, reforgeGamble } from '../src/logic/gamble';
import { emptyVerdict, type ItemInput } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const setId = (short: string) => D.sets.find((s) => s.short === short)!.id;
const ctx = (patch: Partial<Settings> = {}, roster: string[] = []) =>
  makeCtx(idx, { rosterOnly: roster.length > 0, fodder: true, stage: 'grow', lv120: false, quirks: true, ...patch }, new Set(roster));
const armor = (slot: ItemInput['slot'], set: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'rare'): ItemInput =>
  ({ slot, grade, setId: setId(set), itemKey: null, main: null, subs });
const epicGear = (slot: 'weapon' | 'accessory', main: string, subs: Record<string, number>): ItemInput =>
  ({ slot, grade: 'rare', setId: null, itemKey: null, main, subs });
const judge = (c: ReturnType<typeof ctx>, s: ItemInput) => (isArmor(s.slot) ? evalArmor : evalGear)(c, s, emptyVerdict());

describe('кубик Reforge', () => {
  it('Epic Attack helmet ATK%/CHC/RES%: «Разобрать», но SPD, CHD или ATK вытянут до «Оставить» — 3 из 9', () => {
    const r = evaluate(ctx(), armor('helmet', 'Attack', { 'ATK%': 1, CHC: 1, RES: 1 }));

    expect(r.v).toBe('junk');
    expect(r.gamble).toMatchObject({ of: 9, target: 'keep', main: ['HP%'] });
    expect(r.gamble!.hits.map((h) => [h.key, h.v])).toEqual([['SPD', 'keep'], ['CHD', 'keep'], ['ATK', 'keep']]);
  });

  it('каждый выигрыш правда даёт свой вердикт — с одним сегментом 4-го, у лучшего кандидата он в цепочке', () => {
    const c = ctx();
    const s = armor('helmet', 'Attack', { 'ATK%': 1, CHC: 1, RES: 1 });

    const g = reforgeGamble(c, s, judge(c, s))!;

    for (const h of g.hits) {
      expect(judge(c, { ...s, subs: { ...s.subs, [h.key]: 1 } }).v).toBe(h.v);
      expect(h.best!.parts.some((p) => p.key === h.key && p.ok)).toBe(true);
    }
  });

  it('сколько статов может выпасть 4-м: броня 9, оружие 8 (flat ATK и main), аксессуар с PEN% — 10; перчаткам EFF% можно', () => {
    const of = (s: ItemInput) => fourthPool(ctx(), s).pool;

    expect(of(armor('helmet', 'Speed', { SPD: 1, CHC: 1, CHD: 1 }))).toHaveLength(9);
    expect(of(armor('gloves', 'Speed', { SPD: 1, CHC: 1, CHD: 1 }))).toHaveLength(9);
    expect(of(armor('gloves', 'Speed', { SPD: 1, CHC: 1, CHD: 1 }))).toContain('EFF');
    expect(of(epicGear('weapon', 'ATK%', { CHC: 2, CHD: 1, RES: 1 }))).toHaveLength(8);
    expect(of(epicGear('accessory', 'PEN%', { CHC: 2, CHD: 1, RES: 1 }))).toHaveLength(10);
  });

  it('Epic-оружие «Разобрать» на «Развитии» — кубик ведёт к «Временно»; на «Эндгейме» кубика нет', () => {
    const s = epicGear('weapon', 'ATK%', { CHC: 2, CHD: 1, RES: 1 });

    const grow = evaluate(ctx(), s);
    const end = evaluate(ctx({ stage: 'end' }), s);

    expect([grow.v, grow.gamble?.target, grow.gamble?.of]).toEqual(['junk', 'temp', 8]);
    expect(grow.gamble!.hits[0]).toMatchObject({ key: 'SPD', v: 'temp' });
    expect(end.gamble).toBeNull();
  });

  it('«Временно» — кубик только к «Оставить»', () => {
    const r = evaluate(ctx(), armor('helmet', 'Attack', { 'DMG UP%': 3, 'ATK%': 3, CHD: 3 }));

    expect(r.v).toBe('temp');
    expect(r.gamble!.hits.map((h) => h.key)).toEqual(['SPD', 'CHC']);
    expect(r.gamble!.hits.every((h) => h.v === 'keep')).toBe(true);
  });

  it('«Спорно» (подходит только не из ростера) — тоже играет, выигрыш — для своих', () => {
    const roster = ['2000121', '2000094', '2700035', '2000012', '2000057', '2000066', '2000010', '2000112', '2000108', '2000111',
      '2000118', '2000065', '2000091', '2000114', '2000100', '2000083', '2000037', '2000061', '2000068', '2000109'];
    const c = ctx({ fodder: false, lv120: true }, roster);

    const r = evaluate(c, armor('gloves', D.sets.find((x) => x.id === '7')!.short, { 'DEF%': 1, RES: 3, SPD: 1 }));

    expect(r.v).toBe('maybe');
    expect(r.gamble!.hits.length).toBeGreaterThan(0);
    expect(r.gamble!.hits.every((h) => h.best && roster.includes(h.best.c.id))).toBe(true);
  });

  it('кубика нет: Legendary, уже 4 сабстата, меньше трёх, «Оставить»', () => {
    const c = ctx();

    expect(evaluate(c, armor('helmet', 'Attack', { 'ATK%': 1, CHC: 1, RES: 1 }, 'unique')).gamble).toBeNull();
    expect(evaluate(c, armor('helmet', 'Attack', { 'ATK%': 1, CHC: 1, RES: 1, 'DMG RED%': 1 })).gamble).toBeNull();
    expect(evaluate(c, armor('helmet', 'Attack', { 'ATK%': 1, RES: 1 })).gamble).toBeNull();
    expect(evaluate(c, armor('helmet', 'Attack', { 'ATK%': 2, CHC: 2, SPD: 2 })).v).toBe('keep');
    expect(evaluate(c, armor('helmet', 'Attack', { 'ATK%': 2, CHC: 2, SPD: 2 })).gamble).toBeNull();
  });

  it('никакой 4-й не спасёт — кубика нет', () => {
    expect(evaluate(ctx(), armor('helmet', 'Attack', { RES: 1, EFF: 1, 'DMG RED%': 1 })).gamble).toBeNull();
  });
});
