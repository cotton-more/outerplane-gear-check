// Запись ogc.tour «обучение пройдено, все подсказки знакомы» для прогонов в Chrome: ни полосы «Появилось обучение»,
// ни «Что нового». «Что нового» считается по known — чего там нет, то и новое (src/tour/tips.ts newsOf), поэтому
// в known — все подсказки из src/**/*.tour.ts (id → rev).
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function tipRevs(dir) {
  const out = {};
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, tipRevs(p));
    else if (e.name.endsWith('.tour.ts')) {
      for (const m of readFileSync(p, 'utf8').matchAll(/\{\s*id:\s*'([^']+)',\s*rev:\s*(\d+)/g)) out[m[1]] = Number(m[2]);
    }
  }
  return out;
}

export const doneTour = () =>
  JSON.stringify({ v: 1, first: 'done', invited: true, seen: {}, known: tipRevs(resolve(import.meta.dirname, '../src')), tips: false });
