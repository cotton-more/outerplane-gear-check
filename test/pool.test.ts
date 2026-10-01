// Пул экипировки (logic/pool, GEARPOOL C1): сборка варианта из вещей персонажа — точная (сверка с перебором без
// отсечения), цель владельца (сет-эффект держится, сет-стат ломается только ради итога), «собираешь», «По статам»,
// ненужные вещи.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { ArmorSlot, Char, Dataset, SlotId } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { buildKey, EMPTY_GEAR, updateIn, updatePiece, type Bt, type GearStore, type Piece } from '../src/logic/gear';
import { assemble, assembleReach, entriesFor, hasStatBuild, heldBy, holds, isStats, outcomeFor, play, poolView, putOn, puts, started, statVariant, STATS, undoPut, type Assembly, type Entry, type Play, type PoolStore } from '../src/logic/pool';
import { bonusRows, bonusValue, bonusWeights, convertible, tierLabel } from '../src/logic/setBonus';
import { charVs, whereUsed } from '../src/logic/poolVs';
import { slotMains } from '../src/logic/builds';
import { decodeItem, MAINS } from '../src/logic/itemCode';
import type { Subs } from '../src/logic/subs';
import type { ItemInput } from '../src/logic/verdict';
import { variantsOf, type Variant } from '../src/logic/variants';
import { evaluate } from '../src/logic/evaluate';
import { withWorn } from '../src/logic/worn';
import { fit } from '../src/logic/vs';

// псевдослучайные [0, 1) с сидом (mulberry32): прежний x * 1103515245 + 12345 в числах JS терял точность (произведение
// больше 2^53) и зацикливался — «1000 пулов» были 190 разными
const lcg = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%
const variant = (name: string, v: string) => variantsOf(idx, char(name)).find((x) => x.name === v)!;

let seq = 0;
// вещь брони: lit — уровень сабстатов (сколько горит), yellow — тот же
const P = (slot: SlotId, short: string | null, lit: Subs, bt: Bt | null = null, grade: Piece['grade'] = 'unique'): Piece =>
  ({ id: 'p' + ++seq, slot, grade, setId: short ? set(short) : null, itemKey: null, main: null, yellow: lit, lit, bt, at: '' });
const W = (itemKey: string, lit: Subs, main = 'DEF%', grade: Piece['grade'] = 'unique'): Piece =>
  ({ id: 'p' + ++seq, slot: 'weapon', grade, setId: null, itemKey, main, yellow: lit, lit, bt: null, at: '' });
const JUNK = { RES: 1, EFF: 1, HP: 1 };
const GOOD = { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 };

const asm = (v: Variant, pieces: Piece[], c = caren) => assemble(ctx, c, v, entriesFor(ctx, c, v, pieces));
const sets = (a: Assembly) => (['helmet', 'armor', 'gloves', 'shoes'] as ArmorSlot[]).map((s) => a.slots[s]?.setId && idx.SET[a.slots[s]!.setId!].short);
const inPlay = (pieces: Piece[], opts = {}, c = caren) => play(ctx, c, pieces, opts).inPlay.map((v) => (isStats(v) ? '#stats' : v.name));

describe('сборка варианта: точная', () => {
  // Независимый эталон (идея build/review-gearpool/test/a1-assemble): полный перебор брони (пусто | любая вещь слота),
  // счёт по спеке из примитивов setBonus — не armorScore и не отсечение; оружие и аксессуар — по слоту. Случайные
  // пулы: сеты связок и чужие, копии роллов (ничьи), Breakthrough от «не указан» до T4, оружие и аксессуар из билда и
  // чужие, вещь с формы (половина пулов), force (каждый пятый). Сверяются раскладка по id, hard/live/soft/total/
  // filled/older и достижимая сборка — с отсечением и без
  const rnd = lcg(12345);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
  const GEAR = ['weapon', 'accessory'] as const;
  const EPS = 1e-9;
  const RANK = { rec: 2, stopgap: 1, no: 0 } as const;
  const SUBKEYS = D.substats.map((x) => x.key);
  const heroes = D.chars.filter((c) => c.builds.length);
  const fixed: [string, string][] = [
    ['Caren', 'Speed'], ['Caren', 'Speed/Immu'], ['Anarky', 'Defense mix · Penetration'], ['Heatwave Cop Delta', 'DPS · Penetration ×4'],
    ['Heatwave Cop Delta', 'DPS · Penetration ×2 + Attack ×2'], ['Core Fusion Lisha', 'Pen combos · Speed'], ['Iota', 'PvE - effi'],
  ];
  const subsOf = (): Subs => { const x: Subs = {}; while (Object.keys(x).length < 4) x[pick(SUBKEYS)] = 1 + Math.floor(rnd() * 4); return x; };
  const gearOf = (v: Variant, kind: 'weapon' | 'accessory') => {
    const r = (kind === 'weapon' ? v.b.weapons : v.b.amulets), items = kind === 'weapon' ? D.weapons : D.amulets;
    const ref = r.length && rnd() < 0.5 ? pick(r) : null;
    const it = ref ? items.find((x) => x.key === ref.key) ?? pick(items) : pick(items);
    return { itemKey: it.key, main: pick(ref?.mains.length ? ref.mains : it.mains.length ? it.mains : ['ATK%']) };
  };
  interface Case { c: Char; v: Variant; es: Entry[]; force?: Entry }
  const makeCase = (i: number): Case => {
    const [cn, vn] = i % 2 ? pick(fixed) : [pick(heroes).name, null];
    const c = char(cn);
    const v = vn ? variant(cn, vn) : pick([...variantsOf(idx, c), statVariant(c)!]);
    const own = variantsOf(idx, c).flatMap((x) => (x.b.sets[0] ?? []).map((q) => q.set));
    const sets = [...own, ...own, pick(D.sets).id, pick(D.sets).id];
    const pieces: Piece[] = [];
    for (let k = Math.floor(rnd() * 11); k > 0; k--) {
      const twin = pieces.length && rnd() < 0.3 ? pick(pieces) : null; // тот же ролл — равная ценность
      const lit = twin ? { ...twin.lit } : subsOf();
      pieces.push({ id: 'p' + ++seq, slot: pick(ARMOR), grade: rnd() < 0.25 ? 'rare' : 'unique', setId: twin?.setId ?? pick(sets), itemKey: null,
        main: null, yellow: lit, lit, bt: pick([null, 0, 1, 2, 3, 4, 4] as (Bt | null)[]), at: '' });
    }
    for (const kind of GEAR) {
      for (let k = Math.floor(rnd() * 3); k > 0; k--) {
        const lit = subsOf();
        pieces.push({ id: 'p' + ++seq, slot: kind, grade: rnd() < 0.3 ? 'rare' : 'unique', setId: null, ...gearOf(v, kind), yellow: lit, lit, bt: null, at: '' });
      }
    }
    const slot = pick([...ARMOR, ...GEAR] as SlotId[]);
    const x: ItemInput | null = rnd() < 0.5 ? null : (GEAR as readonly SlotId[]).includes(slot)
      ? { slot, grade: 'unique', setId: null, ...gearOf(v, slot as 'weapon' | 'accessory'), subs: subsOf() }
      : { slot, grade: 'unique', setId: pick(sets), itemKey: null, main: null, subs: subsOf() };
    const es = entriesFor(ctx, c, v, pieces, x);
    return { c, v, es, force: es.length && rnd() < 0.2 ? (x && rnd() < 0.6 ? es[es.length - 1] : pick(es)) : undefined };
  };
  type S = { hard: number; live: number; soft: number; total: number; filled: number; older: number; progress: number };
  const cmp = (a: S, z: S) => a.hard - z.hard || a.live - z.live || a.soft - z.soft
    || (Math.abs(a.total - z.total) > EPS ? Math.sign(a.total - z.total) : 0) || a.filled - z.filled || z.older - a.older;
  function reference({ c, v, es, force }: Case) {
    const stats = isStats(v), parts = v.b.sets[0] ?? [], W = bonusWeights(ctx, c, v.b);
    const gear = GEAR.map((slot) => (force?.slot === slot ? [force] : es.filter((e) => e.slot === slot && (e.piece || e.fit !== 'no' || (stats && e.v > EPS))))
      .reduce<Entry | null>((b, e) => (!b || RANK[e.fit] > RANK[b.fit] || (RANK[e.fit] === RANK[b.fit] && (e.v > b.v + EPS || (Math.abs(e.v - b.v) <= EPS && e.num < b.num))) ? e : b), null));
    const score = (arm: (Entry | null)[]): S => {
      const got = [...arm, ...gear].filter((e): e is Entry => !!e), armor = arm.filter((e): e is Entry => !!e);
      const rows = bonusRows(idx.SET, armor);
      const cnt = (st: string) => armor.filter((e) => e.setId === st).length;
      let hard = 0, live = 0, soft = 0, progress = 0;
      for (const q of parts) {
        progress += Math.min(cnt(q.set), q.n);
        if (convertible(ctx, c, q.set)) soft += Math.min(cnt(q.set), q.n - 1);
        else { hard += Math.min(cnt(q.set), q.n); if (rows.some((r) => r.set === q.set && r.n >= q.n)) live++; }
      }
      const total = got.reduce((n, e) => n + e.v, 0) + rows.reduce((n, r) => n + bonusValue(ctx, c, W, r), 0);
      return { hard, live, soft, total, filled: got.length, older: got.reduce((n, e) => n + e.num, 0), progress };
    };
    const all: { arm: (Entry | null)[]; s: S }[] = [];
    const cur: (Entry | null)[] = [null, null, null, null];
    const walk = (i: number) => {
      if (i === 4) { all.push({ arm: [...cur], s: score(cur) }); return; }
      for (const e of force?.slot === ARMOR[i] ? [force] : [null, ...es.filter((e) => e.slot === ARMOR[i])]) { cur[i] = e; walk(i + 1); }
    };
    walk(0);
    const best = all.reduce((b, a) => (cmp(a.s, b.s) > 0 ? a : b));
    const near = all.reduce((b, a) => (a.s.progress > b.s.progress || (a.s.progress === b.s.progress && cmp(a.s, b.s) > 0) ? a : b));
    const lay = (arm: (Entry | null)[]) => [...gear, ...arm].map((e) => (e ? e.id ?? 'X' : '-')).join(',');
    const tiesOf = (same: (a: typeof best) => boolean) => new Set(all.filter(same).map((a) => lay(a.arm)));
    const reach = near.s.progress > best.s.progress ? near : best;
    return {
      best: best.s, bestLay: tiesOf((a) => cmp(a.s, best.s) === 0),
      reach: reach.s, reachLay: tiesOf((a) => a.s.progress === reach.s.progress && cmp(a.s, reach.s) === 0),
    };
  }
  const layOf = (a: Assembly) => [...GEAR, ...ARMOR].map((sl) => { const e = a.slots[sl]; return e ? e.id ?? 'X' : '-'; }).join(',');
  const scoreOf = (a: Assembly): S => ({ hard: a.hard, live: a.live, soft: a.soft, total: a.total, filled: a.filled, older: a.older, progress: a.progress });
  const same = (a: Assembly, s: S, lays: Set<string>) => {
    expect(lays).toContain(layOf(a));
    expect({ ...scoreOf(a), total: 0 }).toEqual({ ...s, total: 0 });
    expect(a.total).toBeCloseTo(s.total, 9);
  };

  it('выбранная сборка — как эталон, с отсечением и без (1000 пулов)', () => {
    let withX = 0, forced = 0, weapons = 0;
    for (let i = 0; i < 1000; i++) {
      const k = makeCase(i), r = reference(k);
      if (k.es.some((e) => !e.piece)) withX++;
      if (k.force) forced++;
      if (k.es.some((e) => e.slot === 'weapon')) weapons++;
      for (const prune of [true, false]) same(assemble(ctx, k.c, k.v, k.es, { force: k.force, prune }), r.best, r.bestLay);
    }
    expect(Math.min(withX, forced, weapons)).toBeGreaterThan(30); // пулы правда разные
  });

  it('достижимая сборка — как эталон, с отсечением и без (1000 пулов)', () => {
    for (let i = 0; i < 1000; i++) {
      const k = { ...makeCase(i), force: undefined }, r = reference(k);
      for (const prune of [true, false]) {
        const got = assembleReach(ctx, k.c, k.v, k.es, { prune });
        same(got.asm, r.best, r.bestLay);
        same(got.reach, r.reach, r.reachLay);
      }
    }
  });
});

describe('сборка: цель владельца', () => {
  it('Caren · Speed: 4 Speed против 3 Speed + чужая вещь — чужая встаёт, только если выигрыш больше бонуса Speed ×4', () => {
    const speed = ['helmet', 'armor', 'gloves', 'shoes'].map((s) => P(s as SlotId, 'Speed', JUNK));
    const strong = P('shoes', 'Attack', { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 });
    const weak = P('shoes', 'Attack', { CHD: 2, RES: 1, EFF: 1, HP: 1 });
    const v = variant('Caren', 'Speed');

    expect(sets(asm(v, [...speed, strong]))).toEqual(['Speed', 'Speed', 'Speed', 'Attack']);
    expect(sets(asm(v, [...speed, weak]))).toEqual(['Speed', 'Speed', 'Speed', 'Speed']);
    expect(asm(v, speed).bonuses.map((r) => [r.n, r.tier])).toEqual([[4, 'T0']]);
  });

  it('2 → 3 Speed всегда лучше чужой вещи, даже сильной: сет-стат собирается вещь за вещью', () => {
    const pieces = [P('helmet', 'Speed', JUNK), P('armor', 'Speed', JUNK), P('gloves', 'Speed', JUNK), P('gloves', 'Attack', { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 })];
    expect(sets(asm(variant('Caren', 'Speed'), pieces))).toEqual(['Speed', 'Speed', 'Speed', undefined]);
  });

  it('Anarky · Defense mix · Penetration: Pen ×2 — эффект, ради статов не ломается', () => {
    const pieces = [P('helmet', 'Penetration', JUNK), P('armor', 'Penetration', JUNK), P('gloves', 'Defense', JUNK), P('shoes', 'Defense', JUNK),
      P('helmet', 'Defense', { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 })];
    const a = asm(variant('Anarky', 'Defense mix · Penetration'), pieces, char('Anarky'));
    expect(sets(a)).toEqual(['Penetration', 'Penetration', 'Defense', 'Defense']);
    expect([a.hard, a.progress, a.need]).toEqual([2, 4, 4]);
  });

  it('Pen ×2 на T4 — бонус только на T4: вещь не с T4 его не отключит, хоть и лучше по статам', () => {
    const lisha = char('Core Fusion Lisha'), v = variant('Core Fusion Lisha', 'Pen combos · Speed');
    const t4 = [P('helmet', 'Penetration', JUNK, 4), P('armor', 'Penetration', JUNK, 4)];
    const better = P('helmet', 'Penetration', { 'ATK%': 6, CHC: 6, CHD: 6, SPD: 6 }, 2);
    const a = asm(v, [...t4, better], lisha);
    expect(a.slots.helmet?.id).toBe(t4[0].id);
    expect(a.live).toBe(1);
  });

  it('оружие: рекомендованное лучше прочего, даже если сабстаты слабее; прочее — всё равно встаёт в пустой слот', () => {
    const [rec] = caren.builds[0].weapons;
    const other = D.weapons.find((w) => w.star === 6 && w.grade === 'unique' && !caren.builds[0].weapons.some((r) => r.key === w.key))!;
    const v = variant('Caren', 'Speed');
    const a = asm(v, [W(rec.key, { HP: 1 }), W(other.key, GOOD, 'ATK%')]);
    expect(a.slots.weapon?.input.itemKey).toBe(rec.key);
    expect(a.roles.weapon).toBe('rec');
    expect(asm(v, [W(other.key, GOOD, 'ATK%')]).roles.weapon).toBe('filler');
  });

  it('отчёт: роли слотов, прогресс, собранные и недостающие части, бонусы', () => {
    const pieces = [P('helmet', 'Immunity', JUNK), P('armor', 'Speed', JUNK, 4), P('gloves', 'Speed', JUNK, 4), P('shoes', 'Speed', JUNK)];
    const a = asm(variant('Caren', 'Speed/Immu'), pieces);
    expect(a.roles).toMatchObject({ helmet: 'set', armor: 'set', gloves: 'set', shoes: 'surplus' });
    expect([a.progress, a.need]).toEqual([3, 4]);
    expect(a.complete).toEqual([{ set: set('Speed'), n: 2 }]);
    expect(a.missing).toEqual([{ set: set('Immunity'), n: 2, have: 1 }]);
    expect(a.bonuses.map((r) => [idx.SET[r.set].short, r.n, r.tier])).toEqual([['Speed', 2, 'T4']]);
  });
});

