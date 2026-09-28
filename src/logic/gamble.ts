// Кубик Reforge: свежая Epic с тремя сабстатами — первый Reforge добавит ей 4-й, один из статов, которых на вещи
// нет и которые не main, все с равными шансами (пул 106 outerpedia: веса 769/770). Какие из них вытянут вердикт,
// считает та же оценка — с одним сегментом: так 4-й пришёл у владельца в игре (OGC GLSN HSFP → OGC GQBG WXFQ).
// Больше жёлтых сегментов вердикт не ухудшит, так что это нижняя граница: «вытянут, даже с одним сегментом».
// Legendary не играет: у неё 4 сабстата сразу, а следующие Reforge добавляют сегмент случайному из них.
import { isArmor } from '../data';
import type { Ctx } from './context';
import { evalArmor } from './evalArmor';
import { evalGear } from './evalGear';
import { itemMains } from './mains';
import type { Row } from './score';
import { dropSubs } from './subs';
import { bestRow, emptyVerdict, type ItemInput, type Verdict, type VerdictKind } from './verdict';

export type GambleTarget = 'keep' | 'temp';
export interface GambleHit {
  key: string;                    // какой 4-й сабстат вытянет вещь
  v: GambleTarget;                // каким станет вердикт
  best: Omit<Row, 'alt'> | null;  // лучший кандидат нового вердикта — уже с этим сабстатом
  n: number;                      // скольким он подойдёт
}
export interface Gamble {
  of: number;                     // сколько статов может выпасть 4-м
  hits: GambleHit[];              // keep раньше temp, потом — кому подойдёт больше
  target: GambleTarget;           // лучшее, чем может стать вещь
  main: string[];                 // каких 4-м не будет из-за main (кроме них не будет тех, что уже на вещи)
}

// выше — лучше; разобрать, «спорно» и фоддер для кубика одинаковы: вещь сейчас никому из ростера не нужна
const RANK: Partial<Record<VerdictKind, number>> = { temp: 1, keep: 2 };
const rank = (v: VerdictKind) => RANK[v] ?? 0;

// что может выпасть 4-м: статы, которых на вещи нет и которые не запрещены main (тот же стат и вид)
export function fourthPool(ctx: Ctx, s: ItemInput): { pool: string[]; blocked: Set<string> } {
  const { blocked } = itemMains(ctx.idx, s);
  return { pool: ctx.idx.SUB_LIST.filter((k) => !(k in s.subs) && !blocked.has(k)), blocked };
}

export function reforgeGamble(ctx: Ctx, s: ItemInput, res: Verdict): Gamble | null {
  if (s.grade !== 'rare' || Object.keys(s.subs).length !== dropSubs('rare')) return null;
  if (res.v !== 'junk' && res.v !== 'maybe' && res.v !== 'temp') return null;
  const { pool, blocked } = fourthPool(ctx, s);
  // не evaluate(): план и кубик для пробной вещи не нужны
  const judge = isArmor(s.slot) ? evalArmor : evalGear;
  const hits: GambleHit[] = [];
  for (const key of pool) {
    const r = judge(ctx, { ...s, subs: { ...s.subs, [key]: 1 } }, emptyVerdict());
    if (rank(r.v) <= rank(res.v)) continue;
    const top = bestRow(r);
    hits.push({ key, v: r.v as GambleTarget, best: top?.row ?? null, n: top?.n ?? 0 });
  }
  if (!hits.length) return null;
  hits.sort((a, b) => rank(b.v) - rank(a.v) || b.n - a.n);
  return { of: pool.length, hits, target: hits[0].v, main: ctx.idx.SUB_LIST.filter((k) => blocked.has(k)) };
}
