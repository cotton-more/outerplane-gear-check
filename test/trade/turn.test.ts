// Dressing in turn (MODEL.md §7 item 8): the picker's gain of each hero is the number on his plan's hero line; the order —
// by name, the re-dressed last in the order they were done (owner, Q1a). Labels and the sheet — test/trade/trade.dom.test.ts.
import { describe, expect, it } from 'vitest';
import type { Piece } from '@/features/gear/model/gear';
import type { Subs } from '@/game/item/subs';
import { applyHero, stampOf } from '@/features/trade/model/apply';
import { freeOf, wornOf } from '@/features/trade/model/free';
import { runAll, runChunks } from '@/features/trade/model/chunks';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { ARMOR_SLOTS, SLOT_ORDER, type World } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { heroGain, turnGains, turnOrder } from '@/features/trade/model/turn';
import { lineGain, linesOf } from '@/features/trade/model/view';
import { worldOf } from '@/features/trade/model/world';
import { compareChars } from '@/features/roster/charFilter';
import { D, HERO, hasOwner, idx, lcg, loadOwner, piece, realWorld, store } from './helpers';

// what the plan's hero line says (TradeSheet: heroPlan → advance → linesOf, the receiver's line)
function planLineGain(w: World, to: string): number | null {
  const hp = heroPlan(w, { to });
  if (!hp.plan.changes.length) return null;
  const step = { plans: [{ to, plan: hp.plan }], fills: hp.holes.fills };
  const line = linesOf(w, advance(w, step), [to], heroMoves(w, to, step)).find((l) => l.hero === to)!;
  return lineGain(line);
}

// six fixture heroes with seeded pools, half of each worn
function seeded(seed: number): World {
  const rnd = lcg(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const sets = ['Speed', 'Penetration', 'Attack', 'Critical Strike', 'Immunity', 'Defense'];
  const stats = ['SPD', 'CHC', 'CHD', 'ATK%', 'ATK', 'HP%', 'DEF%', 'EFF', 'RES'];
  const heroes = [HERO.rin, HERO.karen, HERO.noa, HERO.delta, HERO.maya, HERO.leah];
  const st = store(Object.fromEntries(heroes.map((h) => {
    const pool: Piece[] = Array.from({ length: 6 + Math.floor(rnd() * 8) }, () => {
      const slot = pick(SLOT_ORDER), lit: Subs = {};
      const k = 1 + Math.floor(rnd() * 4);
      while (Object.keys(lit).length < k) lit[pick(stats)] = 1 + Math.floor(rnd() * 6);
      return piece(slot, ARMOR_SLOTS.includes(slot) ? pick(sets) : null, lit, { bt: rnd() < 0.5 ? 4 : 0 });
    });
    const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && rnd() < 0.6);
    return [h, { pool, worn }];
  })));
  return realWorld(st);
}

describe('the picker gain = the plan line gain', () => {
  it('every hero of 12 seeded worlds', () => {
    let shown = 0;
    for (let i = 0; i < 12; i++) {
      const w = seeded(2026_10_12 + i);
      for (const h of w.heroes) {
        const g = heroGain(w, h.id);
        expect(g, `world ${i}, ${h.id}`).toBe(planLineGain(w, h.id));
        if (g !== null) shown++;
      }
    }
    expect(shown).toBeGreaterThan(10);
  });

  it('a re-dressed hero is locked: the others no longer count on his worn gear', () => {
    const k = piece('helmet', 'Speed', { ATK: 6, CHC: 6, CHD: 6, SPD: 6 });
    const r = piece('helmet', 'Defense', { RES: 1 });
    const st = store({ [HERO.karen]: { pool: [k], worn: [k] }, [HERO.rin]: { pool: [r], worn: [r] } });
    const open = realWorld(st, [HERO.karen, HERO.rin]);
    const shut = realWorld(st, [HERO.karen, HERO.rin], [HERO.karen]);
    expect(heroGain(open, HERO.rin)).toBe(planLineGain(open, HERO.rin));
    expect(heroGain(open, HERO.rin)).toBeGreaterThan(0);
    expect(heroGain(shut, HERO.rin)).toBeNull();
  });

  it.skipIf(!hasOwner())('the owner snapshot: every hero with builds', () => {
    const o = loadOwner();
    const w = worldOf(o.ctx, o.st, o.roster);
    const ids = o.roster.filter((id) => o.ctx.idx.CHAR[id]?.builds.length);
    const gains = runAll(turnGains(w, ids));
    for (const id of ids) expect(gains.get(id), id).toBe(planLineGain(w, id));
  });
});

