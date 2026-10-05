// Режимы списка персонажей «Мои · Доодеть · Все» (features/roster/charFilter): кого показывать (.x/0070-more-sheet SPEC 5)
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Char, Dataset } from '@/game/data/types';
import { charMatches, compareChars, countToDress, effectiveMode, isBare, type CharFilter, type CharMode } from '@/features/roster/charFilter';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const withBuilds = D.chars.find((c) => c.builds.length)!;
const noBuilds = D.chars.find((c) => !c.builds.length)!;
const other = D.chars.find((c) => c.builds.length && c.id !== withBuilds.id)!;
const f = (cMode: CharMode, patch: Partial<CharFilter> = {}): CharFilter => ({ cq: '', cel: '', ccl: '', cMode, ...patch });
const shown = (filter: CharFilter, roster: string[], geared: Map<string, number> = new Map(), off?: Map<string, string>) =>
  D.chars.filter((c) => charMatches(c, filter, new Set(roster), geared, off)).sort(compareChars);

describe('«Доодеть»: кого есть кому доодеть', () => {
  it('ничего не надето (нет записи) и 5 из 6 — доодеть; 6 из 6 — нет', () => {
    expect(isBare(withBuilds, new Map())).toBe(true);
    expect(isBare(withBuilds, new Map([[withBuilds.id, 5]]))).toBe(true);
    expect(isBare(withBuilds, new Map([[withBuilds.id, 6]]))).toBe(false);
  });

  it('героя без билдов и заменённого Core Fusion не показывает', () => {
    expect(isBare(noBuilds, new Map())).toBe(false);
    expect(isBare(withBuilds, new Map(), new Map([[withBuilds.id, 'cf']]))).toBe(false);
  });
});

