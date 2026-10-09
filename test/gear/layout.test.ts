// Ценность раскладки и лучшая раскладка (.x/0085-stat-set-model, TESTS T4): история Anarky, сборка = полный перебор,
// монотонность, равные вещи, ранг оружия/аксессуара, текущая раскладка = чистый максимум, свойства ценности сета.
import { describe, expect, it } from 'vitest';
import type { Piece } from '@/features/gear/model/gear';
import { wearable } from '@/features/gear/model/vs';
import type { Fit } from '@/features/gear/model/vs';
import { bonusRows, convertible } from '@/game/set/setBonus';
import { partKey, pinCombo, pinKey, pinnedProfile, pinOf, pinOptions, profileFor, rowPoints, type Profile } from '@/game/build/profile';
import { eligibleIn, pieceBar, poolInfo } from '@/features/gear/pool/info';
import { heroOutcome, heroPool } from '@/features/gear/verdict';
import { setValue } from '@/game/set/setValue';
import { better, bestLayout, gearRank, layoutValue, NEW_ID, piecePoints, type Layout } from '@/features/gear/layout';
import { ARMOR, char, ctx, D, EPS, GEAR, gen, heroes, mk, prof, randArmor, randGear, randPool, setId, twenty } from './statSets';

const RANK: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };

// strict (rank, V) order with no threshold — what the best layout maximises
const cmpLex = (a: { rank: number; v: number }, z: { rank: number; v: number }): number => {
  if (a.rank !== z.rank) return Math.sign(a.rank - z.rank);
  return Math.abs(a.v - z.v) <= EPS ? 0 : Math.sign(a.v - z.v);
};

// --- оракул: полный перебор. Броня: пусто | любая вещь слота; V заново из bonusRows по конкретным вещам (без setValue и мемо),
// половины A4 написаны независимо. Оружие и аксессуар: все пары (пусто | годная вещь), порядок (ранг, очки) ---
function bruteBestV(P: Profile, pool: readonly Piece[]): { v: number; rank: number; armorV: number } {
  const per = ARMOR.map((slot) => [null as Piece | null, ...pool.filter((p) => p.slot === slot)]);
  let armorV = -Infinity;
  for (const a of per[0]) for (const b of per[1]) for (const c of per[2]) for (const d of per[3]) {
    const arm = [a, b, c, d].filter((x): x is Piece => !!x);
    let v = arm.reduce((n, p) => n + piecePoints(P, p), 0);
    for (const s of new Set(arm.map((p) => p.setId))) {
      if (!s) continue;
      const mine = arm.filter((p) => p.setId === s);
      if (mine.length < 2) continue;
      const rows = bonusRows(ctx.idx.SET, mine.map((p) => ({ setId: s, bt: p.bt })));
      const r2 = rows.find((r) => r.n === 2), r4 = rows.find((r) => r.n === 4);
      // A4: часть «S ×4» — две половины; «S ×2» — одна, если активна строка 2P или 4P
      const halves = P.parts.has(partKey(s, 4)) && r4 ? 2 : P.parts.has(partKey(s, 2)) && (r2 || r4) ? 1 : 0;
      v += halves * P.U;
      if (!convertible(ctx, P.c, s)) continue;
      for (const r of rows) {
        const counted = halves === 2 || (halves === 1 && (r.n === 2 || !r2));
        if (!counted) v += rowPoints(P, r.bon);
      }
    }
    if (v > armorV) armorV = v;
  }
  const opts = GEAR.map((slot) => [null as Piece | null, ...pool.filter((p) => p.slot === slot && wearable(ctx, P.c, p))]);
  let bestRank = -1, bestPts = -Infinity;
  for (const w of opts[0]) for (const a of opts[1]) {
    const gear = [w, a].filter((x): x is Piece => !!x);
    const rank = gear.reduce((n, p) => n + RANK[gearRank(P, p)], 0);
    const pts = gear.reduce((n, p) => n + piecePoints(P, p), 0);
    if (rank > bestRank || (rank === bestRank && pts > bestPts + EPS)) { bestRank = rank; bestPts = pts; }
  }
  return { v: armorV + bestPts, rank: bestRank, armorV };
}

