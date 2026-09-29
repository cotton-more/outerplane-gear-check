// Пул экипировки (logic/pool, GEARPOOL C1): сборка варианта из вещей персонажа — точная (сверка с перебором без
// отсечения), цель владельца (сет-эффект держится, сет-стат ломается только ради итога), «собираешь», «По статам»,
// ненужные вещи.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { ArmorSlot, Dataset, SlotId } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { buildKey, type Bt, type Piece } from '../src/logic/gear';
import { assemble, entriesFor, holds, isStats, outcomeFor, play, poolView, statVariant, type Assembly, type PoolStore } from '../src/logic/pool';
import type { Subs } from '../src/logic/subs';
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

  it('GEARPOOL.md: один Speed-шлем — Speed и Speed/Immu; четыре Speed — и Speed/Immu (Speed ×2 собран), Def/Immu — нет', () => {
    expect(inPlay([sp('helmet')])).toEqual(['Speed', 'Speed/Immu']);
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map(sp);
    expect(inPlay(four)).toEqual(['Speed', 'Speed/Immu']);
    // одна Immunity — Def/Immu не собирается; вторая — Immunity ×2 собрана, собирается
    const immu = P('helmet', 'Immunity', JUNK);
    expect(inPlay([...four, immu])).toEqual(['Speed', 'Speed/Immu']);
    expect(inPlay([...four, immu, P('armor', 'Immunity', JUNK)])).toEqual(['Speed', 'Speed/Immu', 'Def/Immu']);
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
    // вещь из сета билда — и «По статам» больше нет
    expect(play(ctx, eternal, [...atk, P('helmet', 'Speed', JUNK)]).stat).toBeNull();
  });
});

