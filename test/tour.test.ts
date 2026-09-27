// Обучение: у каждого компонента есть обучение или пометка (coverage.ts), тексты шагов на обоих языках не длиннее
// полосы, хранилище 'ogc.tour' и то, где встаёт полоса (place.ts).
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEXTS } from '../src/i18n';
import { ANCHORS } from '../src/tour/anchors';
import { CORE } from '../src/tour/core';
import { COVERAGE } from '../src/tour/coverage';
import { place } from '../src/tour/place';
import { TIPS } from '../src/tour/registry';
import { bootTour, markSeen, mergeTour } from '../src/tour/store';
import type { StepText } from '../src/tour/types';

const COMPONENTS = new URL('../src/components/', import.meta.url).pathname;
const tsx = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? tsx(p) : f.endsWith('.tsx') ? [relative(COMPONENTS, p)] : [];
});

describe('у каждого компонента — обучение или пометка', () => {
  const files = tsx(COMPONENTS);
  const own = (f: string) => existsSync(join(COMPONENTS, f.replace(/\.tsx$/, '.tour.ts')));

  it('новый компонент без обучения — подскажем, что сделать', () => {
    const missing = files.filter((f) => !own(f) && !COVERAGE[f]);
    const how = (f: string) => [
      `Компонент без обучения: src/components/${f}`,
      `  Игрок это видит → создай src/components/${f.replace(/\.tsx$/, '.tour.ts')} рядом (export default defineTips(...), src/tour/types.ts),`,
      '  тексты — в ru.ts и en.ts. Сначала предложи текст подсказки владельцу и спроси, показывать ли как «Что нового».',
      `  Объясняет главный тур или служебный → впиши в src/tour/coverage.ts: '${f}': 'core' | 'helper' с причиной в комментарии.`,
      '  Подробно: DEVELOPMENT.md → «Обучение».',
    ].join('\n');
    expect(missing.map(how).join('\n\n')).toBe('');
  });

  it('в coverage.ts нет лишнего: ни удалённых файлов, ни тех, у кого уже свой .tour.ts', () => {
    expect(Object.keys(COVERAGE).filter((f) => !files.includes(f))).toEqual([]);
    expect(Object.keys(COVERAGE).filter(own)).toEqual([]);
  });
});

describe('главный тур', () => {
  it('до 5 шагов, id и подсказки не повторяются, якоря из списка', () => {
    expect(CORE.length).toBeLessThanOrEqual(5);
    const ids = [...CORE.map((s) => s.id), ...TIPS.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const x = { demo: true, keys: false, kind: 'armor', legend: false, narrow: true, n: 0, of: 3 } as const;
    expect(CORE.flatMap((s) => s.at({ narrow: x.narrow } as never)).filter((a) => !ANCHORS.includes(a))).toEqual([]);
  });

  // полоса на телефоне — 3–4 строки: длиннее — закроет полэкрана в разделённом экране
  it('каждый вариант текста шага на обоих языках — не длиннее 200 знаков', () => {
    const variants: StepText[] = [];
    for (const demo of [true, false]) for (const keys of [true, false]) for (const kind of ['armor', 'weapon', 'accessory'] as const)
      for (const legend of [true, false]) for (const narrow of [true, false]) variants.push({ demo, keys, kind, legend, narrow, n: 4, of: 4 });
    const long = Object.entries(TEXTS).flatMap(([lang, t]) => CORE.flatMap((s) => variants
      .map((v) => t.tour.steps[s.id](v)).filter((txt) => txt.replace(/\*\*/g, '').length > 200).map((txt) => `${lang}/${s.id}: ${txt}`)));
    expect([...new Set(long)]).toEqual([]);
  });
});

describe('хранилище ogc.tour', () => {
  const cur = { slot: 1, pick: 1 };

  it('новичок: тур ещё не пройден; исходная точка «что было» — всё текущее', () => {
    expect(bootTour(null, { roster: 0, welcomeHidden: false }, cur, '2026-09-27'))
      .toEqual({ v: 1, first: 'new', invited: false, seen: {}, known: cur, since: '2026-09-27', tips: true });
  });

  it('давний игрок (есть ростер или закрыл «Как пользоваться») тур не получает — ему один раз полоса', () => {
    expect(bootTour(null, { roster: 3, welcomeHidden: false }, cur, 'd').first).toBe('skipped');
    expect(bootTour(null, { roster: 0, welcomeHidden: true }, cur, 'd').first).toBe('skipped');
  });

  it('сохранённое читается как есть; мусор — как первый запуск', () => {
    const saved = { v: 1, first: 'done', invited: true, seen: { slot: 1, bad: 'x' }, known: { slot: 1 }, since: '2026-01-01', tips: false };
    expect(bootTour(saved, { roster: 0, welcomeHidden: false }, cur, 'd'))
      .toEqual({ v: 1, first: 'done', invited: true, seen: { slot: 1 }, known: { slot: 1 }, since: '2026-01-01', tips: false });
    expect(bootTour({ v: 9 }, { roster: 0, welcomeHidden: false }, cur, 'd').first).toBe('new');
    expect(bootTour('junk', { roster: 0, welcomeHidden: false }, cur, 'd').first).toBe('new');
  });

  it('пройденное не теряется: берём большую ревизию, «пройден» и «приглашён» из другой вкладки остаются', () => {
    const st = bootTour(null, { roster: 0, welcomeHidden: false }, cur, 'd');
    expect(markSeen(markSeen(st, { slot: 2 }), { slot: 1 }).seen).toEqual({ slot: 2 });
    const other = { ...st, first: 'done', invited: true, seen: { pick: 1 }, known: { slot: 2, tip: 1 } };
    expect(mergeTour(markSeen(st, { slot: 1 }), other))
      .toMatchObject({ first: 'done', invited: true, seen: { slot: 1, pick: 1 }, known: { slot: 2, pick: 1, tip: 1 } });
  });
});

describe('где встаёт полоса', () => {
  // экран 360×740 с плашкой вердикта: свободно 0…660; полоса 120px
  it('внизу, если не закрывает то, на что показывает; иначе сверху; нет места — узкой плашкой', () => {
    expect(place({ top: 100, bottom: 300 }, 0, 660, 120)).toBe('bottom');
    expect(place({ top: 450, bottom: 600 }, 0, 660, 120)).toBe('top');
    expect(place({ top: 60, bottom: 600 }, 0, 660, 120)).toBe('pill');
    expect(place(null, 0, 660, 120)).toBe('bottom');
  });

  it('низкий экран 420×390 (разделённый экран в ландшафте): сетка на всю высоту — узкая плашка', () => {
    expect(place({ top: 40, bottom: 300 }, 0, 330, 110)).toBe('pill');
  });
});
