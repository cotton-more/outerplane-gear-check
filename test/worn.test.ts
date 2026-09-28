// Штамп по надетому (logic/worn, этап B3): «Оставить» → «Разобрать», когда всем, кому вещь подходит, уже надето
// не хуже; вещь из билда — «Оставить». Персонаж без записей — как раздетый, считаются только начатые билды.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx, type Ctx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { buildKey, EMPTY_GEAR, equip, updatePiece, type GearStore } from '../src/logic/gear';
import { materialFor, withMaterial } from '../src/logic/material';
import type { ItemInput } from '../src/logic/verdict';
import { compare } from '../src/logic/vs';
import { withWorn } from '../src/logic/worn';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const W = ru.worn;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!; // DEF › CHC › CHD › SPD › DMG UP%; Speed, Pen, Def, …/Immu
const rin = D.chars.find((c) => c.name === 'Rin')!;     // ATK › CHC › CHD › SPD › DMG UP%; Speed, CritDmg, Pen
const ctxOf = (chars: { id: string }[], fodder = true): Ctx =>
  makeCtx(idx, { rosterOnly: true, fodder, stage: 'grow', lv120: false, quirks: true }, new Set(chars.map((c) => c.id)), ru);
const piece = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique', s = 'Speed') => piece('helmet', s, subs, grade);
const on = (st: GearStore, c: { id: string }, build: string, item: ItemInput) => equip(st, buildKey(c.id, build), item).store;
const judge = (ctx: Ctx, item: ItemInput, st: GearStore) => withWorn(ctx, st, item, evaluate(ctx, item, { gamble: false }));

const STRONG = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }); // на Caren · Speed
const EPIC = helmet({ 'DEF%': 2, CHC: 2, CHD: 2 }, 'rare');  // сама по себе «Оставить» для Caren
const onCaren = on(EMPTY_GEAR, caren, 'Speed', STRONG);

describe('все, кому подходит, уже носят не хуже — штамп понижается', () => {
  it('Epic, которую Caren носит лучше, — «Разобрать»: у кого лучше, почему, и без кубика, ролла и значка', () => {
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, EPIC, { gamble: false }).v).toBe('keep');
    const r = judge(ctx, EPIC, onCaren);
    expect(r).toMatchObject({ v: 'junk', worn: 'lower', wornBy: [buildKey(caren.id, 'Speed')], title: 'Разбирай — уже лучше у Caren', badge: '', gamble: null, roll: undefined });
    expect(r.lines.slice(0, 2)).toEqual([W.line, W.stale]);
    // кому и чем она хороша — первая строка прежнего вердикта остаётся
    expect(r.lines[2]).toBe(evaluate(ctx, EPIC, { gamble: false }).lines[0]);
    expect(r.lines).toHaveLength(3);
  });

  it('Legendary — «Фоддер»; не копишь фоддер — броня «Разобрать», как любая слабая Legendary', () => {
    const mid = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 });
    expect(judge(ctxOf([caren]), mid, onCaren)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже лучше у Caren' });
    expect(judge(ctxOf([caren], false), mid, onCaren)).toMatchObject({ v: 'junk', title: 'Разбирай — уже лучше у Caren' });
  });

  it('«на уровне» — тоже не улучшит: «уже не хуже»', () => {
    const worn = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 });
    const same = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 }); // полезные те же, лишний — другой
    const st = on(EMPTY_GEAR, caren, 'Speed', worn);
    expect(compare(ctxOf([caren]), st, caren, caren.builds[0], same)?.kind).toBe('eq');
    expect(judge(ctxOf([caren]), same, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже не хуже у Caren' });
  });

  it('два кандидата, оба собраны и оба носят лучше — называет обоих', () => {
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    const st = on(onCaren, rin, 'Speed', helmet({ 'ATK%': 3, CHC: 3, CHD: 3, SPD: 2 }));
    expect(judge(ctxOf([caren, rin]), both, st).title).toBe('Фоддер — уже лучше у Caren и Rin');
  });

  it('понижает и «Разобрать» у материала: такая же вещь надета не на T4 — «Фоддер» со строкой, для чего', () => {
    const ctx = ctxOf([caren]);
    const worn = helmet({ 'DEF%': 3, CHC: 3, CHD: 3 }, 'rare');
    const r0 = equip(EMPTY_GEAR, buildKey(caren.id, 'Speed'), worn);
    const st = updatePiece(r0.store, r0.piece.id, { bt: 2 });
    const r = withMaterial(idx, ru, judge(ctx, EPIC, st), materialFor(st, EPIC, idx));
    expect(r.v).toBe('fodder');
    expect(r.lines[0]).toMatch(/^\*\*Материал\*\*/);
    expect(r.lines).toContain(W.line);
  });
});

