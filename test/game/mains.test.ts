// Строки main и сабстаты, которых из-за них не бывает. Игра сравнивает стат вместе с видом (проверено в игре):
// flat RES в main ботинок и RES% сабстатом бывают на одной вещи, а HP% сабстатом на ботинках — нет.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chain } from '@/features/eval/verdict/Chain';
import { StatGrid } from '@/features/eval/form/StatGrid';
import { IndexContext } from '@/game/data/IndexContext';
import { createIndex, MAIN_GRID } from '@/game/data';
import type { Char, Dataset, FlatBase, Grade, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import type { MainOption } from '@/features/eval/form/lists';
import { itemMains, takenByMain } from '@/game/item/mains';
import { flatFactor, rows, tierPlaces, uselessFor } from '@/game/build/score';
import type { ItemInput } from '@/game/item/item';
import { fromPersisted, reducer, restoreItem, type AppState } from '@/app/appState';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const speed = D.sets.find((s) => s.short === 'Speed')!;
const item = (slot: SlotId, main: string | null, patch: Partial<ItemInput> = {}, grade: Grade = 'rare'): ItemInput =>
  ({ slot, grade, setId: slot === 'weapon' || slot === 'accessory' ? null : speed.id, itemKey: null, main, subs: {}, ...patch });
const blocked = (slot: SlotId, main: string | null = null) => [...itemMains(idx, item(slot, main)).blocked].sort();
const build = (subs: string[][]) => ({ ...D.chars.find((c) => c.builds.length)!.builds[0], subs });

describe('какие сабстаты запрещает main', () => {
  it('броня: только совпадающие и по стату, и по виду — flat EFF и flat RES сабстатам EFF% и RES% не мешают', () => {
    expect(blocked('helmet')).toEqual(['HP%']);
    expect(blocked('armor')).toEqual(['DEF']);
    expect(blocked('gloves')).toEqual(['DEF']);
    expect(blocked('shoes')).toEqual(['HP%']);
  });

  it('оружие: базовый flat ATK всегда, плюс выбранный main', () => {
    expect(blocked('weapon')).toEqual(['ATK']);
    expect(blocked('weapon', 'ATK%')).toEqual(['ATK', 'ATK%']);
    expect(blocked('weapon', 'DEF%')).toEqual(['ATK', 'DEF%']);
  });

  it('аксессуар: main EFF и RES — flat, сабстаты EFF% и RES% остаются; main SPD запрещает SPD', () => {
    expect(blocked('accessory', 'EFF')).toEqual([]);
    expect(blocked('accessory', 'RES')).toEqual([]);
    expect(blocked('accessory', 'PEN%')).toEqual([]);
    expect(blocked('accessory', 'SPD')).toEqual(['SPD']);
  });

  it('данные без mainBlocks (старее этой версии): main запрещает сабстат с той же меткой и того же вида', () => {
    const old = createIndex({ ...D, mainBlocks: undefined, fixedMains: undefined, sets: D.sets.map((s) => ({ ...s, fixed: undefined })) });
    expect([...itemMains(old, item('accessory', 'SPD')).blocked]).toEqual(['SPD']);
    expect([...itemMains(old, item('accessory', 'HP%')).blocked]).toEqual(['HP%']);
    // flat EFF в main и сабстат EFF% — разные статы: сабстат остаётся и без таблицы
    expect([...itemMains(old, item('accessory', 'EFF')).blocked]).toEqual([]);
    expect(itemMains(old, item('helmet', null)).blocked.size).toBe(0);
  });
});

describe('места в цепочке: токен занят, только если сабстатом ему уже не выпасть', () => {
  const chain = [['ATK'], ['CHC'], ['CHD'], ['SPD']];

  it('оружие с main ATK%: ось ATK занята целиком (ATK% — main, flat ATK — базовая строка)', () => {
    expect(tierPlaces(build(chain), itemMains(idx, item('weapon', 'ATK%')))).toEqual([0, 0, 1, 2]);
  });

  it('оружие с main DEF%: ATK% сабстатом ещё бывает — ATK своё место держит', () => {
    expect(tierPlaces(build(chain), itemMains(idx, item('weapon', 'DEF%')))).toEqual([0, 1, 2, 3]);
  });

  it('flat EFF в main (перчатки, аксессуар) EFF не занимает: EFF% сабстатом бывает', () => {
    expect(takenByMain('EFF', itemMains(idx, item('gloves', null)))).toBe(false);
    expect(takenByMain('EFF', itemMains(idx, item('accessory', 'EFF')))).toBe(false);
    expect(takenByMain('RES', itemMains(idx, item('shoes', null)))).toBe(false);
  });

  it('main SPD занимает SPD, main PEN% — PEN% (сабстатом его не бывает вовсе)', () => {
    expect(takenByMain('SPD', itemMains(idx, item('accessory', 'SPD')))).toBe(true);
    expect(takenByMain('PEN%', itemMains(idx, item('accessory', 'PEN%')))).toBe(true);
  });
});

describe('оценка и цепочка', () => {
  const effBuild = D.chars.flatMap((c) => c.builds.map((b) => ({ c, b }))).find(({ b }) => b.subs[1]?.includes('EFF') && b.amulets.some((a) => a.mains.includes('EFF')))!;

  it('аксессуар с main EFF и сабстатом EFF: сабстат засчитан тем, у кого EFF в цепочке', () => {
    expect(effBuild).toBeTruthy();
    const r = evaluate(ctx, item('accessory', 'EFF', { subs: { EFF: 2, CHC: 1, SPD: 1 } }));
    const row = r.sections.flatMap((s) => s.rows).find((m) => m.c.id === effBuild.c.id)!;
    expect(row.parts.find((p) => p.key === 'EFF')?.ok).toBe(true);
  });

  it('цепочка перчаток: у EFF пометка main, сабстат EFF% рядом через «/»', () => {
    const r = evaluate(ctx, item('gloves', null, { subs: { EFF: 2, SPD: 1, 'HP%': 1 } }));
    const row = r.sections.flatMap((s) => s.rows).find((m) => m.b.subs.flat().includes('EFF'))!;
    const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m: row })));
    expect(html).toMatch(/<small>main <\/small>EFF<\/span><i class="sep">\/<\/i><span class="pill [^"]+">EFF%<\/span>/);
  });

  // одна строка «кому подходит» с заданной цепочкой — чтобы проверить отрисовку, не завися от того, чьи билды в данных
  const chainOf = (it: ItemInput, chain: string[][], c: Char = D.chars.find((x) => x.builds.length)!) => {
    const [m] = rows(ctx, it.grade, [{ c, b: build(chain), i: 0 }], it.subs, itemMains(idx, it));
    return renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m })));
  };

  it('оружие с main DEF% без сабстата ATK%: «main ATK» и пунктир ATK% — базовый flat ATK в счёт не идёт', () => {
    const html = chainOf(item('weapon', 'DEF%', { subs: { CHC: 1, CHD: 1, SPD: 1 } }), [['ATK'], ['CHC'], ['CHD']]);
    expect(html).toContain('<small>main </small>ATK</span><i class="sep">/</i><span class="pill miss">ATK%</span>');
  });

  it('с сабстатом ATK% пунктира нет, а при main ATK% ось занята целиком — пунктира тоже нет', () => {
    const withSub = chainOf(item('weapon', 'DEF%', { subs: { 'ATK%': 2, CHC: 1, CHD: 1 } }), [['ATK'], ['CHC'], ['CHD']]);
    expect(withSub).toMatch(/<small>main <\/small>ATK<\/span><i class="sep">\/<\/i><span class="pill ok">ATK%<\/span>/);
    const taken = chainOf(item('weapon', 'ATK%', { subs: { CHC: 1, CHD: 1, SPD: 1 } }), [['ATK'], ['CHC'], ['CHD']]);
    expect(taken).not.toContain('pill miss');
  });

  it('перчатки без сабстата EFF: «main EFF» и пунктир EFF% — EFF% сабстатом ещё бывает', () => {
    const html = chainOf(item('gloves', null, { subs: { SPD: 1, CHC: 1, CHD: 1 } }), [['EFF'], ['SPD']]);
    expect(html).toContain('<small>main </small>EFF</span><i class="sep">/</i><span class="pill miss">EFF%</span>');
  });

  it('шлем для персонажа, которому flat HP не засчитывается: «main HP%» без пунктира — место занято main', () => {
    const low = D.chars.find((c) => uselessFor(ctx, c).includes('HP'))!;
    const html = chainOf(item('helmet', null, { subs: { CHC: 1, CHD: 1, SPD: 1 } }), [['HP'], ['CHC'], ['CHD']], low);
    expect(html).toContain('<small>main </small>HP%</span>');
    expect(html).not.toContain('pill miss');
  });

  it('цепочка оружия с main ATK%: на оси ATK обе строки main', () => {
    const r = evaluate(ctx, item('weapon', 'ATK%', { subs: { CHC: 2, CHD: 1, SPD: 1 } }));
    const row = r.sections.flatMap((s) => s.rows).find((m) => m.b.subs.flat().includes('ATK'))!;
    const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m: row })));
    expect(html).toContain('<small>main </small>ATK%/ATK</span>');
  });
});

