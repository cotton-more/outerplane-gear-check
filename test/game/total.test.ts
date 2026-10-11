// A hero's CHC from what the app knows (game/stat/total): base, class passive, quirks, accessory main at +10 by tier,
// Critical Hit rows by the Breakthrough rule, substats capped at 6 segments. Numbers checked against outerpedia 93a5234.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { statTotal, type StatPiece } from '@/game/stat/total';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctxOf = (quirks: boolean) => makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks }, new Set());
const ctx = ctxOf(true);
const hero = (name: string) => D.chars.find((c) => c.name === name)!;
const crit = D.sets.find((s) => s.short === 'Critical Hit')!.id;
const attack = D.sets.find((s) => s.short === 'Attack')!.id;
const amulet = D.amulets.find((a) => a.star === 6 && a.grade === 'unique' && a.mains.includes('CHC'))!.key;

const acc = (grade: 'unique' | 'rare', bt: StatPiece['bt'], lit = {}): StatPiece =>
  ({ slot: 'accessory', grade, setId: null, itemKey: grade === 'unique' ? amulet : null, main: 'CHC', lit, bt });
const armor = (slot: StatPiece['slot'], setId: string, bt: StatPiece['bt'], lit = {}): StatPiece =>
  ({ slot, grade: 'unique', setId, itemKey: null, main: null, lit, bt });
const critSet = (bt: StatPiece['bt']) => (['helmet', 'armor', 'gloves', 'shoes'] as const).map((s) => armor(s, crit, bt));

describe('CHC from gear', () => {
  it('hero data: every base 5 %, Strikers +5 % from the class passive, element quirks +10 %', () => {
    expect(new Set(D.chars.map((c) => c.chc?.base))).toEqual(new Set([50]));
    expect(hero('Caren').chc).toEqual({ base: 50, cls: 50, quirk: 100 });
    expect(hero('Akari').chc).toEqual({ base: 50, cls: 0, quirk: 100 });
  });

  it('Striker, CHC accessory T4, Critical Hit 4P T4: 5 + 5 + 10 + 48 + 18 + 12 = 98 % before substats', () => {
    const t = statTotal(ctx, hero('Caren'), [acc('unique', 4), ...critSet(4)], 'CHC');
    expect(t).toEqual({ base: 5, cls: 5, quirk: 10, mains: 48, sets: 30, subs: 0, c0: 98, total: 98 });
  });

  it('Critical Hit at T0 and the accessory at T0: 15 + 10 and 40', () => {
    const t = statTotal(ctx, hero('Caren'), [acc('unique', 0), ...critSet(0)], 'CHC');
    expect([t.mains, t.sets, t.c0]).toEqual([40, 25, 85]);
  });

  it('Ranger, quirks off, Epic accessory with Breakthrough not marked (counts as T0), CHC substats capped at 6', () => {
    const pieces = [acc('rare', null, { CHD: 3 }), armor('gloves', attack, 4, { CHC: 4 }), armor('helmet', attack, 4, { CHC: 7, SPD: 2 })];
    const t = statTotal(ctxOf(false), hero('Akari'), pieces, 'CHC');
    expect(t.quirk).toBe(0);
    expect(t.mains).toBeCloseTo(36);
    expect(t.subs).toBe(30);       // (4 + 6) × 3
    expect(t.sets).toBe(0);        // Attack 2P is ATK%, not CHC
    expect(t.total).toBeCloseTo(5 + 36 + 30);
  });

  it('a main that is not CHC adds nothing; no pieces — the hero alone', () => {
    const other = { ...acc('unique', 4), main: 'CHD' };
    expect(statTotal(ctx, hero('Caren'), [other], 'CHC').mains).toBe(0);
    expect(statTotal(ctx, hero('Caren'), [], 'CHC').total).toBe(20);
  });
});