describe('что удерживает штамп', () => {
  it('персонаж без записей — как раздетый: вещь ему пригодится', () => {
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    expect(evaluate(ctxOf([caren, rin]), both, { gamble: false }).v).toBe('keep');
    const r = judge(ctxOf([caren, rin]), both, onCaren);
    expect(r.v).toBe('keep');
    expect(r.worn).toBeUndefined();
  });

  it('пустой слот в начатом билде держит вещь', () => {
    const st = on(EMPTY_GEAR, caren, 'Speed', piece('shoes', 'Speed', { CHC: 3, CHD: 3, SPD: 2, 'DEF%': 2 }));
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  it('надетая не по билду — как пустой слот', () => {
    const st = on(EMPTY_GEAR, caren, 'Speed', helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, 'unique', 'Penetration'));
    expect(compare(ctxOf([caren]), st, caren, caren.builds[0], EPIC)?.kind).toBe('down');
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  it('новая лучше надетой — «Оставить»', () => {
    const st = on(EMPTY_GEAR, caren, 'Speed', helmet({ 'DEF%': 1, HP: 1, RES: 1 }, 'rare'));
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  it('считаются только начатые билды: Caren собрана в Pen — Speed-шлем её не держит; не собирает никто — не понижаем', () => {
    const inPen = on(EMPTY_GEAR, caren, 'Pen', helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, 'unique', 'Penetration'));
    expect(judge(ctxOf([caren]), EPIC, inPen).v).toBe('keep');
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    const st = on(inPen, rin, 'Speed', helmet({ 'ATK%': 3, CHC: 3, CHD: 3, SPD: 2 }));
    expect(judge(ctxOf([caren, rin]), both, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже лучше у Rin' });
  });

  it('«Спорно» не понижаем: вещь хороша для тех, кого нет в ростере', () => {
    const atk = helmet({ 'ATK%': 3, ATK: 2, 'HP%': 2, EFF: 1 });
    const res = evaluate(ctxOf([caren]), atk, { gamble: false });
    expect(res.v).toBe('maybe');
    expect(withWorn(ctxOf([caren]), onCaren, atk, res)).toBe(res);
  });

  describe('2+2 ломается', () => {
    // Caren · Speed/Immu: шлем и броня — Speed, перчатки и Boots — Immunity; новый шлем Immunity ломает Speed ×2
    const st = [
      piece('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }), piece('armor', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
      piece('gloves', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }), piece('shoes', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
    ].reduce((s, x) => on(s, caren, 'Speed/Immu', x), EMPTY_GEAR);
    const immu = caren.builds.find((b) => b.name === 'Speed/Immu')!;

    it('и по сегментам новая не лучше — не улучшит: понижаем', () => {
      const weak = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 }, 'unique', 'Immunity');
      expect(compare(ctxOf([caren]), st, caren, immu, weak)?.kind).toBe('breaks');
      expect(judge(ctxOf([caren]), weak, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже не хуже у Caren' });
    });

    it('а по сегментам новая лучше — не понижаем: может, стоит переставить сеты', () => {
      const strong = helmet({ 'DEF%': 4, CHC: 4, CHD: 3, SPD: 3 }, 'unique', 'Immunity');
      const vs = compare(ctxOf([caren]), st, caren, immu, strong)!;
      expect(vs.kind).toBe('breaks');
      expect(vs.delta!).toBeGreaterThanOrEqual(0.1);
      expect(judge(ctxOf([caren]), strong, st).v).toBe('keep');
    });
  });
});

describe('вещь уже в билде — «Оставить»', () => {
  it('«Разобрать» у вещи из билда — «Оставить»: где она, и без кубика и «Прокачки»', () => {
    const junk = helmet({ HP: 1, RES: 1, EFF: 1 }, 'rare');
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, junk, { gamble: false }).v).toBe('junk');
    const r = judge(ctx, junk, on(EMPTY_GEAR, caren, 'Speed', junk));
    expect(r).toMatchObject({ v: 'keep', worn: 'home', title: 'Оставляй — она уже в билде Caren · Speed', lines: [W.kept('Caren · Speed')], plan: [], gamble: null, badge: '' });
  });

  it('«Фоддер» — тоже; в нескольких билдах — первый и «и ещё N»', () => {
    const fod = helmet({ HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 });
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, fod, { gamble: false }).v).toBe('fodder');
    const st = on(on(EMPTY_GEAR, caren, 'Speed', fod), rin, 'Speed', fod);
    expect(judge(ctx, fod, st).title).toBe('Оставляй — она уже в билде Caren · Speed и ещё 1');
  });

  it('«Оставить» у надетой не трогаем — и не понижаем', () => {
    const res = evaluate(ctxOf([caren]), STRONG, { gamble: false });
    expect(res.v).toBe('keep');
    expect(withWorn(ctxOf([caren]), onCaren, STRONG, res)).toBe(res);
  });
});

it('без записей экипировки вердикт тот же объект', () => {
  const res = evaluate(ctxOf([caren]), EPIC, { gamble: false });
  expect(withWorn(ctxOf([caren]), EMPTY_GEAR, EPIC, res)).toBe(res);
});