const lay = (l: Layout) => ARMOR.map((s) => l[s]?.id ?? '-').join(' ');

describe('ценность раскладки и лучшая раскладка', () => {
  it('T4.1: история Anarky — Defense ×2 + Penetration ×2 (V 39,20 → 33,70 → 41,20)', () => {
    const anarky = char('Anarky');
    const P = prof(anarky);
    const hD = mk('hD', 'helmet', 'Defense', { 'DEF%': 2, CHC: 3, CHD: 2, SPD: 1 });
    const aD = mk('aD', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const pG = mk('pG', 'gloves', 'Penetration', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 2 });
    const pB = mk('pB', 'shoes', 'Penetration', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
    const pH = mk('pH', 'helmet', 'Penetration', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 });
    const dB = mk('dB', 'shoes', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
    expect(P.U).toBeCloseTo(7.5, 6);
    [[hD, 6.2], [aD, 7.2], [pG, 6.05], [pB, 4.75], [pH, 8.2], [dB, 4.75]].forEach(([p, x]) => expect(piecePoints(P, p as Piece)).toBeCloseTo(x as number, 6));

    // шаг 1: hD aD pG pB → 24,20 + Def ×2 7,50 + Pen ×2 7,50
    const pool = [hD, aD, pG, pB];
    const b1 = bestLayout(P, pool, {});
    expect(lay(b1.layout)).toBe('hD aD pG pB');
    expect(b1.value.v).toBeCloseTo(39.2, 6);

    // шаг 2: с pH раскладка pH aD pG pB стоит 33,70 (ΔV −5,50, ломает Def ×2), лучшая остаётся прежней
    const forced: Layout = { helmet: pH, armor: aD, gloves: pG, shoes: pB };
    const v2 = layoutValue(P, forced).v;
    expect(v2).toBeCloseTo(33.7, 6);
    expect(v2 - b1.value.v).toBeCloseTo(-5.5, 6);
    const b2 = bestLayout(P, [...pool, pH], {});
    expect(b2.layout.helmet?.id).toBe('hD');
    expect(b2.value.v).toBeCloseTo(39.2, 6);

    // шаг 3: пришли dB → pH aD pG dB = 26,20 + 15,00 = 41,20 (ΔV +2,00)
    const b3 = bestLayout(P, [...pool, pH, dB], {});
    expect(lay(b3.layout)).toBe('pH aD pG dB');
    expect(b3.value.v).toBeCloseTo(41.2, 6);
    expect(b3.value.v - b1.value.v).toBeCloseTo(2, 6);
  });

  it('T4.2: сборка (с отсечкой и без) = полный перебор, 20 героев × 40 пулов', () => {
    const g = gen(4242);
    const bad: string[] = [];
    let cases = 0;
    for (const c of twenty()) {
      const P = prof(c);
      for (let i = 0; i < 40; i++) {
        const pool = randPool(g, P, 3, true);
        const a = bestLayout(P, pool, {});
        const b = bestLayout(P, pool, { prune: false });
        const r = bruteBestV(P, pool);
        cases++;
        if (a.value.rank !== r.rank || Math.abs(a.value.v - r.v) > EPS) bad.push(`${c.name} #${i}: сборка (ранг ${a.value.rank}, ${a.value.v}) / перебор (ранг ${r.rank}, ${r.v})`);
        if (Math.abs(a.value.v - b.value.v) > EPS) bad.push(`${c.name} #${i}: с отсечкой ${a.value.v} / без ${b.value.v}`);
        if (Math.abs(layoutValue(P, a.layout).v - a.value.v) > EPS) bad.push(`${c.name} #${i}: V возвращённой раскладки пересчитан иначе`);
      }
    }
    expect(cases).toBe(800);
    expect(bad).toEqual([]);
  });

  it('T4.3 (A6): добавленная вещь не делает лучшую раскладку хуже — по (ранг, V), по броне и по V только брони', () => {
    const g = gen(777);
    const bad: string[] = [];
    for (const c of twenty()) {
      const P = prof(c);
      for (let i = 0; i < 20; i++) {
        let pool: Piece[] = [];
        let last = { rank: 0, v: 0 }, lastArmor = 0;
        for (let k = 0; k < 9; k++) {
          const slot = g.pick([...ARMOR, ...ARMOR, ...ARMOR, 'weapon', 'accessory'] as const);
          const p = slot === 'weapon' || slot === 'accessory' ? randGear(g, P, slot) : randArmor(g, P, slot);
          pool = [...pool, p];
          const now = bestLayout(P, pool, {}).value;
          const armor = bestLayout(P, pool, { armorOnly: true }).value.v;
          if (cmpLex(now, last) < 0) bad.push(`${c.name}: (ранг ${last.rank}, V ${last.v}) → (ранг ${now.rank}, V ${now.v}) после ${p.slot} ${p.id}`);
          if (armor < lastArmor - EPS) bad.push(`${c.name}: V брони ${lastArmor} → ${armor} после ${p.slot} ${p.id}`);
          last = { rank: now.rank, v: now.v }; lastArmor = armor;
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('T4.4 (A16): равные вещи на одном T — лучший набор из меню не хуже любого статового не из меню', () => {
    // все четыре вещи с одинаковыми сабстатами → V раскладки различается только ценностью сетов;
    // перебор всех мультимножеств из четырёх сетов, все вещи на T4 или все на T0
    const ids = D.sets.map((s) => s.id);
    const multisets: number[][] = [];
    const cur = new Array<number>(ids.length).fill(0);
    const rec = (i: number, left: number) => {
      if (i === ids.length - 1) { cur[i] = left; multisets.push([...cur]); return; }
      for (let k = 0; k <= left; k++) { cur[i] = k; rec(i + 1, left - k); }
    };
    rec(0, 4);
    const sum = (P: Profile, counts: number[], t4: boolean) => {
      let v = 0;
      counts.forEach((n, i) => { if (n >= 2) v += setValue(P, ids[i], n, t4 ? n : 0).value; });
      return v;
    };
    const bad: string[] = [];
    heroes.filter((_, i) => i % 2 === 0).forEach((c) => {
      const P = prof(c);
      for (const t4 of [true, false]) {
        let maxOff = 0;
        for (const counts of multisets) {
          if (counts.some((n, i) => n > 0 && (!convertible(ctx, c, ids[i]) || P.menuSets.has(ids[i])))) continue;
          maxOff = Math.max(maxOff, sum(P, counts, t4));
        }
        let maxMenu = -Infinity;
        for (const b of c.builds) for (const combo of b.sets) {
          const counts = new Array<number>(ids.length).fill(0);
          for (const p of combo) counts[ids.indexOf(p.set)] += p.n;
          maxMenu = Math.max(maxMenu, sum(P, counts, t4));
        }
        if (maxMenu < maxOff - EPS) bad.push(`${c.name} ${t4 ? 'T4' : 'T0'}: меню ${maxMenu} < не из меню ${maxOff}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('T4.5: рекомендованное оружие на 0,00 очков бьёт оружие не из билдов на 9,65 (ранг раньше очков), V = 0,00', () => {
    const rin = char('Rin');
    const P = prof(rin);
    const listed = P.chain.weapons[0];
    const item = D.weapons.find((i) => i.key === listed.key)!;
    const main = listed.mains[0] ?? item.mains[0];
    const other = D.weapons.find((i) => i.grade === 'unique' && i.key !== listed.key && !rin.builds.some((b) => b.weapons.some((w) => w.key === i.key)) && (!i.classLimits.length || i.classLimits.includes(rin.class)) && i.mains.includes('HP%'))!;
    const rec = mk('wRec', 'weapon', null, { RES: 1, EFF: 1, 'HP%': 1, 'DEF%': 1 }, 4, { itemKey: item.key, main });
    const non = mk('wNon', 'weapon', null, { CHC: 4, CHD: 3, SPD: 3, 'ATK%': 3 }, 4, { itemKey: other.key, main: 'HP%' });
    expect(piecePoints(P, rec)).toBeCloseTo(0, 6);
    expect(piecePoints(P, non)).toBeCloseTo(9.65, 6);
    const b = bestLayout(P, [rec, non], {});
    expect(b.layout.weapon?.id).toBe('wRec');
    expect(b.value.v).toBeCloseTo(0, 6);
  });

  it('T4.5a (D2): «временная» с плохими сабстатами = «не из билдов»; аксессуар Fran на 9,90 не вытесняется Epic на 0,00', () => {
    const fran = char('Fran');
    const P = prof(fran);
    const worn = mk('a167', 'accessory', null, { 'ATK%': 2, CHC: 6, SPD: 3, CHD: 4 }, 0, { itemKey: '1022', main: 'DMG UP%' });
    const recJunk = mk('a2', 'accessory', null, { RES: 2, DEF: 1, 'DMG RED%': 1, HP: 1 }, 4, { itemKey: '1017', main: 'SPD' });
    const epicJunk = mk('a93', 'accessory', null, { DEF: 2, EFF: 3, HP: 2 }, 0, { grade: 'rare', main: 'SPD' });
    const epicGood = mk('a178', 'accessory', null, { CHC: 2, RES: 2, 'HP%': 3 }, 0, { grade: 'rare', main: 'SPD' });
    expect(piecePoints(P, worn)).toBeCloseTo(9.9, 6);
    expect(gearRank(P, epicJunk)).toBe('no');
    expect(gearRank(P, epicGood)).toBe('stopgap');
    // рекомендованный Legendary-аксессуар вытесняет надетый, плохая «временная» — нет
    expect(bestLayout(P, [worn, epicJunk], {}).layout.accessory?.id).toBe('a167');
    expect(bestLayout(P, [worn, recJunk], {}).layout.accessory?.id).toBe('a2');
  });

  it('T4.5b (D3): текущая раскладка = чистый максимум пула; порог +1 только в better; ничья — раньше запись', () => {
    const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%
    const P = prof(caren);
    const wornH = mk('h7', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });   // надет, 7,70
    const arm = mk('h2', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    // в пуле, не надет: DEF% 4 + CHC 3 + CHD 2 + DMG UP% 1 = 4 + 2,4 + 1,3 + 0,4 = 8,10 = надетый + 0,40
    const mid = mk('h8', 'helmet', 'Defense', { 'DEF%': 4, CHC: 3, CHD: 2, 'DMG UP%': 1 });
    expect(piecePoints(P, wornH)).toBeCloseTo(7.7, 6);
    expect(piecePoints(P, mid) - piecePoints(P, wornH)).toBeCloseTo(0.4, 6);
    const pool = [wornH, arm, mid];
    const best = bestLayout(P, pool, {});
    expect(best.layout.helmet?.id).toBe('h8');
    const vNow = best.value;
    const vWorn = layoutValue(P, { helmet: wornH, armor: arm });
    expect(better(vNow, vWorn)).toBe(false);
    expect(vNow.v - vWorn.v).toBeCloseTo(0.4, 6);

    // ничья по V: больше слотов, потом более старая запись — p5, хотя надет p9
    const a = mk('p5', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const b = mk('p9', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    expect(bestLayout(P, [b, a], {}).layout.helmet?.id).toBe('p5');
  });

  it('T4.6: закрепление — броня чужих сетов исключена (надетая остаётся), половины только частей набора, цепочка своего билда', () => {
    const anarky = char('Anarky'); // «По статам» — цепочка Patience (SPD = HP = DMG RED% на 4-м месте); Defense mix — без них
    const P = prof(anarky);
    const mix = anarky.builds.find((b) => b.name === 'Defense mix')!;
    const combo = mix.sets.find((x) => x.some((q) => q.set === setId('Penetration')))!;
    const key = pinKey(anarky, mix, combo);
    expect(pinOptions(anarky).map((o) => o.key)).toContain(key);
    const pin = pinOf(anarky, key)!;
    const Pp = pinnedProfile(P, pin);
    expect(profileFor(ctx, anarky, key)).toBe(Pp);
    // меню — только набор, цепочка — его билда
    expect([...Pp.menuSets].sort()).toEqual([setId('Defense'), setId('Penetration')].sort());
    expect([...Pp.parts].sort()).toEqual([partKey(setId('Defense'), 2), partKey(setId('Penetration'), 2)].sort());
    expect(Pp.chain.subs).toEqual(mix.subs);
    const hp = mk('hH', 'helmet', 'Defense', { 'DEF%': 2, CHC: 2, 'DMG RED%': 3, SPD: 1 });
    expect(piecePoints(P, hp)).toBeGreaterThan(piecePoints(Pp, hp)); // DMG RED% у «По статам» засчитан, у Defense mix — нет
    // половины — только частей набора: Immunity ×2 есть в меню героя, но не в наборе
    expect(setValue(P, setId('Immunity'), 2, 2).halves).toBe(1);
    expect(setValue(Pp, setId('Immunity'), 2, 2).halves).toBe(0);
    // броня чужого сета: годна «По статам», закреплённому — нет; не надета — не в раскладке, надета — остаётся
    const aD = mk('aD', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const pG = mk('pG', 'gloves', 'Penetration', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 2 });
    const pB = mk('pB', 'shoes', 'Penetration', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
    const sH = mk('sH', 'helmet', 'Swiftness', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 });
    expect(pieceBar(P, sH).pass).toBe(true);
    expect(pieceBar(Pp, sH).pass).toBe(false);
    expect(pieceBar(Pp, pG).pass).toBe(pieceBar(P, pG).pass);
    const pool = [aD, pG, pB, sH];
    const none = new Set<string>();
    expect(bestLayout(P, pool, { eligible: eligibleIn(P, none) }).layout.helmet?.id).toBe('sH');
    expect(bestLayout(Pp, pool, { eligible: eligibleIn(Pp, none) }).layout.helmet).toBeUndefined();
    expect(bestLayout(Pp, pool, { eligible: eligibleIn(Pp, new Set(['sH'])) }).layout.helmet?.id).toBe('sH');
    // пул: не надетая чужая — «больше не нужна»; вердикт: чужой сет закреплённому не «Надень» и не «Оставь»
    expect(poolInfo(Pp, pool, none).unneeded.map((p) => p.id)).toEqual(['sH']);
    const bare = heroPool(ctx, anarky, [aD, pG, pB], none, key)!;
    expect(bare.P).toBe(Pp);
    expect(heroOutcome(heroPool(ctx, anarky, [aD, pG, pB], none)!, { ...sH, id: NEW_ID }).kind).toBe('wear');
    expect(heroOutcome(bare, { ...sH, id: NEW_ID }).kind).toBe('none');
    // запас закреплённому — только сетов набора (ревью этапа 10): слабая Swiftness-броня при начатом Swiftness — не запас
    const sWeak = mk('sW', 'armor', 'Swiftness', { RES: 1, EFF: 1, HP: 1, 'ATK%': 1 }, 0);
    const pBweak = mk('pW', 'helmet', 'Penetration', { RES: 1, EFF: 1, HP: 1, 'ATK%': 1 }, 0);
    expect(poolInfo(P, [sH, sWeak], new Set(['sH'])).why.get('sW')).toEqual(['reserve']);
    expect(poolInfo(Pp, [sH, sWeak], new Set(['sH'])).why.get('sW')).toBeUndefined();
    expect(poolInfo(Pp, [pG, pBweak], new Set(['pG'])).why.get('pW')).toEqual(['reserve']);
    // билд переименовали — ключ не годится, профиль «По статам»
    const stale = key.replace('Defense mix', 'Defense mix old');
    expect(pinOf(anarky, stale)).toBeNull();
    expect(profileFor(ctx, anarky, stale)).toBe(P);
    expect(pinCombo(key)).toEqual([...combo].sort((a, z) => Number(a.set) - Number(z.set)));
  });

  it('кандидаты: eligible отсекает вещи; вещь с формы (NEW_ID) при равенстве уступает записанной', () => {
    const P = prof('Caren');
    const strong = mk('p3', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });
    const weak = mk('p4', 'helmet', 'Defense', { 'DEF%': 1, CHC: 1, RES: 1, EFF: 1 });
    expect(bestLayout(P, [strong, weak]).layout.helmet?.id).toBe('p3');
    expect(bestLayout(P, [strong, weak], { eligible: (p) => p.id !== 'p3' }).layout.helmet?.id).toBe('p4');
    const form = { ...strong, id: NEW_ID };
    const old = { ...strong, id: 'p999' };
    expect(bestLayout(P, [form, old]).layout.helmet?.id).toBe('p999');
  });

  it('T4.7 (A4): ценность сета не падает ни от вещи в пустой слот, ни от T0 → T4', () => {
    let nA = 0, nB = 0;
    const bad: string[] = [];
    for (const c of heroes) {
      const P = prof(c);
      for (const s of D.sets) {
        // (а) добавили вещь сета: (n, n4) → (n + 1, n4) или (n + 1, n4 + 1)
        for (let n = 0; n <= 3; n++) for (let n4 = 0; n4 <= n; n4++) for (const t4 of [0, 1]) {
          nA++;
          const from = n >= 2 ? setValue(P, s.id, n, n4).value : 0;
          const to = setValue(P, s.id, n + 1, n4 + t4).value;
          if (n + 1 >= 2 && to < from - EPS) bad.push(`A ${c.name} ${s.short}: ${n} (T4 ${n4}) + ${t4 ? 'T4' : 'T0'}: ${from} → ${to}`);
        }
        // (б) одна вещь из n переходит T0 → T4
        for (let n = 2; n <= 4; n++) for (let n4 = 0; n4 < n; n4++) {
          nB++;
          const from = setValue(P, s.id, n, n4).value, to = setValue(P, s.id, n, n4 + 1).value;
          if (to < from - EPS) bad.push(`B ${c.name} ${s.short} ×${n}: T4 ${n4} → ${n4 + 1}: ${from} → ${to}`);
        }
      }
    }
    expect(nA).toBeGreaterThan(0);
    expect(nB).toBeGreaterThan(0);
    expect(bad).toEqual([]);

    // целые раскладки: вещь в пустой слот и T0 → T4 одной вещи не уменьшают V
    const g = gen(4747);
    const badL: string[] = [];
    for (const c of twenty()) {
      const P = prof(c);
      for (let i = 0; i < 60; i++) {
        const l: Layout = {};
        for (const p of randPool(g, P, 1, false).slice(0, 3)) l[p.slot] = p;
        const free = ARMOR.filter((s) => !l[s]);
        if (!free.length) continue;
        const x = randArmor(g, P, g.pick(free));
        if (layoutValue(P, { ...l, [x.slot]: x }).v < layoutValue(P, l).v - EPS) badL.push(`${c.name}: вещь ${x.id} в пустой слот снизила V`);
        const t0 = Object.values(l).find((p) => p.bt !== 4);
        if (t0 && layoutValue(P, { ...l, [t0.slot]: { ...t0, bt: 4 } }).v < layoutValue(P, l).v - EPS) badL.push(`${c.name}: T0 → T4 у ${t0.id} снизило V`);
      }
    }
    expect(badL).toEqual([]);
  });

  it('T4.8: лучшая раскладка заполняет каждый слот брони, для которого в пуле есть вещь', () => {
    const g = gen(99);
    const bad: string[] = [];
    for (const c of heroes.filter((_, i) => i % 2 === 0)) {
      const P = prof(c);
      for (let i = 0; i < 30; i++) {
        const pool = randPool(g, P, 3, false);
        const l = bestLayout(P, pool, {}).layout;
        if (ARMOR.some((s) => !l[s] && pool.some((p) => p.slot === s))) bad.push(`${c.name} #${i}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
