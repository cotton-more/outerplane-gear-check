// Ценность сета в раскладке (T3): половины по меню билдов, строки бонусов T4 / T0–T3 (FORMULA.md §2 п. 2, 4).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Char, Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { profileOf } from '@/game/build/profile';
import { setValue } from '@/game/set/setValue';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const char = (name: string): Char => {
  const c = D.chars.find((x) => x.name === name);
  if (!c) throw new Error('нет героя ' + name);
  return c;
};
const prof = (name: string) => profileOf(ctx, char(name))!;
const setId = (short: string) => D.sets.find((s) => s.short === short)!.id;

// сет и сколько его вещей всего (n) и на T4 (n4)
type Part = [set: string, n: number, n4: number];
// ценность раскладки без очков вещей: сумма value сетов, у которых вещей ≥ 2
const value = (hero: string, parts: Part[]) => {
  const P = prof(hero);
  return parts.filter(([, n]) => n >= 2).reduce((sum, [set, n, n4]) => sum + setValue(P, setId(set), n, n4).value, 0);
};

// Меню Caren: Speed ×4 · Penetration ×4 · Defense ×4 · Immunity ×2 + Speed ×2 · Immunity ×2 + Defense ×2
describe('T3. половины сета (Caren, U 7,50)', () => {
  const U = 7.5;
  it('T3.1: Speed ×4, все T4 → 2 половины', () => expect(value('Caren', [['Speed', 4, 4]])).toBeCloseTo(2 * U, 2));
  it('T3.2: Speed ×4, все T0 → 2 половины', () => expect(value('Caren', [['Speed', 4, 0]])).toBeCloseTo(2 * U, 2));
  it('T3.3: Speed T4 T4 T0 T0 → 2 половины', () => expect(value('Caren', [['Speed', 4, 2]])).toBeCloseTo(2 * U, 2));
  it('T3.4: Speed ×2 + Immunity ×2 → 15,00', () => {
    expect(value('Caren', [['Speed', 2, 2], ['Immunity', 2, 2]])).toBeCloseTo(2 * U, 2);
  });
  it('T3.5: Speed T4 T0 + Immunity ×2 → 7,50 (у Speed ×2 без бонуса)', () => {
    expect(value('Caren', [['Speed', 2, 1], ['Immunity', 2, 2]])).toBeCloseTo(U, 2);
  });
  it('T3.6: Immunity ×4 на T4 → 7,50', () => expect(value('Caren', [['Immunity', 4, 4]])).toBeCloseTo(U, 2));
  it('T3.7: Immunity ×4 на T0 → 7,50', () => expect(value('Caren', [['Immunity', 4, 0]])).toBeCloseTo(U, 2));
  it('T3.8: Speed ×3 + Defense ×1 → 7,50', () => {
    expect(value('Caren', [['Speed', 3, 3], ['Defense', 1, 1]])).toBeCloseTo(U, 2);
  });
  it('T3.9: Defense ×2 + Speed ×2 → 15,00', () => {
    expect(value('Caren', [['Defense', 2, 2], ['Speed', 2, 2]])).toBeCloseTo(2 * U, 2);
  });
  it('T3.10: Revenge ×4 (эффект-сет не из меню) → 0,00', () => expect(value('Caren', [['Revenge', 4, 4]])).toBe(0));
  it('T3.11: Critical Strike ×2 (статовый, не из меню) → 5,363 на T4 и 3,250 на T0', () => {
    expect(value('Caren', [['Critical Strike', 2, 2]])).toBeCloseTo(5.3625, 4);
    expect(value('Caren', [['Critical Strike', 2, 0]])).toBeCloseTo(3.25, 3);
  });
});

describe('T3. сеты из меню против статовых', () => {
  it('T3.12: Demiurge Stella — Counterattack ×4 и Revenge ×4 по 17,50, Attack ×4 — 15,00', () => {
    const counter = value('Demiurge Stella', [['Counterattack', 4, 4]]);
    const revenge = value('Demiurge Stella', [['Revenge', 4, 4]]);
    const attack = value('Demiurge Stella', [['Attack', 4, 4]]);
    expect(counter).toBeCloseTo(17.5, 2);
    expect(revenge).toBeCloseTo(17.5, 2);
    expect(attack).toBeCloseTo(15.0, 2);
    expect(counter - attack).toBeCloseTo(2.5, 2);
  });
  it('T3.13: Demiurge Luna, Attack ×4 на T4 (Attack в меню только ×2) → U 8,75 + строка 4P 6,25 = 15,00', () => {
    expect(value('Demiurge Luna', [['Attack', 4, 4]])).toBeCloseTo(15.0, 2);
  });
});

describe('T3. Anarky: Penetration только в меню «Pen ×2 + Def ×2»', () => {
  it('T3.14: Pen ×2 на T0 → 0,00, на T4 → 7,50', () => {
    expect(value('Anarky', [['Penetration', 2, 0]])).toBe(0);
    expect(value('Anarky', [['Penetration', 2, 2]])).toBeCloseTo(7.5, 2);
  });
  it('T3.15: Pen T4 T4 T0 T0 — строка 4P T0–T3 засчитывает половину «Pen ×2» → 7,50', () => {
    expect(value('Anarky', [['Penetration', 4, 2]])).toBeCloseTo(7.5, 2);
  });
});
