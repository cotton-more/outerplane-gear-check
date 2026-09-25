// Броня: строже к Epic (слабые «три полезных» — в разбор), подсказки про flat и про перековку одного сабстата.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset, Grade } from '../src/data/types';
import { ru } from '../src/i18n/ru';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const life = D.sets.find((s) => s.short === 'Life')!;
// у танков с Life (Liselotte и др.) приоритет SPD > HP > DEF = DMG RED% = RES
const lifeGloves = (grade: Grade, subs: Record<string, number>) => evaluate(ctx, { slot: 'gloves', grade, setId: life.id, itemKey: null, main: null, subs });

describe('Epic-броня: три полезных ещё не повод держать', () => {
  it('три стата с нижней ступени и минимальный ролл — «полезные, но слабые», в разбор', () => {
    const r = lifeGloves('rare', { RES: 1, 'DEF%': 1, 'DMG RED%': 1 });
    expect([r.v, r.title]).toEqual(['junk', ru.armor.weakEpicTitle]);
  });

  it('те же статы с хорошим роллом (5+ жёлтых) — «Оставить»', () => {
    expect(lifeGloves('rare', { RES: 2, 'DEF%': 2, 'DMG RED%': 1 }).v).toBe('keep');
  });

  it('с SPD или статом с верхних ступеней — «Оставить» и при минимальном ролле', () => {
    expect(lifeGloves('rare', { SPD: 1, 'HP%': 1, 'DEF%': 1 }).v).toBe('keep');
  });

  it('Legendary правило не трогает: у него есть Transistone и Breakthrough', () => {
    expect(lifeGloves('unique', { RES: 1, 'DEF%': 1, 'DMG RED%': 1, ATK: 1 }).v).toBe('keep');
  });
});

describe('подсказка про flat', () => {
  it('HP без % не засчитался, а билдам нужен HP% — просит проверить значок %', () => {
    expect(lifeGloves('rare', { HP: 3, CHC: 3, CHD: 3 }).lines).toContain(ru.verdict.flatHint('HP'));
  });

  it('если HP% тоже отмечен, путаницы нет — подсказки нет', () => {
    const r = lifeGloves('unique', { HP: 3, 'HP%': 1, CHC: 1, RES: 1 });
    expect(r.lines.some((l) => l.startsWith('Проверь HP'))).toBe(false);
  });
});

describe('Legendary с одним лишним сабстатом', () => {
  it('называет лишний и советует перебросить только его Transistone (Individual)', () => {
    expect(lifeGloves('unique', { 'HP%': 2, CHC: 1, CHD: 2, RES: 1 }).lines).toContain(ru.armor.rerollOne('RES'));
  });

  it('у Epic такого совета нет: Transistone на Epic не тратят', () => {
    const r = lifeGloves('rare', { SPD: 2, 'HP%': 1, ATK: 1 });
    expect(r.lines.some((l) => l.startsWith('Лишний'))).toBe(false);
  });
});
