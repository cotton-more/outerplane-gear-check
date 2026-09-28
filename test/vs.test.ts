// Сравнение с надетым (logic/vs): пустой слот, лучше, хуже, та же вещь, сломанный сет 2+2, временная против
// рекомендованной. Пример владельца: у Caren в цепочке пусто 3-е место — новая его закрывает, теряя 4-е.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { buildKey, EMPTY_GEAR, equip, updatePiece, type GearStore } from '../src/logic/gear';
import type { ItemInput } from '../src/logic/verdict';
import { compare, compareAll } from '../src/logic/vs';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!; // DEF › CHC › CHD › SPD › DMG UP%
const build = (name: string) => caren.builds.find((b) => b.name === name)!;
const armor = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });

// на Caren · Speed надет шлем: 2 жёлтых + 2 оранжевых DEF%, CHC 3, SPD 2, EFF% 3 — все 6 Reforge сделаны, T4
function wearing(lit: Record<string, number>, yellow: Record<string, number>, name = 'Speed'): GearStore {
  const { store, piece } = equip(EMPTY_GEAR, buildKey(caren.id, name), armor('helmet', 'Speed', yellow));
  return updatePiece(store, piece.id, { lit, bt: 4 });
}
const NEW = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });

describe('сравнение с надетым', () => {
  it('3-е место важнее 4-го: новая закрывает CHD, теряет SPD — лучше на ~25%', () => {
    const st = wearing({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });

    const vs = compare(ctx, st, caren, build('Speed'), NEW)!;

    expect(vs.kind).toBe('up');
    expect(vs.delta).toBeCloseTo(0.247, 2);
    expect(vs.gained).toEqual([{ key: 'CHD', place: 3 }]);
    expect(vs.lost).toEqual([{ key: 'SPD', place: 4 }]);
  });

  it('та же новая против хорошо прокачанной — хуже: на DEF% уже 6 сегментов', () => {
    const st = wearing({ 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }, { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 });
    expect(compare(ctx, st, caren, build('Speed'), NEW)).toMatchObject({ kind: 'down' });
  });

  it('пустой слот в собираемом билде; эта же вещь — «уже надета»', () => {
    const st = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), armor('armor', 'Speed', { CHC: 2 })).store;
    expect(compare(ctx, st, caren, build('Speed'), NEW)?.kind).toBe('fill');
    const worn = equip(st, buildKey(caren.id, 'Speed'), NEW).store;
    expect(compare(ctx, worn, caren, build('Speed'), NEW)?.kind).toBe('worn');
  });

  it('вещь не того сета билду не подходит — сравнения нет', () => {
    const st = wearing({ CHC: 2 }, { CHC: 2 });
    expect(compare(ctx, st, caren, build('Speed'), armor('helmet', 'Attack', { CHC: 3 }))).toBeNull();
  });

  it('2+2: Speed-шлем вместо Immunity в Speed/Immu ломает Immunity ×2', () => {
    const K = buildKey(caren.id, 'Speed/Immu');
    let st = EMPTY_GEAR;
    for (const [slot, s] of [['helmet', 'Immunity'], ['armor', 'Immunity'], ['gloves', 'Speed'], ['shoes', 'Speed']] as const) st = equip(st, K, armor(slot, s, { CHC: 1 })).store;

    const vs = compare(ctx, st, caren, build('Speed/Immu'), NEW)!;

    expect(vs.kind).toBe('breaks');
    expect(vs.broken).toBe(set('Immunity'));
  });

  it('оружие: временная (Epic) против надетой рекомендованной — хуже, как бы ни были хороши сабстаты', () => {
    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;
    const K = buildKey(caren.id, 'Speed');
    const st = equip(EMPTY_GEAR, K, { slot: 'weapon', grade: 'unique', setId: null, itemKey: embrace.key, main: 'DEF%', subs: { HP: 1 } }).store;

    const vs = compare(ctx, st, caren, build('Speed'), { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'DEF%', subs: { CHC: 3, CHD: 3, SPD: 3 } })!;

    expect(vs).toMatchObject({ kind: 'down', worse: true });
  });

  it('раздел вердикта: только собираемые билды тех, кому вещь подходит; ничего не надето — пусто', () => {
    const st = wearing({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });
    const res = evaluate(ctx, NEW);

    expect(compareAll(ctx, st, NEW, res).map((v) => [v.c.name, v.b.name, v.kind])).toEqual([['Caren', 'Speed', 'up']]);
    expect(compareAll(ctx, EMPTY_GEAR, NEW, res)).toEqual([]);
  });

  it('та же вещь, что надета не на T4, — материал её Breakthrough', () => {
    const { store, piece } = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), armor('helmet', 'Speed', { SPD: 1 }));
    const st = updatePiece(store, piece.id, { bt: 2 });
    expect(compare(ctx, st, caren, build('Speed'), NEW)?.material).toBe(true);
    expect(compare(ctx, updatePiece(st, piece.id, { bt: 4 }), caren, build('Speed'), NEW)?.material).toBe(false);
  });
});