describe('место HP: flat HP почти никому не засчитывается — на вещи с HP% в main место занято', () => {
  const chainHp = [['HP'], ['CHC'], ['CHD'], ['SPD']];
  const low = D.chars.find((c) => uselessFor(ctx, c).includes('HP'))!;
  // тот же персонаж, но с базой HP, при которой flat-сегмент равен %-сегменту: flat HP ему засчитывается
  const r0 = flatFactor(ctx, low, 'HP');
  const high: Char = { ...low, flat: { ...low.flat, HP: low.flat.HP!.map((x) => x * r0) as FlatBase } };

  it('шлем: у персонажа со слабым flat HP место HP занято, CHC и CHD идут вперёд; с сильным — место остаётся', () => {
    const im = itemMains(idx, item('helmet', null));
    expect(uselessFor(ctx, high)).not.toContain('HP');
    expect(tierPlaces(build(chainHp), im, uselessFor(ctx, low))).toEqual([0, 0, 1, 2]);
    expect(tierPlaces(build(chainHp), im, uselessFor(ctx, high))).toEqual([0, 1, 2, 3]);
  });

  it('ботинки (RES + HP%) и оружие с main HP% — так же; броня без HP% в main — место HP остаётся', () => {
    const no = uselessFor(ctx, low);
    expect(tierPlaces(build(chainHp), itemMains(idx, item('shoes', null)), no)).toEqual([0, 0, 1, 2]);
    expect(tierPlaces(build(chainHp), itemMains(idx, item('weapon', 'HP%')), no)).toEqual([0, 0, 1, 2]);
    expect(tierPlaces(build(chainHp), itemMains(idx, item('armor', null)), no)).toEqual([0, 1, 2, 3]);
  });

  it('оценка шлема: CHC, CHD, ATK% засчитаны целиком, ATK — третий, а не четвёртый', () => {
    const b = build([['HP'], ['CHC'], ['CHD'], ['ATK']]);
    const [m] = rows(ctx, 'rare', [{ c: low, b, i: 0 }], { CHC: 1, CHD: 1, 'ATK%': 1 }, itemMains(idx, item('helmet', null)));
    expect([m.good, m.parts.map((p) => p.half)]).toEqual([3, [false, false, false]]);
  });
});