describe('«собираешь»', () => {
  const sp = (slot: SlotId) => P(slot, 'Speed', JUNK);

  it('GEARPOOL.md: один Speed-шлем — Speed и Speed/Immu; четыре Speed — те же, Def/Immu — нет', () => {
    expect(inPlay([sp('helmet')])).toEqual(['Speed', 'Speed/Immu']);
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map(sp);
    expect(inPlay(four)).toEqual(['Speed', 'Speed/Immu']);
  });

  // было (до Р14): Def/Immu собирался только со второй Immunity, когда Immunity ×2 собрана
  it('Р14: одна Immunity-вещь к четырём Speed начинает Def/Immu', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map(sp);
    expect(inPlay([...four, P('helmet', 'Immunity', JUNK)])).toEqual(['Speed', 'Speed/Immu', 'Def/Immu']);
  });

  // пример владельца (Р14): у Caren 3 Speed и 1 Immunity — начаты и Speed (3 из 4), и Speed/Immu, при любом T
  it.each([null, 0, 4] as (Bt | null)[])('Р14, пример владельца: 3 Speed + 1 Immunity (Breakthrough %s) — собираются и Speed, и Speed/Immu', (bt) => {
    const pieces = [P('helmet', 'Speed', JUNK, bt), P('armor', 'Speed', JUNK, bt), P('gloves', 'Speed', JUNK, bt), P('shoes', 'Immunity', JUNK, bt)];
    expect(inPlay(pieces)).toEqual(expect.arrayContaining(['Speed', 'Speed/Immu']));
  });

  // было: Speed/Immu собран (4 из 4), Speed (3 из 4) не «ближе всех» — выпадал
  it('Р14: 3 Speed + 2 Immunity — Speed (3 из 4) собирается рядом с собранным Speed/Immu', () => {
    const pieces = [P('helmet', 'Speed', JUNK), P('armor', 'Speed', JUNK), P('gloves', 'Speed', JUNK), P('shoes', 'Immunity', JUNK), P('gloves', 'Immunity', JUNK)];
    expect(inPlay(pieces)).toEqual(expect.arrayContaining(['Speed', 'Speed/Immu']));
  });

  it('Р14: вариант, где из пула не встаёт ни одна вещь его связки, не собирается', () => {
    expect(inPlay([sp('helmet')])).not.toContain('Def');
  });

  // было: только оружие — «никто не начат», запасное правило собирало все билды, кому оно подходит, и «По статам»; с
  // «Собираю» — только отмеченный. Р18: оружие из списка начинает билд, как вещь сета; запасного правила нет
  it('Р18: оружие из списка начинает только билды, в чьих списках оно есть; «По статам» уже не живой', () => {
    const sterope = char('Sterope'); // оружие 5 (HP%) — в списках Support-билдов, не SubDPS
    const w = [W('5', GOOD, 'HP%')];
    expect(inPlay(w, {}, sterope)).toEqual(['Support Speed', 'Support Swift Immu']);
  });

  it('Р18: оружие из списка начинает все билды, где оно есть, и с «Собираю» у одного из них', () => {
    const w = [W(caren.builds[0].weapons[0].key, GOOD)];
    expect(inPlay(w, { marks: { [buildKey(caren.id, 'Def')]: 'want' } })).toEqual(['Speed', 'Pen', 'Def', 'Speed/Immu', 'Def/Immu']);
  });

  it('Р18: оружие не из списка (fit «нет») — собирается только «По статам»', () => {
    const w = W(D.weapons.find((x) => !caren.builds.some((b) => b.weapons.some((r) => r.key === x.key)))!.key, GOOD, 'SPD', 'rare');
    expect(caren.builds.map((b) => fit(ctx, caren, b, w))).toEqual(caren.builds.map(() => 'no'));
    expect(inPlay([w])).toEqual(['#stats']);
  });

  // Р18: «Не собираю» исключает всегда — даже когда отмечены так все начатые (было: запасное правило собирало билды по
  // оружию, 110 состояний у опровергателя 3б; теперь оружие из списка их само начинает)
  it('Р18: все начатые — «Не собираю»: не собирается ничего, и «По статам» не живой (билды начаты)', () => {
    const all = Object.fromEntries(caren.builds.map((b) => [buildKey(caren.id, b.name), 'skip' as const]));
    expect(inPlay([sp('helmet'), W(caren.builds[0].weapons[0].key, GOOD)], { marks: all })).toEqual([]);
  });

  it('Р18: Speed и Speed/Immu — «Не собираю»: они не собираются, а начатые оружием — да', () => {
    const skip = { [buildKey(caren.id, 'Speed')]: 'skip' as const, [buildKey(caren.id, 'Speed/Immu')]: 'skip' as const };
    expect(inPlay([sp('helmet'), W(caren.builds[0].weapons[0].key, GOOD)], { marks: skip })).toEqual(['Pen', 'Def', 'Def/Immu']);
  });

  it('«Не собираю» убирает вариант, даже собранный', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map(sp);
    expect(inPlay(four, { marks: { [buildKey(caren.id, 'Speed/Immu')]: 'skip' } })).toEqual(['Speed']);
  });

  it('Demiurge Luna, четыре Penetration — собираются все 5 вариантов «Pen mix» (Pen ×2 собран в каждом)', () => {
    const luna = char('Demiurge Luna');
    const pen = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map((s) => P(s, 'Penetration', JUNK));
    const on = play(ctx, luna, pen).inPlay;
    expect(on.filter((v) => v.parent.name === 'Pen mix')).toHaveLength(5);
    expect(on.map((v) => v.name)).toContain('Penetration');
  });

  it('Eternal, четыре Attack — только «По статам»: бонусы Attack считаются', () => {
    const eternal = char('Eternal');
    const atk = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map((s) => P(s, 'Attack', { SPD: 3, EFF: 2, CHC: 2 }));
    const p = play(ctx, eternal, atk);
    expect(p.inPlay.map((v) => v.key)).toEqual([`${eternal.id}/#stats`]);
    expect(p.asm.get(p.inPlay[0].key)!.bonuses.map((r) => [r.n, r.tier])).toEqual([[2, 'T0'], [4, 'T0']]);
    // вещь из сета билда — «По статам» уже не живой: он есть (находка 28), но не собирается сам
    const withSpeed = play(ctx, eternal, [...atk, P('helmet', 'Speed', JUNK)]);
    expect(withSpeed.stat).not.toBeNull();
    expect(withSpeed.inPlay).not.toContain(withSpeed.stat);
  });

  // Р12 + Р18: «начат» одно — оружие из списка тоже начинает билд, и «По статам» становится тихим
  it('Eternal, четыре Attack и оружие из списка Speed — собирается Speed, «По статам» не живой', () => {
    const eternal = char('Eternal');
    const atk = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map((s) => P(s, 'Attack', { SPD: 3, EFF: 2, CHC: 2 }));
    const g = eternal.builds[0].weapons[0];
    const p = play(ctx, eternal, [...atk, W(g.key, { SPD: 2 }, g.mains[0] ?? 'ATK%')]);
    expect({ live: p.statLive, on: p.inPlay.map((v) => v.name) }).toEqual({ live: false, on: ['Speed'] });
  });
});

// П3 (повторное ревью, 2026-09-30): билд начинает только оружие / аксессуар из списка — рекомендованное (fit «rec»).
// Временное (Epic с main из списка в «Развитии») в сборке стоит, но билд не начинает. Было: одно Steel Sword ATK% у
// Demiurge Luna начинало все 8 вариантов, «Надеть — начнёт …» перечисляло все 8
describe('П3: временное оружие билд не начинает', () => {
  const luna = char('Demiurge Luna'); // Mage; в списках всех билдов оружие 17 (ATK%)
  const end = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'end', lv120: false, quirks: true }, new Set());
  const steel = D.weapons.find((w) => w.name === 'Steel Sword' && w.star === 6)!; // Epic, main ATK% / DEF% / HP%
  const sword = () => W(steel.key, { CHC: 2, CHD: 2, 'ATK%': 1, SPD: 1 }, 'ATK%', 'rare');
  const listed = () => W('17', { CHC: 2, CHD: 2, 'ATK%': 1, SPD: 1 }, 'ATK%');
  const input = (p: Piece): ItemInput => ({ slot: p.slot, grade: p.grade, setId: null, itemKey: p.itemKey, main: p.main, subs: p.lit });
  const real = (c: Char) => variantsOf(idx, c).map((v) => v.name);
  const helm = () => P('helmet', 'Penetration', { 'ATK%': 2, CHC: 2, CHD: 2, SPD: 1 });

  it('Steel Sword ATK% у Luna — временное во всех билдах', () => {
    expect(luna.builds.map((b) => fit(ctx, luna, b, sword()))).toEqual(luna.builds.map(() => 'stopgap'));
  });

  it('одно временное оружие в пуле: ни один билд не начат, собирается только «По статам» (живой)', () => {
    const p = play(ctx, luna, [sword()]);

    expect(p.variants.some((v) => !isStats(v) && started(p.reach.get(v.key)!))).toBe(false);
    expect({ live: p.statLive, stat: hasStatBuild(ctx, luna, [sword()]), on: inPlay([sword()], {}, luna) }).toEqual({ live: true, stat: true, on: ['#stats'] });
  });

  it('временное оружие стоит в сборке билда и «По статам» (ранг «временная» — выше прочего)', () => {
    const w = sword();
    const p = play(ctx, luna, [w], { marks: { [buildKey(luna.id, 'Penetration')]: 'want' } });
    const pen = p.variants.find((v) => v.name === 'Penetration')!;

    expect(p.asm.get(pen.key)!.slots.weapon?.id).toBe(w.id);
    expect(p.asm.get(pen.key)!.roles.weapon).toBe('stopgap');
    expect(p.asm.get(p.stat!.key)!.slots.weapon?.id).toBe(w.id);
  });

  it('рекомендованное оружие из списка начинает все билды, где оно есть; «По статам» не живой', () => {
    const p = play(ctx, luna, [listed()]);

    expect(luna.builds.map((b) => fit(ctx, luna, b, listed()))).toEqual(luna.builds.map(() => 'rec'));
    expect({ live: p.statLive, on: inPlay([listed()], {}, luna) }).toEqual({ live: false, on: real(luna) });
  });

  it('временное рядом с рекомендованным в другом слоте: начинает рекомендованное — временное не отменяет', () => {
    const acc = W('1013', { CHC: 2, CHD: 2, 'ATK%': 1, SPD: 1 }, 'PEN%');
    const pieces = [sword(), { ...acc, slot: 'accessory' as const }];

    expect(inPlay(pieces, {}, luna)).toEqual(real(luna));
  });

  it('«Кому надеть?»: Luna без вещей, новое Steel Sword ATK% — строки нет (ничего не начнёт, вставать некуда)', () => {
    expect(charVs(ctx, poolView(ctx, EMPTY_GEAR), luna.id, input(sword()))).toBeNull();
  });

  it('«Кому надеть?»: Luna без вещей, рекомендованное оружие — «начнёт» все варианты', () => {
    const cv = charVs(ctx, poolView(ctx, EMPTY_GEAR), luna.id, input(listed()))!;

    expect({ starts: cv.starts.map((v) => v.name), useful: cv.useful }).toEqual({ starts: real(luna), useful: true });
  });

  it('«Кому надеть?»: Pen-шлем начал Penetration и Pen mix — временное оружие встаёт в пустой слот, «начнёт» нет', () => {
    const st: GearStore = { ...EMPTY_GEAR, pieces: {}, pools: { [luna.id]: [] } };
    const h = helm();
    st.pieces[h.id] = h; st.pools[luna.id].push(h.id);
    const view = poolView(ctx, st);
    const was = view.of(luna.id)!.inPlay.map((v) => v.name);
    const cv = charVs(ctx, view, luna.id, input(sword()))!;

    expect(was.length).toBeGreaterThan(0);
    expect(was.length).toBeLessThan(real(luna).length);
    expect(cv.starts).toEqual([]);
    expect(cv.rows.every((r) => !r.entering)).toBe(true);
    expect({ kind: cv.best?.kind, useful: cv.useful }).toEqual({ kind: 'fill', useful: true });
  });

  it('«Надеть» временного оружия: тост «Начал собирать» пуст, «По статам» живой', () => {
    const r = putOn(ctx, EMPTY_GEAR, luna.id, input(sword()));

    expect(r.began).toEqual([]);
    expect(poolView(ctx, r.st).of(luna.id)!.statLive).toBe(true);
  });

  it('«Надеть» рекомендованного оружия: «Начал собирать» — все билды из его списков', () => {
    const r = putOn(ctx, EMPTY_GEAR, luna.id, input(listed()));

    expect(r.began.sort()).toEqual(variantsOf(idx, luna).map((v) => v.key).sort());
  });

  it('«Эндгейм»: Steel Sword у Luna — «нет» (не временное), только «По статам», как до П3', () => {
    expect(luna.builds.map((b) => fit(end, luna, b, sword()))).toEqual(luna.builds.map(() => 'no'));
    expect(play(end, luna, [sword()]).inPlay.map((v) => v.key)).toEqual([`${luna.id}/#stats`]);
  });

  it('«Эндгейм» не меняется: у всех героев оружие и аксессуары из списков и Epic 6★ начинают ровно билды, где fit не «нет»', () => {
    const epics = [...D.weapons, ...D.amulets].filter((i) => i.grade === 'rare' && i.star === 6);
    const off: string[] = [];
    let n = 0;
    for (const c of D.chars.filter((x) => x.builds.length)) {
      const refs = c.builds.flatMap((b) => [
        ...b.weapons.map((r) => ({ slot: 'weapon' as const, key: r.key, mains: r.mains })),
        ...b.amulets.map((r) => ({ slot: 'accessory' as const, key: r.key, mains: r.mains })),
      ]);
      const items = [
        ...refs.map((r) => ({ ...W(r.key, { CHC: 1 }, r.mains[0] ?? 'ATK%'), slot: r.slot })),
        ...epics.slice(0, 4).map((e) => ({ ...W(e.key, { CHC: 1 }, e.mains?.[0] ?? 'ATK%', 'rare'), slot: e.kind === 'weapon' ? 'weapon' as const : 'accessory' as const })),
      ];
      for (const w of items) {
        n++;
        const got = play(end, c, [w]).inPlay.filter((v) => !isStats(v)).map((v) => v.key);
        const want = variantsOf(idx, c).filter((v) => fit(end, c, v.b, w) !== 'no').map((v) => v.key);
        if (got.join() !== want.join()) off.push(`${c.name} ${w.slot} ${w.itemKey}`);
      }
    }
    expect(n).toBeGreaterThan(500);
    expect(off).toEqual([]);
  });
});

