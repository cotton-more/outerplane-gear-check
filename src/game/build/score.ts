// Оценка сабстатов предмета под конкретный билд.
import { CFG } from '@/game/config';
import { FLAT } from '@/game/data';
import type { Build, Char, Grade } from '@/game/data/types';
import type { BuildRef } from './builds';
import type { Ctx } from '@/game/context';
import { NO_MAINS, takenByMain, type ItemMains } from '@/game/item/mains';
import { dropSubs, type Subs } from '@/game/item/subs';

export interface Part { key: string; ok: boolean; half: boolean; tier: number | null }

export interface Score {
  ratio: number | null;  // взвешенно по приоритету, 0…1+ (для сортировки и процента)
  good: number | null;   // полезных сабстатов: 1, ½ или 0 за каждый
  yellow: number;        // сегментов на полезных
  spd: boolean;          // SPD отмечен и нужен билду
  parts: Part[];
  im: ItemMains;         // строки main предмета, под которые считали места цепочки (см. tierPlaces)
  useless: string[];     // flat-сабстаты, которые этому персонажу не засчитываются (uselessFor) — тоже для мест
}

// Сколько стоит сегмент flat-стата относительно сегмента %-версии у ЭТОГО персонажа.
// %-сабстат умножает только собственную базу (уровень + эволюции + flat-quirks) — см. update.py.
// Больше 1 бывает у персонажей с низкой базой (flat DEF +40 против 4% от ~770 у Gnosis Domine на lv 100), но в счёт
// идёт не больше 1: % не бывает хуже flat (см. subWeights).
export function flatFactor(ctx: Ctx, c: Char | null | undefined, axis: string): number {
  const f = c && c.flat && c.flat[axis as 'ATK' | 'DEF' | 'HP'];
  const t = ctx.idx.TICK[axis];
  if (!f || !t || !f[0] || !f[1]) return CFG.flatFallback[axis]; // нет своей базы — берём средние
  const base = f[ctx.settings.lv120 ? 1 : 0] + (ctx.settings.quirks ? f[2] : 0);
  return t[0] / (base * t[1] / 100);
}
const flatCredit = (r: number) => (r >= CFG.flatFull ? 1 : r >= CFG.flatHalf ? 0.5 : 0);

// flat-сабстаты, которые персонажу не засчитываются даже на первом месте цепочки (сегмент слабее 0,6 %-сегмента).
// Почти всегда это flat HP: из 78 билдов с HP в первой тройке он засчитывается троим; flat ATK и DEF — всем хотя бы за ½.
// Если main закрывает ось, а сабстатом остался только такой вид, место в цепочке занято main (см. mains.takenByMain)
export const uselessFor = (ctx: Ctx, c: Char): string[] => [...FLAT].filter((ax) => flatCredit(Math.min(flatFactor(ctx, c, ax), 1)) === 0);

export interface SubWeight { w: number; tier: number; credit: number }

// Место каждой ступени в цепочке приоритета, считая статы: «CHC › ATK › SPD=CHD › DMG UP%» → 0, 1, 2, 4.
// Связка делит одно место, а следующая ступень встаёт после всех её статов: иначе DMG UP% у Delta
// (пятый по важности) считался бы четвёртым и получал ½, а у Lambda тот же пятый DMG UP% — 0.
// Пустая ступень (SPD>>CHC) — разрыв в приоритете, занимает одно место.
// Стат, который main занял целиком (сабстатом ему на этом предмете уже не выпасть), места не занимает: у Luna
// (SPD › HP › CHC › ATK) на аксессуаре с main SPD лучшие сабстаты — HP, CHC, ATK, и ATK для него третий, а не четвёртый.
export function tierPlaces(build: Build, im: ItemMains = NO_MAINS, useless: readonly string[] = []): number[] {
  let pos = 0;
  const no = (k: string) => useless.includes(k);
  return build.subs.map((tier) => {
    const t = pos;
    const left = tier.filter((k) => !takenByMain(k, im, no)).length;
    pos += left < tier.length ? left : Math.max(tier.length, 1); // ступень только из main — не разрыв, её просто нет
    return t;
  });
}

// токены приоритета на первых n местах — «главные статы» билда
export const topTokens = (build: Build, n: number, im: ItemMains = NO_MAINS, useless: readonly string[] = []): string[] => {
  const place = tierPlaces(build, im, useless);
  return build.subs.filter((_, i) => place[i] < n).flat().map((k) => k.trim()).filter(Boolean);
};