describe('ввод: main и сабстаты', () => {
  const base = fromPersisted(null, idx);
  const on = (patch: Partial<AppState>): AppState => ({ ...base, ...patch });

  it('main EFF у аксессуара сабстат EFF не убирает, main SPD убирает SPD', () => {
    const s = on({ slot: 'accessory', grade: 'rare', subs: { EFF: 2, SPD: 1 } });
    expect(reducer(s, { type: 'main', main: 'EFF', blocks: null }).subs).toEqual({ EFF: 2, SPD: 1 });
    expect(reducer(s, { type: 'main', main: 'SPD', blocks: 'SPD' }).subs).toEqual({ EFF: 2 });
  });

  it('из сохранённого или из кода: EFF при main EFF остаётся, HP% на шлеме и flat ATK на оружии отбрасываются', () => {
    const acc = restoreItem(on({ slot: 'accessory', grade: 'rare' }), { main: 'EFF', subs: { EFF: 2, CHC: 1 } }, idx);
    expect([acc.main, acc.subs]).toEqual(['EFF', { EFF: 2, CHC: 1 }]);
    const helmet = restoreItem(on({ slot: 'helmet', grade: 'rare' }), { setId: speed.id, subs: { 'HP%': 2, HP: 1 } }, idx);
    expect(helmet.subs).toEqual({ HP: 1 });
    const weapon = restoreItem(on({ slot: 'weapon', grade: 'rare' }), { main: 'DEF%', subs: { ATK: 2, 'ATK%': 1 } }, idx);
    expect(weapon.subs).toEqual({ 'ATK%': 1 });
  });
});

describe('подписи в сетке: сабстаты EFF% и RES% — с %, как в игре; main — без %', () => {
  const grid = (slot: SlotId, mains: MainOption[] | null = null) =>
    renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(StatGrid, {
      subs: {}, main: null, blocked: itemMains(idx, item(slot, null)).blocked, full: false, useful: null, mains, onPick: () => {}, onMain: () => {},
    })));

  it('ботинки: HP% — клетка main, EFF% и RES% — обычные сабстаты (flat RES из main сабстатом не бывает)', () => {
    const html = grid('shoes');
    expect(html).toContain('<small>main</small><span>HP%</span>');
    expect(html).toContain('<span>EFF%</span>');
    expect(html).toContain('<span>RES%</span>');
    expect(html).not.toMatch(/<span>(EFF|RES)<\/span>/);
  });

  it('main аксессуара: flat EFF и flat RES — без %', () => {
    const html = grid('accessory', MAIN_GRID.map((key) => ({ key, want: true, n: 1, rare: false })));
    expect(html).toContain('<span>EFF</span>');
    expect(html).toContain('<span>RES</span>');
  });
});
