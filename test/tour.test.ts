// Обучение: у каждого компонента есть обучение или пометка (coverage.ts), тексты шагов на обоих языках не длиннее
// полосы, хранилище 'ogc.tour' и то, где встаёт полоса (place.ts).
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEXTS } from '../src/i18n';
import { ANCHORS } from '../src/tour/anchors';
import { CORE, CORE_ANCHORS } from '../src/tour/core';
import { COVERAGE } from '../src/tour/coverage';
import { place } from '../src/tour/place';
import { TIP_COUNTS, TIPS } from '../src/tour/registry';
import { TOURS } from '../src/tour/tours';
import { bootTour, markSeen, mergeTour, type TourStore } from '../src/tour/store';
import { LIMITS, newsOf, nextTip } from '../src/tour/tips';
import type { StepText, Tip, TourCtx } from '../src/tour/types';

const COMPONENTS = new URL('../src/components/', import.meta.url).pathname;
const tsx = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? tsx(p) : f.endsWith('.tsx') ? [relative(COMPONENTS, p)] : [];
});

describe('у каждого компонента — обучение или пометка', () => {
  const files = tsx(COMPONENTS);
  // свой .tour.ts — только с подсказками: пустой файл обучением не считается
  const own = (f: string) => (TIP_COUNTS[f.replace(/\.tsx$/, '.tour.ts')] ?? 0) > 0;

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

describe('туры', () => {
  const ALL = Object.values(TOURS).flatMap((d) => d.steps);

  it('главный — до 5 шагов, «Экипировка» — до 6; id шагов и подсказок не повторяются, якоря из списка', () => {
    expect(CORE.length).toBeLessThanOrEqual(5);
    expect(TOURS.gear.steps.length).toBeLessThanOrEqual(6);
    const ids = [...ALL.map((s) => s.id), ...TIPS.map((t) => t.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const ctxs = (['helmet', 'weapon', 'accessory'] as const).flatMap((slot) => (['unique', 'rare'] as const).flatMap((grade) =>
      [null, 'ATK%'].map((main) => ({ narrow: true, s: { slot, grade, main } }) as unknown as TourCtx)));
    const used = [...CORE_ANCHORS, ...ctxs.flatMap((c) => ALL.flatMap((s) => [...s.at(c), ...(s.pin?.(c) ?? []).map((p) => p.slice(0, p.indexOf(':')) as never)]))];
    expect(used.filter((a) => !ANCHORS.includes(a))).toEqual([]);
  });

  it('у подсказки с туром — тур из списка, и она в «Что нового»', () => {
    expect(TIPS.filter((tp) => tp.tour && (!TOURS[tp.tour] || !tp.news)).map((tp) => tp.id)).toEqual([]);
  });

  // полоса на телефоне — 3–4 строки: длиннее — закроет полэкрана в разделённом экране
  it('каждый вариант текста шага на обоих языках — не длиннее 200 знаков', () => {
    const variants: StepText[] = [];
    for (const demo of [true, false]) for (const keys of [true, false]) for (const kind of ['armor', 'weapon', 'accessory'] as const)
      for (const legend of [true, false]) for (const narrow of [true, false]) variants.push({ demo, keys, kind, legend, narrow, n: 4, of: 4 });
    const long = Object.entries(TEXTS).flatMap(([lang, t]) => ALL.flatMap((s) => variants
      .map((v) => t.tour.steps[s.id](v)).filter((txt) => txt.replace(/\*\*/g, '').length > 200).map((txt) => `${lang}/${s.id}: ${txt}`)));
    expect([...new Set(long)]).toEqual([]);
  });
});

describe('хранилище ogc.tour', () => {
  const cur = { slot: 1, pick: 1 };

  it('новичок: тур ещё не пройден; исходная точка «что было» — всё текущее', () => {
    expect(bootTour(null, { roster: 0, welcomeHidden: false }, cur))
      .toEqual({ v: 1, first: 'new', invited: false, seen: {}, known: cur, tips: true, tipsAt: 0, resetAt: 0 });
  });

  it('давний игрок (есть ростер или закрыл «Как пользоваться») тур не получает — ему один раз полоса', () => {
    expect(bootTour(null, { roster: 3, welcomeHidden: false }, cur).first).toBe('skipped');
    expect(bootTour(null, { roster: 0, welcomeHidden: true }, cur).first).toBe('skipped');
  });

  it('давний игрок пришёл раньше обучения: подсказки с news для него новые, новичку — нет', () => {
    const news: Tip = { id: 'move', rev: 1, at: 'submove', news: true };
    const now = { slot: 1, move: 1 };
    expect(newsOf([news], bootTour(null, { roster: 3, welcomeHidden: false }, now, ['move']))).toEqual([news]);
    expect(newsOf([news], bootTour(null, { roster: 0, welcomeHidden: false }, now, ['move']))).toEqual([]);
  });

  it('сохранённое читается как есть; мусор — как первый запуск', () => {
    // since — дата первого запуска из прежних выпусков: читать не мешает, дальше не хранится
    const saved = { v: 1, first: 'done', invited: true, seen: { slot: 1, bad: 'x' }, known: { slot: 1 }, since: '2026-01-01', tips: false };
    expect(bootTour(saved, { roster: 0, welcomeHidden: false }, cur))
      .toEqual({ v: 1, first: 'done', invited: true, seen: { slot: 1 }, known: { slot: 1 }, tips: false, tipsAt: 0, resetAt: 0 });
    expect(bootTour({ v: 9 }, { roster: 0, welcomeHidden: false }, cur).first).toBe('new');
    expect(bootTour('junk', { roster: 0, welcomeHidden: false }, cur).first).toBe('new');
  });

  it('пройденный тур «Экипировка» (seen tour.gear) не стирает ни старая вкладка, ни «Показать подсказки заново»', () => {
    const st = markSeen(bootTour(null, { roster: 0, welcomeHidden: false }, cur), { 'tour.gear': 1 });
    const oldTab = { v: 1, first: 'done', invited: true, seen: { slot: 1 }, known: {}, tips: true };
    expect(mergeTour(st, oldTab, TIPS.map((tp) => tp.id)).seen['tour.gear']).toBe(1);
    expect(mergeTour({ ...st, resetAt: 5 }, oldTab, TIPS.map((tp) => tp.id)).seen['tour.gear']).toBe(1);
  });

  it('пройденное не теряется: берём большую ревизию, «пройден» и «приглашён» из другой вкладки остаются', () => {
    const st = bootTour(null, { roster: 0, welcomeHidden: false }, cur);
    expect(markSeen(markSeen(st, { slot: 2 }), { slot: 1 }).seen).toEqual({ slot: 2 });
    const other = { ...st, first: 'done', invited: true, seen: { pick: 1 }, known: { slot: 2, tip: 1 } };
    expect(mergeTour(markSeen(st, { slot: 1 }), other))
      .toMatchObject({ first: 'done', invited: true, seen: { slot: 1, pick: 1 }, known: { slot: 2, pick: 1, tip: 1 } });
    // старая вкладка с rev 1 не затирает rev 2 из новой
    expect(mergeTour(markSeen(st, { pick: 1 }), { ...other, seen: { pick: 2 } }).seen.pick).toBe(2);
  });

  it('две вкладки: выключатель подсказок — кто менял позже; «Показать заново» не откатывается увиденным из другой', () => {
    const st = bootTour(null, { roster: 0, welcomeHidden: false }, cur);
    const off = { ...st, tips: false, tipsAt: 200 };
    expect(mergeTour({ ...st, tipsAt: 100 }, off).tips).toBe(false);   // старая вкладка не включает обратно
    expect(mergeTour({ ...st, tips: true, tipsAt: 300 }, off).tips).toBe(true); // включили позже — включено
    const seenBefore = { ...st, seen: { slot: 1, star: 1 } };
    const reset = { ...st, seen: { slot: 1 }, resetAt: 500 };
    expect(mergeTour(reset, seenBefore, ['star']).seen).toEqual({ slot: 1 });     // сброс в этой вкладке
    expect(mergeTour(seenBefore, reset, ['star']).seen).toEqual({ slot: 1 });     // сброс в другой вкладке
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

describe('подсказки модулей', () => {
  it('у каждой — текст на обоих языках не длиннее 160 знаков и якорь из списка; у новостей — строка «Что нового»', () => {
    for (const [lang, t] of Object.entries(TEXTS)) {
      expect(TIPS.filter((tp) => !t.tour.tips[tp.id]).map((tp) => `${lang}/${tp.id}`)).toEqual([]);
      expect(TIPS.filter((tp) => t.tour.tips[tp.id].length > 160).map((tp) => `${lang}/${tp.id}`)).toEqual([]);
      const news = t.tour.news as Record<string, string>;
      expect(TIPS.filter((tp) => tp.news && !news[tp.id]).map((tp) => `${lang}/${tp.id}`)).toEqual([]);
      expect(Object.keys(news).filter((id) => !TIPS.some((tp) => tp.id === id && tp.news))).toEqual([]);
    }
    expect(TIPS.filter((tp) => !ANCHORS.includes(tp.at)).map((tp) => tp.id)).toEqual([]);
  });

  const st = (patch: Partial<TourStore> = {}): TourStore =>
    ({ v: 1, first: 'done', invited: true, seen: {}, known: {}, tips: true, tipsAt: 0, resetAt: 0, ...patch });
  const tipA: Tip = { id: 'star', rev: 1, at: 'star' };
  const tipB: Tip = { id: 'code', rev: 1, at: 'code', when: () => false };
  const c = {} as TourCtx;
  const all = () => true;

  it('показываем одну невиденную, чей якорь на экране и условие верно', () => {
    expect(nextTip([tipB, tipA], st(), c, { shown: 0, lastAt: 0 }, 10_000, 0, all)).toBe(tipA);
    expect(nextTip([tipA], st({ seen: { star: 1 } }), c, { shown: 0, lastAt: 0 }, 10_000, 0, all)).toBeNull();
    expect(nextTip([{ ...tipA, rev: 2 }], st({ seen: { star: 1 } }), c, { shown: 0, lastAt: 0 }, 10_000, 0, all)?.id).toBe('star');
    expect(nextTip([tipA], st(), c, { shown: 0, lastAt: 0 }, 10_000, 0, () => false)).toBeNull();
  });

  it('не навязываемся: выключены, три за запуск, 20 секунд между, пауза в нажатиях', () => {
    expect(nextTip([tipA], st({ tips: false }), c, { shown: 0, lastAt: 0 }, 10_000, 0, all)).toBeNull();
    expect(nextTip([tipA], st(), c, { shown: LIMITS.perLaunch, lastAt: 0 }, 99_000, 0, all)).toBeNull();
    expect(nextTip([tipA], st(), c, { shown: 1, lastAt: 90_000 }, 99_000, 0, all)).toBeNull();
    expect(nextTip([tipA], st(), c, { shown: 1, lastAt: 70_000 }, 99_000, 0, all)).toBe(tipA);
    expect(nextTip([tipA], st(), c, { shown: 0, lastAt: 0 }, 10_000, 9_000, all)).toBeNull();
  });

  // что было при первом запуске, уже в known (bootTour) — дат выпуска не нужно
  it('«Что нового»: знакомая с rev + 1 и появившаяся после первого запуска; то, что было при нём, — не новое', () => {
    const n = (t: Tip, s: TourStore) => newsOf([{ ...t, news: true }], s).length;
    expect(n(tipA, st())).toBe(1); // в known нет — появилась позже
    expect(n(tipA, st({ known: { star: 1 } }))).toBe(0);
    expect(n({ ...tipA, rev: 2 }, st({ known: { star: 1 } }))).toBe(1);
    expect(newsOf([tipA], st())).toEqual([]); // без news — не новость
    // первый запуск с этой подсказкой — она в known; появилась после него — новая
    const boot = bootTour(null, { roster: 0, welcomeHidden: false }, { star: 1 });
    expect(n(tipA, boot)).toBe(0);
    expect(n({ ...tipA, id: 'code' }, boot)).toBe(1);
  });
});

describe('подсказка «Кубик»', () => {
  const dice = TIPS.find((tp) => tp.id === 'dice')!;
  const ctx = (tab: 'eval' | 'chars', gamble: boolean) =>
    ({ s: { tab }, verdict: { gamble: gamble ? { of: 9, hits: [], target: 'keep', near: [], main: [] } : null } }) as unknown as TourCtx;

  it('только на оценке и только когда у вердикта есть кубик', () => {
    expect([ctx('eval', true), ctx('eval', false), ctx('chars', true)].map((c) => dice.when!(c))).toEqual([true, false, false]);
  });
});

describe('подсказка «Все уже носят не хуже»', () => {
  const worn = TIPS.find((tp) => tp.id === 'worn')!;
  const ctx = (tab: 'eval' | 'chars', lowered: boolean) => ({ s: { tab }, worn: lowered }) as unknown as TourCtx;

  it('только на оценке и только когда штамп понизили по надетому', () => {
    expect([ctx('eval', true), ctx('eval', false), ctx('chars', true)].map((c) => worn.when!(c))).toEqual([true, false, false]);
  });
});