describe('«По статам»', () => {
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

// --------------------------------------------------------------------------- исходы

// Повтор каждого случая test/vs.test.ts на пуле: вещи тех же записей — в пуле Caren (или кого там), исход — строка
// нужного варианта. Ожидания те же, кроме помеченных «иначе»: там новое правило владельца
describe('исход вещи с формы: повтор vs.test', () => {
  const armor = (slot: SlotId, s: string, subs: Subs, grade: Piece['grade'] = 'unique') =>
    ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
  const NEW = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
  // записанная вещь: yellow — из оценки, lit — горит всего
  const rec = (x: ReturnType<typeof armor> | { slot: SlotId; grade: Piece['grade']; setId: null; itemKey: string; main: string; subs: Subs }, lit: Subs = x.subs, bt: Bt | null = null): Piece =>
    ({ id: 'p' + ++seq, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main, yellow: x.subs, lit, bt, at: '' });
  const view = (pieces: Piece[], who = caren.id, marks = {}) =>
    poolView(ctx, { pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [who]: pieces.map((p) => p.id) }, marks });
  const out = (pieces: Piece[], x: Parameters<typeof outcomeFor>[3], who = caren.id, marks = {}) => outcomeFor(ctx, view(pieces, who, marks), who, x)!;
  const row = (pieces: Piece[], x: Parameters<typeof outcomeFor>[3], vname: string, who = caren.id, marks = {}) =>
    out(pieces, x, who, marks).rows.find((r) => r.v.name === vname);
  const helmetT4 = (lit: Subs, yellow: Subs) => rec(armor('helmet', 'Speed', yellow), lit, 4);
  const weapon = (grade: Piece['grade'], itemKey: string | null, subs: Subs, main = 'DEF%') => ({ slot: 'weapon' as const, grade, setId: null, itemKey, main, subs });

  describe('бонус сета только на T4', () => {
    const speedHelm = (bt: Bt | null) => rec(armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }), { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, bt);

    it('Speed-шлем на T4 и второй Speed на T4 (бонус ×2 есть): новая лучше по сегментам — «на уровне из-за T4»', () => {
      const r = row([speedHelm(4), rec(armor('gloves', 'Speed', { CHC: 1 }), { CHC: 1 }, 4)], NEW, 'Speed/Immu')!;
      expect(r.pair!.delta!).toBeGreaterThan(0.1);
      expect(r).toMatchObject({ kind: 'capped', used: false, t4: { set: set('Speed'), n: 2 } });
      expect(r.lostBonus.map((b) => [b.n, b.tier])).toEqual([[2, 'T4']]);
    });

    it('иначе: Speed на T4 один — бонуса ×2 ещё нет, терять нечего: «лучше» (было «на уровне»)', () => {
      expect(row([speedHelm(4)], NEW, 'Speed/Immu')).toMatchObject({ kind: 'up', used: true, t4: { n: 2 } });
    });

    it('надетая не на T4 — «лучше», пометка T4 есть', () => {
      expect(row([speedHelm(2)], NEW, 'Speed/Immu')).toMatchObject({ kind: 'up', t4: { n: 2 } });
    });

    describe('Heatwave Cop Delta · DPS: варианты вместо «связки, которую собирают»', () => {
      const delta = char('Heatwave Cop Delta');
      const wear = (sets: Record<string, string>, bts: Partial<Record<string, Bt>>) =>
        Object.entries(sets).map(([slot, s]) => rec(armor(slot as SlotId, s, { HP: 1, DEF: 1, RES: 1, EFF: 1 }), undefined, bts[slot] ?? null));
      const pen = armor('helmet', 'Penetration', { 'ATK%': 3, CHC: 2, CHD: 2, SPD: 1 });

      it('четыре Pen — в Pen ×4 «лучше», пометки нет', () => {
        const r = row(wear({ helmet: 'Penetration', armor: 'Penetration', gloves: 'Penetration', shoes: 'Penetration' }, { helmet: 4 }), pen, 'DPS · Penetration ×4', delta.id)!;
        expect(r).toMatchObject({ kind: 'up', t4: null });
      });

      it('два Pen на T4 и два Attack — в Pen ×2 + Atk ×2 «на уровне из-за T4» (иначе: партнёр тоже на T4 — бонус есть)', () => {
        const pieces = wear({ helmet: 'Penetration', armor: 'Penetration', gloves: 'Attack', shoes: 'Attack' }, { helmet: 4, armor: 4 });
        expect(row(pieces, pen, 'DPS · Penetration ×2 + Attack ×2', delta.id)).toMatchObject({ kind: 'capped', t4: { set: set('Penetration'), n: 2 } });
      });

      it('пусто — вариант Pen ×4 без пометки, Pen ×2 + Atk ×2 — с ней; с одной вещью начнут собираться', () => {
        const o = out([], pen, delta.id);
        expect(o.rows.find((r) => r.v.name === 'DPS · Penetration ×4')).toMatchObject({ kind: 'closer', t4: null, entering: true });
        expect(o.rows.find((r) => r.v.name === 'DPS · Penetration ×2 + Attack ×2')?.t4).toMatchObject({ n: 2 });
        expect(o.useful).toBe(true);
      });
    });

    it('Speed ×4 бонус даёт и на T0 — пометки нет', () => {
      expect(row([helmetT4({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 })], NEW, 'Speed')?.t4).toBeNull();
    });
  });

  describe('сравнение с тем, что в сборке', () => {
    it('3-е место важнее 4-го: закрывает CHD, теряет SPD — лучше на ~25%', () => {
      const r = row([helmetT4({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 })], NEW, 'Speed')!;
      expect(r.kind).toBe('up');
      expect(r.delta).toBeCloseTo(0.247, 2);
      expect(r.pair).toMatchObject({ gained: [{ key: 'CHD', place: 3 }], lost: [{ key: 'SPD', place: 4 }] });
    });

    it('против хорошо прокачанной — хуже', () => {
      expect(row([helmetT4({ 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }, { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 })], NEW, 'Speed')).toMatchObject({ kind: 'down', used: false });
    });

    it('«хуже» без потерянных мест — у той больше сегментов DEF% (6 против 3,5)', () => {
      const r = row([helmetT4({ 'DEF%': 6, CHC: 4, CHD: 4, HP: 2 }, { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 })], NEW, 'Speed')!;
      expect(r).toMatchObject({ kind: 'down', pair: { lost: [], ahead: { key: 'DEF%', worn: 6, next: 3.5 } } });
    });

    it('иначе: пустой слот вещью сета — «сет 2 из 4» (ближе), лишней вещью сета — «пустой слот»; такая же — «уже есть»', () => {
      const body = rec(armor('armor', 'Speed', { CHC: 2 }));
      expect(row([body], NEW, 'Speed')).toMatchObject({ kind: 'closer', used: true });
      const immu = [rec(armor('armor', 'Immunity', { CHC: 1 })), rec(armor('gloves', 'Speed', { CHC: 1 })), rec(armor('shoes', 'Speed', { CHC: 1 }))];
      expect(row(immu, NEW, 'Speed/Immu')).toMatchObject({ kind: 'fill', used: true }); // Speed ×2 уже собран — сверх него
      const o = out([body, rec(NEW)], NEW);
      expect(o.worn).toBeTruthy();
      expect(o).toMatchObject({ rows: [], useful: false });
    });

    it('иначе: не тот сет, а лучше по сегментам — «только статы» (было: сравнения нет); хуже — исхода нет', () => {
      const pieces = [helmetT4({ CHC: 2 }, { CHC: 2 })];
      expect(row(pieces, armor('helmet', 'Attack', { CHC: 3 }), 'Speed')).toMatchObject({ kind: 'stats', used: false });
      expect(row(pieces, armor('helmet', 'Attack', { CHC: 1 }), 'Speed')).toBeUndefined();
    });

    it('2+2: Speed-шлем вместо Immunity ломает Immunity ×2 — и где вторая Immunity это исправит', () => {
      const pieces = [['helmet', 'Immunity'], ['armor', 'Immunity'], ['gloves', 'Speed'], ['shoes', 'Speed']].map(([slot, s]) => rec(armor(slot as SlotId, s, { CHC: 1 })));
      const r = row(pieces, NEW, 'Speed/Immu')!;
      expect(r).toMatchObject({ kind: 'breaks', broken: set('Immunity'), used: false, fix: { set: set('Immunity'), slots: ['gloves', 'shoes'], t4: false } });
      // иначе: Immunity-ботинки вместо Speed — Speed ×2 распадётся, но на T0 у него бонуса нет: итог выгоднее — «лучше»
      expect(row(pieces, armor('shoes', 'Immunity', { CHC: 2 }), 'Speed/Immu')).toMatchObject({ kind: 'up', used: true, broken: set('Speed') });
    });

    const embrace = D.weapons.find((w) => w.name === 'Snow-white Embrace' && w.star === 6)!;

    it('оружие: временная против рекомендованной — хуже, как бы ни были хороши сабстаты', () => {
      const r = row([rec(weapon('unique', embrace.key, { HP: 1 }) as never)], weapon('rare', null, { CHC: 3, CHD: 3, SPD: 3 }), 'Speed')!;
      expect(r).toMatchObject({ kind: 'down', used: false, pair: { why: 'stopgap' } });
    });

    it('оружие: рекомендованная против временной — лучше словом, хотя по сегментам хуже', () => {
      const r = row([rec(weapon('rare', null, { CHC: 3, CHD: 3, SPD: 3 }) as never)], weapon('unique', embrace.key, { HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 }), 'Speed')!;
      expect(r).toMatchObject({ kind: 'up', used: true, pair: { why: 'rec' } });
      expect(r.delta!).toBeLessThan(0);
    });

    it('Epic с 4 сабстатами, тот же ролл — на уровне, ровно 0 в обе стороны', () => {
      const a = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 }, 'rare');
      const z = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, EFF: 1 }, 'rare');
      expect(row([rec(a)], z, 'Speed')).toMatchObject({ kind: 'eq', delta: 0 });
      expect(row([rec(z)], a, 'Speed')).toMatchObject({ kind: 'eq', delta: 0 });
    });

    it('Legendary из списка с другим main — временная в «Развитии»; в «Эндгейме» исхода нет', () => {
      const eris = char('Eris');
      const gw = D.weapons.find((w) => w.name === "Gorgon's Wrath [Striker]" && w.star === 6)!;
      const item = weapon('unique', gw.key, { CHC: 2, CHD: 2, SPD: 2, 'ATK%': 1 }, 'HP%');
      const pieces = [rec({ ...item, grade: 'rare', itemKey: null, subs: { HP: 1 } } as never)];
      expect(row(pieces, item, 'Attack', eris.id)).toMatchObject({ kind: 'up' });
      const end = { ...ctx, settings: { ...ctx.settings, stage: 'end' as const } };
      const o = outcomeFor(end, poolView(end, { pieces: { [pieces[0].id]: pieces[0] }, pools: { [eris.id]: [pieces[0].id] } }), eris.id, item)!;
      expect(o.rows.find((r) => r.v.name === 'Attack')).toBeUndefined();
    });

    it('у той полезных нет — «полезных нет»; больше +200% — «×N»', () => {
      const junk = row([rec(armor('helmet', 'Speed', { RES: 2, EFF: 2, HP: 1, 'DMG RED%': 1 }))], NEW, 'Speed')!;
      expect(junk.pair?.wornEmpty).toBe(true);
      const weak = row([rec(armor('helmet', 'Speed', { SPD: 1, RES: 2, EFF: 2, HP: 1 }))], armor('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }), 'Speed')!;
      expect(weak.delta!).toBeGreaterThan(2);
      expect(weak.delta).toBeCloseTo(weak.pair!.delta!, 9);
    });

    it('иначе: один Speed-шлем у Caren — исходы и в Speed, и в Speed/Immu (вещи у персонажа, не у билда)', () => {
      const o = out([helmetT4({ 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 })], NEW);
      expect(o.rows.map((r) => [r.v.name, r.kind])).toEqual([['Speed', 'up'], ['Speed/Immu', 'up']]);
      expect(o.useful).toBe(true);
    });

    it('материал: та же вещь не на T4 — материал её Breakthrough; на T4 — нет; другого грейда — нет', () => {
      const p = rec(armor('helmet', 'Speed', { SPD: 1 }), undefined, 2);
      expect(row([p], NEW, 'Speed')?.pair?.material).toBe(true);
      expect(row([{ ...p, bt: 4 }], NEW, 'Speed')?.pair?.material).toBe(false);
      expect(row([rec(armor('helmet', 'Speed', { SPD: 1 }, 'rare'), undefined, 2)], NEW, 'Speed')?.pair?.material).toBe(false);
    });

    it('Reforge впереди: Epic с 3 — 5 на три, Legendary 6 на четыре', () => {
      const r = row([rec(armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 }))], armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2 }, 'rare'), 'Speed')!;
      expect(r.delta!).toBeCloseTo((2 + 5 / 4 - (2 + 6 / 4)) / (2 + 6 / 4), 6);
    });

    it('больше 6 сегментов не бывает', () => {
      const r = row([helmetT4({ 'DEF%': 6, CHC: 2, CHD: 3, HP: 1 }, { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 })], NEW, 'Speed')!;
      expect(r.pair?.ahead).toMatchObject({ key: 'DEF%', worn: 6 });
    });

    it('flat DEF у Caren засчитывается слабее DEF%', () => {
      const base = rec(armor('helmet', 'Speed', { RES: 1, EFF: 1, HP: 1, CHC: 1 }));
      const pct = row([base], armor('helmet', 'Speed', { 'DEF%': 2, RES: 1, EFF: 1, CHC: 1 }), 'Speed')!;
      const flat = row([base], armor('helmet', 'Speed', { DEF: 2, RES: 1, EFF: 1, CHC: 1 }), 'Speed')!;
      expect(flat.delta!).toBeLessThan(pct.delta!);
    });

    it('оружие: оба рекомендованные, пассивки разные — пометка «другая пассивка», держит', () => {
      const [a, z] = caren.builds[0].weapons;
      const r = row([rec(weapon('unique', a.key, { CHC: 1 }) as never)], weapon('unique', z.key, { CHC: 2 }), 'Speed')!;
      expect(r.pair).toMatchObject({ passive: true, why: null });
    });
  });

  describe('держит штамп', () => {
    it('держат: соберёт, ближе, пустой слот, лучше, ломает и «на уровне из-за T4»; не держат: только статы, на уровне, хуже', () => {
      const pieces = [['helmet', 'Immunity'], ['armor', 'Immunity'], ['gloves', 'Speed'], ['shoes', 'Speed']].map(([slot, s]) => rec(armor(slot as SlotId, s, { CHC: 1 })));
      expect(holds(row(pieces, NEW, 'Speed/Immu')!)).toBe(true); // ломает, но лучше
      expect(holds(row([rec(armor('armor', 'Speed', { CHC: 2 }))], NEW, 'Speed')!)).toBe(true); // ближе к сборке
      expect(holds(row([helmetT4({ 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }, { 'DEF%': 3, CHC: 3, SPD: 2, EFF: 1 })], NEW, 'Speed')!)).toBe(false); // хуже
      expect(holds(row([helmetT4({ CHC: 2 }, { CHC: 2 })], armor('helmet', 'Attack', { CHC: 3 }), 'Speed')!)).toBe(false); // только статы
      const [a, z] = caren.builds[0].weapons;
      expect(holds(row([rec(weapon('unique', a.key, { CHC: 3, CHD: 3 }) as never)], weapon('unique', z.key, { CHC: 1 }), 'Speed')!)).toBe(true); // другая пассивка
    });

    it('«прочее» в слоте держит только у оружия: броня не из связки в сборке — обычное дело', () => {
      // Speed/Immu: в броне — Attack (не из связки); Speed-броня хуже её — «хуже», не держит
      const pieces = [rec(armor('helmet', 'Immunity', { CHC: 1 })), rec(armor('armor', 'Attack', { 'DEF%': 4, CHC: 4, CHD: 4 })), rec(armor('gloves', 'Speed', { CHC: 1 })), rec(armor('shoes', 'Speed', { CHC: 1 }))];
      const r = row(pieces, armor('armor', 'Speed', { RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 }), 'Speed/Immu')!;
      expect(r.worn?.fit).toBe('no');
      expect(holds(r)).toBe(false);
      // оружие не из списка билда (временная в «Эндгейме» — «прочее»): рекомендованная, хоть и слабее, — держит
      const other = D.weapons.find((w) => w.star === 6 && w.grade === 'unique' && !caren.builds[0].weapons.some((x) => x.key === w.key))!;
      const g = row([rec(weapon('unique', other.key, { 'DEF%': 5, CHC: 5, CHD: 5 }, 'ATK%') as never)], weapon('rare', null, { RES: 1 }), 'Speed')!;
      expect(g.worn?.fit).toBe('no');
      expect(holds(g)).toBe(true);
    });

    it('соберёт: вторая Immunity к Speed ×2 — Speed/Immu собран; ближе: третья Speed', () => {
      const pieces = [rec(armor('helmet', 'Immunity', { CHC: 1 })), rec(armor('gloves', 'Speed', { CHC: 1 })), rec(armor('shoes', 'Speed', { CHC: 1 }))];
      expect(row(pieces, armor('armor', 'Immunity', { CHC: 1 }), 'Speed/Immu')).toMatchObject({ kind: 'completes', used: true });
      expect(row(pieces, armor('armor', 'Speed', { CHC: 1 }), 'Speed')).toMatchObject({ kind: 'closer' });
    });
  });

  it('начнёт: у Caren только Speed; Immunity-вещь начнёт Speed/Immu и Def/Immu, в Speed она — «только статы» или ничего', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).map((s) => rec(armor(s, 'Speed', { CHC: 1 })));
    const o = out(four.slice(0, 1), armor('armor', 'Immunity', { CHC: 1 }));
    expect(o.starts.map((v) => v.name)).toEqual([]); // Speed/Immu уже собирается (Speed-шлем): Immunity ему ближе
    expect(o.rows.find((r) => r.v.name === 'Speed/Immu')).toMatchObject({ kind: 'closer', entering: false });
    const w = [rec(weapon('unique', caren.builds[0].weapons[0].key, { CHC: 1 }) as never)];
    const o2 = out(w, armor('armor', 'Immunity', { CHC: 1 }), caren.id, { [buildKey(caren.id, 'Speed')]: 'want' });
    expect(o2.starts.map((v) => v.name).sort()).toEqual(['Def/Immu', 'Speed/Immu']);
    expect(o2.useful).toBe(true);
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
