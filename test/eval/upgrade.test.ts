// Блок «Прокачка»: что вкладывать в вещь после вердикта. Прогноза Reforge нет (решение владельца 2026-10-01): ни
// кубика, ни «Стоит Reforge», ни строки «Ролл», ни советов, когда делать Reforge — вердикт по вещи как есть;
// бейджа «Топ-ролл» тоже нет.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, Grade } from '@/game/data/types';
import { ru } from '@/i18n/ru';
import { makeCtx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const P = ru.plan;

// Speed Set — самый частый; SPD на любой ступени полезен, поэтому «Оставить» получить легко
const speed = D.sets.find((s) => s.short === 'Speed')!;
const helmet = (grade: Grade, subs: Record<string, number>) =>
  evaluate(ctx, { slot: 'helmet', grade, setId: speed.id, itemKey: null, main: null, subs });

describe('«Прокачка»: броня', () => {
  it('Epic «Оставить»: Enhance, Breakthrough такой же Epic-вещью, без Transistone — строки Reforge нет', () => {
    const r = helmet('rare', { SPD: 3, CHC: 2, CHD: 2 });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.btArmorEpic('Helmet', 'Speed'), P.noTransistone]);
  });

  it('Legendary «Оставить»: Breakthrough фоддером того же сета и слота, Transistone не запрещён — строки Reforge нет', () => {
    const r = helmet('unique', { SPD: 3, CHC: 3, CHD: 3, 'ATK%': 3 });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.btArmorLegend('Helmet', 'Speed')]);
  });

  it('Legendary с SPD 6: «Оставить» без бейджа — ни «Топ-ролл», ни «Стоит Reforge», ни строки «Ролл»', () => {
    const r = helmet('unique', { SPD: 6, CHC: 3, CHD: 3, 'ATK%': 2 });
    expect(r.v).toBe('keep');
    expect(r.lines.some((l) => l.startsWith('Ролл:'))).toBe(false);
  });

  it('слабая Legendary-броня без ростера — «Разобрать», не фоддер (Д6)', () => {
    const r = helmet('unique', { RES: 1, 'DEF%': 1, HP: 1, DEF: 1 });
    expect(r.v).toBe('junk');
    expect(r.plan).toEqual([]);
  });

  it('Epic в разбор из сета, который носят: напоминание, что это материал для Epic-«Оставить» того же сета и слота', () => {
    const r = helmet('rare', { RES: 1, 'DEF%': 1, HP: 1 });
    expect(r.v).toBe('junk');
    expect(r.plan.at(-1)).toBe(P.junkEpicArmor('Helmet', 'Speed'));
  });

  it('сет без билдов — никакой прокачки и никаких напоминаний', () => {
    const dead = D.sets.find((s) => !s.users)!;
    const r = evaluate(ctx, { slot: 'helmet', grade: 'rare', setId: dead.id, itemKey: null, main: null, subs: { SPD: 3 } });
    expect([r.v, r.plan]).toEqual(['junk', []]);
  });
});

// Attack Set: у атакеров главные статы — CHC и ATK%
const attack = D.sets.find((s) => s.short === 'Attack')!;
const attackHelmet = (subs: Record<string, number>) => evaluate(ctx, { slot: 'helmet', grade: 'rare', setId: attack.id, itemKey: null, main: null, subs });

describe('Epic: 4-й сабстат от первого Reforge', () => {
  it('свежая Epic с тремя сабстатами, «Временно»: без кубика и без строк Reforge — Enhance и «не вкладывай»', () => {
    const r = attackHelmet({ 'DMG UP%': 2, 'ATK%': 3, CHD: 3 });
    expect(r.v).toBe('temp');
    expect('gamble' in r).toBe(false);
    expect(r.plan).toEqual([P.enhance, P.tempNoInvest]);
  });

  it('свежая Epic с тремя сабстатами, «Разобрать»: без кубика — в «Прокачке» только напоминание про материал', () => {
    const r = attackHelmet({ CHC: 2, 'ATK%': 2, RES: 1 });
    expect(r.v).toBe('junk');
    expect('gamble' in r).toBe(false);
    expect(r.plan).toEqual([P.junkEpicArmor('Helmet', 'Attack')]);
  });

  it('введённый 4-й сабстат считается как есть: CHC к «Временно» делает вещь «Оставить»', () => {
    expect(attackHelmet({ 'DMG UP%': 3, 'ATK%': 3, CHD: 3, CHC: 1 }).v).toBe('keep');
  });

  it('два хороших и третий так себе, первый Reforge дал SPD — вещь вытянута', () => {
    expect(attackHelmet({ CHC: 2, 'ATK%': 2, RES: 1 }).v).toBe('junk');
    expect(attackHelmet({ CHC: 2, 'ATK%': 2, RES: 1, SPD: 1 }).v).toBe('keep');
  });

  it('у Epic с 4-м сабстатом смена статов уже открыта; ни строки «Ролл», ни строки Reforge', () => {
    const r = attackHelmet({ CHC: 3, 'ATK%': 3, CHD: 2, SPD: 2 });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.btArmorEpic('Helmet', 'Attack'), P.noTransistone]);
    expect(r.lines.some((l) => l.startsWith('Ролл:'))).toBe(false);
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
    const r = evaluate(ctx, { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main: ref.mains[0], subs: {} });
    expect(r.v).toBe('keep');
    expect(r.plan).toEqual([P.enhance, P.btGear(weapon.name)]);
  });

  it('со слабыми сабстатами — строкой «кандидат на реролл», а «Прокачка» без Reforge', () => {
    const r = evaluate(ctx, { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main: ref.mains[0], subs: { EFF: 1, RES: 1, 'DMG RED%': 1, DEF: 1 } });
    expect(r.lines).toContain(ru.gear.weakReroll);
    expect(r.plan).toEqual([P.enhance, P.btGear(weapon.name)]);
  });

  it('Legendary с SPD 6: без «Стоит Reforge» и строки «Ролл» — как есть', () => {
    const r = evaluate(ctx, { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main: ref.mains[0], subs: { SPD: 6, CHC: 4, CHD: 4, 'ATK%': 4 } });
    expect(r.v).toBe('keep');
    expect(r.lines.some((l) => l.startsWith('Ролл:'))).toBe(false);
    expect(r.plan).toEqual([P.enhance, P.btGear(weapon.name)]);
  });

  it('с ненужным main stat — фоддер: копия для Breakthrough экземпляра с нужным main', () => {
    const main = weapon.mains.find((m) => !wanted.has(m))!;
    const r = evaluate(ctx, { slot: 'weapon', grade: 'unique', setId: null, itemKey: weapon.key, main, subs: {} });
    expect(r.v).toBe('fodder');
    expect(r.plan).toEqual([P.fodderGear(weapon.name)]);
  });

  // .x/0060 SPEC 4.3: у Epic — Breakthrough только вещами из разбора (любой Steel Sword), Glunite не тратить
  it('временная замена — только Enhance, Breakthrough — вещами из разбора, сколько бы ни было сегментов', () => {
    const plan = (n: number) => evaluate(ctx, { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { SPD: n, CHC: n, CHD: n } });
    expect([1, 3].map((n) => [plan(n).v, plan(n).plan])).toEqual([1, 3].map(() => ['temp', [P.enhance, P.tempNoInvest]]));
  });
});
