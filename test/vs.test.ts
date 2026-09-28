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
import { compare, compareAll, equipTargets, vsFigure } from '../src/logic/vs';

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

const kappa = D.chars.find((c) => c.name === 'Kappa')!;
const kitsune = D.chars.find((c) => c.name.startsWith('Kitsune'))!;

describe('бонус сета только на T4', () => {
  // Caren · Speed/Immu: Immunity ×2 + Speed ×2 — у Speed ×2 бонус только на T4
  const onSpeedImmu = (bt: 0 | 1 | 2 | 3 | 4 | null) => {
    const { store, piece } = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed/Immu'), armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }));
    return updatePiece(store, piece.id, { lit: { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt });
  };

  it('надетый Speed-шлем на T4, новая лучше по сегментам — не выше «на уровне»: пока новая не на T4, бонуса нет', () => {
    const vs = compare(ctx, onSpeedImmu(4), caren, build('Speed/Immu'), NEW)!;
    expect(vs.delta!).toBeGreaterThan(0.1);
    expect(vs).toMatchObject({ kind: 'eq', t4: { set: set('Speed'), n: 2 } });
  });

  it('надетая не на T4 — бонуса и сейчас нет: «лучше» остаётся, пометка есть', () => {
    expect(compare(ctx, onSpeedImmu(2), caren, build('Speed/Immu'), NEW)).toMatchObject({ kind: 'up', t4: { n: 2 } });
  });

  // Heatwave Cop Delta · DPS: Pen ×4 | Atk ×2 + Spd ×2 | Pen ×2 + Atk ×2 — ограничение по собираемой связке
  describe('несколько связок: смотрим ту, что собирают', () => {
    const delta = D.chars.find((c) => c.name === 'Heatwave Cop Delta')!;
    const dps = delta.builds.find((b) => b.name === 'DPS')!;
    const key = buildKey(delta.id, dps.name);
    const wear = (sets: Record<string, string>, helmetBt: 0 | 4) => {
      let st: GearStore = EMPTY_GEAR;
      for (const [slot, s] of Object.entries(sets)) st = equip(st, key, armor(slot as ItemInput['slot'], s, { HP: 1, DEF: 1, RES: 1, EFF: 1 })).store;
      const helmet = st.builds[key].slots.helmet!;
      return updatePiece(st, helmet, { bt: helmetBt });
    };
    const pen = armor('helmet', 'Penetration', { 'ATK%': 3, CHC: 2, CHD: 2, SPD: 1 });

    it('четыре Pen — это Pen ×4: новый шлем лучше надетого на T4 остаётся «лучше», пометки нет', () => {
      const vs = compare(ctx, wear({ helmet: 'Penetration', armor: 'Penetration', gloves: 'Penetration', shoes: 'Penetration' }, 4), delta, dps, pen)!;
      expect(vs).toMatchObject({ kind: 'up', t4: null });
    });

    it('два Pen и два Attack — это Pen ×2 + Atk ×2: ограничение и пометка остаются', () => {
      const vs = compare(ctx, wear({ helmet: 'Penetration', armor: 'Penetration', gloves: 'Attack', shoes: 'Attack' }, 4), delta, dps, pen)!;
      expect(vs).toMatchObject({ kind: 'eq', t4: { set: set('Penetration'), n: 2 } });
    });

    it('пустой слот, ничего не собрано: первая связка с Pen — Pen ×4, пометки нет', () => {
      expect(compare(ctx, EMPTY_GEAR, delta, dps, pen)?.t4).toBeNull();
    });
  });

  it('Speed ×4 бонус даёт и на T0 — пометки нет', () => {
    expect(compare(ctx, wearing({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }), caren, build('Speed'), NEW)?.t4).toBeNull();
  });
});

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

  it('«хуже» без потерянных мест — почему: у надетой больше сегментов на DEF% (6 против 3,5 с Reforge впереди)', () => {
    const st = wearing({ 'DEF%': 6, CHC: 4, CHD: 4, HP: 2 }, { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 });
    const vs = compare(ctx, st, caren, build('Speed'), NEW)!;

    expect(vs).toMatchObject({ kind: 'down', lost: [], ahead: { key: 'DEF%', worn: 6, next: 3.5 } });
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
    // наоборот: Immunity-ботинки вместо Speed — ломается Speed, хотя в связке он второй
    expect(compare(ctx, st, caren, build('Speed/Immu'), armor('shoes', 'Immunity', { CHC: 2 }))?.broken).toBe(set('Speed'));
  });

  it('оружие: временная (Epic) против надетой рекомендованной — хуже, как бы ни были хороши сабстаты', () => {
    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;
    const K = buildKey(caren.id, 'Speed');
    const st = equip(EMPTY_GEAR, K, { slot: 'weapon', grade: 'unique', setId: null, itemKey: embrace.key, main: 'DEF%', subs: { HP: 1 } }).store;

    const vs = compare(ctx, st, caren, build('Speed'), { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'DEF%', subs: { CHC: 3, CHD: 3, SPD: 3 } })!;

    expect(vs).toMatchObject({ kind: 'down', why: 'stopgap' });
  });

  it('оружие: рекомендованная против надетой временной — лучше словом (why), хотя по сегментам хуже', () => {
    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;
    const K = buildKey(caren.id, 'Speed');
    const st = equip(EMPTY_GEAR, K, { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'DEF%', subs: { CHC: 3, CHD: 3, SPD: 3 } }).store;

    const vs = compare(ctx, st, caren, build('Speed'), { slot: 'weapon', grade: 'unique', setId: null, itemKey: embrace.key, main: 'DEF%', subs: { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 } })!;

    expect(vs).toMatchObject({ kind: 'up', why: 'rec' });
    expect(vs.delta!).toBeLessThan(0);
  });

  it('Epic с 4 сабстатами: новая и надетая с тем же роллом (разный бесполезный 4-й) — на уровне, ровно 0 в обе стороны', () => {
    const K = buildKey(caren.id, 'Speed');
    const a = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 }, 'rare');
    const z = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, EFF: 1 }, 'rare');

    expect(compare(ctx, equip(EMPTY_GEAR, K, a).store, caren, build('Speed'), z)).toMatchObject({ kind: 'eq', delta: 0 });
    expect(compare(ctx, equip(EMPTY_GEAR, K, z).store, caren, build('Speed'), a)).toMatchObject({ kind: 'eq', delta: 0 });
  });

  it('Legendary из списка билда, но с другим main — временная, если этот main в слоте билд просит (Eris, как в вердикте)', () => {
    const eris = D.chars.find((c) => c.name === 'Eris')!;
    const attack = eris.builds.find((b) => b.name === 'Attack')!;
    const gw = D.weapons.find((w) => w.name === "Gorgon's Wrath [Striker]" && w.star === 6)!;
    const item: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: gw.key, main: 'HP%', subs: { CHC: 2, CHD: 2, SPD: 2, 'ATK%': 1 } };
    const st = equip(EMPTY_GEAR, buildKey(eris.id, 'Attack'), { ...item, grade: 'rare', itemKey: null, subs: { HP: 1 } }).store;

    expect(attack.weapons.find((w) => w.key === gw.key)?.mains).not.toContain('HP%');
    expect(compare(ctx, st, eris, attack, item)).toMatchObject({ kind: 'up' });
    expect(compare({ ...ctx, settings: { ...ctx.settings, stage: 'end' } }, st, eris, attack, item)).toBeNull();
  });

  it('у надетой полезных нет — не процент, а «полезных нет»; больше +200% — «×N»', () => {
    const K = buildKey(caren.id, 'Speed');
    const junk = equip(EMPTY_GEAR, K, armor('helmet', 'Speed', { RES: 2, EFF: 2, HP: 1, 'DMG RED%': 1 })).store;
    expect(vsFigure(compare(ctx, junk, caren, build('Speed'), NEW)!)).toEqual({ kind: 'empty' });

    const weak = equip(EMPTY_GEAR, K, armor('helmet', 'Speed', { SPD: 1, RES: 2, EFF: 2, HP: 1 })).store;
    const vs = compare(ctx, weak, caren, build('Speed'), armor('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }))!;
    expect(vsFigure(vs)).toEqual({ kind: 'times', n: Math.round(vs.delta! + 1) });
    expect(vs.delta!).toBeGreaterThan(2);
    expect(vsFigure({ delta: 0.25, wornEmpty: false })).toEqual({ kind: 'pct', n: 25 });
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

  it('Reforge впереди: у Epic с 3 сабстатами первый уйдёт на 4-й — 5 на три известных, у Legendary 6 на четыре', () => {
    const K = buildKey(caren.id, 'Speed');
    const st = equip(EMPTY_GEAR, K, armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 })).store;
    const vs = compare(ctx, st, caren, build('Speed'), armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2 }, 'rare'))!;
    expect(vs.delta!).toBeCloseTo((2 + 5 / 4 - (2 + 6 / 4)) / (2 + 6 / 4), 6);
  });

  it('больше 6 сегментов у стата не бывает: 6 горящих + Reforge впереди — всё равно 6', () => {
    const st = wearing({ 'DEF%': 6, CHC: 2, CHD: 3, HP: 1 }, { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 }); // 3 Reforge сделано
    const vs = compare(ctx, st, caren, build('Speed'), NEW)!;
    expect(vs.ahead).toMatchObject({ key: 'DEF%', worn: 6 });
  });

  it('засчитывается слабее — и ценность меньше: flat DEF у Caren против DEF% на том же 1-м месте', () => {
    const K = buildKey(caren.id, 'Speed');
    const pct = compare(ctx, equip(EMPTY_GEAR, K, armor('helmet', 'Speed', { RES: 1, EFF: 1, HP: 1, CHC: 1 })).store, caren, build('Speed'), armor('helmet', 'Speed', { 'DEF%': 2, RES: 1, EFF: 1, CHC: 1 }))!;
    const flat = compare(ctx, equip(EMPTY_GEAR, K, armor('helmet', 'Speed', { RES: 1, EFF: 1, HP: 1, CHC: 1 })).store, caren, build('Speed'), armor('helmet', 'Speed', { DEF: 2, RES: 1, EFF: 1, CHC: 1 }))!;
    expect(flat.delta!).toBeLessThan(pct.delta!);
  });

  it('материал — только того же грейда: Epic-шлем не ступень Breakthrough для Legendary', () => {
    const { store, piece } = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), armor('helmet', 'Speed', { SPD: 1 }, 'rare'));
    const st = updatePiece(store, piece.id, { bt: 2 });
    expect(compare(ctx, st, caren, build('Speed'), NEW)?.material).toBe(false);
  });

  it('оружие: оба из рекомендованных, пассивки разные — пометка «другая пассивка»', () => {
    const [a, z] = build('Speed').weapons;
    const st = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), { slot: 'weapon', grade: 'unique', setId: null, itemKey: a.key, main: 'DEF%', subs: { CHC: 1 } }).store;
    const vs = compare(ctx, st, caren, build('Speed'), { slot: 'weapon', grade: 'unique', setId: null, itemKey: z.key, main: 'DEF%', subs: { CHC: 2 } })!;
    expect(vs).toMatchObject({ passive: true, why: null });
  });

  it('раздел: только первая открытая секция вердикта (Kitsune с этим шлемом «не те сабстаты» — нет); пустой слот первым', () => {
    let st = wearing({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });
    st = equip(st, buildKey(caren.id, 'Speed/Immu'), armor('armor', 'Immunity', { CHC: 1 })).store;
    st = equip(st, buildKey(kitsune.id, 'Mix Speed'), armor('helmet', 'Speed', { SPD: 1 })).store;
    const res = evaluate(ctx, NEW);

    expect(compare(ctx, st, kitsune, kitsune.builds.find((b) => b.name === 'Mix Speed')!, NEW)).not.toBeNull();
    expect(compareAll(ctx, st, NEW, res).map((v) => [v.b.name, v.kind])).toEqual([['Speed/Immu', 'fill'], ['Speed', 'up']]);
  });

  it('«Кому надеть?»: собираемые билды первыми, «не по билду» — только с all', () => {
    const st = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed/Immu'), armor('armor', 'Immunity', { CHC: 1 })).store;
    const rows = equipTargets(ctx, st, NEW, [kappa, caren], false);

    expect([rows[0].c.name, rows[0].b.name]).toEqual(['Caren', 'Speed/Immu']);
    expect(rows.every((r) => r.vs)).toBe(true);
    expect(equipTargets(ctx, st, NEW, [kappa, caren], true).some((r) => !r.vs)).toBe(true);
  });
});