describe('режимы списка', () => {
  // 1. «Мои» — все свои, с билдами и без, по алфавиту; серый портрет — у героя без билдов (CharTile)
  it('1. «Мои»: ростер {A с билдами, B без билдов} → видны A и B, по алфавиту', () => {
    const list = shown(f('mine'), [withBuilds.id, noBuilds.id]);
    expect(list.map((c) => c.id).sort()).toEqual([withBuilds.id, noBuilds.id].sort());
    const names = list.map((c) => c.base || c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
  });

  // 2. «Все» — с билдами; без билдов — только поиском
  it('2. «Все»: герой без билдов не виден; поиск по его имени — виден', () => {
    expect(shown(f('all'), []).some((c) => c.id === noBuilds.id)).toBe(false);
    expect(shown(f('all'), []).length).toBe(D.chars.filter((c) => c.builds.length).length);
    expect(shown(f('all', { cq: noBuilds.name }), []).map((c) => c.id)).toContain(noBuilds.id);
  });

  it('2. «Все»: поиск находит и по slug, и по прозвищу', () => {
    expect(shown(f('all', { cq: noBuilds.slug }), []).map((c) => c.id)).toContain(noBuilds.id);
    expect(shown(f('all', { cq: 'Slacker Surfer' }), []).map((c) => c.name)).toEqual(['Aer']);
  });

  it('2. «Мои» и «Все» с поиском находят героя без билдов, «Доодеть» — нет (его некому доодеть)', () => {
    const roster = [noBuilds.id];
    expect(shown(f('mine', { cq: noBuilds.name }), roster).map((c) => c.id)).toEqual([noBuilds.id]);
    expect(shown(f('all', { cq: noBuilds.name }), roster).map((c) => c.id)).toEqual([noBuilds.id]);
    expect(shown(f('todress', { cq: noBuilds.name }), roster)).toEqual([]);
  });

  // 3. «Доодеть»
  describe('3. «Доодеть»', () => {
    const roster = [withBuilds.id, noBuilds.id];
    const ids = (geared: Map<string, number>, off?: Map<string, string>) => shown(f('todress'), roster, geared, off).map((c) => c.id);

    it('свой с билдами и 3 из 6 — виден; свой 6 из 6 — нет', () => {
      expect(ids(new Map([[withBuilds.id, 3]]))).toEqual([withBuilds.id]);
      expect(ids(new Map([[withBuilds.id, 6]]))).toEqual([]);
    });

    it('свой без билдов — нет; чужой — нет', () => {
      expect(ids(new Map())).toEqual([withBuilds.id]);
      expect(shown(f('todress'), [withBuilds.id]).map((c) => c.id)).not.toContain(other.id);
    });

    it('X, заменённый Core Fusion X, — нет', () => {
      const x = char('Eternal'), cf = char('Core Fusion Eternal');
      expect(shown(f('todress'), [x.id, cf.id], new Map(), new Map([[x.id, cf.id]])).map((c) => c.id)).toEqual([cf.id]);
    });
  });

  // 4. стихия и класс сужают любой режим
  it('4. стихия и класс сужают каждый из трёх режимов', () => {
    const roster = D.chars.filter((c) => c.builds.length).slice(0, 40).map((c) => c.id);
    for (const mode of ['mine', 'todress', 'all'] as const) {
      const all = shown(f(mode), roster);
      const fire = shown(f(mode, { cel: 'fire' }), roster);
      const fireMage = shown(f(mode, { cel: 'fire', ccl: 'mage' }), roster);
      expect(fire.length).toBeGreaterThan(0);
      expect(fire.length).toBeLessThan(all.length);
      expect(fire.every((c) => c.element === 'fire')).toBe(true);
      expect(fireMage.every((c) => c.element === 'fire' && c.class === 'mage')).toBe(true);
      expect(fireMage.length).toBeLessThanOrEqual(fire.length);
    }
  });

  it('«Мои»: чужих нет вовсе', () => {
    expect(shown(f('mine'), [withBuilds.id]).map((c) => c.id)).toEqual([withBuilds.id]);
  });
});

describe('пустой ростер', () => {
  // 5–6: пока ростер пуст, режим — «Все»
  it('«Мои» и «Доодеть» при пустом ростере читаются как «Все»', () => {
    expect(effectiveMode('mine', 0)).toBe('all');
    expect(effectiveMode('todress', 0)).toBe('all');
    expect(effectiveMode('mine', 1)).toBe('mine');
    expect(effectiveMode('todress', 3)).toBe('todress');
    // сам отбор режим не подменяет: это делают список и «открыть героя», которые знают ростер
    expect(shown(f(effectiveMode('mine', 0)), []).map((c) => c.id)).toEqual(shown(f('all'), []).map((c) => c.id));
  });
});

describe('счётчик «Доодеть N»', () => {
  it('7. свои с билдами, у которых надето меньше 6 из 6; не заменённые Core Fusion; чужие и без билдов не считаются', () => {
    const x = char('Eternal'), cf = char('Core Fusion Eternal');
    const roster = new Set([withBuilds.id, other.id, noBuilds.id, x.id, cf.id]);
    const geared = new Map([[other.id, 6], [withBuilds.id, 2]]);
    const off = new Map([[x.id, cf.id]]);
    // withBuilds (2/6) и cf (0/6): other одет полностью, noBuilds без билдов, x заменён
    expect(countToDress(idx.D.chars, roster, geared, off)).toBe(2);
  });

  it('7. «Доодеть N» равен числу героев, которых показывает режим «Доодеть»', () => {
    const roster = new Set(D.chars.filter((c) => c.builds.length).slice(0, 12).map((c) => c.id));
    const geared = new Map([...roster].slice(0, 4).map((id) => [id, 6] as [string, number]));
    const n = D.chars.filter((c) => charMatches(c, f('todress'), roster, geared)).length;
    expect(countToDress(D.chars, roster, geared)).toBe(n);
    expect(n).toBe(roster.size - 4);
  });
});

describe('порядок', () => {
  // 5.6: по имени; пара X / Core Fusion X рядом решает список (CharList.fusionOrder), здесь — сам порядок имён
  it('по базовому имени героя, затем по приставке', () => {
    const list = shown(f('mine'), D.chars.map((c) => c.id));
    const key = (c: Char) => c.base || c.name;
    for (let i = 1; i < list.length; i++) expect(key(list[i - 1]).localeCompare(key(list[i]), 'en', { sensitivity: 'base' })).toBeLessThanOrEqual(0);
  });
});
