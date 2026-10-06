// Очки вещи (T1) и U героя (T2) по формуле «очки вещи + ценность сетов» (FORMULA.md §1–§2).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Char, Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import type { Subs } from '@/game/item/subs';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { pointsOf, weightOfPlace } from '@/game/build/points';
import { profileOf, rowPoints } from '@/game/build/profile';
import { setValue } from '@/game/set/setValue';
import { convertible } from '@/game/set/setBonus';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const char = (name: string): Char => {
  const c = D.chars.find((x) => x.name === name);
  if (!c) throw new Error('нет героя ' + name);
  return c;
};
const prof = (name: string) => profileOf(ctx, char(name))!;
const heroes = D.chars.filter((c) => c.builds.length);

let seq = 0;
const mk = (slot: SlotId, lit: Subs, extra: Partial<Piece> = {}): Piece => ({
  id: 'p' + ++seq, slot, grade: 'unique', setId: null, itemKey: null, main: null,
  yellow: lit, lit, bt: 4, at: '', ...extra,
});
const pts = (name: string, p: Piece) => {
  const P = prof(name);
  return pointsOf(ctx, P.c, P.chain, pieceInput(p));
};

describe('T1. очки вещи', () => {
  it('T1.1: Rin, шлем CHC 3, CHD 2, SPD 1, DMG UP% 2 → 5,00', () => {
    expect(pts('Rin', mk('helmet', { CHC: 3, CHD: 2, SPD: 1, 'DMG UP%': 2 }))).toBeCloseTo(5.0, 2);
  });
  it('T1.2: Heatwave Cop Delta, броня DMG UP% 2, SPD 2, CHD 1, CHC 1 → 3,75', () => {
    expect(pts('Heatwave Cop Delta', mk('armor', { 'DMG UP%': 2, SPD: 2, CHD: 1, CHC: 1 }))).toBeCloseTo(3.75, 2);
  });
  it('T1.3: Fran, перчатки SPD 2, CHC 2, CHD 1, ATK% 1 — разрыв считается местом → 4,30', () => {
    expect(pts('Fran', mk('gloves', { SPD: 2, CHC: 2, CHD: 1, 'ATK%': 1 }))).toBeCloseTo(4.3, 2);
  });
  it('T1.4: Luna, аксессуар с main SPD закрывает место → 6,40', () => {
    const acc = D.amulets.find((a) => a.grade === 'unique' && a.mains.includes('SPD'))!;
    const p = mk('accessory', { 'HP%': 3, CHC: 2, 'ATK%': 2, CHD: 1 }, { itemKey: acc.key, main: 'SPD' });
    expect(pts('Luna', p)).toBeCloseTo(6.4, 2);
  });
  it.each([
    ['Demiurge Saeran', 'ATK', 4.0],
    ['Aer', 'ATK', 2.0],
    ['Anarky', 'DEF', 4.0],
    ['Caren', 'DEF', 2.0],
    ['Gnosis Nella', 'HP', 1.6],
    ['Christina', 'HP', 0.0],
  ])('T1.5: flat-сабстат, 4 сегмента: %s %s → %f', (name, ax, expected) => {
    const slot: SlotId = ax === 'DEF' ? 'helmet' : 'armor';
    expect(pts(name, mk(slot, { [ax]: 4 }))).toBeCloseTo(expected, 2);
  });
  it('T1.6: сегментов больше 6 считается как 6 (Rin, CHC 7 → 4,80)', () => {
    const p = { ...mk('helmet', { CHC: 6 }), lit: { CHC: 7 } }; // такой записи в приложении нет — проверяется только потолок
    expect(pts('Rin', p)).toBeCloseTo(4.8, 2);
  });
  it('T1.7: места дальше 8-го весят 0,2', () => {
    for (const place of [8, 9, 10, 12]) expect(weightOfPlace(place)).toBe(0.2);
  });
});

describe('T2. U героя', () => {
  it.each([
    ['Caren', 7.5],
    ['Rin', 8.75],
    ['Valentine', 7.0],
    ['Delta', 11.67],
    ['Demiurge Stella', 8.75],
    ['Eternal', 7.04],
    ['Anarky', 7.5],
    ['Demiurge Luna', 8.75],
  ])('T2.1: U героя %s = %f', (name, u) => {
    expect(prof(name).U).toBeCloseTo(u, 2);
  });

  it('T2.2: у всех героев с билдами строка 2P статового сета ≤ U, строка 4P ≤ 2U', () => {
    const bad: string[] = [];
    let rows = 0;
    for (const c of heroes) {
      const P = profileOf(ctx, c)!;
      for (const s of D.sets) {
        if (!convertible(ctx, c, s.id) || !s.bonus) continue;
        for (const t of [s.bonus.t4, s.bonus.t0]) {
          for (const [n, bon] of [[2, t.p2], [4, t.p4]] as const) {
            if (!bon) continue;
            rows++;
            const v = rowPoints(P, bon);
            const limit = n === 2 ? P.U : 2 * P.U;
            if (v > limit + 1e-9) bad.push(`${c.name} ${s.short} ${n}P: ${v} > ${limit}`);
          }
        }
      }
    }
    expect(rows).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('T2.3: у Rin нет HP в цепочке — Life даёт 0,00', () => {
    const life = D.sets.find((s) => s.short === 'Life')!.id;
    expect(setValue(prof('Rin'), life, 4, 4).value).toBe(0);
  });
});
