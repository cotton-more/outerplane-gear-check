// Мягкий потолок крита (MODEL.md §12 item 2; HISTORY.md 0135 stage 2): кривая и её контрольное число, свойства, на которых стоит
// отсечка, лучшая раскладка у героя с упёртым критом, «Оставь» по очкам в нынешней раскладке, тихая строка, N из хранилища.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { pieceInput, type Piece, type Worn } from '@/features/gear/model/gear';
import { poolView } from '@/features/gear/pool';
import { bestLayout, gearRank, layoutValue, piecePoints, pointsIn, RANK, type Layout } from '@/features/gear/layout';
import { poolInfo } from '@/features/gear/pool/info';
import { wearable } from '@/features/gear/model/vs';
import { heroOutcome, heroPool, verdictOf } from '@/features/gear/verdict';
import { pinnedProfile, pinOptions, withNeed, type Profile } from '@/game/build/profile';
import { critF, critLinear, critValue } from '@/game/stat/curve';
import { char, D, gen, idx, mk, prof, randArmor, randGear, randPool, setId as setIdOf, twenty, type Gen } from './statSets';
import * as S from './statSets';

const inputOf = (p: Piece): ItemInput => ({ ...pieceInput(p), bt: p.bt === 4 ? 4 : p.bt === null ? null : 0 });
const near = (a: number, b: number, d = 1e-9) => Math.abs(a - b) <= d;

describe('кривая (decision 4)', () => {
  it('контрольное число: N 100, C₀ 80, вес 0,8 — шесть сегментов 0,80 / 0,79 / 0,67 / 0,51 / 0,35 / 0,19 = 3,30; CHC 2 + CHD 4 = 4,19 бьёт CHC 6', () => {
    const one = (k: number) => critValue(100, 80 + 3 * k, 3, [{ w: 0.8, n: 1 }]);
    expect([0, 1, 2, 3, 4, 5].map((k) => Math.round(one(k) * 100) / 100)).toEqual([0.8, 0.79, 0.67, 0.51, 0.35, 0.19]);
    const six = critValue(100, 80, 3, [{ w: 0.8, n: 6 }]);
    expect(six).toBeCloseTo(3.3, 2);
    const two = critValue(100, 80, 3, [{ w: 0.8, n: 2 }]) + 4 * 0.65;
    expect(two).toBeCloseTo(4.19, 2);
    expect(two).toBeGreaterThan(six);
  });

  it('ниже N − 15 ничего не меняется; выше N — ноль; колено не ниже 0 (N 10)', () => {
    expect(critValue(100, 20, 3, [{ w: 0.8, n: 6 }, { w: 1, n: 4 }])).toBeCloseTo(critLinear([{ w: 0.8, n: 6 }, { w: 1, n: 4 }]), 12);
    expect(critValue(100, 100, 3, [{ w: 1, n: 6 }])).toBe(0);
    expect(critValue(100, 130, 3, [{ w: 1, n: 6 }])).toBe(0);
    expect(critF(10, 5)).toBeCloseTo(5 - 25 / 20, 12); // f = 1 − c/10 на [0, 10]
    expect(critValue(0, 5, 3, [{ w: 1, n: 3 }])).toBe(0);
  });

  it('свойства (на них стоит отсечка): сегмент добавляет от 0 до своих линейных очков; больше C₀ — не больше ценность; один вес — формула плана', () => {
    const g = gen(135);
    const bad: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const need = g.pick([100, 90, 70, 40, 12, 0]);
      const c0 = g.int(110);
      const segs = Array.from({ length: g.int(6) }, () => ({ w: g.pick([1, 0.8, 0.65, 0.5, 0.4]), n: 1 + g.int(6) }));
      const v = critValue(need, c0, 3, segs);
      const add = { w: g.pick([1, 0.8, 0.65, 0.5]), n: 1 + g.int(6) };
      const d = critValue(need, c0, 3, [...segs, add]) - v;
      if (d < -1e-12 || d > add.w * add.n + 1e-12) bad.push(`#${i} добавка ${d} вне [0, ${add.w * add.n}]`);
      if (critValue(need, c0 + 1 + g.int(20), 3, segs) > v + 1e-12) bad.push(`#${i} больше C₀ — больше ценность`);
      const n = 1 + g.int(18), w = 0.8;
      if (!near(critValue(need, c0, 3, [{ w, n }]), (w * (critF(need, c0 + 3 * n) - critF(need, c0))) / 3)) bad.push(`#${i} один вес`);
    }
    expect(bad).toEqual([]);
  });
});

