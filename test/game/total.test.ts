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
const starred = (stars: Record<string, number>) => makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), undefined, undefined, stars);
const hero = (name: string) => D.chars.find((c) => c.name === name)!;
const crit = D.sets.find((s) => s.short === 'Critical Hit')!.id;
const attack = D.sets.find((s) => s.short === 'Attack')!.id;
const amulet = D.amulets.find((a) => a.star === 6 && a.grade === 'unique' && a.mains.includes('CHC'))!.key;

const acc = (grade: 'unique' | 'rare', bt: StatPiece['bt'], lit = {}): StatPiece =>
  ({ slot: 'accessory', grade, setId: null, itemKey: grade === 'unique' ? amulet : null, main: 'CHC', lit, bt });
const armor = (slot: StatPiece['slot'], setId: string, bt: StatPiece['bt'], lit = {}): StatPiece =>
  ({ slot, grade: 'unique', setId, itemKey: null, main: null, lit, bt });
const critSet = (bt: StatPiece['bt']) => (['helmet', 'armor', 'gloves', 'shoes'] as const).map((s) => armor(s, crit, bt));

describe('the hero\'s CHC with what is worn', () => {
  it('hero data: every base 5 %, Strikers +5 % from the class passive, element quirks +10 %', () => {
    expect(new Set(D.chars.map((c) => c.chc?.base))).toEqual(new Set([50]));
    expect(hero('Caren').chc).toEqual({ base: 50, cls: 50, quirk: 100 });
    expect(hero('Akari').chc).toEqual({ base: 50, cls: 0, quirk: 100 });
  });

  it('hero data: transcend CHC by ★1…6 (‰) only for the heroes whose stars give crit', () => {
    expect(hero('Poolside Trickster Regina').chc?.trans).toEqual([0, 0, 0, 0, 650, 650]);
    expect(hero('Lisha').chc?.trans).toEqual([0, 0, 0, 30, 30, 60]);
    expect(hero('Demiurge Luna').chc?.trans).toEqual([0, 0, 0, 60, 60, 60]);
    expect('trans' in hero('Caren').chc!).toBe(false);
    expect(D.chars.filter((c) => c.chc?.trans)).toHaveLength(15);
  });

  it('Striker, CHC accessory T4, Critical Hit 4P T4: 5 + 5 + 10 + 48 + 18 + 12 = 98 % before substats', () => {
    const t = statTotal(ctx, hero('Caren'), [acc('unique', 4), ...critSet(4)], 'CHC');
    expect(t).toEqual({ base: 5, cls: 5, quirk: 10, trans: 0, mains: 48, sets: 30, subs: 0, c0: 98, total: 98 });
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

  it('transcend (PLAN 0190): Poolside Regina ★5 +65 %, ★4 and not set 0; Lisha ★6 +6 %; c0 and total include it', () => {
    const regina = hero('Poolside Trickster Regina'), lisha = hero('Lisha');
    const at = (c: typeof regina, star?: number) => statTotal(star ? starred({ [c.id]: star }) : ctx, c, [], 'CHC');
    expect([at(regina).trans, at(regina, 4).trans, at(regina, 5).trans, at(regina, 6).trans]).toEqual([0, 0, 65, 65]);
    expect([at(lisha, 3).trans, at(lisha, 5).trans, at(lisha, 6).trans]).toEqual([0, 3, 6]);
    expect(at(regina, 5)).toMatchObject({ base: 5, cls: 5, quirk: 10, trans: 65, c0: 85, total: 85 });
    expect(statTotal(starred({ [regina.id]: 5 }), regina, [acc('unique', 4)], 'CHC').total).toBe(85 + 48);
  });

  it('transcend: a hero whose stars give no crit gains nothing; the star of another hero does not count', () => {
    expect(statTotal(starred({ [hero('Caren').id]: 6 }), hero('Caren'), [], 'CHC').trans).toBe(0);
    expect(statTotal(starred({ [hero('Lisha').id]: 6 }), hero('Caren'), [], 'CHC').c0).toBe(20);
  });

  it('transcend: a ★ that is not 1…6 (0, 7, 3.5, NaN) or a short trans table counts nothing, and the total is a number', () => {
    const regina = hero('Poolside Trickster Regina');
    for (const star of [0, 7, 3.5, Number.NaN]) {
      const t = statTotal(starred({ [regina.id]: star }), regina, [acc('unique', 4)], 'CHC');
      expect(t.trans, `★${star}`).toBe(0);
      expect(Number.isNaN(t.total), `★${star}`).toBe(false);
      expect(t.total, `★${star}`).toBe(20 + 48);
    }
    // a table shorter than 6 with ★6 — nothing (no entry), not NaN
    const short = structuredClone(regina);
    short.chc!.trans = [0, 0, 0, 0, 650];
    const t = statTotal(starred({ [short.id]: 6 }), short, [], 'CHC');
    expect([t.trans, t.total]).toEqual([0, 20]);
    expect(statTotal(starred({ [short.id]: 5 }), short, [], 'CHC').trans).toBe(65);
  });

  it('transcend: an old snapshot — the hero has no chc at all — with a ★ set does not throw and counts 0', () => {
    const old = structuredClone(hero('Poolside Trickster Regina'));
    delete old.chc;
    const t = statTotal(starred({ [old.id]: 5 }), old, [], 'CHC');
    expect(t).toEqual({ base: 0, cls: 0, quirk: 0, trans: 0, mains: 0, sets: 0, subs: 0, c0: 0, total: 0 });
  });

  it('transcend is per id: Core Fusion Lisha ★6 gives +6 %; the same ★ on base Lisha does not reach her', () => {
    const cf = D.chars.find((c) => c.id === '2700005')!, base = D.chars.find((c) => c.id === '2000005')!;
    expect(cf.chc?.trans).toEqual([0, 0, 0, 30, 30, 60]);
    const own = (c: typeof cf, stars: Record<string, number>) => statTotal(starred(stars), c, [], 'CHC');
    expect(own(cf, { '2700005': 6 }).trans).toBe(6);
    expect(own(cf, { '2700005': 6 }).total - own(cf, {}).total).toBe(6);
    expect(own(cf, { '2000005': 6 }).trans).toBe(0);
    expect(own(cf, { '2000005': 6 }).total).toBe(own(cf, {}).total);
    expect(own(base, { '2000005': 6 }).trans).toBe(6);
    expect(own(base, { '2700005': 6 }).trans).toBe(0);
  });
});
