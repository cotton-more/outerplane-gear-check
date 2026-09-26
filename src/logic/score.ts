// Оценка сабстатов предмета под конкретный билд.
import { CFG } from '../config';
import { FLAT } from '../data';
import type { Build, Char, Grade } from '../data/types';
import type { BuildRef } from './builds';
import type { Ctx } from './context';
import { maxSubs, type Subs } from './subs';
import { fmtGood } from './text';
import type { Texts } from '../i18n/ru';

export interface Part { key: string; ok: boolean; half: boolean; tier: number | null }

export interface Score {
  ratio: number | null;  // взвешенно по приоритету, 0…1+ (для сортировки и процента)
  good: number | null;   // полезных сабстатов: 1, ½ или 0 за каждый
  yellow: number;        // жёлтых сегментов на полезных
  spd: boolean;          // SPD отмечен и нужен билду
  parts: Part[];
}

// Сколько стоит сегмент flat-стата относительно сегмента %-версии у ЭТОГО персонажа.
// %-сабстат умножает только собственную базу (уровень + эволюции + flat-quirks) — см. update.py.
export function flatFactor(ctx: Ctx, c: Char | null | undefined, axis: string): number {
  const f = c && c.flat && c.flat[axis as 'ATK' | 'DEF' | 'HP'];
  const t = ctx.idx.TICK[axis];
  if (!f || !t || !f[0] || !f[1]) return CFG.flatFallback[axis]; // нет своей базы — берём средние
  const base = f[ctx.settings.lv120 ? 1 : 0] + (ctx.settings.quirks ? f[2] : 0);
  return t[0] / (base * t[1] / 100);
}
const flatCredit = (r: number) => (r >= CFG.flatFull ? 1 : r >= CFG.flatHalf ? 0.5 : 0);

export interface SubWeight { w: number; tier: number; credit: number }

// Место каждой ступени в цепочке приоритета, считая статы: «CHC › ATK › SPD=CHD › DMG UP%» → 0, 1, 2, 4.
// Связка делит одно место, а следующая ступень встаёт после всех её статов: иначе DMG UP% у Delta
// (пятый по важности) считался бы четвёртым и получал ½, а у Lambda тот же пятый DMG UP% — 0.
// Пустая ступень (SPD>>CHC) — разрыв в приоритете, занимает одно место.
export function tierPlaces(build: Build): number[] {
  let pos = 0;
  return build.subs.map((tier) => { const t = pos; pos += Math.max(tier.length, 1); return t; });
}

// токены приоритета на первых n местах — «главные статы» билда
export const topTokens = (build: Build, n: number): string[] => {
  const place = tierPlaces(build);
  return build.subs.filter((_, i) => place[i] < n).flat().map((k) => k.trim()).filter(Boolean);
};

export function subWeights(ctx: Ctx, build: Build, c: Char): Map<string, SubWeight> {
  // «ключ сабстата предмета → вес / ступень / засчитывается (1, ½, 0)» по приоритету билда
  const out = new Map<string, SubWeight>();
  const put = (key: string, w: number, tier: number, credit: number) => {
    const prev = out.get(key);
    credit = credit >= 1 ? 1 : credit >= 0.5 ? 0.5 : 0;
    if (!prev || prev.credit < credit || (prev.credit === credit && prev.w < w)) out.set(key, { w, tier, credit });
  };
  const place = tierPlaces(build);
  build.subs.forEach((tier, i) => {
    const t = place[i];
    const w = CFG.tierWeights[Math.min(t, CFG.tierWeights.length - 1)];
    const tc = CFG.tierCredit[t] ?? 0;
    for (const raw of tier) {
      const tok = raw.trim();
      const axis = tok.replace(/%$/, '');
      if (FLAT.has(axis)) {
        // ATK/DEF/HP в приоритете — ось: подходит и flat, и %; лучшая из двух версий получает полный вес
        const r = flatFactor(ctx, c, axis);
        put(axis + '%', r > 1 ? w / r : w, t, tc * (r > 1 ? flatCredit(1 / r) : 1));
        put(axis, r > 1 ? w : w * r, t, tc * flatCredit(Math.min(r, 1)));
      } else if (tok === 'SPD') {
        put(tok, w, t, 1); // скорость полезна на любой ступени — так её и оценивают игроки
      } else if (ctx.idx.SUB[tok]) {
        put(tok, w, t, tc); // токены, которые не выпадают сабстатом (CDMG RED%), пропускаем
      }
    }
  });
  return out;
}

