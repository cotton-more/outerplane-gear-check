// Ролл с учётом Reforge (плашка «Стоит Reforge») и блок «Прокачка»: что вкладывать в вещь после вердикта.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset, Grade } from '../src/data/types';
import { ru } from '../src/i18n/ru';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { reforgeSegments, rollInfo, type Row } from '../src/logic/score';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = (fodder = false) => makeCtx(idx, { rosterOnly: false, fodder, stage: 'grow', lv120: false, quirks: true }, new Set());
const row = (good: number, yellow: number) => ({ good, yellow }) as Row;
const P = ru.plan;

describe('ролл: жёлтые плюс оранжевые, которые Reforge в среднем отдаст полезным', () => {
  it('Reforge добавляет 6 сегментов Legendary и 5 Epic — первая попытка Epic уходит на 4-й сабстат', () => {
    expect([reforgeSegments('unique'), reforgeSegments('rare')]).toEqual([6, 5]);
  });

  it('полезным достаётся доля попыток по доле полезных сабстатов из четырёх', () => {
    expect(rollInfo(ru, row(3, 7), 4, 'unique')!.orange).toBe(4.5);
    expect(rollInfo(ru, row(2, 7), 4, 'unique')!.orange).toBe(3);
  });

  it('Legendary: 3 полезных из 4 с 7 жёлтыми — высокий, с 6 — средний', () => {
    expect(rollInfo(ru, row(3, 7), 4, 'unique')!.level).toBe('high');
    expect(rollInfo(ru, row(3, 6), 4, 'unique')!.level).toBe('mid');
  });

  it('Legendary: все 4 полезны — высокий даже при 6 жёлтых: все 6 Reforge уйдут в дело', () => {
    expect(rollInfo(ru, row(4, 6), 4, 'unique')!.level).toBe('high');
  });

  it('один полезный стат не делает ролл высоким, сколько бы на нём ни было жёлтых', () => {
    expect(rollInfo(ru, row(1, 3), 4, 'unique')!.level).toBe('low');
  });

  it('Epic: 3 полезных из 3 с 5 жёлтыми — высокий, с 4 — средний', () => {
    expect(rollInfo(ru, row(3, 5), 3, 'rare')!.level).toBe('high');
    expect(rollInfo(ru, row(3, 4), 3, 'rare')!.level).toBe('mid');
  });
});

// Speed Set — самый частый; SPD на любой ступени полезен, поэтому «Оставить» получить легко
const speed = D.sets.find((s) => s.short === 'Speed')!;
const helmet = (grade: Grade, subs: Record<string, number>, fodder = false) =>
  evaluate(ctx(fodder), { slot: 'helmet', grade, setId: speed.id, itemKey: null, main: null, subs });

describe('«Прокачка»: броня', () => {
  it('Epic «Оставить» с хорошим роллом: Enhance, Reforge в первую очередь, Breakthrough такой же Epic-вещью, без Transistone', () => {
    const r = helmet('rare', { SPD: 3, CHC: 2, CHD: 2 });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.reforgeFirst(true), P.btArmorEpic('Helmet', 'Speed'), P.noTransistone]);
  });

  it('Legendary «Оставить»: Breakthrough фоддером того же сета и слота, Transistone не запрещён', () => {
    const r = helmet('unique', { SPD: 3, CHC: 3, CHD: 3, 'ATK%': 3 });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.reforgeFirst(false), P.btArmorLegend('Helmet', 'Speed')]);
  });

  it('фоддер: не прокачивать — это ступень Breakthrough для такой же вещи', () => {
    const r = helmet('unique', { RES: 1, 'DEF%': 1, HP: 1, DEF: 1 }, true);
    expect(r.v).toBe('fodder');
    expect(r.plan).toEqual([P.fodderArmor('Helmet', 'Speed')]);
  });

  it('Epic в разбор из сета, который носят: напоминание, что это материал для Epic-«Оставить» того же сета и слота', () => {
    const r = helmet('rare', { RES: 1, 'DEF%': 1, HP: 1 });
    expect(r.v).toBe('junk');
    expect(r.plan).toEqual([P.junkEpicArmor('Helmet', 'Speed')]);
  });

  it('сет без билдов — никакой прокачки и никаких напоминаний', () => {
    const dead = D.sets.find((s) => !s.users)!;
    const r = evaluate(ctx(), { slot: 'helmet', grade: 'rare', setId: dead.id, itemKey: null, main: null, subs: { SPD: 3 } });
    expect([r.v, r.plan]).toEqual(['junk', []]);
  });
});

// первое оружие из билдов, у которого есть и нужный main, и ненужный
const ref = D.chars.flatMap((c) => c.builds.flatMap((b) => b.weapons)).find((w) => {
  const item = idx.ITEM.weapon[w.key];
  return item && w.mains.length && item.mains.some((m) => !w.mains.includes(m));
})!;
const weapon = idx.ITEM.weapon[ref.key];
const wanted = new Set(D.chars.flatMap((c) => c.builds.flatMap((b) => b.weapons.filter((w) => w.key === ref.key).flatMap((w) => w.mains))));

describe('«Прокачка»: оружие', () => {
  it('Legendary с нужной пассивкой и main: Breakthrough до T4 обязателен — растёт пассивка', () => {
    const r = evaluate(ctx(), { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main: ref.mains[0], subs: {} });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.reforgeUnknown, P.btGear(weapon.name)]);
  });

  it('со слабыми сабстатами Reforge — только после реролла', () => {
    const r = evaluate(ctx(), { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main: ref.mains[0], subs: { EFF: 1, RES: 1, 'DMG RED%': 1, DEF: 1 } });
    expect(r.plan[1]).toBe(P.reforgeAfterReroll);
  });

  it('с ненужным main stat — фоддер: копия для Breakthrough экземпляра с нужным main', () => {
    const main = weapon.mains.find((m) => !wanted.has(m))!;
    const r = evaluate(ctx(), { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main, subs: {} });
    expect(r.v).toBe('fodder');
    expect(r.plan).toEqual([P.fodderGear(weapon.name)]);
  });

  it('временная замена: только Enhance — Reforge и Breakthrough не вкладывать', () => {
    const r = evaluate(ctx(), { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { SPD: 3, CHC: 3, CHD: 3 } });
    expect(r.v).toBe('temp');
    expect([r.plan, r.badge]).toEqual([[P.enhance, P.tempNoInvest], '']);
  });
});
