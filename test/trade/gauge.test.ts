// «Обмен вещами», мерило героя — его заказ (.x/0085 FORMULA §7, TESTS T7.1, T7.2, T7.6) и X1 (модель обмена из своего пула =
// лучшая раскладка приложения). Мерило строит мост world.ts: key — заказ, parts — части набора, value — очки, ранг, годная.
import { describe, expect, it } from 'vitest';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { comboSig } from '@/game/build/variants';
import { combosOf, comboProfile, profileOf } from '@/game/build/profile';
import { setValue } from '@/game/set/setValue';
import { bestLayout, gearRank, piecePoints } from '@/features/gear/layout';
import { eligibleIn } from '@/features/gear/pool/info';
import { milli } from '@/features/gear/model/vs';
import { candidates } from '@/features/trade/model/cands';
import { bestKit } from '@/features/trade/model/kit';
import { SLOT_ORDER } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { STATS, worldOf } from '@/features/trade/model/world';
import { teamPlan } from '@/features/trade/model/team';
import type { SlotId } from '@/game/data/types';
import type { Subs } from '@/game/item/subs';
import { ctx, HERO, hasOwner, lcg, loadOwner, piece, realWorld, setId, store } from './helpers';

const char = (id: string) => ctx.idx.CHAR[id];
const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const armorOf = (short: string, lit: Subs) => ARMOR.map((slot) => piece(slot, short, lit));
const GOOD2: Subs = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };
const WEAK: Subs = { RES: 1 };

// заказы Delta: DPS (Pen ×4 | Attack ×2 + Speed ×2 | Pen ×2 + Attack ×2), Priority Support/PvP (Speed ×4)
const D = HERO.delta, K = HERO.karen;
const SPEED = setId('Speed'), PEN = setId('Penetration');
const orderOf = (id: string, sets: string) => comboSig(combosOf(char(id)).find((c) => comboSig(c) === sets)!);
const PEN4 = `${PEN}x4`, SPEED4 = `${SPEED}x4`;

