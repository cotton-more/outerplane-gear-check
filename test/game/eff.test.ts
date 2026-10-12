// A hero's EFF from what the app knows (game/stat/eff): the game's formula (.x/0200-boss RESEARCH §1.2) — W by level, the
// gear rate on W (EFF% substats, Effectiveness rows), main flats, the Ranger node by `quirks`, transcend at the hero's ★;
// the typed stat-screen value as a factor (effShown); the chance a debuff lands (landChance, RESEARCH §1.1).
// `../fixtures/hero-eff.json` — per hero W at Lv100/120, the Ranger node, transcend by ★ and a passive premium, from the
// research probe (.x/0200-boss/data/heroeff, outerpedia dc83b4a), independent of update.py.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { battleBonus, effOf, effShown, inBattle, landChance } from '@/game/stat/eff';
import type { StatPiece } from '@/game/stat/total';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const PROBE: Record<string, { n: string; w: [number, number]; r: number; tr: number[]; tf: number[]; p: number }> =
  JSON.parse(readFileSync(new URL('../fixtures/hero-eff.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctxOf = (lv120: boolean, quirks = true, stars: Record<string, number> = {}) =>
  makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120, quirks }, new Set(), undefined, undefined, stars);
const hero = (name: string) => D.chars.find((c) => c.name === name)!;
const eff = D.sets.find((s) => s.short === 'Effectiveness')!.id;
const amulet = D.amulets.find((a) => a.star === 6 && a.grade === 'unique' && a.mains.includes('EFF'))!.key;

// the research's worked gear (RESEARCH §1.2): an EFF-main accessory T4, Effectiveness 4P T4 (22 + 16 %), two EFF substats at
// 6 segments (12 × 2.5 % = 30 %) — gloves at T4 too (the research took T0 gloves, 50, but 4P T4 needs all four at T4: 60)
const armor = (slot: StatPiece['slot'], bt: StatPiece['bt'], lit = {}): StatPiece =>
  ({ slot, grade: 'unique', setId: eff, itemKey: null, main: null, lit, bt });
const worked: StatPiece[] = [
  { slot: 'accessory', grade: 'unique', setId: null, itemKey: amulet, main: 'EFF', lit: {}, bt: 4 },
  armor('helmet', 4, { EFF: 6 }), armor('armor', 4, { EFF: 6 }), armor('gloves', 4), armor('shoes', 4),
];

describe('the hero\'s EFF with what is worn', () => {
  it('every hero, no gear: W by level + the Ranger node by quirks + transcend flat, × transcend and passive premium by ★ (the research probe)', () => {
    let n = 0;
    for (const c of D.chars) {
      const x = PROBE[c.id];
      expect(x, c.name).toBeDefined();
      for (const lv120 of [false, true]) for (const quirks of [false, true]) for (let star = 1; star <= 6; star++) {
        const e = effOf(ctxOf(lv120, quirks, { [c.id]: star }), c, [])!;
        const s = Math.max(star, c.rarity ?? 1); // a hero never has fewer stars than the base rarity
        const base = x.w[lv120 ? 1 : 0] + (quirks ? x.r : 0) + x.tf[s - 1];
        expect(e.total, `${c.name} lv120 ${lv120} quirks ${quirks} ★${star}`).toBe(Math.floor((base * (1000 + x.tr[s - 1] + x.p)) / 1000));
        n++;
      }
    }
    expect(n).toBe(D.chars.length * 24);
  });

  it('Sigma (Ranger), the worked gear: Lv100 ⌊120 × 1.68⌋ + 126 + 60 + 50 = 437, Lv120 471', () => {
    expect(effOf(ctxOf(false), hero('Sigma'), worked)).toEqual({ w: 120, rate: 680, flat: 186, own: 50, premium: 0, hero: 170, gear: 267, base: 437, total: 437 });
    expect(effOf(ctxOf(true), hero('Sigma'), worked)!.total).toBe(471);
    expect(effOf(ctxOf(true, false), hero('Sigma'), worked)!.total).toBe(421); // no Ranger node without quirks
  });

  it('Ember (Defender, W 80) without her EE: 320 (×2 with it is the typed value\'s job)', () => {
    expect(effOf(ctxOf(true), hero('Ember'), worked)!.total).toBe(320);
  });

  it('Dahlia, Lv120: ★3 488, ★6 (+6 % transcend) 517', () => {
    expect(effOf(ctxOf(true, true, { [hero('Dahlia').id]: 3 }), hero('Dahlia'), worked)!.total).toBe(488);
    expect(effOf(ctxOf(true, true, { [hero('Dahlia').id]: 6 }), hero('Dahlia'), worked)!.total).toBe(517);
  });

  it('Gnosis Domine ★4 (+100 % transcend), Lv100: 387 × 2 = 774', () => {
    expect(effOf(ctxOf(false, true, { [hero('Gnosis Domine').id]: 4 }), hero('Gnosis Domine'), worked)!.total).toBe(774);
  });

  it('gloves at T0 and Breakthrough not marked: the glove main reads T0 (50), the set rows drop to 2P T0 + 4P T0', () => {
    const e = effOf(ctxOf(false), hero('Sigma'), worked.map((p) => (p.slot === 'gloves' ? { ...p, bt: null } : p)))!;
    expect(e.flat).toBe(126 + 50);
    expect(e.rate).toBe(300 + 220 + 120); // 2P T4 still on (three at T4), 4P falls to T0
  });

  it('EFF% substats capped at 6 segments; Effectiveness 2P at T0 — 18 %; old data without EFF — null', () => {
    const e = effOf(ctxOf(false, false), hero('Sigma'), [armor('helmet', 0, { EFF: 9 }), armor('armor', 0)])!;
    expect(e.rate).toBe(150 + 180);
    expect(e.total).toBe(Math.floor((120 * 1330) / 1000));
    expect(effOf(ctxOf(false), { ...hero('Sigma'), eff: undefined }, [])).toBeNull();
  });
});

describe('the typed stat-screen EFF', () => {
  const at233 = { base: 233, total: 233 };
  it('nothing typed: the app\'s number, «≈», no factor', () => {
    expect(effShown(at233)).toEqual({ v: 233, approx: true, x: 1 });
  });
  it('typed 466 at 233: 466, exact, ×2', () => {
    expect(effShown(at233, { typed: 466, at: 233 })).toEqual({ v: 466, approx: false, x: 2 });
  });
  it('gear changed since: the factor follows (240 × 2 = 480), «≈» again', () => {
    expect(effShown({ base: 240, total: 240 }, { typed: 466, at: 233 })).toEqual({ v: 480, approx: true, x: 2 });
  });
  it('a premium the app knows shows as the factor (stars ×2)', () => {
    expect(effShown({ base: 182, total: 364 })).toEqual({ v: 364, approx: true, x: 2 });
  });
});

describe('the chance a debuff lands', () => {
  it('EFF above RES — always; equal — 1 % resisted; 100 below — half; Meteos 288 vs 233 — 64 %', () => {
    expect(landChance(289, 288)).toBe(1);
    expect(landChance(288, 288)).toBeCloseTo(1 - 10 / 1001);
    expect(landChance(188, 288)).toBeCloseTo(1 - 501 / 1001);
    expect(Math.floor(landChance(233, 288) * 100)).toBe(64);
  });

  // the game's FloorToInt(1000f / (1f + 100f / d)) is float32: d = 60 gives 374.99998… in float64 but 375 in float32
  it('float32 like the game: d = 60 → resisted (375 + 1)/1001', () => {
    expect(Math.floor(1000 / (1 + 100 / 60))).toBe(374);
    expect(landChance(228, 288)).toBe(1 - 376 / 1001);
  });
});

// EFF in battle (owner F1, F4): the element quirk node and a teammate's transcend team row, added to the premium sum
describe('EFF in battle against a boss', () => {
  const C = (name: string, eff: Partial<NonNullable<ReturnType<typeof hero>['eff']>> = {}) => ({ ...hero(name), eff: { ...hero(name).eff!, ...eff } });
  it('the element node: Light/Dark +5 % always, Water vs Fire +7 %, Water vs Earth nothing, quirks off — nothing', () => {
    const tamara = hero('Tamara'), iota = hero('Iota');
    expect([tamara.element, iota.element]).toEqual(['water', 'dark']);
    expect(battleBonus(tamara, 3, true, 'fire', [])).toBe(70);
    expect(battleBonus(tamara, 3, true, 'earth', [])).toBe(0);
    expect(battleBonus(iota, 3, true, 'fire', [])).toBe(50);
    expect(battleBonus(tamara, 3, false, 'fire', [])).toBe(0);
  });
  it('a teammate\'s team row: the strongest one, above the hero\'s own; Tamara 233 (base 233) + 7 % + 6 % = 263', () => {
    const tamara = hero('Tamara');
    const iota = C('Iota', { tm: 1 }), dahlia = C('Dahlia', { tm: 1 });
    expect(battleBonus(tamara, 3, false, null, [{ c: iota, star: 6 }, { c: dahlia, star: 4 }])).toBe(60);
    expect(battleBonus(iota, 6, false, null, [{ c: iota, star: 6 }, { c: dahlia, star: 4 }])).toBe(0); // her own 6 % ≥ Dahlia's 3 %
    expect(battleBonus(iota, 4, false, null, [{ c: dahlia, star: 6 }])).toBe(30);
    expect(inBattle({ base: 233 }, 233, 70 + 60)).toBe(263);
  });
});

