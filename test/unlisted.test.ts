// «Нет в списке»: Legendary оружие/аксессуар, которого нет в данных outerpedia, идёт путём Epic — main stat + ролл.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { legendMains } from '../src/logic/builds';
import { makeCtx, type Settings } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import type { ItemInput } from '../src/logic/verdict';
import { fromPersisted, reducer } from '../src/state/appState';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const settings = (patch: Partial<Settings> = {}): Settings => ({ rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true, ...patch });
const ctx = (patch?: Partial<Settings>) => makeCtx(idx, settings(patch), new Set());
const unlisted = (patch: Partial<ItemInput> = {}): ItemInput => ({ slot: 'weapon', grade: 'unique', setId: null, itemKey: null, main: null, unlisted: true, subs: {}, ...patch });

describe('«нет в списке»: вердикт', () => {
  it('без main stat просит его выбрать', () => {
    const r = evaluate(ctx(), unlisted());
    expect([r.v, r.title]).toEqual(['idle', 'Нет в списке: какой main stat?']);
  });

  it('с main stat и без сабстатов — кандидаты на временную замену, как у Epic', () => {
    const r = evaluate(ctx(), unlisted({ main: 'ATK%' }));
    expect(r.title).toMatch(/^Как временная замена подойдёт \d+ персонаж/);
    expect(r.sections[0].mainNote).toBe('ATK%');
  });

  it('полностью введённый Legendary с хорошим роллом — «Временно»', () => {
    const r = evaluate(ctx(), unlisted({ main: 'ATK%', subs: { SPD: 2, CHC: 2, CHD: 2, 'DEF%': 1 } }));
    expect(r.v).toBe('temp');
  });

  it('недовведённый Legendary (3 из 4) не получает окончательного вердикта раньше времени', () => {
    const r = evaluate(ctx(), unlisted({ main: 'ATK%', subs: { SPD: 3, CHC: 3, 'DEF%': 1 } }));
    expect(r.title).toBe('Отмечено 3 из 4 — отметь остальные');
  });

  it('слабый ролл — «Разобрать», но с оговоркой про новый предмет', () => {
    const r = evaluate(ctx(), unlisted({ main: 'ATK%', subs: { 'DEF%': 1, RES: 1, DEF: 1, HP: 1 } }));
    expect(r.v).toBe('junk');
    expect(r.lines.at(-1)).toMatch(/Если предмет новый/);
  });

  it('в «Эндгейме» — «Спорно»: про новый предмет ещё неизвестно, рекомендуют ли его', () => {
    const r = evaluate(ctx({ stage: 'end' }), unlisted({ main: 'ATK%', subs: { 'DEF%': 1, RES: 1, DEF: 1, HP: 1 } }));
    expect(r.v).toBe('maybe');
  });

  it('выбор main — main stat 6★ Legendary в слоте', () => {
    expect(legendMains(idx, 'weapon')).toContain('ATK%');
    expect(legendMains(idx, 'accessory')).toContain('SPD');
  });
});

describe('«нет в списке»: переходы', () => {
  const base = { ...fromPersisted(null, idx), slot: 'weapon' as const, grade: 'unique' as const };

  it('включается кнопкой и сбрасывается выбором предмета из списка', () => {
    const on = reducer({ ...base, main: 'ATK%' }, { type: 'unlisted' });
    expect([on.unlisted, on.main, on.itemKey]).toEqual([true, null, null]);
    expect(reducer(on, { type: 'item', itemKey: D.weapons[0].key }).unlisted).toBe(false);
    expect(reducer(on, { type: 'item', itemKey: null }).unlisted).toBe(false);
  });

  it('сбрасывается сменой грейда, слота и «Следующим»', () => {
    const on = reducer(base, { type: 'unlisted' });
    expect(reducer(on, { type: 'grade', grade: 'rare' }).unlisted).toBe(false);
    expect(reducer(on, { type: 'slot', slot: 'accessory' }).unlisted).toBe(false);
    expect(reducer(on, { type: 'reset' }).unlisted).toBe(false);
  });
});
