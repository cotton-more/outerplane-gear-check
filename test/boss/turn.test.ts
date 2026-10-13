// Who moves first against the boss (.x/0200-boss E1, features/boss/model/turn; rules data/turn/TURN.md): the start gauge
// SPD × 100 / top SPD plus a hidden head start of 0…5 — surely first above ≈ boss × 1.053, surely after at or below ≈ × 0.95,
// luck between; and the hero's SPD the app knows (game/stat/spd: base by level and quirks, the Speed Set rows on the base,
// SPD substats 3 a segment, an accessory's SPD main).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { spdOf } from '@/game/stat/spd';
import type { StatPiece } from '@/game/stat/total';
import { JITTER, luckPct, timeline, turnOf } from '@/features/boss/model/turn';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctxOf = (lv120 = false, quirks = true) => makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120, quirks }, new Set());

describe('the first turn against the boss', () => {
  it('boss 276 (guild raid stage 10): 291 surely first (the research: 276 × 100/95), 290 luck, 262 surely after, 263 luck', () => {
    expect(turnOf(291, 276, [])).toEqual({ state: 'first', p: 1, need: 0 });
    expect(turnOf(290, 276, []).state).toBe('luck');
    expect(turnOf(290, 276, []).need).toBe(291);
    expect(turnOf(262, 276, [])).toEqual({ state: 'after', p: 0, need: 291 });
    expect(turnOf(263, 276, []).state).toBe('luck');
  });

  it('the chance grows with SPD: equal SPD — ½; the research\'s simulation at boss 276 — 270 ≈ 0.17, 280 ≈ 0.74, 290 ≈ 0.97', () => {
    expect(turnOf(276, 276, []).p).toBeCloseTo(0.5, 2);
    expect(turnOf(270, 276, []).p).toBeCloseTo(0.17, 1);
    expect(turnOf(280, 276, []).p).toBeCloseTo(0.74, 1);
    expect(turnOf(290, 276, []).p).toBeCloseTo(0.97, 1);
    let last = 0;
    for (let s = 263; s <= 290; s++) { const p = turnOf(s, 276, []).p; expect(p).toBeGreaterThanOrEqual(last); last = p; }
  });

  it('a faster teammate sets the top SPD: the window stays the same in ratio (the gauge is SPD over the top)', () => {
    expect(turnOf(291, 276, [400]).state).toBe('first');
    expect(turnOf(262, 276, [400]).state).toBe('after');
    expect(turnOf(276, 276, [400]).p).toBeCloseTo(0.5, 2);
  });

  it('exactly 0.95 × the boss\'s SPD: the best start only ties the boss\'s worst — surely after, chance 0, not luck (E1-1)', () => {
    expect(turnOf(190, 200, [])).toEqual({ state: 'after', p: 0, need: 211 });
    expect(turnOf(191, 200, []).state).toBe('luck');
    expect(turnOf(191, 200, []).p).toBeGreaterThan(0);
    expect(turnOf(285, 300, []).state).toBe('after');
    expect(turnOf(494, 520, []).state).toBe('after');
    expect(turnOf(495, 520, []).state).toBe('luck');
  });

  it('luckPct: the percent of a luck chance is never 0 or 100, in the badge and in the trade walk alike (E4-2)', () => {
    expect([0.0001, 0.004, 0.5, 0.9996, 1].map(luckPct)).toEqual([1, 1, 50, 99, 99]);
    expect(luckPct(turnOf(222, 211, []).p)).toBe(99);
  });

  it('a slow boss: everyone first; a fast boss: everyone after, need = the SPD that surely beats it', () => {
    expect(turnOf(150, 109, []).state).toBe('first');
    const t = turnOf(312, 329, []);
    expect(t.state).toBe('after');
    expect(t.need).toBe(Math.floor((329 * 100) / (100 - JITTER)) + 1);
  });

  it('the timeline: heroes by SPD, the boss after everyone with a chance of ½ or more', () => {
    const r = timeline([{ hero: 'V', spd: 240 }, { hero: 'T', spd: 312 }, { hero: 'S', spd: 280 }, { hero: 'I', spd: 295 }], 276);
    expect(r.before.map((x) => [x.hero, x.turn.state])).toEqual([['T', 'first'], ['I', 'first'], ['S', 'luck']]);
    expect(r.after.map((x) => [x.hero, x.turn.state])).toEqual([['V', 'after']]);
  });
});

describe('the hero\'s SPD the app knows', () => {
  const tamara = D.chars.find((c) => c.name === 'Tamara')!;
  const speed = D.sets.find((s) => s.short === 'Speed')!.id;
  const amulet = D.amulets.find((a) => a.star === 6 && a.grade === 'unique' && a.mains.includes('SPD'))!.key;
  const armor = (slot: StatPiece['slot'], bt: StatPiece['bt'], lit = {}): StatPiece => ({ slot, grade: 'unique', setId: speed, itemKey: null, main: null, lit, bt });

  it('no gear: the base by level (Lv100 / Lv120) plus quirks by the setting', () => {
    const [l100, l120, q] = tamara.spd!;
    expect(spdOf(ctxOf(false, true), tamara, [])!.total).toBe(l100 + q);
    expect(spdOf(ctxOf(true, false), tamara, [])!.total).toBe(l120);
  });

  it('Speed ×4 at T0 (+25 % of the base, floored), SPD 6 + 4 segments (3 each), an SPD accessory T4 (+48)', () => {
    const base = tamara.spd![0] + tamara.spd![2];
    const pieces = [armor('helmet', 0, { SPD: 6 }), armor('armor', 0, { SPD: 4 }), armor('gloves', 0), armor('shoes', 0),
      { slot: 'accessory', grade: 'unique', setId: null, itemKey: amulet, main: 'SPD', lit: {}, bt: 4 } as StatPiece];
    const s = spdOf(ctxOf(), tamara, pieces)!;
    expect(s.total).toBe(Math.floor((base * 1250) / 1000) + 30 + 48);
    expect(s.base + s.gear).toBe(s.total);
  });

  it('Speed T4 ×4: 13 + 12 %; old data without the SPD base — null', () => {
    const base = tamara.spd![0] + tamara.spd![2];
    const s = spdOf(ctxOf(), tamara, [armor('helmet', 4), armor('armor', 4), armor('gloves', 4), armor('shoes', 4)])!;
    expect(s.total).toBe(Math.floor((base * 1250) / 1000));
    expect(spdOf(ctxOf(), { ...tamara, spd: null }, [])).toBeNull();
  });
});