// Caren: цепочка DEF › CHC › CHD › SPD › DMG UP; Critical Hit не в её меню (его строки — очки). Своё: 5 + 5 + 10 = 20 %,
// аксессуар A Prima Vista с main CHC на T4 — 48 %, Critical Hit ×4 на T4 — 30 %: C₀ = 98 %, любой CHC-сабстат почти ничего не стоит
const caren = () => prof('Caren');
const acc = (id = 'acc') => mk(id, 'accessory', null, { CHD: 3, 'ATK%': 2, SPD: 1, HP: 1 }, 4, { itemKey: '1036', main: 'CHC' });
const crit4 = () => [
  mk('ca', 'armor', 'Critical Hit', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }),
  mk('cg', 'gloves', 'Critical Hit', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }),
  mk('cs', 'shoes', 'Critical Hit', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }),
];
// два шлема Critical Hit: hA — CHC 6 (линейно больше очков), hB — CHD 4 и CHC 1
const hA = () => mk('hA', 'helmet', 'Critical Hit', { CHC: 6, 'DEF%': 1, SPD: 1, HP: 1 });
const hB = () => mk('hB', 'helmet', 'Critical Hit', { CHD: 4, CHC: 1, 'DEF%': 1, SPD: 1 });

describe('раскладка у героя с упёртым критом', () => {
  it('C₀ 98 %: лучшая раскладка берёт шлем с CHD, хотя у шлема с CHC 6 линейно больше очков', () => {
    const P = caren();
    const a = hA(), b = hB();
    expect(piecePoints(P, a)).toBeCloseTo(6.3, 9);
    expect(piecePoints(P, b)).toBeCloseTo(4.9, 9);
    const best = bestLayout(P, [acc(), ...crit4(), a, b]);
    expect(best.layout.helmet?.id).toBe('hB');
    expect(best.value.chc).toBeCloseTo(20 + 48 + 30 + 3, 9);
    // без аксессуара и без сета крита упора нет: прежний выбор по очкам
    const plain = bestLayout(P, [{ ...a, setId: D.sets.find((s) => s.short === 'Defense')!.id }, { ...b, setId: D.sets.find((s) => s.short === 'Defense')!.id }]);
    expect(plain.layout.helmet?.id).toBe('hA');
    expect(plain.value.critLoss).toBe(0);
  });

  it('V = очки + сеты − потеря крита; потеря растёт, если N ниже', () => {
    const P = caren();
    const layout = { accessory: acc(), helmet: hA(), armor: crit4()[0], gloves: crit4()[1], shoes: crit4()[2] };
    const v = layoutValue(P, layout);
    expect(v.v).toBeCloseTo(v.ptsSum + v.setSum - v.critLoss, 12);
    expect(v.critLoss).toBeGreaterThan(4.5); // CHC 6 на 98 % почти целиком сверх нужного: 4,8 линейно
    // один шлем: 20 + 18 = 38 % — при N 100 (колено 85) и N 50 (колено 35) потери нет и есть
    expect(layoutValue(P, { helmet: hA() }).critLoss).toBe(0);
    expect(layoutValue(withNeed(P, 50), { helmet: hA() }).critLoss).toBeGreaterThan(0);
  });

  it('Q-A (owner 2026-10-11, B): крит строк сета — на той же кривой. Caren 68 % + Critical Hit ×4 T4 (30 %): +8,0 линейно, 6,5 при N 100, ≈ 0 при N 70', () => {
    const P = caren();
    const layout = { accessory: acc(), helmet: mk('ch', 'helmet', 'Critical Hit', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }), armor: crit4()[0], gloves: crit4()[1], shoes: crit4()[2] };
    const v = layoutValue(P, layout);
    const rows = v.sets.find((x) => x.set === D.sets.find((s) => s.short === 'Critical Hit')!.id)!;
    expect(rows.value).toBeCloseTo(8, 9);                       // строки по-прежнему стоят 8 в сетах
    expect(v.chc).toBeCloseTo(98, 9);
    expect(rows.value - v.critLoss).toBeCloseTo(6.5, 1);        // крит сета на кривой 68 → 98 %
    expect(rows.value - layoutValue(withNeed(P, 70), layout).critLoss).toBeLessThan(0.05);
  });

  it('у героя без CHC в цепочке потери нет', () => {
    const akari = prof('Akari');
    expect(akari.critOn).toBe(false);
    const v = layoutValue(akari, { helmet: mk('x', 'helmet', 'Speed', { CHC: 6, SPD: 2, EFF: 2, HP: 1 }) });
    expect([v.critLoss, v.chc]).toEqual([0, null]);
  });

  it('pointsIn: CHC вещи — там, где крит героя их оставляет; без CHC — её очки', () => {
    const P = caren();
    const layout = { accessory: acc(), armor: crit4()[0], gloves: crit4()[1], shoes: crit4()[2], helmet: hB() };
    expect(pointsIn(P, layout, hA())).toBeLessThan(piecePoints(P, hA()) - 4);
    expect(pointsIn(P, layout, crit4()[0])).toBeCloseTo(piecePoints(P, crit4()[0]), 12);
    expect(pointsIn(P, {}, hA())).toBeCloseTo(piecePoints(P, hA()), 12); // 20 + 18 % — под коленом
  });
});

