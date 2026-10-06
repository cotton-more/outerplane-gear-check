// Порог «годная» (T5.1в): броня годная, если прошла прежнее правило ИЛИ очки по цепочке героя ≥ 6.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Char, Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { CFG } from '@/game/config';
import { pointsOf } from '@/game/build/points';
import { profileOf } from '@/game/build/profile';
import { rows } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import type { ItemInput } from '@/game/item/item';
import type { Subs } from '@/game/item/subs';
import { armorBar } from '@/features/eval/verdict/bar';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const heroes = D.chars.filter((c) => c.builds.length);
const char = (name: string): Char => D.chars.find((c) => c.name === name)!;

const item = (c: Char, slot: SlotId, subs: Subs, grade: 'unique' | 'rare' = 'unique'): ItemInput =>
  ({ slot, grade, setId: c.builds[0].sets[0][0].set, itemKey: null, main: null, subs });

// строка героя по его цепочке «По статам» (билд-родитель цепочки) и оба слагаемых порога
const gate = (c: Char, s: ItemInput) => {
  const chain = profileOf(ctx, c)!.chain;
  const b = chain;
  const [row] = rows(ctx, s.grade, [{ c, b, i: c.builds.indexOf(b) }], s.subs, itemMains(idx, s));
  const bar = armorBar(ctx, s);
  return { qualifies: bar.qualifies(row), old: bar.passesOld(row), byPoints: bar.passesPoints(row), pts: pointsOf(ctx, c, chain, s) };
};

describe('T5.1в. порог «прежний ИЛИ очки ≥ 6»', () => {
  it('шлем Rin CHC 5, ATK% 5, ATK 2, DMG UP% 3: 11,20 очка — годная, хотя прежний порог не прошёл', () => {
    const g = gate(char('Rin'), item(char('Rin'), 'helmet', { CHC: 5, 'ATK%': 5, ATK: 2, 'DMG UP%': 3 }));
    expect(g.pts).toBeCloseTo(11.2, 2);
    expect(g.old).toBe(false);
    expect(g.qualifies).toBe(true);
  });

  it('шлем Rin CHC 1, CHD 1, SPD 1, ATK% 1 (2,95 < 6): очки не добавляют, решает прежнее правило', () => {
    const g = gate(char('Rin'), item(char('Rin'), 'helmet', { CHC: 1, CHD: 1, SPD: 1, 'ATK%': 1 }));
    expect(g.pts).toBeCloseTo(2.95, 2);
    expect(g.byPoints).toBe(false);
    expect(g.qualifies).toBe(g.old);
  });

  it('Speed-ботинки CHD 4, EFF% 4, RES% 2, SPD 4 у героя со SPD первым — ровно 6,00, годная', () => {
    const subs = { CHD: 4, 'EFF%': 4, 'RES%': 2, SPD: 4 };
    const hit = heroes.map((c) => ({ c, g: gate(c, item(c, 'shoes', subs)) })).filter((x) => Math.abs(x.g.pts - 6) < 1e-9);
    expect(hit.length).toBeGreaterThan(0);
    for (const { g } of hit) expect(g.qualifies).toBe(true);
    expect(hit.some(({ g }) => !g.old)).toBe(true); // хотя бы у одного годится именно по очкам
  });

  it('очки 5,95–5,99 при непройденном прежнем пороге — не годная', () => {
    const keys = ['SPD', 'CHC', 'CHD', 'ATK%', 'DEF%', 'HP%', 'EFF%', 'RES%'];
    let found = 0;
    for (const c of heroes) {
      for (let a = 0; a < keys.length && !found; a++) for (let b = a + 1; b < keys.length; b++) for (let k = 1; k <= 6; k++) {
        const g = gate(c, item(c, 'shoes', { [keys[a]]: k, [keys[b]]: 6 }));
        if (g.pts > 5.5 && g.pts < 6 && !g.old) { expect(g.qualifies).toBe(false); found++; }
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('свойство: всё, что проходит прежнее правило, остаётся годным; годная = прежнее ИЛИ очки ≥ 6', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const keys = ['SPD', 'CHC', 'CHD', 'ATK%', 'DEF%', 'HP%', 'EFF%', 'RES%', 'DMG UP%', 'DMG RED%'];
    let old = 0, extra = 0;
    for (let n = 0; n < 300; n++) {
      const grade = rnd() < 0.5 ? 'unique' : 'rare';
      const subs: Subs = {};
      while (Object.keys(subs).length < (grade === 'unique' ? 4 : 3)) subs[keys[Math.floor(rnd() * keys.length)]] = 1 + Math.floor(rnd() * 5);
      const c = heroes[Math.floor(rnd() * heroes.length)];
      const g = gate(c, item(c, 'helmet', subs, grade));
      expect(g.qualifies).toBe(g.old || g.pts >= CFG.goodPoints);
      if (g.old) { expect(g.qualifies).toBe(true); old++; } else if (g.qualifies) extra++;
    }
    expect(old).toBeGreaterThan(0);
    expect(extra).toBeGreaterThan(0);
  });
});