describe('мерило героя — заказ', () => {
  it('без заказа — «По статам»: очки и ранг — функции лучшей раскладки, ценность сета — setValue профиля', () => {
    const arm = armorOf('Speed', GOOD2);
    const st = store({ [D]: { pool: arm, worn: arm } });
    const g = realWorld(st).gauge(D)!;
    const P = profileOf(ctx, char(D))!;
    expect(g.key).toBe(STATS);
    expect(g.parts).toEqual([]);
    expect(g.value(arm[0].id)).toEqual({ v: milli(piecePoints(P, arm[0])), fit: gearRank(P, arm[0]), ok: true });
    const sv = setValue(P, SPEED, 4, 0);
    expect(g.bonus(SPEED, 4, 0)).toEqual({ v: milli(sv.value), halves: sv.halves, eff: 0 });
    expect(sv.halves).toBe(2); // premise: Speed ×4 — часть меню Delta
  });

  it('T7.2: заказ Pen ×4 — половины только у Pen; Speed — как случайный статовый сет (строки по очкам), без половин', () => {
    const st = store({ [D]: { pool: armorOf('Speed', GOOD2) } });
    expect(orderOf(D, PEN4)).toBe(PEN4); // premise: такой набор у Delta есть
    const g = realWorld(st, undefined, [], { [D]: PEN4 }).gauge(D)!;
    const P = profileOf(ctx, char(D))!;
    const Po = comboProfile(P, combosOf(char(D)).find((c) => comboSig(c) === PEN4)!);
    expect(g.key).toBe(PEN4);
    expect(g.parts).toEqual([{ set: PEN, n: 4 }]);
    const speed = g.bonus(SPEED, 4, 4);
    expect(speed.halves).toBe(0);
    expect(speed.v).toBe(milli(setValue(Po, SPEED, 4, 4).rowsValue));
    expect(speed.v).toBeGreaterThan(0);
    expect(g.bonus(PEN, 4, 4)).toMatchObject({ halves: 2, eff: 2 });
    expect(g.bonus(PEN, 2, 2)).toMatchObject({ halves: 0, eff: 0 }); // Pen ×2 в этом заказе не часть
  });

  it('T7.2: Pen ×4 не собирается — список слотов, где Penetration нет ни у кого', () => {
    const pen = [piece('helmet', 'Penetration', GOOD2), piece('armor', 'Penetration', GOOD2)];
    const st = store({ [D]: { pool: [...armorOf('Speed', GOOD2), ...pen] } });
    const hp = heroPlan(realWorld(st, undefined, [], { [D]: PEN4 }), { to: D });
    expect(hp.missing).toEqual([{ part: { set: PEN, n: 4 }, slots: ['gloves', 'shoes'] }]);
    // «По статам» — частей заказа нет, строк нет
    expect(heroPlan(realWorld(st), { to: D }).missing).toEqual([]);
  });

  it('T7.2: заказ набора собирает его, «По статам» — то, что больше по V', () => {
    // Speed ×4 надет, такие же по статам Pen-вещи на T4 — в запасе другого героя
    const speed = armorOf('Speed', GOOD2), pen = ARMOR.map((slot) => piece(slot, 'Penetration', { SPD: 4, CHC: 4, CHD: 4, ATK: 3 }, { bt: 4 }));
    const st = store({ [D]: { pool: speed, worn: speed }, [K]: { pool: pen } });
    const setOf = (order: string) => {
      const hp = heroPlan(realWorld(st, undefined, [], { [D]: order }), { to: D });
      return ARMOR.map((s) => hp.plan.kit.slots[s]?.item.set);
    };
    expect(setOf(PEN4)).toEqual([PEN, PEN, PEN, PEN]);
    expect(setOf(SPEED4)).toEqual([SPEED, SPEED, SPEED, SPEED]);
  });

  it('заказ, которого у героя нет (данные обновились), — «По статам»', () => {
    const g = realWorld(store({ [D]: { pool: armorOf('Speed', GOOD2) } }), undefined, [], { [D]: '999x4' }).gauge(D)!;
    expect(g.key).toBe(STATS);
  });

  it('T7.1: не годная для получателя вещь другого героя — не кандидат; своё надетое — кандидат, даже слабое', () => {
    const weakOther = piece('helmet', 'Speed', WEAK), weakMine = piece('armor', 'Speed', WEAK);
    const st = store({ [D]: { pool: [weakMine], worn: [weakMine] }, [K]: { pool: [weakOther] } });
    const w = realWorld(st);
    expect(w.gauge(D)!.value(weakOther.id)!.ok).toBe(false); // premise
    const c = candidates(w, { to: D });
    expect((c.helmet ?? []).map((x) => x.item.id)).not.toContain(weakOther.id);
    expect((c.armor ?? []).map((x) => x.item.id)).toContain(weakMine.id);
  });

  it('ранг оружия и аксессуара — по любому билду героя, при любом заказе', () => {
    // аксессуар 1012 (PEN%) рекомендует DPS, Support — нет
    const acc = piece('accessory', null, GOOD2, { grade: 'unique', itemKey: '1012', main: 'PEN%' });
    const st = store({ [D]: { pool: [acc] } });
    for (const order of [STATS, PEN4, SPEED4]) expect(realWorld(st, undefined, [], { [D]: order }).gauge(D)!.value(acc.id)!.fit).toBe('rec');
  });

  it('B9: герой без билдов — мерила нет, кандидатов нет; его вещи — не кандидаты от него', () => {
    const mine = armorOf('Speed', GOOD2);
    const shared = piece('helmet', 'Attack', GOOD2);
    const st = store({ [HERO.nobuild]: { pool: [...mine, shared], worn: mine }, [K]: { pool: [shared] } });
    const w = realWorld(st);
    expect(char(HERO.nobuild).builds).toEqual([]); // premise
    expect(w.gauge(HERO.nobuild)).toBeNull();
    expect(candidates(w, { to: HERO.nobuild })).toEqual({});
    const all = Object.values(candidates(w, { to: K })).flat();
    expect(all.some((c) => c.holder === HERO.nobuild)).toBe(false);
    expect(all.find((c) => c.item.id === shared.id)?.holder).toBe(K);
  });

  it.todo('T7.5: закрепление — жёстко (этап 6)');
});

