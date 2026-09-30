// Исход вещи с формы на пуле (logic/pool outcomeFor) — случаи прежнего сравнения с надетым (logic/vs compare):
// пустой слот, лучше, хуже, та же вещь, 2+2, временная против рекомендованной, T4. Пример владельца: у Caren в
// цепочке пусто 3-е место — новая его закрывает, теряя 4-е. Ожидания те же, кроме помеченных «иначе»: новые правила
// владельца (GEARPOOL). Пара вещей в одном слоте (against, vsFigure) — внизу.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset, SlotId } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { buildKey, type Bt, type Piece } from '../src/logic/gear';
import { holds, outcomeFor, poolView } from '../src/logic/pool';
import type { Subs } from '../src/logic/subs';
import { against, vsFigure } from '../src/logic/vs';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%
let seq = 0;

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
      expect(r).toMatchObject({ kind: 'breaks', broken: set('Immunity'), used: false, fix: { set: set('Immunity'), slots: ['gloves', 'shoes'], t4: false, mark: false } });
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

    it('встала, а вытесненная ничего не стоила — «полезных нет», а не «×2609» (вещь в её слоте пуста)', () => {
      // Speed-ботинки в пустой слот: сборка Speed меняет пустой по цепочке Speed-шлем на сильный Attack-шлем
      const JUNK = { RES: 1, EFF: 1, HP: 1, ATK: 1 };
      const pieces = [rec(armor('helmet', 'Speed', JUNK)), rec(armor('helmet', 'Attack', { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 })),
        rec(armor('armor', 'Speed', JUNK)), rec(armor('gloves', 'Speed', JUNK))];
      const r = row(pieces, armor('shoes', 'Speed', { CHC: 3, CHD: 2, 'DEF%': 1, HP: 1 }), 'Speed')!;
      expect({ used: r.used, worn: r.worn, displaced: r.displaced.map((e) => e.slot), lostEmpty: r.lostEmpty }).toEqual({ used: true, worn: null, displaced: ['helmet'], lostEmpty: true });
      expect(vsFigure({ delta: r.delta, wornEmpty: r.lostEmpty })).toEqual({ kind: 'empty' });
    });

    it('вытесненная чего-то стоила — процент, не «полезных нет»', () => {
      const r = row([rec(armor('helmet', 'Speed', { SPD: 1, RES: 2, EFF: 2, HP: 1 }))], armor('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }), 'Speed')!;
      expect({ used: r.used, lostEmpty: r.lostEmpty }).toEqual({ used: true, lostEmpty: false });
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
    // Speed/Immu уже собирается (Speed-шлем): Immunity ему ближе; Def/Immu она начинает (Р14; было — нет: он не был
    // ближе всех)
    expect(o.starts.map((v) => v.name)).toEqual(['Def/Immu']);
    expect(o.rows.find((r) => r.v.name === 'Speed/Immu')).toMatchObject({ kind: 'closer', entering: false });
    const w = [rec(weapon('unique', caren.builds[0].weapons[0].key, { CHC: 1 }) as never)];
    const o2 = out(w, armor('armor', 'Immunity', { CHC: 1 }), caren.id, { [buildKey(caren.id, 'Speed')]: 'want' });
    expect(o2.starts.map((v) => v.name).sort()).toEqual(['Def/Immu', 'Speed/Immu']);
    expect(o2.useful).toBe(true);
  });
});


describe('пара вещей в одном слоте (against)', () => {
  const armor = (s: string, subs: Subs) => ({ slot: 'helmet' as const, grade: 'unique' as const, setId: set(s), itemKey: null, main: null, subs });
  const worn = (subs: Subs, lit: Subs, bt: Bt | null = 4): Piece => ({ id: 'w', slot: 'helmet', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, yellow: subs, lit, bt, at: '' });

  it('3-е место важнее 4-го: +CHD (3-е), −SPD (4-е), ~+25%', () => {
    const p = against(ctx, caren, caren.builds[0], armor('Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 }), worn({ 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 }));
    expect(p).toMatchObject({ kind: 'up', gained: [{ key: 'CHD', place: 3 }], lost: [{ key: 'SPD', place: 4 }] });
    expect(p.delta).toBeCloseTo(0.247, 2);
  });

  it('«полезных нет» и «×N»', () => {
    expect(vsFigure({ delta: null, wornEmpty: true })).toEqual({ kind: 'empty' });
    expect(vsFigure({ delta: 2.5, wornEmpty: false })).toEqual({ kind: 'times', n: 4 });
    expect(vsFigure({ delta: 0.25, wornEmpty: false })).toEqual({ kind: 'pct', n: 25 });
  });
});