describe('вердикт и пул (decision 3)', () => {
  const st = (pieces: Piece[], worn: Piece[], crit?: number) => {
    const id = char('Caren').id;
    return {
      pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [id]: pieces.map((p) => p.id) },
      worn: { [id]: Object.fromEntries(worn.map((p) => [p.slot, p.id])) as Worn },
      ...(crit !== undefined ? { crit: { [id]: crit } } : {}),
    };
  };
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set([char('Caren').id]));
  const carenOf = (r: ReturnType<typeof verdictOf>) => r!.heroes.find((h) => h.c.name === 'Caren')!;

  it('новый шлем с CHD при упёртом крите — «Надень» вместо шлема с CHC 6 (dV ≈ +2,6)', () => {
    const worn = [acc(), ...crit4(), hA()];
    const r = verdictOf(ctx, poolView(ctx, st(worn, worn)).hero, inputOf(hB()));
    expect(r!.kind).toBe('wear');
    expect(carenOf(r).dV).toBeGreaterThan(2);
  });

  it('«Оставь» сравнивает очки в нынешней раскладке: шлем чужого сета с CHC 6 не откладывается (линейно он на 1,4 выше надетого)', () => {
    const worn = [acc(), ...crit4(), hB()];
    const x = { ...hA(), id: 'new', setId: D.sets.find((s) => s.short === 'Attack')!.id };
    const view = poolView(ctx, st(worn, worn));
    const h = heroOutcome(view.hero(char('Caren').id)!, x);
    expect(piecePoints(caren(), x) - piecePoints(caren(), hB())).toBeCloseTo(1.4, 9);
    expect(h.kind).toBe('none');
    expect(h.margin).toBeLessThan(0);
  });

  it('пул держит то же, что вердикт отложил бы: чужой сет — по очкам в раскладке', () => {
    const worn = [acc(), ...crit4(), hB()];
    const off = { ...hA(), id: 'p9', setId: D.sets.find((s) => s.short === 'Attack')!.id };
    const hp = poolView(ctx, st([...worn, off], worn)).hero(char('Caren').id)!;
    expect(hp.info.why.has('p9')).toBe(false);
  });

  it('крит у колена в раскладке Caren', () => {
    const worn = [acc(), ...crit4(), hB()];
    const hp = poolView(ctx, st(worn, worn)).hero(char('Caren').id)!;
    expect(hp.info.value.chc).toBeGreaterThanOrEqual(85);
  });

  it('N из хранилища: при N 100 у Caren 20 % + CHC 6 на шлеме — без потерь; при N 30 — с потерями', () => {
    const worn = [hA()];
    const at = (n?: number) => poolView(ctx, st(worn, worn, n)).hero(char('Caren').id)!;
    expect(at().P.need).toBe(100);
    expect(at().info.value.critLoss).toBe(0);
    expect(at(30).P.need).toBe(30);
    expect(at(30).info.value.critLoss).toBeGreaterThan(1);
    expect(heroPool(ctx, char('Caren'), worn, new Set(['hA']), null, 30)!.P.need).toBe(30);
  });
});