// Р1: «собрана часть» и «ближе всех» — по тому, что можно собрать из пула; раскладка остаётся честной
describe('«собираешь» по тому, что можно собрать из пула (Р1)', () => {
  const HELM: Subs = { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }, GLOVES: Subs = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
  // 4 Speed: шлем и броня на T4, перчатки и ботинки — Breakthrough не указан
  const SPEED: [SlotId, Subs, Bt | null][] = [
    ['helmet', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, 4], ['armor', { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }, 4],
    ['gloves', { CHC: 2, CHD: 2, SPD: 1, ATK: 1 }, null], ['shoes', { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }, null],
  ];
  const speed = () => SPEED.map(([slot, lit, bt]) => P(slot, 'Speed', lit, bt));
  const X = (slot: SlotId, short: string, subs: Subs): ItemInput => ({ slot, grade: 'unique', setId: set(short), itemKey: null, main: null, subs });
  const view = (st: PoolStore) => poolView(ctx, st).of(caren.id)!;
  const store = (pieces: Piece[]): PoolStore => ({ pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } });
  const names = (vs: Variant[]) => vs.map((v) => (isStats(v) ? '#stats' : v.name));

  it('4 Speed + 2 Immunity без отметок: раскладка Speed отдаёт перчатки Immunity-вещи, но Speed собирается — ничего не лишнее', () => {
    const cp = view(store([...speed(), P('helmet', 'Immunity', HELM), P('gloves', 'Immunity', GLOVES)]));
    expect(names(cp.inPlay)).toEqual(expect.arrayContaining(['Speed', 'Speed/Immu']));
    expect(cp.unused).toEqual([]);
  });

  it('раскладка честная: карточка Speed — 3 из 4 с Immunity-перчатками, достижимая — Speed ×4', () => {
    const cp = view(store([...speed(), P('helmet', 'Immunity', HELM), P('gloves', 'Immunity', GLOVES)]));
    const v = variant('Caren', 'Speed');
    expect(sets(cp.asm.get(v.key)!)).toEqual(['Speed', 'Speed', 'Immunity', 'Speed']);
    expect(sets(cp.reach.get(v.key)!)).toEqual(['Speed', 'Speed', 'Speed', 'Speed']);
    expect(cp.reach.get(v.key)!.missing).toEqual([]);
  });

  it('раскладка уже собирает всё, что можно, — достижимая та же', () => {
    const cp = view(store(speed()));
    const v = variant('Caren', 'Speed');
    expect(cp.reach.get(v.key)).toBe(cp.asm.get(v.key));
  });

  // «Надеть» по одной, Breakthrough — потом, в листе вещи (как в приложении). Первая Immunity-вещь в ботинки: Speed-вещи
  // встают в уже собираемые варианты и отметку «Собираю» не получают — держит только то, что можно собрать
  it.each([
    ['T4 T4 T? T?', [4, 4, null, null]],
    ['без Breakthrough', [null, null, null, null]],
    ['все на T4', [4, 4, 4, 4]],
  ] as [string, (Bt | null)[]][])('порядок «Immunity-ботинки → 4 Speed → Immunity-шлем → Immunity-перчатки» (%s): Speed и Speed/Immu собираются, ничего не лишнее', (_, bts) => {
    let st: GearStore = { ...EMPTY_GEAR };
    const put = (x: ItemInput) => { const r = putOn(ctx, st, caren.id, x); st = r.st; return r.id; };
    put(X('shoes', 'Immunity', { 'DEF%': 2, SPD: 2, CHC: 1, CHD: 1 }));
    const ids = SPEED.map(([slot, subs]) => put(X(slot, 'Speed', subs)));
    ids.forEach((id, i) => { if (bts[i] !== null) st = updatePiece(st, id, { bt: bts[i]! }); });
    put(X('helmet', 'Immunity', HELM));
    put(X('gloves', 'Immunity', GLOVES));
    const cp = view(st);
    expect(names(cp.inPlay)).toEqual(expect.arrayContaining(['Speed', 'Speed/Immu']));
    expect(cp.unused).toEqual([]);
    expect(cp.pieces.map((p) => p.id)).toEqual(expect.arrayContaining(ids)); // «Надеть» не убрал ни одной Speed-вещи
  });

  // Находка 3, остаток (Р14): вторая Immunity-вещь, когда Speed-вещей три. Было: Speed/Immu собран, Speed (3 из 4)
  // не «ближе всех» и выпадал — «Надеть» Immunity-перчаток убирал Speed-перчатки. Breakthrough — сразу после «Надеть»
  const ITEMS: [ItemInput, Bt | null][] = [
    ...SPEED.map(([slot, subs, bt]): [ItemInput, Bt | null] => [X(slot, 'Speed', subs), bt]),
    [X('shoes', 'Immunity', { 'DEF%': 2, SPD: 2, CHC: 1, CHD: 1 }), null], [X('helmet', 'Immunity', HELM), null], [X('gloves', 'Immunity', GLOVES), null],
  ];
  const putAll = (order: number[]) => {
    let st: GearStore = { ...EMPTY_GEAR };
    const removed: Piece[] = [];
    for (const i of order) {
      const r = putOn(ctx, st, caren.id, ITEMS[i][0]);
      st = ITEMS[i][1] === null ? r.st : updatePiece(r.st, r.id, { bt: ITEMS[i][1]! });
      removed.push(...r.removed);
    }
    return { st, removed };
  };

  it('Р14, порядок из находки 3 (Immunity-ботинки, 3 Speed, Immunity-перчатки, Speed-ботинки, Immunity-шлем): ничего не убрано', () => {
    const { st, removed } = putAll([4, 0, 1, 2, 6, 3, 5]);
    expect(removed).toEqual([]);
    expect(view(st).pieces).toHaveLength(7);
  });

  it('Р14: все порядки «Надеть» 4 Speed и 3 Immunity (каждый 7-й из 5040) — ни одна вещь не убрана', () => {
    const perms = (a: number[]): number[][] => (a.length <= 1 ? [a] : a.flatMap((v, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [v, ...p])));
    const lost = perms([0, 1, 2, 3, 4, 5, 6]).filter((_, i) => i % 7 === 0).filter((o) => putAll(o).removed.length).map((o) => o.join(''));
    expect(lost).toEqual([]);
  });
});

