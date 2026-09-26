// Броня: строже к Epic (слабые «три полезных» — в разбор), подсказки про flat и про перековку одного сабстата.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset, Grade } from '../src/data/types';
import { ru } from '../src/i18n/ru';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { subWeights, tierPlaces } from '../src/logic/score';
import { setSubDemand } from '../src/logic/lists';

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

// Attack Set: у атакеров (Titia, Lambda…) основной — Attack ×4, у Heatwave Cop Delta — запасной (Attack ×2 в связках)
const attack = D.sets.find((s) => s.short === 'Attack')!;
const attackHelmet = (grade: Grade, subs: Record<string, number>) => evaluate(ctx, { slot: 'helmet', grade, setId: attack.id, itemKey: null, main: null, subs });

describe('Epic-броня: решают главные статы (1–2 ступень) и ролл на них', () => {
  it('два главных стата с 5+ жёлтыми — «Оставить», даже если третий мимо', () => {
    expect(attackHelmet('rare', { CHC: 3, 'ATK%': 3, 'DMG UP%': 3 }).v).toBe('keep');
    expect(attackHelmet('rare', { CHC: 3, 'ATK%': 2, RES: 1 }).v).toBe('keep');
  });

  it('два главных стата со слабым роллом и ненужный третий — в разбор', () => {
    expect(attackHelmet('rare', { CHC: 2, 'ATK%': 2, RES: 1 }).v).toBe('junk');
  });

  it('один главный стат с хорошим роллом и ещё полезный — «Временно», в тексте — чего не хватает', () => {
    const r = attackHelmet('rare', { 'DMG UP%': 3, 'ATK%': 3, CHD: 3 });
    expect(r.v).toBe('temp');
    expect(r.lines[0]).toContain('нет CHC');
  });

  it('главный стат с одним сегментом «Временно» не даёт, даже если на другом стате много', () => {
    expect(attackHelmet('rare', { 'ATK%': 1, EFF: 1, CHD: 3 }).v).toBe('junk');
  });

  it('flat вместо % и без CHC — ловушка «всё про атаку», в разбор', () => {
    expect(attackHelmet('rare', { 'DMG UP%': 3, ATK: 3, CHD: 3 }).v).toBe('junk');
    expect(attackHelmet('rare', { 'DMG UP%': 3, ATK: 1, CHD: 3 }).v).toBe('junk');
  });

  it('Legendary эти пути не трогают: два главных из четырёх — по-прежнему не «Оставить»', () => {
    expect(attackHelmet('unique', { CHC: 3, 'ATK%': 3, 'DMG UP%': 3, RES: 1 }).v).not.toBe('keep');
  });
});

describe('«Кому подходит»: сначала те, у кого сет основной', () => {
  it('первыми идут персонажи, у которых сет в первой связке билда', () => {
    const rows = attackHelmet('rare', { CHC: 3, 'ATK%': 3, 'DMG UP%': 3 }).sections[0].rows;
    const primary = rows.map((m) => m.b.sets[0].some((p) => p.set === attack.id));
    expect(primary[0]).toBe(true);
    expect(primary.indexOf(false) === -1 || primary.slice(primary.indexOf(false)).every((x) => !x)).toBe(true);
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

describe('места в цепочке приоритета: связка делит одно место', () => {
  const build = (subs: string[][]) => ({ ...D.chars.find((c) => c.builds.length)!.builds[0], subs });

  it('стат после связки встаёт на место после всех её статов; пустая ступень — одно место', () => {
    expect(tierPlaces(build([['CHC'], ['ATK'], ['SPD', 'CHD'], ['DMG UP%']]))).toEqual([0, 1, 2, 4]);
    expect(tierPlaces(build([['SPD'], [], ['CHC'], ['ATK', 'CHD', 'HP']]))).toEqual([0, 1, 2, 3]);
  });

  it('DMG UP% пятым после SPD=CHD не засчитывается, как и пятым без связки', () => {
    const c = D.chars.find((x) => x.builds.length)!;
    const tie = subWeights(ctx, build([['CHC'], ['ATK'], ['SPD', 'CHD'], ['DMG UP%']]), c).get('DMG UP%');
    const plain = subWeights(ctx, build([['ATK'], ['CHC'], ['SPD'], ['CHD'], ['DMG UP%']]), c).get('DMG UP%');
    expect([tie?.credit, plain?.credit]).toEqual([0, 0]);
  });

  it('четвёртый по месту — за ½', () => {
    const c = D.chars.find((x) => x.builds.length)!;
    expect(subWeights(ctx, build([['CHC'], ['ATK'], ['SPD'], ['CHD']]), c).get('CHD')?.credit).toBe(0.5);
  });
});

describe('подсветка сетки: 0–1 нужных стата — «Оставить» и «Временно» невозможны', () => {
  const stats = idx.SUB_LIST;
  const combos = (n: number, from = 0): string[][] => (n === 0 ? [[]] : stats.slice(from).flatMap((k, i) => combos(n - 1, from + i + 1).map((rest) => [k, ...rest])));

  it('у Attack Set блёклые — статы, которые не нужны ни одному билду с этим сетом', () => {
    const demand = setSubDemand(ctx, attack.id);
    expect(demand.get('CHC')).toBe(1);
    expect(demand.get('DMG RED%') ?? 0).toBe(0);
  });

  for (const grade of ['rare', 'unique'] as const) {
    it(`${grade === 'rare' ? 'Epic' : 'Legendary'}: такие предметы всегда в разбор (фоддер выключен)`, () => {
      const wrong: string[] = [];
      let checked = 0;
      for (const set of D.sets.filter((x) => x.users > 0)) {
        const demand = setSubDemand(ctx, set.id);
        for (const keys of combos(grade === 'rare' ? 3 : 4)) {
          if (keys.filter((k) => (demand.get(k) ?? 0) > 0).length > 1) continue;
          const r = evaluate(ctx, { slot: 'helmet', grade, setId: set.id, itemKey: null, main: null, subs: Object.fromEntries(keys.map((k) => [k, 3])) });
          checked++;
          if (r.v !== 'junk') wrong.push(`${set.short} ${keys.join(' ')} → ${r.v}`);
        }
      }
      expect(checked).toBeGreaterThan(100);
      expect(wrong).toEqual([]);
    });
  }
});

describe('«Кому подходит»: вторая цепочка у персонажа с разными приоритетами билдов', () => {
  it('Heatwave Cop Delta на Speed Set: DPS и PvP-билд — две цепочки, одна строка', () => {
    const speed = D.sets.find((s) => s.short === 'Speed')!;
    const r = evaluate(ctx, { slot: 'gloves', grade: 'unique', setId: speed.id, itemKey: null, main: null, subs: { SPD: 2, CHC: 1, 'ATK%': 1, CHD: 1 } });
    const rows = r.sections.flatMap((s) => s.rows).filter((m) => m.c.name === 'Heatwave Cop Delta');
    expect(rows).toHaveLength(1);
    const chains = [rows[0].b, ...(rows[0].other ?? []).map((o) => o.b)].map((b) => b.subs.map((t) => t.join('=')).join(' › '));
    expect(new Set(chains).size).toBe(2);
  });

  it('у персонажа с одной цепочкой на все билды второй строки нет', () => {
    const r = attackHelmet('rare', { CHC: 3, 'ATK%': 3, 'DMG UP%': 3 });
    const lambda = r.sections.flatMap((s) => s.rows).find((m) => m.c.name === 'Lambda');
    expect(lambda?.other ?? []).toEqual([]);
  });
});
