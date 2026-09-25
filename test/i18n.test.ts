// Английская версия полная: вердикты без русского, словарь без русского, в коде нет фраз мимо словаря.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { en } from '../src/i18n/en';
import { makeCtx, type Settings } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import type { Verdict } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const CYR = /[А-Яа-яЁё]/;

const verdictText = (r: Verdict) => [r.title, r.badge, r.foot, ...r.lines, ...r.sections.map((s) => s.title)].join('\n');

describe('английские вердикты', () => {
  it('все случаи эталона считаются на английском без единой русской буквы', () => {
    const leaks: string[] = [];
    for (const { in: inp } of golden.cases) {
      const settings: Settings = { rosterOnly: inp.rosterOnly, fodder: !!inp.fodder, stage: inp.stage ?? 'grow', lv120: !!inp.lv120, quirks: inp.quirks ?? true };
      const ctx = makeCtx(idx, settings, new Set(golden.meta.rosters[inp.roster]), en);
      const r = evaluate(ctx, { slot: inp.slot, grade: inp.grade, setId: inp.setId, itemKey: inp.itemKey, main: inp.main, subs: Object.fromEntries(inp.subs) });
      const text = verdictText(r);
      if (CYR.test(text)) leaks.push(text.split('\n').find((l) => CYR.test(l))!);
    }
    expect(golden.cases.length).toBeGreaterThan(500);
    expect(leaks).toEqual([]);
  });
});

describe('английский словарь', () => {
  it('ни строки, ни функции не содержат русского', () => {
    const leaks: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === 'string' || typeof v === 'function') { if (CYR.test(String(v))) leaks.push(path); }
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(en, 'en');
    expect(leaks).toEqual([]);
  });
});

// Русский допустим только в словаре, в комментариях и там, где он — данные: кириллические двойники
// латиницы в коде предмета, клавиши русской раскладки, названия языков.
const ALLOWED = ['src/i18n/ru.ts', 'src/i18n/index.ts', 'src/logic/itemCode.ts', 'src/hooks/useHotkeys.ts'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const stripComments = (src: string) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')     // {/* JSX */}
  .replace(/\/\*[\s\S]*?\*\//g, '')         // /* блок */
  .replace(/(^|[\s;,(){}])\/\/.*$/gm, '$1'); // // строка (но не https://)

describe('исходники', () => {
  it('русские фразы — только в src/i18n/ru.ts', () => {
    const root = new URL('..', import.meta.url).pathname;
    const leaks = sources(join(root, 'src'))
      .filter((p) => !ALLOWED.includes(relative(root, p)))
      .flatMap((p) => stripComments(readFileSync(p, 'utf8')).split('\n').filter((l) => CYR.test(l)).map((l) => `${relative(root, p)}: ${l.trim()}`));
    expect(leaks).toEqual([]);
  });
});