// allPlaces — очки «статов + сетов» (MODEL.md §1 item 2): засчитывается каждое место цепочки, без отсечки после 4-го
export function subWeights(ctx: Ctx, build: Build, c: Char, im: ItemMains = NO_MAINS, allPlaces = false): Map<string, SubWeight> {
  // «ключ сабстата предмета → вес / ступень / засчитывается (1, ½, 0)» по приоритету билда
  const out = new Map<string, SubWeight>();
  const put = (key: string, w: number, tier: number, credit: number) => {
    if (im.blocked.has(key)) return; // сабстатом на этом предмете не бывает: main той же строки
    const prev = out.get(key);
    credit = credit >= 1 ? 1 : credit >= 0.5 ? 0.5 : 0;
    if (!prev || prev.credit < credit || (prev.credit === credit && prev.w < w)) out.set(key, { w, tier, credit });
  };
  const useless = uselessFor(ctx, c);
  const no = (k: string) => useless.includes(k);
  const place = tierPlaces(build, im, useless);
  build.subs.forEach((tier, i) => {
    const t = place[i];
    const w = CFG.tierWeights[Math.min(t, CFG.tierWeights.length - 1)];
    const tc = allPlaces ? 1 : CFG.tierCredit[t] ?? 0;
    for (const raw of tier) {
      const tok = raw.trim();
      if (takenByMain(tok, im, no)) continue;
      const axis = tok.replace(/%$/, '');
      if (FLAT.has(axis)) {
        // ATK/DEF/HP в приоритете — параметр, который меняют два разных сабстата: flat и %. На одной вещи бывают оба,
        // и оба засчитываются. % всегда идёт целиком, flat — по своей ценности для персонажа, но не выше %:
        // % растёт вместе с базой (уровень, Awakening, Monad Gate — CalcFinalStat умножает и их, а в flatFactor их нет),
        // flat — нет. Слабый flat в цепочке — жёлтый (½) или серый
        const r = Math.min(flatFactor(ctx, c, axis), 1);
        put(axis + '%', w, t, tc);
        put(axis, w * r, t, tc * flatCredit(r));
      } else if (tok === 'SPD') {
        put(tok, w, t, 1); // скорость полезна на любой ступени — так её и оценивают игроки
      } else if (ctx.idx.SUB[tok]) {
        put(tok, w, t, tc); // токены, которые не выпадают сабстатом (CDMG RED%), пропускаем
      }
    }
  });
  return out;
}

// im — строки main предмета: сабстатов, которые они запрещают, нет ни в идеале, ни на местах цепочки
export function scoreBuild(ctx: Ctx, grade: Grade, c: Char, build: Build, subs: Subs, im: ItemMains): Score {
  const W = subWeights(ctx, build, c, im);
  const keys = Object.keys(subs);
  const n = Math.max(keys.length, dropSubs(grade));
  const ideal = [...W.values()].map((v) => v.w).sort((a, b) => b - a).slice(0, n);
  const max = ideal.reduce((a, b) => a + b, 0) || 1;
  let got = 0, good = 0, yellow = 0;
  const parts = keys.map((k) => {
    const w = W.get(k);
    const m = CFG.rollMult[Math.min(Math.max(subs[k] || 1, 1), CFG.rollMult.length - 1)];
    if (w) { got += w.w * m; good += w.credit; if (w.credit) yellow += subs[k] || 1; }
    return { key: k, ok: !!(w && w.credit), half: !!(w && w.credit > 0 && w.credit < 1), tier: w ? w.tier : null };
  });
  return { ratio: got / max, good, yellow, spd: !!(W.get('SPD') && 'SPD' in subs), parts, im, useless: uselessFor(ctx, c) };
}

// Временная замена (оружие и аксессуар без нужной пассивки) годится только с хорошим роллом: 3 полезных или 2 с 5+
// сегментами. «2 полезных» — только для 3 сабстатов (Epic); Legendary с 4 сабстатами нужно 3 полезных. Считаем по
// грейду, а не по числу отмеченных: иначе недовведённый Legendary проходил бы по правилу Epic
export function tempOk(grade: Grade, m: Pick<Score, 'good' | 'yellow'>): boolean {
  const tempNeed = Math.max(CFG.tempGood2, dropSubs(grade) - 1);
  return m.good != null && (m.good >= CFG.tempGood || (m.good >= tempNeed && m.yellow >= CFG.tempYellow));
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
export function rows(ctx: Ctx, grade: Grade, list: BuildRef[], subs: Subs, im: ItemMains, extra?: (x: BuildRef) => RowExtra): Omit<Row, 'alt'>[] {
  const hasSubs = Object.keys(subs).length > 0;
  return list.map((x) => ({
    ...x,
    ...(hasSubs ? scoreBuild(ctx, grade, x.c, x.b, subs, im) : { ratio: null, good: null, parts: [], spd: false, yellow: 0, im, useless: uselessFor(ctx, x.c) }),
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

// flat-статы предмета, которые не засчитались, хотя их параметр (ATK/DEF/HP) у билда в приоритете, —
// частая путаница: на предмете HP%, а отмечен HP. Путаницы нет, если %-версия тоже отмечена или сабстатом её на этой
// вещи не бывает: у шлема HP% — main, и flat HP отмечен верно.
export function flatMisses(m: Omit<Row, 'alt'>): string[] {
  const marked = new Set(m.parts.map((p) => p.key));
  const place = tierPlaces(m.b, m.im, m.useless);
  const wanted = (axis: string) => m.b.subs.some((tier, i) => (CFG.tierCredit[place[i]] ?? 0) > 0 && tier.some((tok) => tok.trim().replace(/%$/, '') === axis));
  return m.parts.filter((p) => FLAT.has(p.key) && !p.ok && !marked.has(p.key + '%') && !m.im.blocked.has(p.key + '%') && wanted(p.key)).map((p) => p.key);
}
