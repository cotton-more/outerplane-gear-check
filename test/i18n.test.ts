// Английская версия полная: вердикты без русского, словарь без русского, в коде нет фраз мимо словаря.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { en } from '../src/i18n/en';
import { TEXTS } from '../src/i18n';
import { tierLabel } from '../src/logic/setBonus';
import { subsText } from '../src/logic/text';
import { makeCtx, type Settings } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import type { Verdict } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const CYR = /[А-Яа-яЁё]/;

const verdictText = (r: Verdict) => [r.title, r.foot, ...r.lines, ...r.sections.map((s) => s.title)].join('\n');

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

// строки GEARPOOL: число сегментов форматирует словарь (RU — запятая, EN — точка), «сегмент» склоняется, бонус сета —
// текстом из данных без лишнего «+», уровень без T4 — «T0–T3», как в карточке персонажа
describe('строки GEARPOOL', () => {
  const speed = D.sets.find((s) => s.short === 'Speed')!;
  const ru = TEXTS.ru.ui, enUi = en.ui;

  it('vsSetCost: «это Speed +13%», не «+Speed +»; RU — «1,5 сегмента», EN — «1.5 SPD segments»', () => {
    const r = ru.vsSetCost('Speed ×2', 'T4', speed.p2!, 1.5, 'SPD', 'gloves');
    const e = enUi.vsSetCost('Speed ×2', 'T4', speed.p2!, 1.5, 'SPD', 'gloves');
    expect(r).toBe('Speed ×2 на T4 — это Speed +13%, около 1,5 сегмента SPD. Перчатки дают меньше.');
    expect(e).toBe('Speed ×2 at T4 is Speed +13%, about 1.5 SPD segments. The gloves add less.');
  });

  it('«сегмент» по числу: 1 сегмент, 2–4 сегмента, 5+ и 11–14 сегментов, 21 сегмент, дробное — сегмента', () => {
    const word = (n: number) => ru.vsNetGain('Speed ×2', n, 'SPD', 'shoes').match(/−(\S+ \S+) SPD/)![1];
    expect([1, 2, 4, 5, 11, 12, 21, 1.5, 0.96].map(word))
      .toEqual(['1 сегмент', '2 сегмента', '4 сегмента', '5 сегментов', '11 сегментов', '12 сегментов', '21 сегмент', '1,5 сегмента', '1 сегмент']);
    expect(enUi.vsNetGain('Speed ×2', 1, 'SPD', 'shoes')).toContain('(−1 SPD segment)');
    expect(enUi.vsNetGain('Speed ×2', 2.25, 'SPD', 'shoes')).toContain('(−2.3 SPD segments)');
  });

  it('«около N сегментов» — родительный: около 1 сегмента, 4 сегментов, 5 сегментов, 21 сегмента, 1,5 сегмента', () => {
    const word = (n: number) => ru.vsSetCost('Speed ×4', 'T4', speed.p4!, n, 'SPD', 'shoes').match(/около (\S+ \S+) SPD/)![1];
    expect([1, 4, 5, 21, 1.5].map(word)).toEqual(['1 сегмента', '4 сегментов', '5 сегментов', '21 сегмента', '1,5 сегмента']);
  });

  it('сравнение «как есть» (Н3): процент, «в N раз» и «у надетой больше» — без хвоста про Reforge впереди, RU/EN', () => {
    expect([ru.vsDelta(21), ru.vsDelta(-8), ru.vsTimes(3), ru.vsAhead('DEF%', 6, 2)]).toEqual([
      '+21% полезных сегментов.', '−8% полезных сегментов.', 'Полезных сегментов в 3 раза больше.', 'На надетой больше сегментов: DEF% — 6 против 2 у новой.']);
    expect([enUi.vsDelta(21), enUi.vsTimes(3), enUi.vsAhead('DEF%', 6, 2)]).toEqual([
      '+21% useful segments.', '3× the useful segments.', 'The one on has more segments: DEF% — 6 vs 2 on the new one.']);
  });

  it('уровень строки без T4 — «T0–T3»', () => {
    expect([tierLabel('T0'), tierLabel('T4')]).toEqual(['T0–T3', 'T4']);
    expect(ru.vsBonusLost('Speed ×4', tierLabel('T0'), speed.p4base!)).toBe('Пропадёт: Speed ×4 (T0–T3) — Speed +25%.');
  });

  it('совет отметить T4 у одной вещи: слот в родительном падеже / is–are', () => {
    expect(['helmet', 'armor', 'gloves', 'shoes'].map((sl) => ru.vsBreaksMarkOne('Penetration', sl))).toEqual([
      'Встанет, если отметить Breakthrough T4 у Penetration-шлема.', 'Встанет, если отметить Breakthrough T4 у Penetration-брони.',
      'Встанет, если отметить Breakthrough T4 у Penetration-перчаток.', 'Встанет, если отметить Breakthrough T4 у Penetration-ботинок.']);
    expect(['helmet', 'gloves'].map((sl) => enUi.vsBreaksMarkOne('Penetration', sl)))
      .toEqual(['Fits once the Penetration helmet is marked Breakthrough T4.', 'Fits once the Penetration gloves are marked Breakthrough T4.']);
  });

  // П6: «у двух» называет слоты (родительный, «-перчаток» без повтора сета); EN — SLOT_EN; сабстаты — в скобках после слота
  it('совет отметить T4 у двух вещей: слоты по порядку, по 4 слотам, RU/EN', () => {
    expect([ru.vsBreaksMarkTwo('Penetration', 'helmet', 'armor'), ru.vsBreaksMarkTwo('Penetration', 'gloves', 'shoes')]).toEqual([
      'Встанет, если отметить Breakthrough T4 у Penetration-шлема и -брони.', 'Встанет, если отметить Breakthrough T4 у Penetration-перчаток и -ботинок.']);
    expect(ru.vsBreaksMarkTwo('Penetration', 'armor', 'gloves')).toBe('Встанет, если отметить Breakthrough T4 у Penetration-брони и -перчаток.');
    expect([enUi.vsBreaksMarkTwo('Penetration', 'armor', 'gloves'), enUi.vsBreaksMarkTwo('Penetration', 'helmet', 'shoes')]).toEqual([
      'Fits once the Penetration armor and gloves are marked Breakthrough T4.', 'Fits once the Penetration helmet and boots are marked Breakthrough T4.']);
  });

  // П5: Breakthrough у вещей известен (0–3) — «сделать» / "reach"
  it('совет сделать T4 (Breakthrough известен): у двух и у одной, по 4 слотам, RU/EN', () => {
    expect(ru.vsBreaksMakeTwo('Penetration', 'armor', 'gloves')).toBe('Встанет, если сделать Breakthrough T4 у Penetration-брони и -перчаток.');
    expect(enUi.vsBreaksMakeTwo('Penetration', 'armor', 'gloves')).toBe('Fits once the Penetration armor and gloves reach Breakthrough T4.');
    expect(['helmet', 'armor', 'gloves', 'shoes'].map((sl) => ru.vsBreaksMakeOne('Penetration', sl))).toEqual([
      'Встанет, если сделать Breakthrough T4 у Penetration-шлема.', 'Встанет, если сделать Breakthrough T4 у Penetration-брони.',
      'Встанет, если сделать Breakthrough T4 у Penetration-перчаток.', 'Встанет, если сделать Breakthrough T4 у Penetration-ботинок.']);
    expect(['helmet', 'armor', 'gloves', 'shoes'].map((sl) => enUi.vsBreaksMakeOne('Penetration', sl))).toEqual([
      'Fits once the Penetration helmet reaches Breakthrough T4.', 'Fits once the Penetration armor reaches Breakthrough T4.',
      'Fits once the Penetration gloves reach Breakthrough T4.', 'Fits once the Penetration boots reach Breakthrough T4.']);
  });

  it('несколько вещей сета в слоте — сабстаты нужной в скобках после слота (у одной и у двух), RU/EN', () => {
    const subs = subsText({ 'DEF%': 2, CHC: 2 });
    expect(subs).toBe('DEF% 2, CHC 2');
    expect(ru.vsBreaksMarkOne('Speed', 'gloves', subs)).toBe('Встанет, если отметить Breakthrough T4 у Speed-перчаток (DEF% 2, CHC 2).');
    expect(enUi.vsBreaksMarkOne('Speed', 'gloves', subs)).toBe('Fits once the Speed gloves (DEF% 2, CHC 2) are marked Breakthrough T4.');
    expect(ru.vsBreaksMarkTwo('Penetration', 'armor', 'gloves', undefined, subs)).toBe('Встанет, если отметить Breakthrough T4 у Penetration-брони и -перчаток (DEF% 2, CHC 2).');
    expect(enUi.vsBreaksMakeTwo('Penetration', 'armor', 'gloves', subs, undefined)).toBe('Fits once the Penetration armor (DEF% 2, CHC 2) and gloves reach Breakthrough T4.');
  });

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

  it('«только статы»: «По статам лучше {шлема} на N%, но сломает …» — слот в родительном падеже', () => {
    expect(ARMOR.map((sl) => ru.vsStatsOnly(25, sl, 'Speed ×4'))).toEqual([
      'По статам лучше шлема на 25%, но сломает Speed ×4 — не надевай.', 'По статам лучше брони на 25%, но сломает Speed ×4 — не надевай.',
      'По статам лучше перчаток на 25%, но сломает Speed ×4 — не надевай.', 'По статам лучше ботинок на 25%, но сломает Speed ×4 — не надевай.']);
    expect(ARMOR.map((sl) => enUi.vsStatsOnly(25, sl, 'Speed ×4'))).toEqual([
      "Beats the helmet by 25% on stats, but breaks Speed ×4 — don't equip.", "Beats the armor by 25% on stats, but breaks Speed ×4 — don't equip.",
      "Beats the gloves by 25% on stats, but breaks Speed ×4 — don't equip.", "Beats the boots by 25% on stats, but breaks Speed ×4 — don't equip."]);
  });

  it('«только статы», у надетой полезных нет: одна строка — «у надетого шлема / надетой брони / надетых перчаток»', () => {
    expect(ARMOR.map((sl) => ru.vsStatsEmpty(sl, 'Speed ×4'))).toEqual([
      'По статам лучше: у надетого шлема полезных нет. Но сломает Speed ×4 — не надевай.',
      'По статам лучше: у надетой брони полезных нет. Но сломает Speed ×4 — не надевай.',
      'По статам лучше: у надетых перчаток полезных нет. Но сломает Speed ×4 — не надевай.',
      'По статам лучше: у надетых ботинок полезных нет. Но сломает Speed ×4 — не надевай.']);
    expect(ARMOR.map((sl) => enUi.vsStatsEmpty(sl, 'Speed ×4'))).toEqual([
      "Better on stats — the helmet on has nothing useful. But it breaks Speed ×4 — don't equip.",
      "Better on stats — the armor on has nothing useful. But it breaks Speed ×4 — don't equip.",
      "Better on stats — the gloves on have nothing useful. But it breaks Speed ×4 — don't equip.",
      "Better on stats — the boots on have nothing useful. But it breaks Speed ×4 — don't equip."]);
  });

  it('«Кому надеть?» при замене: «Заменить {шлем/броню/…} — соберёт / сет n из m / начнёт»', () => {
    expect(ru.equipRowReplaceCompletes(ru.slotAcc.armor, 'Speed')).toBe('Заменить броню — соберёт Speed');
    expect(ru.equipRowReplaceCloser(ru.slotAcc.gloves, 'Speed', 3, 4)).toBe('Заменить перчатки — Speed: сет 3 из 4');
    expect(ru.equipRowReplaceStarts(ru.slotAcc.helmet, 'Speed, Speed/Immu')).toBe('Заменить шлем — начнёт Speed, Speed/Immu');
    expect(enUi.equipRowReplaceCompletes(enUi.slotAcc.shoes, 'Speed')).toBe('Replace boots — completes Speed');
    expect(enUi.equipRowReplaceStarts(enUi.slotAcc.armor, 'Speed')).toBe('Replace armor — starts Speed');
  });

  it('подпись «Собираю», когда часть собирается из пула, а раскладка её не взяла — по имени персонажа', () => {
    expect(ru.fillingReach('Speed ×4', 'Caren')).toBe('— Speed ×4 собирается из вещей Caren, но сейчас выгоднее без неё');
    expect(enUi.fillingReach('Speed ×4', 'Caren')).toBe("— Speed ×4 can be made from Caren's pieces, but the layout is better without it");
  });

  it('«сейчас» у надетой: bt 0 — «ниже T4», bt 1–3 и 4 — как есть, null — «не указан»', () => {
    expect(ru.vsWorn('Legendary', 0)).toBe('сейчас: Legendary, Breakthrough T0–T3');
    expect(ru.vsWorn('Legendary', 2)).toBe('сейчас: Legendary, Breakthrough T2');
    expect(ru.vsWorn('Legendary', null)).toBe('сейчас: Legendary, Breakthrough не указан');
    expect(enUi.vsWorn('Legendary', 0)).toBe('now: Legendary, Breakthrough T0–T3');
    expect(enUi.vsWorn('Legendary', 4)).toBe('now: Legendary, Breakthrough T4');
  });
});
