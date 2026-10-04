// «Обмен вещами», блок B (мерило героя, TESTS.md B1–B7, B9) и X1 (модель обмена эквивалентна сборке приложения).
// Мерило строит мост world.ts: key — билд, который показывает «Надето» (aimOf); parts — связка; value — очки и fit.
import { describe, expect, it } from 'vitest';
import { aimOf, statsKey } from '../src/logic/aim';
import { buildKey, pieceInput, type GearStore, type Piece } from '../src/logic/gear';
import { assemble, entriesFor, poolView } from '../src/logic/pool';
import { fit, pieceValue } from '../src/logic/vs';
import { candidates } from '../src/logic/trade/cands';
import { bestKit } from '../src/logic/trade/kit';
import { milli, SLOT_ORDER } from '../src/logic/trade/model';
import { worldOf } from '../src/logic/trade/world';
import type { SlotId } from '../src/data/types';
import type { Subs } from '../src/logic/subs';
import { ctx, HERO, hasOwner, lcg, loadOwner, piece, realWorld, store } from './trade.helpers';
import { teamPlan } from '../src/logic/trade/team';

const char = (id: string) => ctx.idx.CHAR[id];
const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const armorOf = (short: string, lit: Subs) => ARMOR.map((slot) => piece(slot, short, lit));
const WEAK: Subs = { SPD: 1 };
const STRONG: Subs = { SPD: 6, CHC: 6, CHD: 6, ATK: 6 };

// ключи вариантов Delta: DPS (Pen×4 | Atk×2+Spd×2 | Pen×2+Atk×2), Priority Support/PvP (Speed×4)
const D = HERO.delta;
const PEN4 = `${buildKey(D, 'DPS')}#11x4`;
const ATK_SPD = `${buildKey(D, 'DPS')}#1x2+13x2`;
const SUPPORT = buildKey(D, 'Priority Support/PvP');
const K = HERO.karen;
const K_STATS = `${K}/#stats`;

// мерило героя в мире из хранилища
const gaugeOf = (st: GearStore, id: string) => realWorld(st).gauge(id);
const deltaStore = (extra: Partial<GearStore> = {}) => store({ [D]: { pool: armorOf('Speed', GOOD2) } }, extra);
const GOOD2: Subs = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };

// лучший комплект героя из его собственного пула
function kitOf(st: GearStore, id: string) {
  const w = realWorld(st);
  const g = w.gauge(id)!;
  return { g, kit: bestKit(g, candidates(w, { to: id })) };
}
const countSet = (kit: ReturnType<typeof bestKit>, st: GearStore, set: string) =>
  ARMOR.filter((s) => { const id = kit.slots[s]?.item.id; return !!id && st.pieces[id].setId === set; }).length;
const SPEED = '13', PEN = '11', ATTACK = '1';