describe('the picker order', () => {
  const name = (id: string) => ({ a: 'Rin', b: 'Aer', c: 'Caren', d: 'Beth' })[id] ?? id;
  const byName = (a: string, z: string) => name(a).localeCompare(name(z));
  it('by name, the re-dressed last in done order', () => {
    expect(turnOrder(['a', 'b', 'c', 'd'], [], byName)).toEqual(['b', 'd', 'c', 'a']);
    expect(turnOrder(['a', 'b', 'c', 'd'], ['c', 'b'], byName)).toEqual(['d', 'a', 'c', 'b']);
  });
  it('«Вернуть»: an unlocked hero goes back to his place by name', () => {
    expect(turnOrder(['a', 'b', 'c', 'd'], ['b'], byName)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('a done hero outside the list stays out', () => {
    expect(turnOrder(['a'], ['z'], byName)).toEqual(['a']);
  });
  it('like the character list: a prefixed hero sorts by his base name (compareChars)', () => {
    const id = (name: string) => D.chars.find((c) => c.name === name)!.id;
    const ids = ["Summer Knight's Dream Ember", 'Gnosis Beth', 'Ember', 'Demiurge Astei', 'Caren', 'Beth', 'Astei'].map(id);
    const compare = (a: string, z: string) => compareChars(idx.CHAR[a], idx.CHAR[z]);
    const names = (xs: string[]) => xs.map((x) => idx.CHAR[x].name);
    // by the full name «Demiurge Astei» would land after «Caren» and «Gnosis Beth» after «Ember»
    expect(names(turnOrder(ids, [], compare))).toEqual(
      ['Astei', 'Demiurge Astei', 'Beth', 'Gnosis Beth', 'Caren', 'Ember', "Summer Knight's Dream Ember"]);
    expect(names(turnOrder(ids, [id('Beth'), id('Astei')], compare))).toEqual(
      ['Demiurge Astei', 'Gnosis Beth', 'Caren', 'Ember', "Summer Knight's Dream Ember", 'Beth', 'Astei']);
  });
});

describe('chunks', () => {
  it('the same gains as at once; abort — null', async () => {
    const w = seeded(77);
    const ids = w.heroes.map((h) => h.id);
    expect(await runChunks(turnGains(w, ids))).toEqual(runAll(turnGains(w, ids)));
    const ac = new AbortController();
    const p = runChunks(turnGains(w, ids), ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});

// MODEL.md §7 item 2: a piece taken off in this window is free — the next hero may take it; spare held at the open never
describe('free pieces of the window', () => {
  const kPiece = () => piece('helmet', 'Speed', { ATK: 6, CHC: 6, CHD: 6, SPD: 6 });
  const rPiece = () => piece('helmet', 'Speed', { ATK: 4, CHC: 4, CHD: 4, SPD: 4 });
  const ROSTER = [HERO.karen, HERO.rin];

  // Rin takes Karen's helmet («Done»); returns the store after it and the pieces
  function afterRin() {
    const k = kPiece(), r = rPiece();
    const st0 = store({ [HERO.karen]: { pool: [k], worn: [k] }, [HERO.rin]: { pool: [r], worn: [r] } });
    const hp = heroPlan(realWorld(st0, ROSTER), { to: HERO.rin });
    const a = applyHero(st0, { to: HERO.rin, hp, stamp: stampOf(st0) })!;
    return { k, r, st0, st1: a.st };
  }
  const took = (w: World, to: string) => heroPlan(w, { to }).plan.changes.map((c) => c.cand.item.id);

  it('freeOf: worn at the open and by nobody now, still in a pool; a piece another hero wears is not free', () => {
    const { k, r, st0, st1 } = afterRin();
    expect(freeOf(wornOf(st0), st0)).toEqual([]);
    expect(wornOf(st0)).toEqual(new Set([k.id, r.id]));
    expect(freeOf(wornOf(st0), st1)).toEqual([r.id]); // Rin wears Karen's; her own helmet is off
    // the piece left every pool (a copy that left the app): not listed
    const gone = { ...st1, pools: { ...st1.pools, [HERO.rin]: st1.pools[HERO.rin].filter((id) => id !== r.id) } };
    expect(freeOf(wornOf(st0), gone)).toEqual([]);
  });

  it('without free: Rin\'s old helmet is spare held for Rin — Karen does not take it (Q1b); with free she does', () => {
    const { r, st1 } = afterRin();
    const w0 = realWorld(st1, ROSTER, [HERO.rin]);
    expect(w0.held?.has(r.id)).toBe(true);
    expect(took(w0, HERO.karen)).toEqual([]);
    const w1 = realWorld(st1, ROSTER, [HERO.rin], {}, [r.id]);
    expect(w1.held?.has(r.id)).toBe(false);
    const kp = heroPlan(w1, { to: HERO.karen });
    expect(kp.plan.changes.map((c) => c.cand.item.id)).toEqual([r.id]);
    expect(kp.plan.changes[0].cand.cost).toBe(2);
  });

  it('spare that was unworn at the open is never taken, even next to free pieces', () => {
    const k = kPiece(), r = rPiece(), spare = piece('helmet', 'Speed', { ATK: 5, CHC: 5, CHD: 5, SPD: 5 });
    const st0 = store({ [HERO.karen]: { pool: [k], worn: [k] }, [HERO.rin]: { pool: [r, spare], worn: [r] } });
    const hp = heroPlan(realWorld(st0, ROSTER), { to: HERO.rin });
    const st1 = applyHero(st0, { to: HERO.rin, hp, stamp: stampOf(st0) })!.st;
    const free = freeOf(wornOf(st0), st1);
    expect(free).toEqual([r.id]);
    const w = realWorld(st1, ROSTER, [HERO.rin], {}, free);
    expect(w.held?.has(spare.id)).toBe(true);
    expect(took(w, HERO.karen)).toEqual([r.id]);
  });

  it('heroGain still equals the plan line, with a free piece in the world', () => {
    const { r, st1 } = afterRin();
    const w = realWorld(st1, ROSTER, [HERO.rin], {}, [r.id]);
    const g = heroGain(w, HERO.karen);
    expect(g).not.toBeNull();
    expect(g).toBe(planLineGain(w, HERO.karen));
  });
});
