// Английская версия полная: вердикты без русского, словарь без русского, в коде нет фраз мимо словаря.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { en } from '@/i18n/en';
import { TEXTS } from '@/i18n';
import { makeCtx, type Settings } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import type { Verdict } from '@/features/eval/verdict/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const CYR = /[А-Яа-яЁё]/;

const verdictText = (r: Verdict) => [r.title, r.foot, ...r.lines, ...r.sections.map((s) => s.title)].join('\n');

describe('английские вердикты', () => {
  it('все случаи эталона считаются на английском без единой русской буквы', () => {
    const leaks: string[] = [];
    for (const { in: inp } of golden.cases) {
      const settings: Settings = { rosterOnly: inp.rosterOnly, stage: inp.stage ?? 'grow', lv120: !!inp.lv120, quirks: inp.quirks ?? true };
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
const ALLOWED = ['src/i18n/ru.ts', 'src/i18n/index.ts', 'src/features/eval/code/codec.ts', 'src/app/useHotkeys.ts'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

// Source with the comments removed, string-aware: `//` or `/*` inside a '…', "…" or `…` literal (a URL, a glob) does not
// start a comment, so Cyrillic in a string after it is still seen. A quote string ends at a newline (JSX text may hold a
// lone apostrophe); template literals nest through `${…}`. Regex literals are not understood — none holds a quote or `//`.
function stripComments(src: string): string {
  let out = '', i = 0, depth = 0;
  const tpl: number[] = []; // brace depth at each open `${`
  let mode: 'code' | 'tpl' = 'code';
  while (i < src.length) {
    const c = src[i], two = src.slice(i, i + 2);
    if (mode === 'tpl') {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === '`') mode = 'code';
      else if (two === '${') { tpl.push(depth++); out += two; i += 2; mode = 'code'; continue; }
      out += c; i++;
      continue;
    }
    if (two === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '`') mode = 'tpl';
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); mode = 'tpl'; }
    }
    out += c; i++;
  }
  return out;
}

describe('stripComments', () => {
  const left = (src: string) => CYR.test(stripComments(src));
  it('drops Cyrillic in line, block and JSX comments', () => {
    expect(left('const a = 1; // Привет')).toBe(false);
    expect(left('/* Привет\n   ещё */ const a = 1;')).toBe(false);
    expect(left('<p>{/* Привет */}</p>')).toBe(false);
    expect(left('const a = 1; /* Привет */ const b = 2; // Пока')).toBe(false);
  });
  it('keeps Cyrillic in strings, also after a string that holds // or /*', () => {
    expect(left('const a = "Привет";')).toBe(true);
    expect(left('const a = "https://x.test", b = "Привет";')).toBe(true);
    expect(left("const a = 'x //y', b = 'Привет';")).toBe(true);
    expect(left('const a = "/*", b = "Привет"; /* коммент */')).toBe(true);
    expect(left('const a = `//${x}`, b = `Привет ${"/* y"} ещё`;')).toBe(true);
    expect(left('const a = `${`//`}`; const b = "Привет";')).toBe(true);
  });
  it('a comment after such a string is still dropped', () => {
    expect(left('const a = "https://x.test"; // Привет')).toBe(false);
    expect(left('const a = `${"x"} //`; // Привет\nconst b = 1;')).toBe(false);
  });
  it('line numbers survive block comments', () => {
    expect(stripComments('a /* x\ny */ b').split('\n')).toHaveLength(2);
  });
});

describe('исходники', () => {
  it('русские фразы — только в src/i18n/ru.ts', () => {
    const root = new URL('..', import.meta.url).pathname;
    const leaks = sources(join(root, 'src'))
      .filter((p) => !ALLOWED.includes(relative(root, p)))
      .flatMap((p) => stripComments(readFileSync(p, 'utf8')).split('\n').filter((l) => CYR.test(l)).map((l) => `${relative(root, p)}: ${l.trim()}`));
    expect(leaks).toEqual([]);
  });
});

// строки GEARPOOL: число сегментов форматирует словарь (RU — запятая, EN — точка), «сегмент» склоняется, бонус сета —
// текстом из данных без лишнего «+», уровень без T4 — «T0–T3», как в карточке персонажа
describe('строки GEARPOOL', () => {
  const ru = TEXTS.ru.ui, enUi = en.ui;

  it('тост двух и трёх убранных — по имени сета или предмета', () => {
    expect(ru.replacedMany('Caren', 'shoes', ['Speed', 'Immunity'])).toBe('Заменено: ботинки Caren — убраны прежние: Speed и Immunity.');
    expect(ru.replacedMany('Caren', 'shoes', ['Speed', 'Attack', 'Immunity'])).toBe('Заменено: ботинки Caren — убраны прежние: Speed, Attack и Immunity.');
    expect(enUi.replacedMany('Caren', 'shoes', ['Speed', 'Attack', 'Immunity'])).toBe("Replaced: Caren's boots — the old Speed, Attack and Immunity ones are removed.");
  });

  const ARMOR = ['helmet', 'armor', 'gloves', 'shoes'];

  it('старая той же линии — материал новой: слот склоняется, 2+ убранных — по имени; EN one\'s / ones\'', () => {
    expect(ARMOR.map((sl) => ru.oldMaterial(sl))).toEqual([
      'Старый шлем — материал для Breakthrough нового.', 'Старая броня — материал для Breakthrough новой.',
      'Старые перчатки — материал для Breakthrough новых.', 'Старые ботинки — материал для Breakthrough новых.']);
    expect([ru.oldMaterial('weapon'), ru.oldMaterial('accessory')])
      .toEqual(['Старое оружие — материал для Breakthrough нового.', 'Старый аксессуар — материал для Breakthrough нового.']);
    expect([ru.oldMaterial('shoes', 'Speed'), ru.oldMaterial('weapon', 'Caracal')])
      .toEqual(['Speed-ботинки — материал для Breakthrough новых.', 'Оружие Caracal — материал для Breakthrough нового.']);
    expect(ARMOR.map((sl) => enUi.oldMaterial(sl))).toEqual([
      "The old helmet can feed the new one's Breakthrough.", "The old armor can feed the new one's Breakthrough.",
      "The old gloves can feed the new ones' Breakthrough.", "The old boots can feed the new ones' Breakthrough."]);
    expect(enUi.oldMaterial('shoes', 'Speed')).toBe("The Speed boots can feed the new ones' Breakthrough.");
  });

  it('«сейчас» у надетой: bt 0 — «ниже T4», bt 1–3 и 4 — как есть, null — «не указан»', () => {
    expect(ru.vsWorn('Legendary', 0)).toBe('сейчас: Legendary, Breakthrough T0–T3');
    expect(ru.vsWorn('Legendary', 2)).toBe('сейчас: Legendary, Breakthrough T2');
    expect(ru.vsWorn('Legendary', null)).toBe('сейчас: Legendary, Breakthrough не указан');
    expect(enUi.vsWorn('Legendary', 0)).toBe('now: Legendary, Breakthrough T0–T3');
    expect(enUi.vsWorn('Legendary', 4)).toBe('now: Legendary, Breakthrough T4');
  });

  // .x/0085 TEXTS.md: points — to tenths without trailing zeros (as in «Надето» and «Обмене»), a comma in RU; the slot's gender in reserve phrases
  it('«статы + сеты»: очки «2,5 / 2.5», запас по роду слота, «A и B» в тихой строке, RU/EN', () => {
    const F = TEXTS.ru.fit, E = TEXTS.en.fit;
    expect([F.pts(2.5), F.pts(8.25), F.pts(2.954), F.pts(1), F.pts(4.87), E.pts(2.5), E.pts(4.87), E.pts(1)]).toEqual(['2,5', '8,3', '3', '1', '4,9', '2.5', '4.9', '1']);
    expect(F.gain('Caren', F.pts(1.95))).toBe('Caren станет сильнее на 2 очк.');
    expect(F.gain('Caren', F.pts(1.64))).toBe('Caren станет сильнее на 1,6 очк.');
    expect(['helmet', 'armor', 'gloves'].map((sl) => F.reserveWhy('Caren', 'Speed', sl))).toEqual([
      'У Caren начат Speed, а Speed-шлема нет. Придёт сильный — этот пойдёт ему в Breakthrough.',
      'У Caren начат Speed, а Speed-брони нет. Придёт сильная — эта пойдёт ей в Breakthrough.',
      'У Caren начат Speed, а Speed-перчаток нет. Придут сильные — эти пойдут им в Breakthrough.',
    ]);
    expect(F.keepBest('Speed', 'gloves', 'Caren')).toBe('Оставляй — лучшие Speed-перчатки у Caren');
    expect(F.quietEmpty('Rin', 'shoes', ['ATK%', 'CHC'])).toBe('У Rin нет ботинок — эта слабая, годная будет с ATK% и CHC.');
    expect(E.quietBetter('Rin', '1.8', ['ATK%', 'CHC'])).toBe('Rin wears worse now (+1.8 pts), but this one is weak too — a good one has ATK% and CHC.');
    expect([F.chipRank('accessory'), F.chipRank('weapon')]).toEqual(['рекомендованный', 'рекомендованное']);
  });
});

// .x/0070-more-sheet SPEC 10: Справка и обучение говорят про «Ещё» и режимы списка, а не про прежнее меню ☰, подвал и галочки
describe('справка и обучение после «Ещё»', () => {
  const STALE = {
    ru: [/меню ☰/i, /в подвале/i, /экспорт \/ импорт/i, /не всё надето/i, /показать и без билдов/i, /Обмен для команды.{0,12}в ростере/],
    en: [/☰ menu/i, /footer/i, /export \/ import/i, /not fully equipped/i, /show those without builds/i, /Team trade" in the roster/],
  } as const;
  const help = (lang: 'ru' | 'en') => {
    const u = TEXTS[lang].ui, t = TEXTS[lang].tour;
    return [...u.helpInputItems, ...u.helpRoutineItems, ...u.helpVerdicts, ...u.helpChars, ...u.helpTradeItems, ...u.helpInstallItems, ...u.steps,
      t.endText(true), t.endText(false), t.gearEnd(true), t.gearEnd(false), ...Object.values(t.tips) as string[], ...Object.values(t.news) as string[]].join('\n');
  };

  it.each(['ru', 'en'] as const)('%s: нет отсылок к прежнему меню ☰, подвалу, «экспорт / импорт» и галочкам', (lang) => {
    const text = help(lang);
    expect(STALE[lang].filter((re) => re.test(text)).map(String)).toEqual([]);
  });

  it.each(['ru', 'en'] as const)('%s: Справка называет «Ещё», «Доодеть», резервную копию и «Обмен»', (lang) => {
    const u = TEXTS[lang].ui;
    const chars = u.helpChars.join('\n');
    for (const word of [u.more, u.modeMine, u.modeToDress, u.backup, u.moreSettings]) expect(chars).toContain(word);
    expect(u.helpTradeItems.join('\n')).toContain(u.tradeBtn);
    expect(u.helpInputItems.join('\n')).toContain(u.more);
  });

  it.each(['ru', 'en'] as const)('%s: конец тура зовёт «Ещё»; «Что нового» про «Ещё» — владельцев текст', (lang) => {
    const t = TEXTS[lang].tour;
    expect(t.endText(true)).toContain(lang === 'ru' ? '«Ещё»' : '“More”');
    expect(t.tips.more).toBe(lang === 'ru' ? 'Настройки оценки, резервная копия, язык и справка — в «Ещё».' : 'Evaluation settings, backup, language and help are in “More”.');
  });
});