describe('B. Мерило героя', () => {
  it('B1: билд Speed×4 — мерило держит часть связки Speed, очки вещи — по цепочке билда', () => {
    // Arrange: Speed в связке; Speed-вещи слабые, вещи Attack сильные — по статам они бы победили
    const speed = armorOf('Speed', WEAK), atk = armorOf('Attack', STRONG);
    const st = store({ [K]: { pool: [...speed, ...atk] } }, { aim: { [K]: buildKey(K, 'Speed') } });
    const c = char(K);
    // Act
    const { g, kit } = kitOf(st, K);
    // Assert: premise — связка Speed ×4, конвертируемая
    expect(g.key).toBe(buildKey(K, 'Speed'));
    expect(g.parts).toEqual([expect.objectContaining({ set: SPEED, n: 4 })]);
    // очки вещи — pieceValue для билда мерила, в тысячных
    const v = poolView(ctx, st).of(K)!.variants.find((x) => x.key === g.key)!;
    expect(g.value(atk[0].id)!.v).toBe(milli(pieceValue(ctx, c, v.b, atk[0])));
    // Speed не ломается до конца: «последняя вещь решается очками», но не меньше трёх вещей связки (n − 1)
    expect(countSet(kit, st, SPEED)).toBeGreaterThanOrEqual(3);
  });

  it('B2: aim в хранилище — мерило этот вариант', () => {
    for (const key of [PEN4, ATK_SPD, SUPPORT]) {
      const g = gaugeOf(deltaStore({ aim: { [D]: key } }), D);
      expect(g?.key).toBe(key);
    }
  });

  it('B3: aim не задан — мерило угаданный билд (aimOf), не «По статам»', () => {
    // Arrange: Delta носит Speed — приложение угадывает билд по вещам
    const st = deltaStore();
    const cp = poolView(ctx, st).of(D)!;
    const guess = aimOf(cp.c, st, cp);
    expect(guess.why?.kind).not.toBe('stats'); // premise
    expect(st.aim?.[D]).toBeUndefined();
    // Act
    const g = gaugeOf(st, D)!;
    // Assert
    expect(g.key).toBe(guess.key);
    expect(g.key.endsWith('/#stats')).toBe(false);
  });

  it('B4: aim = «По статам» — мерило без связки', () => {
    const g = gaugeOf(deltaStore({ aim: { [D]: `${D}/#stats` } }), D)!;
    expect(g.key).toBe(`${D}/#stats`);
    expect(g.parts).toEqual([]);
  });

  it('B4: все билды «Не собираю» — мерило «По статам»', () => {
    const marks = Object.fromEntries(char(K).builds.map((b) => [buildKey(K, b.name), 'skip' as const]));
    const st = store({ [K]: { pool: armorOf('Speed', GOOD2) } }, { marks });
    expect(statsKey(K)).toBe(K_STATS); // premise
    const g = gaugeOf(st, K)!;
    expect(g.key).toBe(K_STATS);
    expect(g.parts).toEqual([]);
  });

  it('B4: «По статам» — конвертируемый сет ломается ради очков; с билдом Speed — нет', () => {
    // Arrange: Speed×4 слабый, Attack×4 сильный
    const speed = armorOf('Speed', WEAK), atk = armorOf('Attack', STRONG);
    const pool = [...speed, ...atk];
    const asStats = store({ [K]: { pool, worn: speed } }, { aim: { [K]: K_STATS } });
    const asSpeed = store({ [K]: { pool, worn: speed } }, { aim: { [K]: buildKey(K, 'Speed') } });
    // Act
    const stats = kitOf(asStats, K), withBuild = kitOf(asSpeed, K);
    // Assert: premise — Speed конвертируемый (иначе тест о другом)
    expect(withBuild.g.parts[0]?.conv).toBe(true);
    expect(countSet(stats.kit, asStats, SPEED)).toBe(0);
    expect(countSet(stats.kit, asStats, ATTACK)).toBe(4);
    expect(countSet(withBuild.kit, asSpeed, SPEED)).toBeGreaterThanOrEqual(3);
  });

  it('B5: «По статам», надет Penetration×4 — ломается, если очков больше; с билдом Pen×4 — держится', () => {
    // Arrange: слабый Penetration×4 надет, в запасе сильный Attack×4
    const pen = armorOf('Penetration', WEAK), atk = armorOf('Attack', STRONG);
    const pool = [...pen, ...atk];
    const asStats = store({ [K]: { pool, worn: pen } }, { aim: { [K]: K_STATS } });
    const asPen = store({ [K]: { pool, worn: pen } }, { aim: { [K]: buildKey(K, 'Pen') } });
    // Act
    const stats = kitOf(asStats, K), withBuild = kitOf(asPen, K);
    // Assert: premise — Pen неконвертируемый и в связке билда
    expect(withBuild.g.parts[0]).toMatchObject({ set: PEN, n: 4, conv: false });
    expect(countSet(stats.kit, asStats, PEN)).toBe(0);
    expect(countSet(withBuild.kit, asPen, PEN)).toBe(4);
  });

  it('B6: «Собираю» у другого билда — мерило всё равно то, что показывает «Надето»', () => {
    const st = deltaStore({ aim: { [D]: SUPPORT }, marks: { [PEN4]: 'want', [buildKey(D, 'DPS')]: 'want' } });
    expect(gaugeOf(st, D)!.key).toBe(SUPPORT);
  });

  it('B7: рекомендованность оружия — fit() приложения для билда мерила', () => {
    // Arrange: аксессуар 1012 (PEN%) есть в списке DPS, в списке Support его нет
    const acc = piece('accessory', null, GOOD2, { grade: 'unique', itemKey: '1012', main: 'PEN%' });
    const weapon = piece('weapon', null, GOOD2, { grade: 'unique', itemKey: '23', main: 'ATK%' });
    const mk = (aim: string) => store({ [D]: { pool: [acc, weapon] } }, { aim: { [D]: aim } });
    // Act
    const dps = gaugeOf(mk(PEN4), D)!, support = gaugeOf(mk(SUPPORT), D)!;
    // Assert
    const expected = (key: string, p: Piece) => {
      const v = poolView(ctx, mk(key)).of(D)!.variants.find((x) => x.key === key)!;
      return fit(ctx, char(D), v.b, pieceInput(p));
    };
    expect(dps.value(acc.id)!.fit).toBe(expected(PEN4, acc));
    expect(support.value(acc.id)!.fit).toBe(expected(SUPPORT, acc));
    expect(dps.value(weapon.id)!.fit).toBe(expected(PEN4, weapon));
    expect(dps.value(acc.id)!.fit).toBe('rec'); // premise: у билдов разный список
    expect(support.value(acc.id)!.fit).not.toBe('rec');
  });

  it('B9: герой без билдов — мерила нет, кандидатов нет', () => {
    const w = realWorld(store({ [HERO.nobuild]: { pool: armorOf('Speed', GOOD2) } }));
    expect(char(HERO.nobuild).builds).toEqual([]); // premise
    expect(w.gauge(HERO.nobuild)).toBeNull();
    expect(candidates(w, { to: HERO.nobuild })).toEqual({});
  });

  it('B9: вещи героя без билдов — не кандидаты от него; общая запись — только от героя с билдами', () => {
    // Arrange: у nobuild надето шесть вещей; одна запись общая с пулом Карен
    const mine = armorOf('Speed', GOOD2);
    const shared = piece('helmet', 'Attack', GOOD2);
    const st = store({ [HERO.nobuild]: { pool: [...mine, shared], worn: mine }, [K]: { pool: [shared] } });
    const w = realWorld(st);
    // Act
    const all = Object.values(candidates(w, { to: K })).flat();
    // Assert
    expect(w.gauge(HERO.nobuild)).toBeNull();
    expect(all.some((c) => c.holder === HERO.nobuild)).toBe(false);
    expect(all.some((c) => mine.some((p) => p.id === c.item.id))).toBe(false);
    expect(all.find((c) => c.item.id === shared.id)?.holder).toBe(K);
  });
});