export function scoreBuild(ctx: Ctx, grade: Grade, c: Char, build: Build, subs: Subs, excluded: Set<string>): Score {
  const W = subWeights(ctx, build, c);
  const keys = Object.keys(subs);
  const n = Math.max(keys.length, maxSubs(grade));
  const ideal = [...W.entries()].filter(([k]) => !excluded.has(k)).map(([, v]) => v.w).sort((a, b) => b - a).slice(0, n);
  const max = ideal.reduce((a, b) => a + b, 0) || 1;
  let got = 0, good = 0, yellow = 0;
  const parts = keys.map((k) => {
    const w = W.get(k);
    const m = CFG.rollMult[Math.min(Math.max(subs[k] || 1, 1), CFG.rollMult.length - 1)];
    if (w) { got += w.w * m; good += w.credit; if (w.credit) yellow += subs[k] || 1; }
    return { key: k, ok: !!(w && w.credit), half: !!(w && w.credit > 0 && w.credit < 1), tier: w ? w.tier : null };
  });
  return { ratio: got / max, good, yellow, spd: !!(W.get('SPD') && 'SPD' in subs), parts };
}

// Строка списка «кому подходит»: билд, его оценка и доп. поля ветки (комбо сета, main stat).
export interface Row extends BuildRef, Score {
  alt: string[];         // другие билды того же персонажа
  // из них — с другой цепочкой приоритета сабстатов (такое у 8 из 95 персонажей): в списке — своя строка цепочки
  other?: Omit<Row, 'alt' | 'other'>[];
  combos?: BuildRef['b']['sets'];
  mains?: string[];
  mainOk?: boolean;
}

export type RowExtra = Partial<Pick<Row, 'combos' | 'mains' | 'mainOk'>>;

// строки списка: оценка каждого билда + один персонаж — одна строка (лучший билд), остальные — в «ещё»
export function rows(ctx: Ctx, grade: Grade, list: BuildRef[], subs: Subs, excluded: Set<string>, extra?: (x: BuildRef) => RowExtra): Omit<Row, 'alt'>[] {
  const hasSubs = Object.keys(subs).length > 0;
  return list.map((x) => ({
    ...x,
    ...(hasSubs ? scoreBuild(ctx, grade, x.c, x.b, subs, excluded) : { ratio: null, good: null, parts: [], spd: false, yellow: 0 }),
    ...(extra ? extra(x) : {}),
  }));
}

const chainKey = (b: Build) => b.subs.map((tier) => tier.join('=')).join('>');

export function dedupe(list: Omit<Row, 'alt'>[], rank: (r: Omit<Row, 'alt'>) => number): Row[] {
  list.sort((a, b) => rank(b) - rank(a) || a.c.name.localeCompare(b.c.name));
  const seen = new Map<string, Row>();
  for (const r of list) {
    const prev = seen.get(r.c.id);
    if (!prev) { seen.set(r.c.id, { ...r, alt: [], other: [] }); continue; }
    if (!prev.alt.includes(r.b.name)) prev.alt.push(r.b.name);
    const key = chainKey(r.b);
    if (key !== chainKey(prev.b) && !prev.other!.some((o) => chainKey(o.b) === key)) prev.other!.push(r);
  }
  return [...seen.values()];
}

// flat-статы предмета, которые не засчитались, хотя их ось (ATK/DEF/HP) у билда в приоритете, —
// частая путаница: на предмете HP%, а отмечен HP. Если %-версия тоже отмечена, путаницы нет.
export function flatMisses(m: Omit<Row, 'alt'>): string[] {
  const marked = new Set(m.parts.map((p) => p.key));
  const place = tierPlaces(m.b);
  const wanted = (axis: string) => m.b.subs.some((tier, i) => (CFG.tierCredit[place[i]] ?? 0) > 0 && tier.some((tok) => tok.trim().replace(/%$/, '') === axis));
  return m.parts.filter((p) => FLAT.has(p.key) && !p.ok && !marked.has(p.key + '%') && wanted(p.key)).map((p) => p.key);
}

export interface RollInfo { level: 'high' | 'mid' | 'low'; text: string }

// «Ролл» предмета: сколько сабстатов полезны лучшему кандидату и сколько на них жёлтых сегментов.
// Жёлтые — стартовое качество; от него зависит, сколько получится после Reforge, то есть стоит ли вкладываться.
export function rollInfo(t: Texts, m: Row | undefined, n: number): RollInfo | null {
  if (!m || m.good == null || !n) return null;
  const max = 3 * n;
  const level = m.yellow >= CFG.rollHigh * max ? 'high' : m.yellow >= CFG.rollMid * max ? 'mid' : 'low';
  return { level, text: t.verdict.roll(fmtGood(m.good), n, m.yellow, max, level) };
}