// Р2 (находка 4): Pen ×2 без T4 бонуса не даёт, поэтому четыре Pen без отметки Breakthrough — раскладка Pen ×4 (сет-эффект
// ради статов не ломается). Вещи части, которая собралась бы при двух Pen на T4, пул держит: достижимая сборка (Р1)
// считает вещи на связку, не глядя на T4. Новая вещь этой части «ломает» — совет отметить T4 у двух Pen
describe('Pen mix без T4 (Р2)', () => {
  const luna = char('Demiurge Luna');
  const pma = variantsOf(idx, luna).find((x) => x.parent.name === 'Pen mix' && x.b.sets[0].some((p) => p.set === set('Attack')))!;
  const STRONG: Subs = { 'ATK%': 6, CHC: 6, CHD: 6, SPD: 6 };
  const ARM: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
  const store = (c: { id: string }, pieces: Piece[]): PoolStore => ({ pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [c.id]: pieces.map((p) => p.id) } });
  const lunaPool = (bt: Bt | null = null) => {
    const pen = ARM.map((s) => P(s, 'Penetration', JUNK, bt));
    const atk = [P('gloves', 'Attack', STRONG), P('shoes', 'Attack', STRONG)];
    return { pen, atk, pieces: [...pen, ...atk] };
  };
  const HELMET: ItemInput = { slot: 'helmet', grade: 'unique', setId: set('Attack'), itemKey: null, main: null, subs: { 'ATK%': 4, CHC: 4, CHD: 3, SPD: 3 } };

  it('раскладка по решению: Pen ×4 на T0 держится; при двух Pen на T4 — Pen, Pen, Attack, Attack', () => {
    const { pen, atk, pieces } = lunaPool();
    expect(sets(asm(pma, pieces, luna))).toEqual(['Penetration', 'Penetration', 'Penetration', 'Penetration']);
    const t4 = pen.map((p, i) => (i < 2 ? { ...p, bt: 4 as Bt } : p));
    expect(sets(asm(pma, [...t4, ...atk], luna))).toEqual(['Penetration', 'Penetration', 'Attack', 'Attack']);
  });

  it.each([
    ['Demiurge Luna', 'Pen mix · Attack', 'Attack'], ['Heatwave Cop Delta', 'DPS · Penetration ×2 + Attack ×2', 'Attack'], ['Core Fusion Lisha', 'Pen combos · Speed', 'Speed'],
  ])('%s · %s: 4 Pen без отметки Breakthrough + 2 %s — вещи второй половины не ненужные, достижимая собирает связку', (who, vname, other) => {
    const c = char(who), v = variant(who, vname);
    const pieces = [...ARM.map((s) => P(s, 'Penetration', JUNK)), P('gloves', other, STRONG), P('shoes', other, STRONG)];
    const cp = poolView(ctx, store(c, pieces)).of(c.id)!;
    expect(cp.unused).toEqual([]);
    expect(cp.reach.get(v.key)!.missing).toEqual([]);
  });

  it('новая Attack-вещь «ломает» Pen ×4 — совет: отметить T4 у двух Pen не в её слоте; надеть нельзя', () => {
    const { pieces } = lunaPool();
    const o = outcomeFor(ctx, poolView(ctx, store(luna, pieces)), luna.id, HELMET)!;
    const r = o.rows.find((x) => x.v.key === pma.key)!;
    expect(r).toMatchObject({ kind: 'breaks', used: false, broken: set('Penetration'), fix: { set: set('Penetration'), t4: true, mark: true } });
    expect(r.fix!.slots).toHaveLength(2);
    expect(r.fix!.slots).not.toContain('helmet');
    expect(o.useful).toBe(false);
  });

  it('совет верный: те две Pen на T4 — и Attack-шлем встаёт', () => {
    const { pieces } = lunaPool();
    const r = outcomeFor(ctx, poolView(ctx, store(luna, pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    const marked = pieces.map((p) => (p.setId === set('Penetration') && r.fix!.slots.includes(p.slot as ArmorSlot) ? { ...p, bt: 4 as Bt } : p));
    const a = assemble(ctx, luna, pma, entriesFor(ctx, luna, pma, marked, HELMET));
    expect(a.slots.helmet?.id).toBeNull();
    expect(sets(a)).toEqual(ARM.map((s) => (r.fix!.slots.includes(s as ArmorSlot) ? 'Penetration' : 'Attack')));
    expect([a.live, a.soft]).toEqual([1, 1]);
  });

  it('четыре Pen на T0 известно (bt 0) — тоже совет про T4: без него Attack-шлем не встанет', () => {
    const { pieces } = lunaPool(0);
    const r = outcomeFor(ctx, poolView(ctx, store(luna, pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r.fix).toMatchObject({ mark: true });
  });

  it('П5: Breakthrough у Pen известен (0–3) — совет «сделать» (make); не указан — «отметить»', () => {
    const make = (bt: Bt | null) => outcomeFor(ctx, poolView(ctx, store(luna, lunaPool(bt).pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!.fix;
    expect(([0, 1, 2, 3] as Bt[]).map((bt) => make(bt))).toMatchObject([0, 1, 2, 3].map(() => ({ mark: true, make: true })));
    expect(make(null)).toMatchObject({ mark: true, make: false });
  });

  it('П5: одна Pen на T4 (броня), остальные на T0 — «сделать» у одной', () => {
    const { pen, atk } = lunaPool(0);
    const pcs = pen.map((p) => (p.slot === 'armor' ? { ...p, bt: 4 as Bt } : p));
    const r = outcomeFor(ctx, poolView(ctx, store(luna, [...pcs, ...atk])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r.fix).toMatchObject({ mark: true, make: true });
    expect(r.fix!.slots).toHaveLength(1);
  });

  // П6: «у двух» называет слоты; П2: выполненный совет — «Надеть»
  it('П6: «у двух» — слоты по порядку и вещи этих слотов; отмечены они — у Attack-шлема «Надеть» (П2)', () => {
    const { pen, pieces } = lunaPool();
    const r = outcomeFor(ctx, poolView(ctx, store(luna, pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r.fix).toMatchObject({ slots: ['armor', 'gloves'], which: [null, null] });
    expect(r.fix!.pieces).toEqual([pen[1], pen[2]]);
    const marked = pieces.map((p) => (r.fix!.pieces.includes(p) ? { ...p, bt: 4 as Bt } : p));
    expect(puts(outcomeFor(ctx, poolView(ctx, store(luna, marked)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!)).toBe(true);
  });

  // П6: сабстаты — когда в слоте есть другая вещь, которой совет касается, а с ней «Надеть» нет (вход опровергателя шага 2)
  it('П6: в броне три Pen (T3, T0, T2), «Надеть» — только с T3: она названа (which), Pen-шлем — нет', () => {
    const helm = P('helmet', 'Penetration', { 'ATK%': 3, DEF: 3, ATK: 2, 'DEF%': 2 }, 1);
    const a3 = P('armor', 'Penetration', { 'ATK%': 3, ATK: 3, SPD: 3, 'HP%': 3 }, 3);
    const a0 = P('armor', 'Penetration', { RES: 1, ATK: 2, 'ATK%': 1, SPD: 1 }, 0);
    const a2 = P('armor', 'Penetration', { CHC: 1, ATK: 3, DEF: 3, 'HP%': 2 }, 2);
    const pcs = [
      P('gloves', 'Penetration', { 'DEF%': 3, ATK: 3, CHC: 2, DEF: 3 }, 4), a3, helm, P('shoes', 'Penetration', { 'ATK%': 3, SPD: 2, 'HP%': 3, ATK: 2 }, 1), a0, a2,
      P('shoes', 'Speed', { 'HP%': 3, ATK: 3, EFF: 3, RES: 3 }, 2), P('armor', 'Speed', { 'DMG UP%': 3, 'ATK%': 3, CHC: 4, 'DEF%': 2 }, 4), P('gloves', 'Speed', { CHC: 3, 'DEF%': 3, RES: 3, CHD: 2 }, 4),
    ];
    const x: ItemInput = { slot: 'gloves', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, subs: { 'DEF%': 3, ATK: 3, CHC: 2, DEF: 3, SPD: 2, CHD: 1 } };
    const o = outcomeFor(ctx, poolView(ctx, store(luna, pcs)), luna.id, x)!;
    const r = o.rows.find((z) => z.fix?.mark)!;
    expect(r.fix).toMatchObject({ slots: ['helmet', 'armor'], make: true, pieces: [helm, a3], which: [null, a3] });
    const putsWith = (a: Piece) => puts(outcomeFor(ctx, poolView(ctx, store(luna, pcs.map((p) => (p === helm || p === a ? { ...p, bt: 4 as Bt } : p)))), luna.id, x)!.rows.find((z) => z.v.key === r.v.key)!);
    expect([a3, a0, a2].map(putsWith)).toEqual([true, false, false]);
  });

  it('П6: в слоте две Pen без Breakthrough, а «Надеть» с любой — сабстатов нет (у двух и у одной)', () => {
    const { pen, pieces, atk } = lunaPool();
    const two = outcomeFor(ctx, poolView(ctx, store(luna, [...pieces, P('gloves', 'Penetration', { RES: 2 })])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(two.fix).toMatchObject({ slots: ['armor', 'gloves'], which: [null, null] });
    const pcs = [...pen.map((p) => (p.slot === 'armor' ? { ...p, bt: 4 as Bt } : p)), P('gloves', 'Penetration', { RES: 2 }), P('shoes', 'Penetration', { EFF: 2 }), ...atk];
    const one = outcomeFor(ctx, poolView(ctx, store(luna, pcs)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(one.fix).toMatchObject({ mark: true, make: false, which: [null] });
  });

  it('одна Pen уже на T4 (броня) — отметить хватает одной вещи: совет называет только её, не ту, что на T4', () => {
    const { pen, atk } = lunaPool();
    const pcs = pen.map((p) => (p.slot === 'armor' ? { ...p, bt: 4 as Bt } : p));
    const r = outcomeFor(ctx, poolView(ctx, store(luna, [...pcs, ...atk])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r).toMatchObject({ kind: 'breaks', fix: { mark: true } });
    expect(r.fix!.slots).toHaveLength(1);
    expect(r.fix!.slots).not.toContain('armor');
  });

  it('две Pen уже на T4 (шлем и броня) — совета «отметь» нет: Attack-шлем вытеснил бы Pen на T4', () => {
    const { pen, atk } = lunaPool();
    const t4 = pen.map((p, i) => (i < 2 ? { ...p, bt: 4 as Bt } : p));
    const r = outcomeFor(ctx, poolView(ctx, store(luna, [...t4, ...atk])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r.fix?.mark ?? false).toBe(false);
  });

  // вопрос 5 (б), владелец 2026-10-01: в совете «у двух» — пара одного вида; было «сделать … у Penetration-брони и
  // -перчаток» (броня без Breakthrough, перчатки T0)
  const mixPool = (bts: (Bt | null)[]) => [...ARM.map((s, i) => P(s, 'Penetration', JUNK, bts[i])), P('gloves', 'Attack', STRONG), P('shoes', 'Attack', STRONG)];
  const fixOf = (pieces: Piece[]) => outcomeFor(ctx, poolView(ctx, store(luna, pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!.fix;

  it('вопрос 5 (б): Pen-броня без Breakthrough, прочие Pen на T0 — «сделать» у двух на T0 (перчатки и ботинки), броня не названа', () => {
    const pcs = mixPool([0, null, 0, 0]);
    const f = fixOf(pcs);
    expect(f).toMatchObject({ slots: ['gloves', 'shoes'], mark: true, make: true });
    expect(f!.pieces.map((p) => p.bt)).toEqual([0, 0]);
  });

  it('вопрос 5 (б): две Pen без Breakthrough и одна на T0 (не в её слоте) — «отметить» у двух без Breakthrough', () => {
    const pcs = mixPool([0, null, 0, null]);
    const f = fixOf(pcs);
    expect(f).toMatchObject({ slots: ['armor', 'shoes'], mark: true, make: false });
    expect(f!.pieces.map((p) => p.bt)).toEqual([null, null]);
  });

  // П7 (находка «Ломает» при вещи пула не хуже, refute-a3): в пуле уже есть Attack-шлем сильнее новой — новая не встанет
  // ни при каких отметках (встанет он): исход по нему, «хуже», а не «ломает» с ложным советом
  describe('П7: в пуле уже есть вещь её сета в её слоте не хуже', () => {
    const rosterCtx = makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set([luna.id]));
    const withHelmet = (subs: Subs, bt: Bt | null = null) => {
      const { pieces } = lunaPool();
      const helmet = P('helmet', 'Attack', subs, bt);
      return { helmet, pieces: [...pieces, helmet] };
    };
    const rowOf = (pieces: Piece[], c = ctx) => outcomeFor(c, poolView(c, store(luna, pieces)), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;

    it('Attack-шлем пула сильнее новой — «хуже» против него, не держит, совета нет', () => {
      const { helmet, pieces } = withHelmet(STRONG);
      const r = rowOf(pieces);
      expect(r).toMatchObject({ kind: 'down', used: false, fix: null, worn: { id: helmet.id } });
      expect(holds(r)).toBe(false);
    });

    it('тот же пул: штамп понижен (ростер — Luna), а не «Оставить» из-за «ломает»', () => {
      const { pieces } = withHelmet(STRONG);
      const w = withWorn(rosterCtx, poolView(rosterCtx, store(luna, pieces)), HELMET, evaluate(rosterCtx, HELMET));
      expect(w.worn).toBe('lower');
    });

    it('Attack-шлем пула на T4 и сильнее — тоже не «ломает»: T4 у него бонус сета только добавляет', () => {
      const { pieces } = withHelmet(STRONG, 4);
      expect(rowOf(pieces)).toMatchObject({ kind: 'down', fix: null });
    });

    it('сторож: Attack-шлем пула слабее новой — исход прежний: «ломает», совет «отметить у двух»', () => {
      const { pieces } = withHelmet({ 'ATK%': 2, RES: 2 });
      const was = rowOf(lunaPool().pieces);
      const r = rowOf(pieces);
      expect(r).toMatchObject({ kind: 'breaks', fix: { mark: true, slots: ['armor', 'gloves'] } });
      expect(r.fix!.slots).toEqual(was.fix!.slots);
    });

    it('сторож: сильный шлем пула другого сета — «ломает» остаётся (сравниваются вещи её сета)', () => {
      const { pieces } = lunaPool();
      expect(rowOf([...pieces, P('helmet', 'Critical Strike', STRONG)]).kind).toBe('breaks');
    });
  });
});

// Р20: совет «отметь T4» — для любого сета. Вещь распавшегося сета в пуле не на T4, с T4 у которой (одной, потом двух)
// у новой «Надеть», — без указанного Breakthrough (bt: null) «отметь», с известным ниже T4 (0–3) «сделать» (Р20 (б))
describe('совет «отметь T4» для любого сета (Р20)', () => {
  const v = variant('Caren', 'Speed/Immu');
  const store = (pieces: Piece[]): PoolStore => ({ pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } });
  const X = (slot: SlotId, short: string, subs: Subs): ItemInput => ({ slot, grade: 'unique', setId: set(short), itemKey: null, main: null, subs });
  const rowOf = (pieces: Piece[], x: ItemInput, vv = v) => outcomeFor(ctx, poolView(ctx, store(pieces)), caren.id, x)!.rows.find((r) => r.v.key === vv.key)!;
  // совет проверяется встраиванием: отмеченные — на T4, и новая встаёт
  const fitsMarked = (pieces: Piece[], x: ItemInput, slots: ArmorSlot[], vv = v) => {
    const marked = pieces.map((p) => (p.setId === set('Speed') && p.bt === null && slots.includes(p.slot as ArmorSlot) ? { ...p, bt: 4 as Bt } : p));
    return assemble(ctx, caren, vv, entriesFor(ctx, caren, vv, marked, x)).slots[x.slot]?.id === null;
  };

  // шаг 14 в браузере: Speed ×2 на T4 (шлем и броня) + Immunity-перчатки и -ботинки, Speed-перчатки и -ботинки в пуле
  // (Breakthrough по вызову); новая — Immunity-броня
  const step14 = (gb: Bt | null, sb: Bt | null) => [
    P('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, 4), P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }, 4),
    P('gloves', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, gb), P('shoes', 'Speed', { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }, sb),
    P('gloves', 'Immunity', { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }), P('shoes', 'Immunity', { 'DEF%': 2, SPD: 2, CHC: 1, CHD: 1 }),
  ];
  const ARMOR_X = X('armor', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });

  // П2: совет «отметь» / «найди ещё … на T4» — только если после него у новой «Надеть». Было (шаг 14в, OGC KKEV MTUQ):
  // «отметь T4 у Speed-перчаток» — с отметкой она встаёт, но «на уровне» (+4% к вытесненному), кнопки нет
  it('шаг 14 (OGC KKEV MTUQ): «ломает», совета «отметь» нет — с отметкой перчаток или ботинок она встаёт, но без «Надеть» (П2)', () => {
    const pcs = step14(null, null);
    const r = rowOf(pcs, ARMOR_X);
    expect(r).toMatchObject({ kind: 'breaks', broken: set('Speed'), fix: null });
    const marked = (slot: ArmorSlot) => pcs.map((p) => (p.setId === set('Speed') && p.slot === slot ? { ...p, bt: 4 as Bt } : p));
    expect((['gloves', 'shoes'] as ArmorSlot[]).map((sl) => fitsMarked(pcs, ARMOR_X, [sl]) && puts(rowOf(marked(sl), ARMOR_X)))).toEqual([false, false]);
    expect(fitsMarked(pcs, ARMOR_X, ['gloves'])).toBe(true);
  });

  it('то же, Speed-перчатки и -ботинки на T0 (bt 0) — ни «сделать T4», ни «найди ещё Speed-вещь на T4»: перчатки на T4 — «на уровне» (П2)', () => {
    const r = rowOf(step14(0, 0), ARMOR_X);
    expect(r).toMatchObject({ kind: 'breaks', broken: set('Speed'), fix: null });
    expect(rowOf(step14(4, 0), ARMOR_X)).toMatchObject({ kind: 'eq', used: true });
  });

  it('то же, перчатки на T0, ботинки без Breakthrough, с отметкой ботинок она не встаёт — совета нет (П2)', () => {
    const pcs = step14(0, null);
    const r = rowOf(pcs, ARMOR_X);
    expect(fitsMarked(pcs, ARMOR_X, ['shoes'])).toBe(false);
    expect(r.fix).toBeNull();
  });

  // регресс шага 4: Speed-перчатки и -ботинки уже на T4, лишние Speed-шлем (bt null) и Speed-броня (bt 0); новая —
  // Immunity-перчатки. Отметить хватает одной вещи — шлема: при равной длине совета вещь без Breakthrough — первой
  const reg = (armorBt: Bt | null) => [
    P('helmet', 'Immunity', JUNK), P('armor', 'Immunity', JUNK), P('gloves', 'Speed', { 'DEF%': 2, CHC: 2 }, 4), P('shoes', 'Speed', JUNK, 4),
    P('helmet', 'Speed', JUNK), P('armor', 'Speed', JUNK, armorBt),
  ];
  const GLOVES_X = X('gloves', 'Immunity', { 'DEF%': 2, CHC: 2, CHD: 1 });

  it('регресс шага 4 (ботинки уже на T4, лишний Speed-шлем без Breakthrough) — «отметь T4 у Speed-шлема», не «у двух»', () => {
    const pcs = reg(0);
    const r = rowOf(pcs, GLOVES_X);
    expect(r).toMatchObject({ kind: 'breaks', broken: set('Speed'), fix: { set: set('Speed'), slots: ['helmet'], t4: true, mark: true } });
    expect(fitsMarked(pcs, GLOVES_X, ['helmet'])).toBe(true);
  });

  it('то же, шлем и броня без Breakthrough — всё равно одна вещь', () => {
    const r = rowOf(reg(null), GLOVES_X);
    expect(r.fix).toMatchObject({ mark: true });
    expect(r.fix!.slots).toHaveLength(1);
  });

  // Р20 (б), владелец 2026-10-01: было «найди ещё Speed-вещь на T4: шлем или броня» — у своей вещи на T0 совет прокачки
  it('то же, лишние шлем и броня на T0 — «сделать Breakthrough T4 у Speed-шлема» (Р20 (б)), а не «найди ещё»', () => {
    const pcs = reg(0).map((p) => (p.setId === set('Speed') && p.bt === null ? { ...p, bt: 0 as Bt } : p));
    const r = rowOf(pcs, GLOVES_X);
    expect(r).toMatchObject({ kind: 'breaks', fix: { set: set('Speed'), slots: ['helmet'], t4: true, mark: true, make: true } });
  });

  // Р20 (б), владелец 2026-10-01: что в пуле — то и в игре. Известный Breakthrough ниже T4 — совет прокачки «сделать»,
  // не указан — «отметить», на T4 — совета T4 нет; совет — только если после него у новой «Надеть» (П2)
  const speedAt = (bt: Bt | null) => reg(0).map((p) => (p.setId === set('Speed') && p.bt === null ? { ...p, bt } : p));

  it('Р20 (б): лишний Speed-шлем на T0 — «сделать Breakthrough T4 у Speed-шлема», и с T4 у новой «Надеть» (П2)', () => {
    const pcs = speedAt(0);
    const r = rowOf(pcs, GLOVES_X);
    expect(r.fix).toMatchObject({ slots: ['helmet'], mark: true, make: true });
    const done = pcs.map((p) => (r.fix!.pieces.includes(p) ? { ...p, bt: 4 as Bt } : p));
    expect(puts(rowOf(done, GLOVES_X))).toBe(true);
  });

  it('Р20: тот же шлем без Breakthrough — «отметить», как было', () => {
    expect(rowOf(speedAt(null), GLOVES_X).fix).toMatchObject({ slots: ['helmet'], mark: true, make: false });
  });

  it('Р20: тот же шлем на T4 — совета про T4 нет', () => {
    expect(rowOf(speedAt(4), GLOVES_X).fix?.mark ?? false).toBe(false);
  });

  // шаг 10 (владелец 2026-10-01): «найди ещё {set}-вещь» без T4 — то же правило П2: слот в совете, только если с пустой
  // найденной вещью сета (без сабстатов, Breakthrough не указан) в нём у новой «Надеть». Пул: Immunity-шлем и -броня,
  // Speed-перчатки и -ботинки; новая — Speed-шлем, Immunity ×2 распадается
  const immuPool = (speed: Subs) => [
    P('helmet', 'Immunity', { 'DEF%': 2, CHC: 2, CHD: 1 }), P('armor', 'Immunity', { 'DEF%': 2, CHC: 2 }),
    P('gloves', 'Speed', speed), P('shoes', 'Speed', speed),
  ];
  const HELMET_X = X('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });

  it('«найди ещё Immunity-вещь: перчатки или ботинки» (без T4) пропал: с пустой найденной она не встаёт («на уровне»), «Надеть» нет', () => {
    const pcs = immuPool({ 'DEF%': 2, CHC: 2 });
    const r = rowOf(pcs, HELMET_X);
    expect(r).toMatchObject({ kind: 'breaks', broken: set('Immunity'), fix: null });
    const after = (slot: ArmorSlot) => rowOf([...pcs, P(slot, 'Immunity', {})], HELMET_X);
    expect((['gloves', 'shoes'] as ArmorSlot[]).map((sl) => [after(sl).kind, after(sl).used, puts(after(sl))])).toEqual([['eq', false, false], ['eq', false, false]]);
  });

  it('сторож: Speed-перчатки и -ботинки слабые — совет «найди ещё Immunity-вещь» (без T4) прежний, с пустой найденной — «Надеть»', () => {
    const pcs = immuPool(JUNK);
    const r = rowOf(pcs, HELMET_X);
    expect(r).toMatchObject({ kind: 'breaks', fix: { set: set('Immunity'), slots: ['gloves', 'shoes'], t4: false, mark: false } });
    for (const sl of r.fix!.slots) expect(puts(rowOf([...pcs, P(sl, 'Immunity', {})], HELMET_X))).toBe(true);
  });

  it('перебор (3000 пулов вокруг шага 14): каждый «отметь» / «сделать» / «найди ещё на T4» выполнен — у новой «Надеть» (П2); совет T4 — кратчайший, вещи не на T4 не в её слоте', () => {
    const r7 = lcg(7);
    const rnd = (n: number) => Math.floor(r7() * n);
    const BTS: (Bt | null)[] = [null, null, 0, 4];
    const sub = (): Subs => ({ 'DEF%': 1 + rnd(3), CHC: 1 + rnd(2), CHD: rnd(3), SPD: rnd(2) });
    const SLOTS: ArmorSlot[] = ['gloves', 'shoes', 'helmet', 'armor'];
    let marks = 0, makes = 0, finds = 0, dropped = 0;
    for (let i = 0; i < 3000; i++) {
      const pcs = [
        P('helmet', 'Speed', sub(), 4), P('armor', 'Speed', sub(), 4),
        ...Array.from({ length: 2 + rnd(3) }, () => P(SLOTS[rnd(rnd(2) ? 2 : 4)], 'Speed', sub(), BTS[rnd(4)])),
        P('gloves', 'Immunity', sub()), P('shoes', 'Immunity', sub()),
      ];
      const base = sub(), x = X(SLOTS[rnd(4)], 'Immunity', { ...base, [(['DEF%', 'CHC', 'CHD'] as const)[rnd(3)]]: 4 });
      const r = rowOf(pcs, x);
      if (r?.kind !== 'breaks') continue;
      const withT4 = (ms: Piece[]) => pcs.map((p) => (ms.includes(p) ? { ...p, bt: 4 as Bt } : p));
      const open = pcs.filter((p) => p.setId === set('Speed') && p.bt !== 4 && p.slot !== x.slot);
      const stands = (ms: Piece[]) => assemble(ctx, caren, v, entriesFor(ctx, caren, v, withT4(ms), x)).slots[x.slot]?.id === null;
      const putsWith = (ms: Piece[]) => puts(rowOf(withT4(ms), x));
      if (!r.fix?.mark) {
        // «отметь» / «сделать» нет — ни одна вещь не на T4 (и пара) не даёт «Надеть»; встаёт, но без «Надеть» — совет пропал по П2
        expect(open.some((a) => putsWith([a]))).toBe(false);
        if (open.some((a) => stands([a]))) dropped++;
        if (r.fix?.t4) {
          finds++;
          // выполнить «найди ещё Speed-вещь на T4»: даже пустая найденная на T4 в названный слот — «Надеть»
          for (const sl of r.fix.slots) expect(puts(rowOf([...pcs, P(sl, 'Speed', {}, 4)], x))).toBe(true);
        }
        continue;
      }
      if (r.fix.make) makes++; else marks++;
      expect(r.fix.slots).not.toContain(x.slot);
      expect(r.fix.pieces.every((p, j) => open.includes(p) && p.slot === r.fix!.slots[j])).toBe(true);
      // «сделать» — у отмечаемых известен Breakthrough (Р20 (б)); у одной вещи «сделать» — только если без Breakthrough
      // ни одной не хватает
      expect(r.fix.make).toBe(r.fix.pieces.some((p) => p.bt !== null));
      if (r.fix.slots.length === 1 && r.fix.make) expect(open.some((a) => a.bt === null && putsWith([a]))).toBe(false);
      // вопрос 5 (б): смешанная пара — только если пары одного вида нет
      const same = (a: Piece, b: Piece) => a.slot !== b.slot && (a.bt === null) === (b.bt === null);
      if (r.fix.pieces.length === 2 && !same(r.fix.pieces[0], r.fix.pieces[1])) {
        expect(open.some((a, i) => open.slice(i + 1).some((b) => same(a, b) && putsWith([a, b])))).toBe(false);
      }
      // выполнить: отметить названные — у новой «Надеть»
      expect(putsWith(r.fix.pieces)).toBe(true);
      // «у двух» — только если одной не хватает
      if (r.fix.slots.length === 2) expect(open.some((a) => putsWith([a]))).toBe(false);
    }
    // вокруг шага 14 советов почти не остаётся (П2): на 3000 пулов их единицы; перебор проверяет в основном, что пропали
    expect(marks + makes + finds).toBeGreaterThan(0);
    expect(dropped).toBeGreaterThan(10);
  });
});

// Цена замены — чистая убыль бонусов по сету (шаг 2, доработка 2): Speed ×4 → ×3 при двух T4 — 4P T0 (25% SPD)
// сменяется на 2P T4 (13%), потеря — разница. Раньше в знаменателе была вся строка 4P T0: «на уровне» (+9,7%)
describe('цена замены: чистая убыль бонусов по сету', () => {
  const sv = variant('Caren', 'Speed');
  const pcs = [
    P('helmet', 'Speed', { HP: 3, CHD: 3, 'DMG UP%': 2, CHC: 3 }, 4), P('armor', 'Speed', { 'DMG UP%': 1, ATK: 2, 'DEF%': 2, RES: 1 }, 4),
    P('gloves', 'Speed', { 'DMG UP%': 3, SPD: 3, 'DEF%': 1, ATK: 2 }, 0), P('shoes', 'Speed', { ATK: 2, SPD: 1, 'DMG UP%': 1, RES: 3 }, 0),
  ];
  const st: PoolStore = { pieces: Object.fromEntries(pcs.map((p) => [p.id, p])), pools: { [caren.id]: pcs.map((p) => p.id) } };
  const x: ItemInput = { slot: 'shoes', grade: 'unique', setId: set('Immunity'), itemKey: null, main: null, subs: { HP: 1, 'DMG UP%': 2, 'DEF%': 3, ATK: 2 } };
  const row = () => outcomeFor(ctx, poolView(ctx, st), caren.id, x)!.rows.find((r) => r.v.key === sv.key)!;

  it('Speed ×4 → ×3 при двух T4: 4P T0 сменяется на 2P T4 — потеря только разница, исход «лучше»', () => {
    const r = row();
    const W = bonusWeights(ctx, caren, sv.b), val = (short: string, n: number, tier: string) =>
      bonusValue(ctx, caren, W, [...r.lostBonus, ...r.gainedBonus].find((b) => b.set === set(short) && b.n === n && b.tier === tier)!);
    expect(r.lostBonus.map((b) => `${b.n}${b.tier}`)).toEqual(['4T0']);
    expect(r.gainedBonus.map((b) => `${b.n}${b.tier}`)).toEqual(['2T4']);
    const cost = r.displaced.reduce((n, e) => n + e.v, 0) + val('Speed', 4, 'T0') - val('Speed', 2, 'T4');
    expect(r.delta!).toBeCloseTo((r.after.total - r.before.total) / cost, 9);
    expect(r).toMatchObject({ kind: 'up', used: true });
  });

  it('то же: исход держит и с ней — «Надеть»', () => {
    expect(puts(row())).toBe(true);
  });
});

// Breakthrough вещи с формы (eval-only, шаг 2): ItemInput.bt — 4 («T4»), 0 (ниже T4), нет поля — не указан, как
// раньше. В сборке вещь с формы — на своём Breakthrough; сеты зависят только от «T4 или нет»
describe('Breakthrough вещи с формы (ItemInput.bt)', () => {
  const sv = variant('Caren', 'Speed/Immu'), dv = variant('Caren', 'Def/Immu');
  const store = (pieces: Piece[]): PoolStore => ({ pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } });
  const X = (slot: SlotId, short: string, subs: Subs, bt?: 0 | 4 | null): ItemInput =>
    ({ slot, grade: 'unique', setId: set(short), itemKey: null, main: null, subs, ...(bt === undefined ? {} : { bt }) });
  const rowOf = (pieces: Piece[], x: ItemInput, vv: Variant) => outcomeFor(ctx, poolView(ctx, store(pieces)), caren.id, x)!.rows.find((r) => r.v.key === vv.key)!;
  const HELM: Subs = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 };
  const immu = () => [P('gloves', 'Immunity', { 'DEF%': 2, CHC: 2, CHD: 1 }), P('shoes', 'Immunity', { 'DEF%': 2, CHC: 1, SPD: 1 })];
  const bonusOf = (a: Assembly, short: string) => a.bonuses.filter((b) => b.set === set(short)).map((b) => `${b.n}${b.tier}`);

  it('Speed-шлем с формы на T4 + Speed-броня пула на T4 — Speed ×2 на T4, исход держит', () => {
    const pcs = [P('armor', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 4), ...immu()];
    const r = rowOf(pcs, X('helmet', 'Speed', HELM, 4), sv);
    expect(r).toMatchObject({ used: true });
    expect(bonusOf(r.after, 'Speed')).toEqual(['2T4']);
    expect(holds(r)).toBe(true);
  });

  it('тот же шлем без «T4» (bt 0) — Speed ×2 бонуса не даёт: на T0–T3 строки 2P у Speed нет', () => {
    const pcs = [P('armor', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 4), ...immu()];
    expect(bonusOf(rowOf(pcs, X('helmet', 'Speed', HELM, 0), sv).after, 'Speed')).toEqual([]);
  });

  it('Defense-шлем с формы с bt 0 + Defense-броня пула на T4 — Defense ×2 T0–T3; с «T4» — T4', () => {
    const pcs = [P('armor', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 4), ...immu()];
    const tierOf = (bt: 0 | 4) => rowOf(pcs, X('helmet', 'Defense', HELM, bt), dv).after.bonuses.find((b) => b.set === set('Defense'))!;
    expect(tierLabel(tierOf(0).tier)).toBe('T0–T3');
    expect(tierLabel(tierOf(4).tier)).toBe('T4');
  });

  it('bt 0 — Breakthrough известен: у бонуса нет «отметь Breakthrough» (unknownBt); у вещи пула без него — есть', () => {
    const known = [P('armor', 'Defense', { 'DEF%': 2, CHC: 2 }, 0), ...immu()];
    const unknown = [P('armor', 'Defense', { 'DEF%': 2, CHC: 2 }), ...immu()];
    const def = (pcs: Piece[]) => rowOf(pcs, X('helmet', 'Defense', HELM, 0), dv).after.bonuses.find((b) => b.set === set('Defense'))!;
    expect([def(known).unknownBt, def(unknown).unknownBt]).toEqual([false, true]);
  });

  it('без поля bt — как bt: null: та же сборка и тот же исход', () => {
    const pcs = [P('armor', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }, 4), ...immu()];
    const a = rowOf(pcs, X('helmet', 'Speed', HELM), sv), b = rowOf(pcs, X('helmet', 'Speed', HELM, null), sv);
    expect([a.kind, a.used, a.delta, a.after.bonuses]).toEqual([b.kind, b.used, b.delta, b.after.bonuses]);
    expect(a.after.slots.helmet!.bt).toBeNull();
  });

  // опровержение шага 2 (refute-2, aer-stamp): с T4 раскладка другая — Bursting-шлем вместо Speed-шлема, Speed ×4 → ×3
  // с двумя T4: 4P T0 → 2P T4. В знаменателе «лучше» была вся строка 4P T0 — «на уровне» и без «Надеть»; убыль бонуса
  // у новой на T4 — чистая по сету (13% SPD из 25%)
  it('Aer: Speed-перчатки на T4 — «лучше» и «Надеть», как те же на T0', () => {
    const aer = char('Aer');
    const sv4 = variant('Aer', 'Speed');
    const Q = (slot: SlotId, short: string, lit: Subs, bt: Bt | null) => P(slot, short, lit, bt, Object.keys(lit).length === 4 ? 'unique' : 'rare');
    const pcs = [
      Q('armor', 'Speed', { 'DEF%': 4, 'DMG UP%': 4, 'ATK%': 2 }, 1), Q('gloves', 'Speed', { 'DMG RED%': 3, 'DEF%': 2, CHD: 1, 'ATK%': 1 }, 2),
      Q('armor', 'Penetration', { RES: 3, CHC: 4, HP: 2 }, 4), Q('shoes', 'Critical Strike', { DEF: 2, 'HP%': 4, HP: 3 }, 4),
      Q('armor', 'Critical Strike', { 'DMG RED%': 4, HP: 2, SPD: 1, DEF: 3 }, null), Q('shoes', 'Penetration', { EFF: 4, 'DMG UP%': 3, 'DMG RED%': 1 }, 3),
      Q('gloves', 'Penetration', { 'DEF%': 1, DEF: 3, CHD: 3 }, 4), Q('helmet', 'Speed', { 'ATK%': 2, RES: 2, 'DEF%': 1 }, 4),
      Q('helmet', 'Bursting', { CHC: 3, SPD: 2, CHD: 3, 'DMG UP%': 4 }, 2), Q('helmet', 'Penetration', { EFF: 4, 'DMG RED%': 1, SPD: 2 }, null),
      Q('shoes', 'Speed', { ATK: 1, HP: 2, SPD: 3, RES: 4 }, 4),
    ];
    const st: PoolStore = { pieces: Object.fromEntries(pcs.map((p) => [p.id, p])), pools: { [aer.id]: pcs.map((p) => p.id) } };
    const row = (bt: 0 | 4) => outcomeFor(ctx, poolView(ctx, st), aer.id, X('gloves', 'Speed', { EFF: 1, DEF: 1, CHD: 3, RES: 2 }, bt))!.rows.find((r) => r.v.key === sv4.key)!;
    expect([row(0), row(4)].map((r) => [r.kind, puts(r)])).toEqual([['up', true], ['up', true]]);
    expect(row(4).lostBonus.map((b) => `${b.n}${b.tier}`)).toEqual(['4T0']);
  });

  // П7 (rivalOf) опирался на «у новой bt всегда null». Пул: Immunity-шлем и -перчатки (Immu ×2), Speed-броня на T4 и
  // Speed-ботинки на T0, лишний Speed-шлем на T0 — по ценности такой же, как новый (EFF и RES Caren не нужны). Новый
  // Speed-шлем на T4 с Speed-бронёй дал бы Speed ×2 T4, а тот — нет: он не соперник
  describe('П7: соперник новой на T4 — только вещь пула на T4', () => {
    const pool = () => [
      P('helmet', 'Immunity', { 'DEF%': 1, CHC: 1 }), P('gloves', 'Immunity', { 'DEF%': 2, CHC: 2 }),
      P('armor', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1 }, 4), P('shoes', 'Speed', { 'DEF%': 2, CHC: 1 }, 0),
      P('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, EFF: 1 }, 0),
    ];
    const NEW = { 'DEF%': 3, CHC: 3, CHD: 2, RES: 1 };

    it('новый Speed-шлем на T4 против такого же по ценности шлема пула на T0 — «ломает» с советом, а не «на уровне» против него', () => {
      const pcs = pool();
      const r = rowOf(pcs, X('helmet', 'Speed', NEW, 4), sv);
      expect(r).toMatchObject({ kind: 'breaks', used: false, broken: set('Immunity'), worn: { id: pcs[0].id }, fix: { set: set('Immunity'), slots: ['shoes'] } });
      expect(holds(r)).toBe(true);
    });

    it('сторож: тот же шлем без «T4» — исход по сопернику, «на уровне», не держит', () => {
      const pcs = pool();
      const r = rowOf(pcs, X('helmet', 'Speed', NEW), sv);
      expect(r).toMatchObject({ kind: 'eq', worn: { id: pcs[4].id }, fix: null });
      expect(holds(r)).toBe(false);
    });

    it('сторож: шлем пула тоже на T4 — соперник, исход по нему', () => {
      const pcs = pool().map((p, i) => (i === 4 ? { ...p, bt: 4 as Bt } : p));
      expect(rowOf(pcs, X('helmet', 'Speed', NEW, 4), sv)).toMatchObject({ kind: 'eq', worn: { id: pcs[4].id }, fix: null });
    });
  });
});

describe('«По статам»', () => {
  // Р12 и Р14 — одно «начат»: «По статам» живой ровно тогда, когда ни один настоящий вариант не начат
  it('живой (hasStatBuild) ⇔ ни один вариант не начат (started): 10 персонажей × 60 пулов, с оружием из списка и чужим, с чужими сетами', () => {
    const rnd = lcg(777);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const who = ['Caren', 'Anarky', 'Demiurge Luna', 'Eternal', 'Core Fusion Eternal', 'Demiurge Stella', 'Heatwave Cop Delta', 'Core Fusion Lisha', 'Iota', 'Demiurge Drakhan'];
    const off: string[] = [];
    for (const name of who) {
      const ch = char(name);
      const own = [...new Set(variantsOf(idx, ch).flatMap((v) => v.b.sets[0].map((p) => p.set)))];
      for (let i = 0; i < 60; i++) {
        const pieces = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => {
          // оружие: из списка (Р18 — начинает билд) или любое с любым main (часто «нет», в «Развитии» бывает временным)
          if (rnd() < 0.1) return W(pick(ch.builds[0].weapons).key, { CHC: 2 });
          if (rnd() < 0.1) return W(pick(D.weapons).key, { CHC: 2 }, pick(['ATK%', 'DEF%', 'HP%', 'CHC', 'CHD', 'SPD', 'EFF']), pick(['unique', 'rare'] as Piece['grade'][]));
          const setId = rnd() < 0.3 ? pick(own) : pick(D.sets).id;
          return { ...P(pick(['helmet', 'armor', 'gloves', 'shoes'] as ArmorSlot[]), null, { CHC: 2 }, pick([null, 0, 4] as (Bt | null)[])), setId };
        });
        const p = play(ctx, ch, pieces);
        const none = !p.variants.some((v) => !isStats(v) && started(p.reach.get(v.key)!));
        if (hasStatBuild(ctx, ch, pieces) !== none) off.push(`${name} #${i}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('цепочка — та, что у большинства билдов; без билдов outerpedia — нет', () => {
    expect(statVariant(caren)!.b.subs).toBe(caren.builds[0].subs);
    expect(statVariant(caren)!.b.sets).toEqual([[]]);
    expect(statVariant(D.chars.find((c) => !c.builds.length)!)).toBeNull();
  });

  it('раскладывает вещи по итогу: из двух шлемов — ценнее; случайный сет ×2 считается', () => {
    const eternal = char('Core Fusion Eternal');
    const v = statVariant(eternal)!;
    const eff = [P('helmet', 'Effectiveness', { EFF: 2 }), P('armor', 'Effectiveness', { SPD: 2 }), P('helmet', 'Attack', { SPD: 1 })];
    const a = asm(v, eff, eternal);
    expect(sets(a)).toEqual(['Effectiveness', 'Effectiveness', undefined, undefined]);
    expect(a.bonuses.map((r) => [idx.SET[r.set].short, r.n])).toEqual([['Effectiveness', 2]]);
  });
});

describe('вид пула и ненужные вещи', () => {
  it('ненужная — та, что не стоит ни в одной собираемой сборке; вид считает персонажа один раз', () => {
    const weak = P('helmet', 'Speed', JUNK), strong = P('helmet', 'Speed', GOOD), gloves = P('gloves', 'Speed', JUNK);
    const st: PoolStore = { pieces: Object.fromEntries([weak, strong, gloves].map((p) => [p.id, p])), pools: { [caren.id]: [weak.id, strong.id, gloves.id, 'нет-такой'] } };
    const view = poolView(ctx, st);
    const cp = view.of(caren.id)!;
    expect(cp.pieces).toHaveLength(3);
    expect(cp.unused.map((p) => p.id)).toEqual([weak.id]);
    expect(view.of(caren.id)).toBe(cp);
    expect(view.of('нет-такого')).toBeNull();
  });

  // находка 27: исход считается один раз на (вид, персонаж, explicit, содержимое входа)
  it('кэш outcomeFor: тот же вход — тот же результат; другой explicit, изменённый вход или новый вид — пересчёт', () => {
    const pieces = [P('helmet', 'Speed', JUNK), P('armor', 'Speed', JUNK)];
    const st: PoolStore = { pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } };
    const view = poolView(ctx, st);
    const x: ItemInput = { slot: 'gloves', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, subs: { 'DEF%': 3, CHC: 2 } };
    const first = outcomeFor(ctx, view, caren.id, x)!;

    expect(outcomeFor(ctx, view, caren.id, { ...x, subs: { ...x.subs } })).toBe(first); // вход собран заново
    expect(outcomeFor(ctx, view, caren.id, x, { explicit: true })).not.toBe(first);
    x.subs.CHD = 3; // форма поменяла вход на месте — ключ по содержимому
    const changed = outcomeFor(ctx, view, caren.id, x)!;
    expect(changed).not.toBe(first);
    expect(changed).toEqual(outcomeFor(ctx, poolView(ctx, st), caren.id, x));
    expect(outcomeFor(ctx, poolView(ctx, st), caren.id, x)).not.toBe(changed);
  });

  it('вещь Speed/Immu-сборки не ненужная, хоть в Speed её место занято', () => {
    const immu = P('helmet', 'Immunity', JUNK), immu2 = P('armor', 'Immunity', JUNK), sp = P('gloves', 'Speed', JUNK), sp2 = P('shoes', 'Speed', JUNK);
    const st: PoolStore = { pieces: Object.fromEntries([immu, immu2, sp, sp2].map((p) => [p.id, p])), pools: { [caren.id]: [immu.id, immu2.id, sp.id, sp2.id] } };
    expect(poolView(ctx, st).of(caren.id)!.unused).toEqual([]);
  });
});

// Шаг 4 «Оценка — единственный ввод»: что держит пул (held) и что убирает «Надеть» (В1, В2; решение владельца «что
// держит пул» — (а)). held — лучшие раскладки (выбранная и достижимая) всех вариантов героя, собираются они или нет, и
// «По статам»; «Надеть» убирает то, что вытеснило само, в любом слоте
describe('что держит пул и что убирает «Надеть» (шаг 4)', () => {
  const store = (c: { id: string }, pieces: Piece[], marks?: PoolStore['marks']): GearStore =>
    ({ ...EMPTY_GEAR, seq: pieces.length + 100, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [c.id]: pieces.map((p) => p.id) }, ...(marks ? { marks } : {}) });
  const X = (slot: SlotId, short: string, subs: Subs, grade: Piece['grade'] = 'unique'): ItemInput => ({ slot, grade, setId: set(short), itemKey: null, main: null, subs });
  const holders = (p: Play, id: string) => p.variants.filter((v) => heldBy(p, v).some((a) => Object.values(a.slots).some((e) => e?.id === id))).map((v) => (isStats(v) ? STATS : v.name));

  // Bell Cranel, Augm Attack (Attack ×2 + Augmentation ×2): Augmentation-шлем и Augmentation-ботинки (Epic, слабые) с
  // Attack-бронёй. Новые Augmentation-перчатки сильнее — сет переставляется в шлем и перчатки, в ботинки встают
  // Effectiveness-ботинки (лучше по статам); Augmentation-ботинки — ни в одной сборке (поток пробы prune.test)
  describe('перестановка сета: Augmentation-перчатки → Augmentation-ботинки убраны', () => {
    const bell = char('Bell Cranel');
    const pieces = () => [
      P('gloves', 'Speed', { HP: 3, ATK: 1, CHC: 2, CHD: 2 }), P('helmet', 'Augmentation', { EFF: 2, CHD: 3, HP: 2, 'DMG RED%': 1 }),
      P('shoes', 'Augmentation', { ATK: 2, EFF: 1, 'DMG UP%': 1 }, null, 'rare'), P('armor', 'Attack', { SPD: 2, RES: 2, 'DEF%': 2, CHD: 2 }),
      P('shoes', 'Effectiveness', { CHC: 2, CHD: 2, 'ATK%': 1, 'DMG UP%': 2 }),
    ];
    const GLOVES = X('gloves', 'Augmentation', { 'DMG RED%': 1, HP: 3, ATK: 1, 'ATK%': 3 });

    it('«Надеть» убирает вытесненные ботинки — вещь другого слота; Speed-перчатки её слота остаются', () => {
      const ps = pieces();
      const r = putOn(ctx, store(bell, ps), bell.id, GLOVES);
      expect(r.removed.map((p) => p.id)).toEqual([ps[2].id]);
      expect(r.st.pools[bell.id]).toEqual([ps[0].id, ps[1].id, ps[3].id, ps[4].id, r.id]);
    });

    it('подпись — «Надеть», не «Заменить перчатки»: вещи её слота «Надеть» не убирает', () => {
      const cv = charVs(ctx, poolView(ctx, store(bell, pieces())), bell.id, GLOVES)!;
      expect({ useful: cv.useful, replaces: cv.replaces }).toEqual({ useful: true, replaces: false });
    });

    it('«Вернуть» — хранилище как до «Надеть»: пул в том же порядке, записи те же', () => {
      const st = store(bell, pieces());
      const r = putOn(ctx, st, bell.id, GLOVES);
      const back = undoPut(r.st, bell.id, r);
      expect({ pools: back.pools, pieces: back.pieces, marks: back.marks }).toEqual({ pools: st.pools, pieces: st.pieces, marks: st.marks });
    });
  });

  // Caren (проба build/eval-only/hyp): Speed — шлем A, броня B, перчатки C (T0), ботинки W (T4); Speed/Immu — I1, I2,
  // перчатки N (T4) и W: Speed ×2 даёт бонус только на T4. Было: «Не собираю» у Speed/Immu и Def/Immu — N, I1 и I2
  // «больше не нужна», хотя Speed/Immu героя их берёт
  describe('«Не собираю» (В2): вещи сборки варианта пул держит', () => {
    const JUNK0 = { RES: 1, EFF: 1, HP: 1 };
    const pieces = () => [
      P('helmet', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 0), P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 0),
      P('gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }, 0), P('shoes', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
      P('gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 4), P('helmet', 'Immunity', JUNK0, 0), P('armor', 'Immunity', JUNK0, 0),
    ];
    const skip = { [buildKey(caren.id, 'Speed/Immu')]: 'skip' as const, [buildKey(caren.id, 'Def/Immu')]: 'skip' as const };

    it('сборка Speed/Immu — перчатки N на T4 и Immunity-вещи; с «Не собираю» он не собирается', () => {
      const ps = pieces();
      const p = play(ctx, caren, ps, { marks: skip });
      const si = p.asm.get(variant('Caren', 'Speed/Immu').key)!;
      expect([si.slots.helmet?.id, si.slots.armor?.id, si.slots.gloves?.id]).toEqual([ps[5].id, ps[6].id, ps[4].id]);
      expect(p.inPlay.map((v) => v.name)).not.toContain('Speed/Immu');
    });

    it('«Не собираю» у Speed/Immu и Def/Immu — «больше не нужна» нет ни у одной: unused не растёт', () => {
      const ps = pieces();
      const without = poolView(ctx, store(caren, ps)).of(caren.id)!.unused;
      const skipped = poolView(ctx, store(caren, ps, skip)).of(caren.id)!.unused;
      expect({ without, skipped }).toEqual({ without: [], skipped: [] });
    });

    // шаг 10 (заметка шага 4): было — у вещи, которую держит только вариант с «Не собираю», строки «в …» не было
    it('где стоит: Immunity-шлем держит только Speed/Immu с «Не собираю» — «в Speed/Immu», как у остальных', () => {
      const ps = pieces();
      const view = poolView(ctx, store(caren, ps, skip));
      expect(whereUsed(view, caren.id, ps[5].id).map((v) => v.name)).toContain('Speed/Immu');
      expect(whereUsed(view, caren.id, ps[0].id).map((v) => v.name)).toEqual(['Speed']); // собираемый — как раньше
    });
  });

  // Mystic Sage Ame: DPS pen (цепочка SPD › ATK › CHC — как «По статам») начат Penetration-шлемом; у DPS attack
  // цепочка CHC › ATK › SPD, своих вещей в пуле нет. Шлем X чужого сета (CHC 4, ATK% 3) — лучший для DPS attack, но не
  // для DPS pen и «По статам». Было: X «больше не нужна» (DPS attack не начат). Решение владельца — пул держит
  describe('вариант без единой вещи своего сета держит вещи своей лучшей раскладки', () => {
    const ame = char('Mystic Sage Ame');
    const pieces = () => [P('helmet', 'Defense', { CHC: 4, 'ATK%': 3 }), P('helmet', 'Penetration', { SPD: 3, 'ATK%': 3 })];

    it('X стоит только в сборке DPS attack, а он не собирается', () => {
      const ps = pieces(), [x] = ps;
      const p = play(ctx, ame, ps);
      expect({ holders: holders(p, x.id), inPlay: p.inPlay.map((v) => v.name) }).toEqual({ holders: ['DPS attack'], inPlay: ['DPS pen'] });
    });

    it('X не «больше не нужна»', () => {
      const ps = pieces();
      expect(poolView(ctx, store(ame, ps)).of(ame.id)!.unused).toEqual([]);
    });

    // шаг 10 (заметка шага 4): было — без «в …»; вариант не начат, а пул держит его сборку
    it('где стоит: X — «в DPS attack» (вариант не начат)', () => {
      const ps = pieces();
      expect(whereUsed(poolView(ctx, store(ame, ps)), ame.id, ps[0].id).map((v) => v.name)).toEqual(['DPS attack']);
    });
  });

  // REFUTE2 п.6, Transistone: у Caren Speed-шлем A (EFF) на T4 — в Speed и в «По статам». Переброшенный A′ (CHC вместо
  // EFF, с формы ниже T4) введён заново и надет: в Speed (4 Speed, T4 у трёх — Speed ×2 T4 и без A) A′ лучше, а в
  // «По статам» (два Speed на T4 и сильные Attack-вещи) A держит Speed ×2 T4 — A остаётся в пуле: «призрак», убрать
  // его — «Убрать у Caren» (чистый путь — «Примерить замену», шаг 6)
  describe('Transistone-«призрак»: A′ вытеснил A из Speed, A стоит в «По статам» и не убран', () => {
    const STRONG4 = { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 2 };
    const pieces = () => [
      P('helmet', 'Speed', { 'DEF%': 2, CHD: 2, SPD: 1, EFF: 2 }, 4), P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
      P('gloves', 'Speed', { HP: 1, RES: 1 }, 4), P('shoes', 'Speed', { HP: 1, ATK: 1 }, 0),
      P('gloves', 'Attack', STRONG4), P('shoes', 'Attack', STRONG4),
    ];
    const A2 = { ...X('helmet', 'Speed', { 'DEF%': 2, CHD: 2, SPD: 1, CHC: 2 }), bt: 0 as const };

    it('до «Надеть»: A — в Speed и в «По статам»', () => {
      const ps = pieces();
      expect(holders(play(ctx, caren, ps), ps[0].id)).toEqual(expect.arrayContaining([STATS, 'Speed']));
    });

    it('после: A′ в Speed вместо A, A — в «По статам», «Надеть» его не убрал', () => {
      const ps = pieces();
      const r = putOn(ctx, store(caren, ps), caren.id, A2);
      const p = poolView(ctx, r.st).of(caren.id)!;
      expect({
        speed: p.asm.get(variant('Caren', 'Speed').key)!.slots.helmet?.id, stats: p.asm.get(p.stat!.key)!.slots.helmet?.id,
        removed: r.removed.map((x) => x.id), kept: r.st.pools[caren.id].includes(ps[0].id),
      }).toEqual({ speed: r.id, stats: ps[0].id, removed: [], kept: true });
    });
  });
});

// Шаг 5 «Оценка — единственный ввод»: правка в шторке (updateIn) пересобирает билды, но пул не чистит (В-А3) — ставшая
// ненужной вещь остаётся со строкой «больше не нужна» и «Убрать у Caren»
describe('правка в шторке пересобирает, но не чистит (В-А3)', () => {
  const held = (p: Play, id: string) => p.variants.filter((v) => heldBy(p, v).some((a) => Object.values(a.slots).some((e) => e?.id === id))).map((v) => (isStats(v) ? STATS : v.name));
  const JUNK2 = { HP: 1, RES: 1 }, STRONG4 = { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 2 };
  // Caren: два Speed-шлема — A (T0, SPD 4) и B (T4). В Speed ×4 (броня и перчатки на T4, ботинки на T0) T4 шлема бонуса
  // не меняет — встаёт A, он сильнее; в «По статам» (Speed-шлем и -броня, Attack-перчатки и -ботинки) B на T4 даёт
  // Speed ×2 T4 — встаёт B. У Pen, Def и Immu — шлемы своих сетов. SPD у A 4 → 6: A сильнее B и с бонусом
  const pieces = () => [
    P('helmet', 'Speed', { 'DEF%': 4, 'HP%': 4, CHC: 2, SPD: 4 }, 0), P('helmet', 'Speed', { RES: 3, CHC: 1, 'DEF%': 3, SPD: 4 }, 4),
    P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4), P('gloves', 'Speed', JUNK2, 4), P('shoes', 'Speed', { HP: 1, ATK: 1 }, 0),
    P('helmet', 'Penetration', JUNK2), P('helmet', 'Defense', JUNK2), P('helmet', 'Immunity', JUNK2),
    P('gloves', 'Attack', STRONG4), P('shoes', 'Attack', STRONG4),
  ];
  const store = (ps: Piece[]): GearStore =>
    ({ ...EMPTY_GEAR, seq: seq + 1, pieces: Object.fromEntries(ps.map((p) => [p.id, p])), pools: { [caren.id]: ps.map((p) => p.id) } });

  it('до правки: A — только в Speed, B — только в «По статам», ненужных нет', () => {
    const ps = pieces(), [a, b] = ps;
    const cp = poolView(ctx, store(ps)).of(caren.id)!;
    expect({ a: held(cp, a.id), b: held(cp, b.id), unused: cp.unused }).toEqual({ a: ['Speed'], b: [STATS], unused: [] });
  });

  it('SPD у A 4 → 6: «По статам» пересобран — шлем A вместо B', () => {
    const ps = pieces(), [a, b] = ps;
    const st = store(ps);
    const stats = (x: GearStore) => { const cp = poolView(ctx, x).of(caren.id)!; return cp.asm.get(cp.stat!.key)!.slots.helmet?.id; };
    const r = updateIn(idx, st, caren.id, a.id, { lit: { SPD: 6 } }, '');
    expect([stats(st), stats(r.st)]).toEqual([b.id, a.id]);
  });

  it('B больше ни в одном билде — «больше не нужна», но из пула не ушёл', () => {
    const ps = pieces(), [a, b] = ps;
    const r = updateIn(idx, store(ps), caren.id, a.id, { lit: { SPD: 6 } }, '');
    const cp = poolView(ctx, r.st).of(caren.id)!;
    expect({ b: held(cp, b.id), unused: cp.unused.map((p) => p.id), pool: r.st.pools[caren.id], kept: r.st.pieces[b.id] })
      .toEqual({ b: [], unused: [b.id], pool: ps.map((p) => p.id), kept: b });
  });
});

// Случаи владельца (прогон 1.4), вещи — свои, не из его кода: персонаж одет не в сеты своих билдов
// Шаг 6 «Оценка — единственный ввод»: «Примерить замену» → режим героя с TryOn.replace (решение владельца «заменить
// в любом случае» — (а)): кнопка «Заменить» всегда, «Надеть» убирает эту запись, лучше новая или хуже
describe('режим героя с replace: «Надеть» заменяет эту запись', () => {
  const store = (pieces: Piece[]): GearStore =>
    ({ ...EMPTY_GEAR, seq: pieces.length + 100, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } });
  // Transistone: у Caren Speed-шлем A (EFF) на T4; в игре EFF перебросили в CHC — A′ введён заново, слабее A
  const pieces = () => [
    P('helmet', 'Speed', { 'DEF%': 4, CHD: 3, SPD: 2, EFF: 2 }, 4), P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
    P('gloves', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
  ];
  const A2: ItemInput = { slot: 'helmet', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, subs: { 'DEF%': 2, CHD: 2, SPD: 1, CHC: 1 }, bt: 0 };
  const vsOf = (st: GearStore, replace?: string) => charVs(ctx, poolView(ctx, st), caren.id, A2, undefined, { explicit: true, replace })!;

  it('без replace A′ хуже A: кнопки нет', () => {
    expect(vsOf(store(pieces())).useful).toBe(false);
  });

  it('с replace = A — кнопка «Заменить» есть (Р4 не действует)', () => {
    const ps = pieces();
    const cv = vsOf(store(ps), ps[0].id);
    expect({ useful: cv.useful, replaces: cv.replaces }).toEqual({ useful: true, replaces: true });
  });

  it('«Надеть» с replace — A убран, A′ в пуле', () => {
    const ps = pieces();
    const r = putOn(ctx, store(ps), caren.id, A2, { replace: ps[0].id });
    expect({ removed: r.removed.map((p) => p.id), pool: r.st.pools[caren.id] }).toEqual({ removed: [ps[0].id], pool: [ps[1].id, ps[2].id, r.id] });
  });

  it('«Вернуть» — хранилище как до «Надеть»: A на прежнем месте, запись та же', () => {
    const st = store(pieces());
    const r = putOn(ctx, st, caren.id, A2, { replace: st.pools[caren.id][0] });
    const back = undoPut(r.st, caren.id, r);
    expect({ pools: back.pools, pieces: back.pieces }).toEqual({ pools: st.pools, pieces: st.pieces });
  });

  it.each([
    ['чужой id (запись другого героя)', (_ps: Piece[], st: GearStore) => {
      const rin = char('Rin');
      const other = P('helmet', 'Speed', GOOD);
      return { st: { ...st, pieces: { ...st.pieces, [other.id]: other }, pools: { ...st.pools, [rin.id]: [other.id] } }, id: other.id };
    }],
    ['уже убранный id', (ps: Piece[], st: GearStore) => ({ st: { ...st, pools: { [caren.id]: st.pools[caren.id].filter((x) => x !== ps[0].id) } }, id: ps[0].id })],
    ['запись другого слота', (ps: Piece[], st: GearStore) => ({ st, id: ps[1].id })],
  ])('replace — %s: как без replace', (_, make) => {
    const ps = pieces();
    const { st, id } = make(ps, store(ps));
    const plain = vsOf(st), rep = vsOf(st, id);
    expect({ useful: rep.useful, replaces: rep.replaces }).toEqual({ useful: plain.useful, replaces: plain.replaces });
    expect(putOn(ctx, st, caren.id, A2, { replace: id }).removed).toEqual(putOn(ctx, st, caren.id, A2).removed);
  });

  it('A′ лучше A: с replace убирается A и вытесненное по В1, как без replace', () => {
    const ps = pieces();
    const better: ItemInput = { ...A2, subs: { 'DEF%': 5, CHD: 4, SPD: 3, CHC: 4 }, bt: 4 };
    const st = store(ps);
    const plain = putOn(ctx, st, caren.id, better), rep = putOn(ctx, st, caren.id, better, { replace: ps[0].id });
    expect(plain.removed.map((p) => p.id)).toEqual([ps[0].id]);
    expect(rep.removed.map((p) => p.id)).toEqual([ps[0].id]);
  });
});

describe('«По статам»: случаи владельца', () => {
  it('Core Fusion Eternal (Speed ×4): три Effectiveness, ни одной Speed — «По статам»; случайный Effectiveness ×2 считается', () => {
    const cf = char('Core Fusion Eternal');
    const pieces = [P('helmet', 'Effectiveness', { SPD: 2, CHC: 2 }), P('gloves', 'Effectiveness', { SPD: 1, EFF: 3 }), P('shoes', 'Effectiveness', { CHD: 2, EFF: 1 })];
    // из переноса v1: Speed отмечен «Собираю» — собирается и он, пустой по сету
    const p = play(ctx, cf, pieces, { marks: { [buildKey(cf.id, 'Speed')]: 'want' } });
    expect(p.inPlay.map((v) => (isStats(v) ? '#stats' : v.name))).toEqual(['#stats', 'Speed']);
    const a = p.asm.get(p.stat!.key)!;
    expect(a.bonuses.map((r) => [idx.SET[r.set].short, r.n, r.tier, r.unknownBt])).toEqual([['Effectiveness', 2, 'T0', true]]);
    expect(a.filled).toBe(3);
    expect(a.total).toBeGreaterThan(pieces.reduce((n, x) => n + entriesFor(ctx, cf, p.stat!, [x])[0].v, 0)); // + бонус EFF
  });

  it('Demiurge Stella (Counter ×4, Revenge ×4): Attack ×2 (Epic) и Critical Hit ×2 без сабстатов — «По статам», оба бонуса, ценность пустых — 0', () => {
    const stella = char('Demiurge Stella');
    const crit = [P('armor', 'Critical Hit', {}), P('gloves', 'Critical Hit', {})];
    const pieces = [P('helmet', 'Attack', { 'ATK%': 2, CHD: 2 }, null, 'rare'), P('shoes', 'Attack', { CHC: 2, 'ATK%': 1 }, null, 'rare'), ...crit];
    const p = play(ctx, stella, pieces, { marks: { [buildKey(stella.id, 'Revenge')]: 'want' } });
    expect(p.stat).not.toBeNull();
    const a = p.asm.get(p.stat!.key)!;
    expect(a.bonuses.map((r) => idx.SET[r.set].short).sort()).toEqual(['Attack', 'Critical Hit']);
    expect(crit.map((x) => entriesFor(ctx, stella, p.stat!, [x])[0].v)).toEqual([0, 0]);
    expect(a.filled).toBe(4);
    expect(poolView(ctx, { pieces: Object.fromEntries(pieces.map((x) => [x.id, x])), pools: { [stella.id]: pieces.map((x) => x.id) } }).of(stella.id)!.unused).toEqual([]);
  });
});

// Находка 28 (Р11–Р13): «По статам» — отдельный билд у каждого героя с билдами. Живой (держит штамп), пока в пуле нет
// брони из сетов связок; потом — тихая строка, «Надеть» в него только при явном выборе (поиск по имени, режим героя).
// Хлам для него — вещь без полезных статов. Вещи — коды владельца (OGC …)
describe('«По статам» у каждого героя (находка 28)', () => {
  const drakhan = idx.CHAR_BY_SLUG['demiurge-drakhan'];    // Speed ×4, Immunity ×2 + Swiftness ×2; SPD › HP › CHC › CHD › DMG UP% › DEF
  const eternal = idx.CHAR_BY_SLUG['core-fusion-eternal']; // Speed ×4; SPD › EFF › CHC › ATK › CHD › DMG UP%
  const code = (c: string): ItemInput => { const r = decodeItem(c); if (!r.ok) throw new Error(c); return r.item; };
  const HLMW = code('OGC HLMW PCHM'); // броня Revenge, Epic: SPD 3 · HP 1 · HP% 1 — сета нет в билдах Drakhan, статы — её
  const CMPP = code('OGC CMPP VPVY'); // броня Effectiveness, Epic: SPD 3 · EFF 2 · HP 1 — не сет Eternal
  const GLUJ = code('OGC GLUJ RXXG'); // перчатки Speed, Epic: SPD 1 · ATK% 3 · EFF 2 — первая вещь Speed у Eternal
  const item = (slot: SlotId, short: string, subs: Subs): ItemInput => ({ slot, grade: 'rare', setId: set(short), itemKey: null, main: null, unlisted: false, subs });
  const rec = (x: ItemInput): Piece =>
    ({ id: 'p' + ++seq, slot: x.slot, grade: x.grade, setId: x.setId ?? null, itemKey: x.itemKey ?? null, main: x.main ?? null, yellow: { ...x.subs }, lit: { ...x.subs }, bt: null, at: '' });
  const store = (pools: Record<string, Piece[]>): GearStore => ({
    ...EMPTY_GEAR, seq, pieces: Object.fromEntries(Object.values(pools).flat().map((p) => [p.id, p])),
    pools: Object.fromEntries(Object.entries(pools).map(([c, ps]) => [c, ps.map((p) => p.id)])),
  });
  const EXPLICIT = { explicit: true };
  const WEAK_SPEED = item('armor', 'Speed', { SPD: 1, HP: 1, RES: 1 });

  describe('Drakhan без вещей: броня Revenge с её статами', () => {
    it('поиск по имени: строка «По статам — пустой слот», надеть можно', () => {
      const x = charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, HLMW, undefined, EXPLICIT)!;
      expect(isStats(x.best!.v)).toBe(true);
      expect(x.best).toMatchObject({ kind: 'fill', used: true });
      expect(x.useful).toBe(true);
    });

    it('без поиска (карточка, «Сейчас на персонажах», список без имени) её нет — по сету (Р11)', () => {
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, HLMW)).toBeNull();
    });

    it('с целью Speed сама вещь в Speed не встаёт', () => {
      const speed = buildKey(drakhan.id, 'Speed');
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, HLMW, speed, EXPLICIT)).toBeNull();
    });

    it('«По статам» как цель подходит — надеть можно', () => {
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, HLMW, statVariant(drakhan)!.key, EXPLICIT)?.useful).toBe(true);
    });

    it('без полезных статов — хлам и при явном выборе (Р13)', () => {
      const junk = item('armor', 'Revenge', { RES: 2, EFF: 2, 'ATK%': 1 }); // в её цепочке нет ни одного
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, junk, undefined, EXPLICIT)).toBeNull();
    });

    it('оружие не по билду (main ей не нужен) с полезными сабстатами — в «По статам» при явном выборе (допущение (а))', () => {
      const want = new Set(drakhan.builds.flatMap((b) => [...slotMains(b, 'weapon')]));
      const main = MAINS.find((m) => !want.has(m) && m !== 'SPD')!;
      const w: ItemInput = { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main, unlisted: false, subs: { SPD: 3, HP: 2, CHC: 1 } };
      const x = charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, w, undefined, EXPLICIT)!;
      expect(isStats(x.best!.v)).toBe(true);
      expect(x.useful).toBe(true);
    });

    it('первая Speed-вещь: главная строка — «начнёт Speed», а не тихая «По статам»', () => {
      const x = charVs(ctx, poolView(ctx, EMPTY_GEAR), drakhan.id, item('helmet', 'Speed', { SPD: 3, HP: 2, CHC: 1 }), undefined, EXPLICIT)!;
      expect(x.best).toBeNull();
      expect(x.starts.map((v) => v.name)).toContain('Speed');
    });
  });

  describe('Drakhan с одной Revenge-бронёй: ни один билд не начат — «По статам» держит (Р12)', () => {
    const view = poolView(ctx, store({ [drakhan.id]: [rec(HLMW)] }));
    const helm = item('helmet', 'Revenge', { SPD: 4, HP: 2, CHC: 1 });

    it('«По статам» — единственный собираемый', () => {
      expect(view.of(drakhan.id)!.inPlay.map(isStats)).toEqual([true]);
    });

    it('Revenge-шлем в пустой слот: «По статам — пустой слот», строка не тихая, штамп держит', () => {
      const row = outcomeFor(ctx, view, drakhan.id, helm)!.rows.find((r) => isStats(r.v))!;
      expect(row).toMatchObject({ kind: 'fill', used: true, quiet: false });
      expect(holds(row)).toBe(true);
    });

    it('без поиска Drakhan за одну строку «По статам» не показывается (Р11)', () => {
      expect(charVs(ctx, view, drakhan.id, helm)).toBeNull();
    });

    it('первая Speed-вещь: строка «По статам» живая, а главная — «начнёт Speed»', () => {
      const x = charVs(ctx, view, drakhan.id, item('helmet', 'Speed', { SPD: 3, HP: 2, CHC: 1 }))!;
      expect(x.best).toBeNull();
      expect(x.rows.find((r) => isStats(r.v))?.quiet).toBe(false);
      expect(x.starts.map((v) => v.name)).toContain('Speed');
    });
  });

  describe('Eternal: «По статам» рядом с Speed', () => {
    it('CMPP + GLUJ: собирается Speed, «По статам» есть (не собирается сам) и держит обе вещи', () => {
      const a = rec(CMPP), b = rec(GLUJ);
      const p = play(ctx, eternal, [a, b]);
      expect(p.inPlay.map((v) => (isStats(v) ? STATS : v.name))).toEqual(['Speed']);
      expect(p.statLive).toBe(false);
      const s = p.asm.get(p.stat!.key)!;
      expect([s.slots.armor?.id, s.slots.gloves?.id]).toEqual([a.id, b.id]);
    });

    it('Effectiveness-броня сильнее по статам, чем Speed-броня, — не «ненужная»: стоит в «По статам»', () => {
      const eff = rec(CMPP), spd = rec(WEAK_SPEED);
      expect(poolView(ctx, store({ [eternal.id]: [eff, spd] })).of(eternal.id)!.unused).toEqual([]);
    });

    it('«Надеть» слабую Speed-броню на Eternal с CMPP: CMPP остаётся — она лучше по статам', () => {
      const eff = rec(CMPP);
      const r = putOn(ctx, store({ [eternal.id]: [eff] }), eternal.id, WEAK_SPEED);
      expect(r.removed).toEqual([]);
      expect(r.st.pools[eternal.id]).toContain(eff.id);
    });

    it('есть GLUJ, CMPP через поиск: «По статам — пустой слот», строка тихая (штамп не держит), надеть можно', () => {
      const view = poolView(ctx, store({ [eternal.id]: [rec(GLUJ)] }));
      const row = outcomeFor(ctx, view, eternal.id, CMPP, EXPLICIT)!.rows.find((r) => isStats(r.v));
      expect(row).toMatchObject({ kind: 'fill', used: true, quiet: true });
      expect(holds(row!)).toBe(false);
      expect(charVs(ctx, view, eternal.id, CMPP, undefined, EXPLICIT)?.useful).toBe(true);
    });

    it('то же без поиска — тихих строк нет, Eternal не показывается (Р11)', () => {
      const view = poolView(ctx, store({ [eternal.id]: [rec(GLUJ)] }));
      expect(outcomeFor(ctx, view, eternal.id, CMPP)!.rows).toEqual([]);
      expect(charVs(ctx, view, eternal.id, CMPP)).toBeNull();
    });

    it('броня не из сета в пустой слот — у настоящего Speed по-прежнему не исход', () => {
      const view = poolView(ctx, store({ [eternal.id]: [rec(GLUJ)] }));
      expect(outcomeFor(ctx, view, eternal.id, CMPP, EXPLICIT)!.rows.filter((r) => !isStats(r.v))).toEqual([]);
    });
  });

  describe('Luna: две Penetration, Critical Strike-перчатки через поиск', () => {
    const luna = char('Demiurge Luna');
    const pen = () => store({ [luna.id]: [rec(item('armor', 'Penetration', { ATK: 1, RES: 3, DEF: 2, CHC: 2 })), rec(item('gloves', 'Penetration', { HP: 1, EFF: 2, SPD: 3 }))] });
    const crit: ItemInput = { ...item('gloves', 'Critical Strike', { EFF: 3, 'DEF%': 1, 'ATK%': 2, CHC: 3 }), grade: 'unique' };

    it('главная строка — «начнёт Critical Strike»: одна вещь начинает билд (Р14)', () => {
      const x = charVs(ctx, poolView(ctx, pen()), luna.id, crit, undefined, EXPLICIT)!;
      expect({ best: x.best, starts: x.starts.map((v) => v.name) }).toEqual({ best: null, starts: ['Critical Strike'] });
    });

    it('Critical Strike «Не собираю» — главная строка тихая «По статам — лучше», а не «ломает», где вещь не встаёт (Р4: подпись = «Надеть»)', () => {
      const st = { ...pen(), marks: { [buildKey(luna.id, 'Critical Strike')]: 'skip' as const } };
      const x = charVs(ctx, poolView(ctx, st), luna.id, crit, undefined, EXPLICIT)!;
      expect(isStats(x.best!.v)).toBe(true);
      expect(x.best).toMatchObject({ kind: 'up', used: true, quiet: true });
      expect(x.rows[0]).toBe(x.best);
      expect(x.rows.some((r) => r.kind === 'breaks')).toBe(true);
      expect(x.useful).toBe(true);
    });
  });

  describe('где стоит вещь (whereUsed): «По статам» — только если больше нигде', () => {
    it('броня не из связки, одна в своём слоте (прочая в пустой слот Speed): «По статам», и пул её держит', () => {
      const shoes = rec(item('shoes', 'Swiftness', { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }));
      const view = poolView(ctx, store({ [caren.id]: [rec(item('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1 })), shoes] }));
      const cp = view.of(caren.id)!;
      expect(cp.asm.get(variant('Caren', 'Speed').key)!.slots.shoes?.id).toBe(shoes.id); // в раскладке Speed она есть
      expect(whereUsed(view, caren.id, shoes.id).map(isStats)).toEqual([true]);
      expect(cp.unused).toEqual([]);
    });

    it('броня не из связки, вытеснившая вещь своего слота, — засчитана в варианте', () => {
      const weak = rec(item('shoes', 'Swiftness', { HP: 1, RES: 1, EFF: 1 }));
      const strong = rec(item('shoes', 'Attack', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }));
      const view = poolView(ctx, store({ [caren.id]: [rec(item('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1 })), weak, strong] }));
      expect(whereUsed(view, caren.id, strong.id).map((v) => v.name)).toContain('Speed');
    });

    it('вещь в Speed и в «По статам» — только Speed', () => {
      const g = rec(GLUJ);
      const view = poolView(ctx, store({ [eternal.id]: [rec(CMPP), g] }));
      expect(view.of(eternal.id)!.asm.get(statVariant(eternal)!.key)!.slots.gloves?.id).toBe(g.id);
      expect(whereUsed(view, eternal.id, g.id).map((v) => v.name)).toEqual(['Speed']);
    });

    it('вещь только в «По статам» — «По статам»', () => {
      // в Speed броня — Speed-вещь (сет идёт вещь за вещью), в «По статам» — CMPP: она сильнее
      const eff = rec(CMPP);
      const view = poolView(ctx, store({ [eternal.id]: [eff, rec(GLUJ), rec(WEAK_SPEED)] }));
      expect(whereUsed(view, eternal.id, eff.id).map(isStats)).toEqual([true]);
    });
  });
});

// Шаг 14 (браузер): Aer (Striker) в «Кому надеть?» предлагался Thumping Odyssey — оружие только для Mage («пустой слот ·
// Speed»). Вещь не для класса героя (vs wearable) — не кандидат нигде: ни в билде, ни в «По статам», ни в режиме героя
describe('оружие не для класса героя (classLimits)', () => {
  const aer = char('Aer');   // Striker; билды просят ATK% в оружии — Mage-оружие с ATK% было бы «временным»
  const ame = char('Ame');   // Mage; Thumping Odyssey — в списке её билдов
  const mageOnly = D.weapons.find((w) => w.name === 'Thumping Odyssey')!;
  const X: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: mageOnly.key, main: 'ATK%', unlisted: false, subs: { ATK: 2, CHC: 2, CHD: 1, SPD: 1 } };
  const EXPLICIT = { explicit: true };
  const aerSpeed = buildKey(aer.id, 'Speed');

  it('данные: Thumping Odyssey — только Mage, Aer — Striker, Ame — Mage', () => {
    expect([mageOnly.classLimits, aer.class, ame.class]).toEqual([['mage'], 'striker', 'mage']);
  });

  it('Aer, явный выбор (поиск по имени): исхода нет — ни билда, ни «По статам»', () => {
    // Arrange
    const view = poolView(ctx, EMPTY_GEAR);
    // Act
    const o = outcomeFor(ctx, view, aer.id, X, EXPLICIT);
    // Assert
    expect(o).toBeNull();
    expect(charVs(ctx, view, aer.id, X, undefined, EXPLICIT)).toBeNull();
  });

  it('Aer, цель Speed и цель «По статам»: строки нет', () => {
    const view = poolView(ctx, EMPTY_GEAR);
    expect(charVs(ctx, view, aer.id, X, aerSpeed, EXPLICIT)).toBeNull();
    expect(charVs(ctx, view, aer.id, X, statVariant(aer)!.key, EXPLICIT)).toBeNull();
  });

  it('Mage-героиня Ame: исход есть — рекомендованное оружие встаёт в пустой слот', () => {
    const o = outcomeFor(ctx, poolView(ctx, EMPTY_GEAR), ame.id, X, EXPLICIT);
    expect(o?.rows.some((r) => r.used && r.kind === 'fill' && !isStats(r.v))).toBe(true);
  });

  it('fit — «нет» у каждого билда Aer, хотя main ATK% его билдам нужен', () => {
    expect(aer.builds.map((b) => fit(ctx, aer, b, X))).toEqual(aer.builds.map(() => 'no'));
    expect(aer.builds.every((b) => slotMains(b, 'weapon').has('ATK%'))).toBe(true);
  });

  it('записанная в пул Aer (старая запись): не в сборках, билд не начинает, собирается только «По статам»', () => {
    // Arrange
    const w = W(mageOnly.key, { ATK: 2, CHC: 2 }, 'ATK%');
    // Act
    const p = play(ctx, aer, [w]);
    // Assert
    expect(p.variants.every((v) => !p.asm.get(v.key)!.slots.weapon)).toBe(true);
    expect(p.variants.some((v) => !isStats(v) && started(p.reach.get(v.key)!))).toBe(false);
    expect(inPlay([w], {}, aer)).toEqual(['#stats']);
  });
});