// ------------------------------------------------------------------------------------------- X1
// модель обмена (candidates + bestKit из собственного пула героя) против сборки приложения (assemble) того же варианта

interface Mismatch { hero: string; variant: string; model: Record<string, string>; app: Record<string, string>; modelTotal: number; appTotal: number }

function compare(o: { st: GearStore; roster: readonly string[]; ctx: typeof ctx }, id: string): Mismatch | null | 'skip' {
  const view = poolView(o.ctx, o.st);
  const cp = view.of(id);
  if (!cp || !cp.c.builds.length || !o.st.pools[id]?.length) return 'skip';
  // мир только из этого героя: его пул и надетое
  const mine: GearStore = { ...o.st, pools: { [id]: o.st.pools[id] }, worn: o.st.worn?.[id] ? { [id]: o.st.worn[id] } : {} };
  const w = worldOf(o.ctx, mine, o.roster);
  const g = w.gauge(id);
  if (!g) return 'skip';
  const variant = cp.variants.find((v) => v.key === g.key);
  expect(variant, `${id}: вариант ${g.key} среди вариантов героя`).toBeDefined();
  const kit = bestKit(g, candidates(w, { to: id }));
  const asm = assemble(o.ctx, cp.c, variant!, entriesFor(o.ctx, cp.c, variant!, cp.pieces));
  const model: Record<string, string> = {}, app: Record<string, string> = {};
  for (const s of SLOT_ORDER) {
    if (kit.slots[s]) model[s] = kit.slots[s]!.item.id;
    if (asm.slots[s]?.id) app[s] = asm.slots[s]!.id!;
  }
  const same = SLOT_ORDER.every((s) => model[s] === app[s]);
  const mt = kit.key.total / 1000;
  if (same || Math.abs(mt - asm.total) <= 0.002) return null;
  return { hero: id, variant: g.key, model, app, modelTotal: mt, appTotal: asm.total };
}

