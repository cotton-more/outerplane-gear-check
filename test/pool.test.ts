// Пул экипировки (logic/pool, GEARPOOL C1): сборка варианта из вещей персонажа — точная (сверка с перебором без
// отсечения), цель владельца (сет-эффект держится, сет-стат ломается только ради итога), «собираешь», «По статам»,
// ненужные вещи.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { ArmorSlot, Dataset, SlotId } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { buildKey, EMPTY_GEAR, updatePiece, type Bt, type GearStore, type Piece } from '../src/logic/gear';
import { assemble, assembleReach, entriesFor, hasStatBuild, holds, isStats, outcomeFor, play, poolView, putOn, started, statVariant, STATS, type Assembly, type PoolStore } from '../src/logic/pool';
import { charVs, whereUsed } from '../src/logic/poolVs';
import { slotMains } from '../src/logic/builds';
import { decodeItem, MAINS } from '../src/logic/itemCode';
import type { Subs } from '../src/logic/subs';
import type { ItemInput } from '../src/logic/verdict';
import { variantsOf, type Variant } from '../src/logic/variants';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%
const variant = (name: string, v: string) => variantsOf(idx, char(name)).find((x) => x.name === v)!;

let seq = 0;
// вещь брони: lit — горит всего (жёлтые = горящим, Reforge впереди все 6)
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
  // случайные пулы: сеты связок, случайные сеты, T4 и нет, сабстаты — сверка с перебором без отсечения
  const rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31; })();
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const cases: [string, string][] = [
    ['Caren', 'Speed'], ['Caren', 'Speed/Immu'], ['Anarky', 'Defense mix · Penetration'], ['Heatwave Cop Delta', 'DPS · Penetration ×4'],
    ['Heatwave Cop Delta', 'DPS · Penetration ×2 + Attack ×2'], ['Core Fusion Lisha', 'Pen combos · Speed'], ['Iota', 'PvE - effi'],
  ];
  const SETS = ['Speed', 'Immunity', 'Penetration', 'Defense', 'Attack', 'Effectiveness', 'Swiftness', 'Critical Hit'];
  const STATS = ['DEF%', 'CHC', 'CHD', 'SPD', 'ATK%', 'EFF', 'HP', 'RES'];

  it('с отсечением — то же, что полный перебор (200 пулов на вариант)', () => {
    for (const [c, vn] of cases) {
      const ch = char(c), v = variantsOf(idx, ch).find((x) => x.name === vn)!;
      for (let i = 0; i < 200; i++) {
        const pieces = Array.from({ length: 3 + Math.floor(rnd() * 9) }, () => {
          const lit: Subs = {};
          for (let k = 0; k < 4; k++) lit[pick(STATS)] = 1 + Math.floor(rnd() * 6);
          return P(pick(['helmet', 'armor', 'gloves', 'shoes'] as ArmorSlot[]), pick(SETS), lit, pick([null, 0, 4] as (Bt | null)[]));
        });
        const es = entriesFor(ctx, ch, v, pieces);
        const a = assemble(ctx, ch, v, es), z = assemble(ctx, ch, v, es, { prune: false });
        expect([a.hard, a.live, a.soft, a.filled]).toEqual([z.hard, z.live, z.soft, z.filled]);
        expect(a.total).toBeCloseTo(z.total, 9);
      }
    }
  });

  it('достижимая сборка с отсечением — то же, что полный перебор (200 пулов на вариант)', () => {
    for (const [c, vn] of cases) {
      const ch = char(c), v = variantsOf(idx, ch).find((x) => x.name === vn)!;
      for (let i = 0; i < 200; i++) {
        const pieces = Array.from({ length: 3 + Math.floor(rnd() * 9) }, () => {
          const lit: Subs = {};
          for (let k = 0; k < 4; k++) lit[pick(STATS)] = 1 + Math.floor(rnd() * 6);
          return P(pick(['helmet', 'armor', 'gloves', 'shoes'] as ArmorSlot[]), pick(SETS), lit, pick([null, 0, 4] as (Bt | null)[]));
        });
        const es = entriesFor(ctx, ch, v, pieces);
        const a = assembleReach(ctx, ch, v, es).reach, z = assembleReach(ctx, ch, v, es, { prune: false }).reach;
        expect([a.progress, a.hard, a.live, a.soft, a.filled]).toEqual([z.progress, z.hard, z.live, z.soft, z.filled]);
        expect(a.total).toBeCloseTo(z.total, 9);
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

  it('только оружие: без отметок — все билды, кому оно подходит; с «Собираю» — только отмеченный (и «По статам»)', () => {
    const w = [W(caren.builds[0].weapons[0].key, GOOD)];
    expect(inPlay(w)).toEqual(['#stats', 'Speed', 'Pen', 'Def', 'Speed/Immu', 'Def/Immu']);
    expect(inPlay(w, { marks: { [buildKey(caren.id, 'Def')]: 'want' } })).toEqual(['#stats', 'Def']);
  });

  it('«Не собираю» убирает вариант, даже собранный; примерка собирается и пустой', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map(sp);
    expect(inPlay(four, { marks: { [buildKey(caren.id, 'Speed/Immu')]: 'skip' } })).toEqual(['Speed']);
    expect(inPlay(four, { tryOn: buildKey(caren.id, 'Pen') })).toEqual(['Speed', 'Pen', 'Speed/Immu']);
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
});

// Р1: «собрана часть» и «ближе всех» — по тому, что можно собрать из пула; раскладка остаётся честной
describe('«собираешь» по тому, что можно собрать из пула (Р1)', () => {
  const HELM: Subs = { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }, GLOVES: Subs = { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 };
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

  it('одна Pen уже на T4 (броня) — отметить хватает одной вещи: совет называет только её, не ту, что на T4', () => {
    const { pen, atk } = lunaPool();
    const pcs = pen.map((p) => (p.slot === 'armor' ? { ...p, bt: 4 as Bt } : p));
    const r = outcomeFor(ctx, poolView(ctx, store(luna, [...pcs, ...atk])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r).toMatchObject({ kind: 'breaks', fix: { mark: true } });
    expect(r.fix!.slots).toHaveLength(1);
    expect(r.fix!.slots).not.toContain('armor');
  });

  // совет «отметить» — только для сета-эффекта ×4 (Р2); сет-стат ×2 только на T4 (Speed) — прежний совет «найди ещё»
  it('Caren · Speed/Immu: Immunity-перчатки ломают Speed ×2 на T4 — прежний совет «ещё Speed-вещь на T4: шлем или броня», не «отметить»', () => {
    const pcs = [
      P('helmet', 'Immunity', JUNK), P('armor', 'Immunity', JUNK), P('gloves', 'Speed', { 'DEF%': 2, CHC: 2 }, 4), P('shoes', 'Speed', JUNK, 4),
      P('helmet', 'Speed', JUNK), P('armor', 'Speed', JUNK, 0),
    ];
    const v = variant('Caren', 'Speed/Immu');
    const x: ItemInput = { slot: 'gloves', grade: 'unique', setId: set('Immunity'), itemKey: null, main: null, subs: { 'DEF%': 2, CHC: 2, CHD: 1 } };
    const r = outcomeFor(ctx, poolView(ctx, store(caren, pcs)), caren.id, x)!.rows.find((y) => y.v.key === v.key)!;
    expect(r).toMatchObject({ kind: 'breaks', broken: set('Speed'), fix: { set: set('Speed'), slots: ['helmet', 'armor'], t4: true, mark: false } });
  });

  it('две Pen уже на T4 (шлем и броня) — совета «отметь» нет: Attack-шлем вытеснил бы Pen на T4', () => {
    const { pen, atk } = lunaPool();
    const t4 = pen.map((p, i) => (i < 2 ? { ...p, bt: 4 as Bt } : p));
    const r = outcomeFor(ctx, poolView(ctx, store(luna, [...t4, ...atk])), luna.id, HELMET)!.rows.find((x) => x.v.key === pma.key)!;
    expect(r.fix?.mark ?? false).toBe(false);
  });
});

describe('«По статам»', () => {
  // Р12 и Р14 — одно «начат»: «По статам» живой ровно тогда, когда ни один настоящий вариант не начат
  it('живой (hasStatBuild) ⇔ ни один вариант не начат (started): 10 персонажей × 60 пулов, с оружием и чужими сетами', () => {
    const rnd = (() => { let x = 777; return () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31; })();
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const who = ['Caren', 'Anarky', 'Demiurge Luna', 'Eternal', 'Core Fusion Eternal', 'Demiurge Stella', 'Heatwave Cop Delta', 'Core Fusion Lisha', 'Iota', 'Demiurge Drakhan'];
    const off: string[] = [];
    for (const name of who) {
      const ch = char(name);
      const own = [...new Set(variantsOf(idx, ch).flatMap((v) => v.b.sets[0].map((p) => p.set)))];
      for (let i = 0; i < 60; i++) {
        const pieces = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => {
          if (rnd() < 0.2) return W(pick(ch.builds[0].weapons).key, { CHC: 2 });
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

  it('вещь Speed/Immu-сборки не ненужная, хоть в Speed её место занято', () => {
    const immu = P('helmet', 'Immunity', JUNK), immu2 = P('armor', 'Immunity', JUNK), sp = P('gloves', 'Speed', JUNK), sp2 = P('shoes', 'Speed', JUNK);
    const st: PoolStore = { pieces: Object.fromEntries([immu, immu2, sp, sp2].map((p) => [p.id, p])), pools: { [caren.id]: [immu.id, immu2.id, sp.id, sp2.id] } };
    expect(poolView(ctx, st).of(caren.id)!.unused).toEqual([]);
  });
});

// Случаи владельца (прогон 1.4), вещи — свои, не из его кода: персонаж одет не в сеты своих билдов
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
// брони из сетов связок; потом — тихая строка, «Надеть» в него только при явном выборе (поиск по имени, примерка).
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

    it('в примерке Speed сама вещь в Speed не встаёт', () => {
      const speed = buildKey(drakhan.id, 'Speed');
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR, speed), drakhan.id, HLMW, speed, EXPLICIT)).toBeNull();
    });

    it('в примерке Speed «По статам» подходит — надеть можно', () => {
      const speed = buildKey(drakhan.id, 'Speed');
      expect(charVs(ctx, poolView(ctx, EMPTY_GEAR, speed), drakhan.id, HLMW, statVariant(drakhan)!.key, EXPLICIT)?.useful).toBe(true);
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
