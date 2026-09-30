// Бонусы сетов в сборке билда (GEARPOOL) — правило владельца по Breakthrough (сверено со страницами сетов outerpedia):
//   - 2P — строка T4, если среди вещей сета хотя бы две на T4; иначе строка T0–T3, если вещей две и больше;
//   - 4P — строка T4, если все четыре на T4; иначе строка T0–T3, если их четыре;
//   - у Speed, Penetration и Bursting на T0–T3 строки 2P нет: вместе с 4P T0–T3 строка 2P T4 не прибавляется
//     (4P T0–T3 — уже весь бонус: Speed T4 T4 T0 T0 = +25%, а не 13 + 25).
// Speed T4 T4 T0 = +13%; Speed T4 ×4 = 13 + 12; Attack T4 T4 T0 T0 = 35 + 20. bt: null (не указан) — не T4; вещь с
// формы оценки — никогда не T4.
// Ценность бонуса — в той же валюте, что ценность вещи (logic/vs value): сегменты стата × вес его места в цепочке ×
// засчитывается. Бонус, который статом не выразить (stat null: Penetration, Immunity, …), ценности не имеет — его
// сборка держит связкой (logic/pool). Нет данных о бонусах или базы SPD — бонус считается невыразимым.
import { CFG } from '../config';
import type { Build, Char, GearSet, SetBonus } from '../data/types';
import type { Ctx } from './context';
import { NO_MAINS } from './mains';
import { subWeights, type SubWeight } from './score';

export interface BonusRow {
  set: string;
  n: 2 | 4;
  tier: 'T4' | 'T0';
  bon: SetBonus;
  unknownBt: boolean; // у какой-то вещи сета Breakthrough не указан — интерфейс попросит «отметь Breakthrough»
}

// уровень строки для показа: 'T0' — это T0–T3 (строка без T4), как в карточке персонажа
export const tierLabel = (tier: BonusRow['tier']): string => (tier === 'T4' ? 'T4' : 'T0–T3');

// строки сета: из bonus, а у старых снимков без него — по тексту (есть строка или нет), без чисел
const EFFECT: SetBonus = { stat: null, value: 0, mode: 'add' };
function rowsOf(s: GearSet): { t0: { p2: SetBonus | null; p4: SetBonus | null }; t4: { p2: SetBonus | null; p4: SetBonus | null } } {
  if (s.bonus) return s.bonus;
  const r = (text: string | null) => (text ? EFFECT : null);
  return { t0: { p2: r(s.p2base), p4: r(s.p4base) }, t4: { p2: r(s.p2), p4: r(s.p4) } };
}

// активные строки бонусов по вещам брони сборки (все сеты, и не из связки билда)
export function bonusRows(sets: Readonly<Record<string, GearSet>>, pieces: readonly { setId: string | null; bt: number | null }[]): BonusRow[] {
  const by = new Map<string, { n: number; n4: number; unknown: boolean }>();
  for (const p of pieces) {
    if (!p.setId) continue;
    const x = by.get(p.setId) ?? { n: 0, n4: 0, unknown: false };
    by.set(p.setId, { n: x.n + 1, n4: x.n4 + (p.bt === 4 ? 1 : 0), unknown: x.unknown || p.bt === null });
  }
  const out: BonusRow[] = [];
  for (const [set, { n, n4, unknown }] of by) {
    const s = sets[set];
    if (!s) continue;
    const t = rowsOf(s);
    const row = (m: 2 | 4, tier: 'T4' | 'T0', bon: SetBonus | null) => { if (bon) out.push({ set, n: m, tier, bon, unknownBt: unknown }); };
    const p4 = n === 4 && n4 === 4 && t.t4.p4 ? 'T4' : n === 4 && t.t0.p4 ? 'T0' : null;
    const p2 = n4 >= 2 && t.t4.p2 ? 'T4' : n >= 2 && t.t0.p2 ? 'T0' : null;
    if (p2 && !(p4 === 'T0' && !t.t0.p2)) row(2, p2, p2 === 'T4' ? t.t4.p2 : t.t0.p2);
    if (p4) row(4, p4, p4 === 'T4' ? t.t4.p4 : t.t0.p4);
  }
  return out;
}

// бонус выражается статом — сет «переводимый»: его можно сломать ради статов, если итог выгоднее (решение владельца)
export function convertible(ctx: Ctx, c: Char, setId: string): boolean {
  const s = ctx.idx.SET[setId];
  if (!s?.bonus) return false;
  const rows = [s.bonus.t0.p2, s.bonus.t0.p4, s.bonus.t4.p2, s.bonus.t4.p4].filter((r): r is SetBonus => !!r);
  return rows.length > 0 && rows.every((r) => r.stat !== null && (r.stat !== 'SPD' || !!spdBase(ctx, c)));
}

// база SPD персонажа (как у flat ATK/DEF/HP: уровень по настройке, quirks — по настройке)
function spdBase(ctx: Ctx, c: Char): number | null {
  const f = c.spd;
  if (!f || !f[0] || !f[1]) return null;
  return f[ctx.settings.lv120 ? 1 : 0] + (ctx.settings.quirks ? f[2] : 0);
}

// сегменты стата, которые даёт строка бонуса; null — статом не выразить
export function bonusSegments(ctx: Ctx, c: Char, bon: SetBonus): number | null {
  if (!bon.stat) return null;
  const step = ctx.idx.SUB[bon.stat]?.step;
  if (!step) return null;
  if (bon.stat !== 'SPD') return bon.value / step;
  const base = spdBase(ctx, c);
  return base ? (bon.value / 100) * base / step : null;
}

// ценность строки бонуса для билда: как у сабстата на том же месте цепочки (стата нет в цепочке — 0), без потолка 6.
// W — веса цепочки билда без main (bonusWeights): у бонуса нет main, который занял бы место
export const bonusWeights = (ctx: Ctx, c: Char, b: Build): Map<string, SubWeight> => subWeights(ctx, b, c, NO_MAINS);
export function bonusValue(ctx: Ctx, c: Char, W: ReadonlyMap<string, SubWeight>, row: BonusRow): number {
  const segs = bonusSegments(ctx, c, row.bon);
  const w = segs && row.bon.stat ? W.get(row.bon.stat) : undefined;
  if (!segs || !w || !w.credit) return 0;
  return CFG.tierWeights[Math.min(w.tier, CFG.tierWeights.length - 1)] * w.credit * segs;
}