describe('X1. Эквивалентность модели сборке приложения', () => {
  it.skipIf(!hasOwner())('X1: снимок владельца — для каждого героя с пулом и билдами', () => {
    const o = loadOwner();
    let checked = 0;
    for (const id of Object.keys(o.st.pools)) {
      const r = compare(o, id);
      if (r === 'skip') continue;
      checked++;
      expect(r, `первый расходящийся: ${JSON.stringify(r)}`).toBeNull();
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('X1: 30 случайных пулов реальных героев', () => {
    const rnd = lcg(20261004);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const heroes = [HERO.rin, HERO.karen, HERO.noa, HERO.delta, HERO.maya, HERO.leah];
    const sets = ['Speed', 'Penetration', 'Attack', 'Critical Strike', 'Immunity', 'Defense'];
    const stats = ['SPD', 'CHC', 'CHD', 'ATK%', 'ATK', 'HP%', 'DEF%', 'EFF', 'RES'];
    let checked = 0;
    for (let i = 0; i < 30; i++) {
      const hero = pick(heroes);
      const n = 6 + Math.floor(rnd() * 9);
      const pool: Piece[] = [];
      for (let j = 0; j < n; j++) {
        const slot = pick(SLOT_ORDER);
        const lit: Subs = {};
        const k = 1 + Math.floor(rnd() * 4);
        while (Object.keys(lit).length < k) lit[pick(stats)] = 1 + Math.floor(rnd() * 6);
        const isArmor = ARMOR.includes(slot);
        pool.push(piece(slot, isArmor ? pick(sets) : null, lit, { bt: rnd() < 0.5 ? 4 : 0 }));
      }
      const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && rnd() < 0.5);
      const st = store({ [hero]: { pool, worn } });
      // часть случаев — выбранный игроком вариант (в том числе «По статам»)
      if (rnd() < 0.5) {
        const keys = poolView(ctx, st).of(hero)!.variants.map((v) => v.key);
        st.aim = { [hero]: pick(keys) };
      }
      const r = compare({ st, roster: [hero], ctx }, hero);
      if (r === 'skip') continue;
      checked++;
      expect(r, `случай ${i}: ${JSON.stringify(r)}`).toBeNull();
    }
    expect(checked).toBe(30);
  });
});

describe('B8: мерило члена команды', () => {
  it('B8: сменил билд члена — план команды пересчитан по новому билду', () => {
    const others = [HERO.rin, HERO.karen, HERO.noa];
    const mkStore = (key: string) => store({ [D]: { pool: armorOf('Speed', GOOD2) }, ...Object.fromEntries(others.map((h) => [h, { pool: [piece('weapon', null)] }])) }, { aim: { [D]: key } });
    const plan = (key: string) => teamPlan(realWorld(mkStore(key)), { team: [D, ...others] })!.members[0].after;
    const a = plan(PEN4), b = plan(ATK_SPD);
    expect(realWorld(mkStore(PEN4)).gauge(D)!.key).toBe(PEN4); // premise
    expect(a.key).not.toEqual(b.key);
  });
});
