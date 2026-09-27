// Строки main и сабстаты, которых из-за них не бывает. Игра сравнивает стат вместе с видом (проверено в игре):
// flat RES в main ботинок и RES% сабстатом бывают на одной вещи, а HP% сабстатом на ботинках — нет.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chain } from '../src/components/eval/Chain';
import { IndexContext } from '../src/components/IndexContext';
import { createIndex } from '../src/data';
import type { Dataset, Grade, SlotId } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { itemMains, takenByMain } from '../src/logic/mains';
import { rows, tierPlaces } from '../src/logic/score';
import type { ItemInput } from '../src/logic/verdict';
import { fromPersisted, reducer, restoreItem, type AppState } from '../src/state/appState';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
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

  it('данные без mainBlocks (старее этой версии): main запрещает сабстат с той же меткой, как раньше', () => {
    const old = createIndex({ ...D, mainBlocks: undefined, fixedMains: undefined, sets: D.sets.map((s) => ({ ...s, fixed: undefined })) });
    const im = itemMains(old, item('accessory', 'EFF'));
    expect([...im.blocked]).toEqual(['EFF']);
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

  it('цепочка перчаток: у EFF пометка main, сабстат EFF рядом через «/»', () => {
    const r = evaluate(ctx, item('gloves', null, { subs: { EFF: 2, SPD: 1, 'HP%': 1 } }));
    const row = r.sections.flatMap((s) => s.rows).find((m) => m.b.subs.flat().includes('EFF'))!;
    const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m: row })));
    expect(html).toMatch(/<small>main <\/small>EFF<\/span><i class="sep">\/<\/i><span class="pill [^"]+">EFF<\/span>/);
  });

  // одна строка «кому подходит» с заданной цепочкой — чтобы проверить отрисовку, не завися от того, чьи билды в данных
  const chainOf = (it: ItemInput, chain: string[][]) => {
    const c = D.chars.find((x) => x.builds.length)!;
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

  it('перчатки без сабстата EFF: «main EFF» и пунктир EFF — EFF% сабстатом ещё бывает', () => {
    const html = chainOf(item('gloves', null, { subs: { SPD: 1, CHC: 1, CHD: 1 } }), [['EFF'], ['SPD']]);
    expect(html).toContain('<small>main </small>EFF</span><i class="sep">/</i><span class="pill miss">EFF</span>');
  });

  it('цепочка оружия с main ATK%: на оси ATK обе строки main', () => {
    const r = evaluate(ctx, item('weapon', 'ATK%', { subs: { CHC: 2, CHD: 1, SPD: 1 } }));
    const row = r.sections.flatMap((s) => s.rows).find((m) => m.b.subs.flat().includes('ATK'))!;
    const html = renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx }, createElement(Chain, { m: row })));
    expect(html).toContain('<small>main </small>ATK%/ATK</span>');
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