// отсечка с Парето-множествами = полный перебор (prune: false), при разных N и пулах, где крит упирается
describe('отсечка при упёртом крите', () => {
  const critPool = (g: Gen, P: Profile): Piece[] => {
    const out = randPool(g, P, 3, true);
    // крита побольше: аксессуары с main CHC и вещи Critical Hit
    if (g.rnd() < 0.7) out.push({ ...randGear(g, P, 'accessory'), id: 'c' + g.int(1e9) });
    for (let i = g.int(4); i > 0; i--) {
      const p = randArmor(g, P, g.pick(['helmet', 'armor', 'gloves', 'shoes'] as const));
      out.push({ ...p, setId: D.sets.find((s) => s.short === 'Critical Hit')!.id });
    }
    return out.map((p) => (p.slot === 'accessory' && g.rnd() < 0.6 && !p.lit.CHC ? { ...p, main: 'CHC' } : p));
  };
  it('20 героев × 30 пулов × N 100 / 75 / 40 / 10: с отсечкой = без отсечки, и потеря крита есть хотя бы в трети случаев', () => {
    const g = gen(13502);
    const bad: string[] = [];
    let cases = 0, binding = 0;
    for (const c of twenty()) {
      const base = prof(c);
      if (!base.critOn) continue;
      for (let i = 0; i < 30; i++) {
        const pool = critPool(g, base);
        for (const need of [100, 75, 40, 10]) {
          const P = withNeed(base, need);
          const a = bestLayout(P, pool);
          const b = bestLayout(P, pool, { prune: false });
          cases++;
          if (a.value.critLoss > 1e-9) binding++;
          if (a.value.rank !== b.value.rank || Math.abs(a.value.v - b.value.v) > 1e-7) bad.push(`${c.name} N${need} #${i}: ${a.value.v} / ${b.value.v}`);
          // and the same pieces: pruning never drops a piece that would win a tie (more Legendary, older)
          const ids = (l: typeof a.layout) => Object.entries(l).map(([s, p]) => `${s}:${p!.id}`).sort().join(' ');
          if (ids(a.layout) !== ids(b.layout)) bad.push(`${c.name} N${need} #${i}: ${ids(a.layout)} / ${ids(b.layout)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(cases).toBeGreaterThan(400);
    expect(binding).toBeGreaterThan(cases / 3);
  });
});

describe('старые данные', () => {
  it('снимок без CHC героев или без mainValues — потолка крита нет вовсе (critOn false, потери нет)', async () => {
    const { createIndex } = await import('@/game/data');
    const { makeCtx: mk2 } = await import('@/game/context');
    const { profileOf } = await import('@/game/build/profile');
    const ofData = (data: typeof D) => profileOf(mk2(createIndex(data), { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set()), data.chars.find((c) => c.name === 'Caren')!)!;
    expect(ofData(D).critOn).toBe(true);
    expect(ofData({ ...D, mainValues: undefined }).critOn).toBe(false);
    expect(ofData({ ...D, chars: D.chars.map((c) => ({ ...c, chc: undefined })) }).critOn).toBe(false);
  });
});

// Review 0136 F8 (a), (c): properties from the review fuzz, smaller loops. Random pools of heroes with CHC in the chain,
// Critical Hit pieces, CHC mains on accessories, CHC substats; pins, armorOnly and N from 0 to 100
describe('fuzz: crit search and «Оставь» (review 0136)', () => {
  const CH = setIdOf('Critical Hit');
  const critHeroes = S.heroes.filter((c) => S.prof(c).critOn);
  const ids = (l: Layout) => Object.entries(l).map(([s, p]) => `${s}:${p!.id}`).sort().join(' ');
  const critPool = (g: Gen, P: Profile, perSlot = 3): Piece[] => {
    const out = randPool(g, P, perSlot, true);
    if (g.rnd() < 0.7) out.push(randGear(g, P, 'accessory'));
    for (let i = g.int(5); i > 0; i--) out.push({ ...randArmor(g, P, g.pick(S.ARMOR)), setId: CH });
    return out.map((p) => {
      if (p.slot === 'accessory' && g.rnd() < 0.6 && !p.lit.CHC) return { ...p, main: 'CHC' };
      if (p.slot !== 'accessory' && g.rnd() < 0.35) { const lit = { ...p.lit, CHC: 1 + g.int(6) }; if (Object.keys(lit).length <= 4) return { ...p, lit, yellow: lit }; }
      return p;
    });
  };
  // every layout (top-rank gear, any armor or empty): the most (rank, V) by layoutValue
  const enumBest = (P: Profile, pool: readonly Piece[], armorOnly: boolean): { v: number; rank: number } => {
    const cands = pool.filter((p) => wearable(P.ctx, P.c, p));
    const gear = (['weapon', 'accessory'] as const).map((slot) => {
      const mine = armorOnly ? [] : cands.filter((p) => p.slot === slot);
      if (!mine.length) return [null];
      const r = Math.max(...mine.map((p) => RANK[gearRank(P, p)]));
      return mine.filter((p) => RANK[gearRank(P, p)] === r);
    });
    const per = S.ARMOR.map((s) => [null, ...cands.filter((p) => p.slot === s)]);
    let best = { v: -Infinity, rank: -1 };
    for (const w of gear[0]) for (const a of gear[1]) for (const h of per[0]) for (const b of per[1]) for (const gl of per[2]) for (const sh of per[3]) {
      const l: Layout = {};
      if (w) l.weapon = w; if (a) l.accessory = a; if (h) l.helmet = h; if (b) l.armor = b; if (gl) l.gloves = gl; if (sh) l.shoes = sh;
      const v = layoutValue(P, l);
      if (v.rank > best.rank || (v.rank === best.rank && v.v > best.v)) best = { v: v.v, rank: v.rank };
    }
    return best;
  };

  it('prune = no prune (the same pieces) = enumeration (V), with pins, armorOnly, N 0…100', () => {
    const g = gen(9001);
    let binding = 0;
    for (let t = 0; t < 120; t++) {
      const c = g.pick(critHeroes);
      let P = withNeed(S.prof(c), g.pick([100, 100, 90, 75, 60, 40, 20, 0]));
      if (g.rnd() < 0.3) { const pins = pinOptions(c); if (pins.length) P = pinnedProfile(P, g.pick(pins)); }
      const pool = critPool(g, P, 2);
      const armorOnly = g.rnd() < 0.15;
      const a = bestLayout(P, pool, { armorOnly });
      const e = enumBest(P, pool, armorOnly);
      if (a.value.critLoss > 0) binding++;
      expect(ids(a.layout), `#${t} ${c.name} N${P.need}`).toBe(ids(bestLayout(P, pool, { armorOnly, prune: false }).layout));
      expect([a.value.rank, a.value.v], `#${t} ${c.name} N${P.need}`).toEqual([e.rank, expect.closeTo(e.v, 7)]);
    }
    expect(binding).toBeGreaterThan(40);
  });

  // decision 3 / 15: a piece judged «Оставь» counts its CHC where the current layout leaves it, as the pool does — after
  // the stash the pool holds it
  it('«Оставь» → after the stash the pool holds it', () => {
    const g = gen(9004);
    let keeps = 0;
    for (let t = 0; t < 3000; t++) {
      const c = g.pick(critHeroes);
      const need = g.pick([100, 85, 70, 55, 40]);
      const pins = pinOptions(c);
      const pin = g.rnd() < 0.3 && pins.length ? g.pick(pins).key : null;
      const P0 = pin ? pinnedProfile(withNeed(S.prof(c), need), pins.find((x) => x.key === pin)!) : withNeed(S.prof(c), need);
      const pool = critPool(g, P0);
      const worn = new Set<string>();
      for (const s of ['weapon', 'accessory', ...S.ARMOR]) { const xs = pool.filter((p) => p.slot === s); if (xs.length && g.rnd() < 0.7) worn.add(g.pick(xs).id); }
      const hp = heroPool(S.ctx, c, pool, worn, pin, need)!;
      let x = { ...randArmor(g, hp.P, g.pick(S.ARMOR)), id: 'new' } as Piece;
      if (g.rnd() < 0.5) x = { ...x, setId: CH };
      if (g.rnd() < 0.6 && Object.keys(x.lit).length < 4) x = { ...x, lit: { ...x.lit, CHC: 1 + g.int(6) } };
      if (heroOutcome(hp, x).kind !== 'keep') continue;
      keeps++;
      const stashed = { ...x, id: 'p999999' };
      expect(poolInfo(hp.P, [...pool, stashed], worn).why.has(stashed.id), `#${t} ${c.name} N${need} pin ${!!pin}`).toBe(true);
    }
    expect(keeps).toBeGreaterThan(30);
  });
});

// PLAN 0190 stage 3: the stars' CHC joins the hero's own crit (C₀) — the same as lowering N by that much, and the card
// number matches the game's sum. The curve depends on N − C₀ only while the knee N − 15 is not clamped at 0
describe('stars: Ctx.stars shifts C₀, not the curve (PLAN 0190 §5)', () => {
  const CH = setIdOf('Critical Hit');
  const settings = { rosterOnly: false, stage: 'grow', lv120: false, quirks: true } as const;
  const starCtx = (id: string, star: number) => makeCtx(idx, settings, new Set(), undefined, undefined, { [id]: star });
  const starHeroes = S.heroes.filter((c) => c.chc?.trans && S.prof(c).critOn);
  const pick = (l: Layout) => Object.entries(l).map(([s, p]) => `${s}:${p!.id}`).sort().join(' ');
  const randLayout = (g: Gen, pool: readonly Piece[]): Layout => {
    const l: Layout = {};
    for (const s of ['weapon', 'accessory', ...S.ARMOR] as const) {
      const xs = pool.filter((p) => p.slot === s);
      if (xs.length && g.rnd() < 0.8) l[s] = g.pick(xs);
    }
    return l;
  };
  const trans = (c: { chc?: { trans?: number[] } }, star: number) => (c.chc?.trans?.[star - 1] ?? 0) / 10;

  it('the fixture has heroes with crit from stars that have a CHC build', () => {
    expect(starHeroes.length).toBeGreaterThan(3);
    expect(starHeroes.some((c) => c.name === 'Poolside Trickster Regina')).toBe(true);
  });

  it('shift property: stars with N = stars absent with N − trans: V, critLoss, rank equal, CHC differs by exactly trans', () => {
    const g = gen(1990);
    let moved = 0, lossy = 0;
    for (let t = 0; t < 400; t++) {
      const c = g.pick(starHeroes);
      const star = 1 + g.int(6), tr = trans(c, star);
      const need = Math.max(40, tr + 15) + g.int(100 - Math.max(40, tr + 15) + 1);
      const Ps = withNeed(prof(c), need), Pn = withNeed(prof(c), need - tr);
      const withStars = withNeed(S.profileFor(starCtx(c.id, star), c), need);
      const pool = critPoolOf(g, Ps);
      const l = randLayout(g, pool);
      const a = layoutValue(withStars, l), b = layoutValue(Pn, l);
      if (tr) moved++;
      if (a.critLoss > 0) lossy++;
      const tag = `#${t} ${c.name} ★${star} N${need}`;
      expect(a.v, tag).toBeCloseTo(b.v, 7);
      expect(a.critLoss, tag).toBeCloseTo(b.critLoss, 7);
      expect(a.rank, tag).toBe(b.rank);
      expect(a.chc! - b.chc!, tag).toBeCloseTo(tr, 7);
    }
    expect(moved).toBeGreaterThan(100);
    expect(lossy).toBeGreaterThan(20); // the curve really bites in the sample
  });

  it('bestLayout picks the same pieces in both worlds (crit binds or not)', () => {
    const g = gen(1991);
    for (let t = 0; t < 60; t++) {
      const c = g.pick(starHeroes);
      const star = 5 + g.int(2), tr = trans(c, star);
      const need = Math.max(40, tr + 15) + g.int(100 - Math.max(40, tr + 15) + 1);
      const Pn = withNeed(prof(c), need - tr);
      const withStars = withNeed(S.profileFor(starCtx(c.id, star), c), need);
      const pool = critPoolOf(g, Pn);
      const a = bestLayout(withStars, pool), b = bestLayout(Pn, pool);
      expect(pick(a.layout), `#${t} ${c.name} ★${star} N${need}`).toBe(pick(b.layout));
      expect(a.value.v).toBeCloseTo(b.value.v, 7);
    }
  });

  // N 50 is below C₀ (5 + 5 + 10 + 65 = 85 %): crit counts nothing above N, so a CHC segment is lost whole — V does not rise
  it('Regina ★5, N 50 (below C₀): a CHC substat adds nothing — its whole linear value is the loss, V equals the piece without it', () => {
    const regina = char('Poolside Trickster Regina');
    const P = withNeed(S.profileFor(starCtx(regina.id, 5), regina), 50);
    expect(P.critOn).toBe(true);
    const bare = mk('hb', 'helmet', null, { CHD: 3, SPD: 2, HP: 1 });
    const withChc = mk('hc', 'helmet', null, { CHD: 3, SPD: 2, HP: 1, CHC: 4 });
    const lin = piecePoints(P, withChc) - piecePoints(P, bare);
    expect(lin).toBeGreaterThan(0);                  // the segments are worth something in a straight line
    const a = layoutValue(P, { helmet: withChc }), b = layoutValue(P, { helmet: bare });
    expect(a.chc).toBeCloseTo(85 + 12, 9);           // the card number still counts them
    expect(a.critLoss).toBeCloseTo(lin, 9);          // …but the curve takes all of it
    expect(a.v).toBeCloseTo(b.v, 9);
    // without the stars C₀ is 20 %, under the knee (35): the same segments are worth in full
    const P0 = withNeed(prof(regina), 50);
    expect(layoutValue(P0, { helmet: withChc }).critLoss).toBe(0);
    expect(layoutValue(P0, { helmet: withChc }).v).toBeGreaterThan(layoutValue(P0, { helmet: bare }).v);
  });

  function critPoolOf(g: Gen, P: Profile): Piece[] {
    const out = randPool(g, P, 2, true);
    if (g.rnd() < 0.7) out.push(randGear(g, P, 'accessory'));
    for (let i = g.int(4); i > 0; i--) out.push({ ...randArmor(g, P, g.pick(S.ARMOR)), setId: CH });
    return out.map((p) => (p.slot === 'accessory' && g.rnd() < 0.6 && !p.lit.CHC ? { ...p, main: 'CHC' } : p));
  }
});
