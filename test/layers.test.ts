// Раскладка src по фичам (DEVELOPMENT.md → «Устройство src/»): зависимости только вниз —
// shared → game → features → screens → app; фичи — в порядке eval → gear → roster → worn → tryon → trade.
// Сквозные i18n и tour берёт кто угодно; сами они берут нижние слои, а app — только типы.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../src/', import.meta.url).pathname;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [relative(SRC, p).split('\\').join('/')] : [];
});
const files = walk(SRC);
const has = new Set(files);
const resolveSpec = (from: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? spec.slice(2) : spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(from), spec)) : null;
  if (base === null) return null;
  for (const e of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (has.has(base + e)) return base + e;
  return null;
};

const LAYER: Record<string, number> = { shared: 0, game: 1, features: 2, screens: 3, app: 4 };
const FEATURES = ['eval', 'gear', 'roster', 'worn', 'tryon', 'trade'];
const CROSS = new Set(['i18n', 'tour']);
const area = (f: string) => f.split('/')[0];

// импорты файла: куда и только ли типы
function importsOf(f: string): { to: string; typeOnly: boolean }[] {
  const src = readFileSync(join(SRC, f), 'utf8');
  return [...src.matchAll(/^(?:import|export) (type )?[^;]*?from '([^']+)'/gms)]
    .map((m) => ({ to: resolveSpec(f, m[2]), typeOnly: !!m[1] }))
    .filter((x): x is { to: string; typeOnly: boolean } => x.to !== null);
}

function problem(f: string, to: string, typeOnly: boolean): string | null {
  if (!f.includes('/')) return null;                                      // main.tsx — точка входа
  const [a, b] = [area(f), area(to)];
  if (a === b && a !== 'features') return null;
  if (CROSS.has(b)) return null;                                         // i18n, tour — кому угодно
  if (CROSS.has(a)) return b === 'app' || b === 'screens' ? (typeOnly ? null : 'сквозной модуль берёт у app/screens не только типы') : null;
  if (!(a in LAYER) || !(b in LAYER)) return `неизвестная папка: ${a} → ${b}`;
  if (LAYER[b] > LAYER[a]) return `${a} не берёт у ${b} (зависимости только вниз)`;
  if (a === 'features' && b === 'features') {
    const [fa, fb] = [f.split('/')[1], to.split('/')[1]];
    if (!FEATURES.includes(fa) || !FEATURES.includes(fb)) return `фича не в порядке FEATURES: ${fa}, ${fb}`;
    if (FEATURES.indexOf(fb) > FEATURES.indexOf(fa)) return `фича ${fa} не берёт у ${fb}: порядок ${FEATURES.join(' → ')}`;
  }
  return null;
}

describe('слои src', () => {
  it('каждый файл — в одной из папок раскладки', () => {
    const top = new Set([...Object.keys(LAYER), ...CROSS, 'styles']);
    expect(files.filter((f) => f.includes('/') && !top.has(area(f)))).toEqual([]);
    expect(files.filter((f) => area(f) === 'features' && !FEATURES.includes(f.split('/')[1]))).toEqual([]);
  });

  // macOS и Windows не различают регистр: Verdict.tsx рядом с verdict.ts — импорт без расширения находит не тот файл
  it('в одной папке нет имён, которые отличаются только регистром', () => {
    const stem = (f: string) => f.replace(/\.(tour\.ts|tsx|ts)$/, '');
    const seen = new Map<string, string>();
    const clash = files.flatMap((f) => {
      const k = stem(f).toLowerCase(), was = seen.get(k);
      seen.set(k, stem(f));
      return was && was !== stem(f) ? [`${was} / ${stem(f)}`] : [];
    });
    expect(clash).toEqual([]);
  });

  it('зависимости только вниз — иначе перенеси общее ниже или собери в screens', () => {
    const bad = files.flatMap((f) => importsOf(f).map(({ to, typeOnly }) => {
      const p = problem(f, to, typeOnly);
      return p ? `${f} → ${to}: ${p}` : null;
    })).filter(Boolean);
    expect(bad).toEqual([]);
  });
});