// ------------------------------------------------------------------------------------------- T7.1, X1
// модель обмена (candidates + bestKit) против лучшей раскладки приложения (bestLayout с порогом: надетое и годные) по
// тем же вещам. Ничьи у них разные (обмен — дешевле источник, раскладка — старше запись), поэтому сверяются ранг и V;
// V обмена — сумма округлённых до тысячных слагаемых
const TOL = 0.006;
function compare(o: { st: GearStore; roster: readonly string[]; ctx: typeof ctx }, id: string, pool: readonly Piece[] | null = null): string | null | 'skip' {
  const c = o.ctx.idx.CHAR[id];
  const P = c ? profileOf(o.ctx, c) : null;
  if (!P || !o.st.pools[id]?.length) return 'skip';
  const w = worldOf(o.ctx, o.st, o.roster);
  const g = w.gauge(id)!;
  const kit = bestKit(g, candidates(w, { to: id }));
  const worn = new Set(Object.values(o.st.worn?.[id] ?? {}));
  const own = pool ?? o.st.pools[id].map((x) => o.st.pieces[x]);
  const lay = bestLayout(P, own, { eligible: eligibleIn(P, worn) }).value;
  if (kit.key.rank === lay.rank && Math.abs(kit.key.total / 1000 - lay.v) <= TOL) return null;
  return `${id}: обмен rank ${kit.key.rank} V ${kit.key.total / 1000}, раскладка rank ${lay.rank} V ${lay.v}`;
}
const onlyHero = (st: GearStore, id: string): GearStore => ({ ...st, pools: { [id]: st.pools[id] }, worn: st.worn?.[id] ? { [id]: st.worn[id] } : {} });

describe('X1. Эквивалентность модели лучшей раскладке', () => {
  it.skipIf(!hasOwner())('X1: снимок владельца — каждый герой с пулом и билдами, только свой пул', () => {
    const o = loadOwner();
    let checked = 0;
    for (const id of Object.keys(o.st.pools)) {
      const r = compare({ ...o, st: onlyHero(o.st, id) }, id);
      if (r === 'skip') continue;
      checked++;
      expect(r).toBeNull();
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
        pool.push(piece(slot, ARMOR.includes(slot) ? pick(sets) : null, lit, { bt: rnd() < 0.5 ? 4 : 0 }));
      }
      const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && rnd() < 0.5);
      const r = compare({ st: store({ [hero]: { pool, worn } }), roster: [hero], ctx }, hero);
      if (r === 'skip') continue;
      checked++;
      expect(r, `случай ${i}`).toBeNull();
    }
    expect(checked).toBe(30);
  });

  it('T7.1: «По статам» из всех источников = лучшая раскладка, как если бы все вещи были в пуле получателя', () => {
    const rnd = lcg(7101);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const sets = ['Speed', 'Attack', 'Critical Strike', 'Penetration'];
    const stats = ['SPD', 'CHC', 'CHD', 'ATK%', 'DMG UP%'];
    for (let t = 0; t < 10; t++) {
      const mk = (n: number) => Array.from({ length: n }, () => {
        const slot = pick(ARMOR), lit: Subs = {};
        while (Object.keys(lit).length < 3) lit[pick(stats)] = 1 + Math.floor(rnd() * 5);
        return piece(slot, pick(sets), lit, { bt: rnd() < 0.5 ? 4 : 0 });
      });
      const mine = mk(5), theirs = mk(6);
      const st = store({ [HERO.rin]: { pool: mine }, [K]: { pool: theirs, worn: [] } });
      expect(compare({ st, roster: [HERO.rin, K], ctx }, HERO.rin, [...mine, ...theirs]), `случай ${t}`).toBeNull();
    }
  });
});

describe('T7.6: команда — у каждого свой заказ', () => {
  it('сменил заказ члена — план команды пересчитан по новому заказу', () => {
    const others = [HERO.rin, K, HERO.noa];
    const pen = ARMOR.map((slot) => piece(slot, 'Penetration', { SPD: 4, CHC: 4, CHD: 4, ATK: 3 }, { bt: 4 }));
    const st = store({ [D]: { pool: [...armorOf('Speed', GOOD2), ...pen] }, ...Object.fromEntries(others.map((h) => [h, { pool: [piece('weapon', null)] }])) });
    const after = (order: string) => teamPlan(worldOf(ctx, st, [D, ...others], { orders: { [D]: order } }), { team: [D, ...others] })!.members[0].after;
    const set = (order: string) => ARMOR.map((s) => after(order).slots[s]?.item.set);
    expect(set(PEN4)).toEqual([PEN, PEN, PEN, PEN]);
    expect(set(SPEED4)).toEqual([SPEED, SPEED, SPEED, SPEED]);
  });
});
