// Строки экранов по пулу (GEARPOOL): одна строка на персонажа — его лучший исход (logic/pool outcomeFor) и
// остальные («Ещё: …»). Их читают карточка вердикта, «Сейчас на персонажах», «Кому надеть?» и примерка.
import type { Char } from '../data/types';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { holds, holdsPiece, isStats, OUTCOME_ORDER, outcomeFor, type Assembly, type Outcome, type PoolView } from './pool';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import type { Variant } from './variants';

export interface CharVs {
  c: Char;
  best: Outcome | null; // лучший исход: держащий, потом по порядку исходов и выигрышу; null — «уже есть» или только «начнёт»
  rows: Outcome[];      // все исходы персонажа (лучший — первый)
  same: number;         // сколько ещё вариантов с тем же исходом («+N» на карточке)
  worn: Piece | null;   // такая же вещь уже у персонажа
  starts: Variant[];    // с ней начнут собираться
  useful: boolean;      // надеть можно: встанет в сборку или начнёт новый
  replaces: boolean;    // вытеснит вещь, которой после этого не будет ни в одной собираемой сборке («Заменить»)
}

const rank = (o: Outcome) => (holds(o) ? 0 : 1) * 100 + OUTCOME_ORDER.indexOf(o.kind);
export const byBest = (a: Outcome, z: Outcome) => rank(a) - rank(z) || (z.delta ?? 0) - (a.delta ?? 0);

// строка персонажа; null — вещь ему ни к чему (исходов нет, ничего не начнёт)
export function charVs(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, only?: string): CharVs | null {
  const o = outcomeFor(ctx, view, charId, item);
  if (!o) return null;
  if (o.worn) return { c: o.c, best: null, rows: [], same: 0, worn: o.worn, starts: [], useful: false, replaces: false };
  // вариант, который вещь только начнёт (не соберёт), — не исход, а строка «начнёт собираться» (design-final D.1)
  const rows = (only ? o.rows.filter((r) => r.v.key === only) : o.rows.filter((r) => !r.entering || r.kind === 'completes')).sort(byBest);
  const starts = only ? [] : o.starts;
  if (!rows.length && !starts.length) return null;
  const best = rows[0] ?? null;
  const same = best ? rows.slice(1).filter((r) => r.kind === best.kind && !r.v.dupOf).length : 0;
  const useful = only ? rows.some((r) => r.used) : o.useful;
  // вытесненная остаётся, если стоит в другой собираемой сборке (с вещью или без неё — туда, куда вещь не встала)
  const gone = best?.used ? best.displaced.map((e) => e.id) : [];
  const cp = view.of(charId)!;
  const kept = (id: string | null) => cp.inPlay.some((v) => {
    const r = o.rows.find((x) => x.v.key === v.key);
    const a = r?.used ? r.after : cp.asm.get(v.key);
    return Object.values(a?.slots ?? {}).some((e) => e?.id === id);
  });
  const replaces = gone.some((id) => !kept(id));
  return { c: o.c, best, rows, same, worn: null, starts, useful, replaces };
}

// строки нескольких персонажей: сначала те, кого вещь держит, потом «уже есть», потом прочие
export function charsVs(ctx: Ctx, view: PoolView, item: ItemInput, chars: readonly Char[]): CharVs[] {
  const out = chars.map((c) => charVs(ctx, view, c.id, item)).filter((x): x is CharVs => !!x);
  const key = (x: CharVs) => (x.best ? (holds(x.best) ? 0 : 3) : x.worn ? 1 : 2);
  return out.sort((a, z) => key(a) - key(z) || (a.best && z.best ? byBest(a.best, z.best) : 0));
}

// кандидаты вердикта: персонажи первой открытой секции (кому вещь подходит)
export function sectionChars(res: Verdict): Char[] {
  if (res.v === 'idle') return [];
  const top = bestRow(res);
  const sec = top && res.sections.find((x) => x.rows[0] === top.row);
  return sec ? uniqChars(sec.rows) : [];
}

// «N/6» варианта: вещи, что работают на него, — части связки и подходящие оружие и аксессуар; у «По статам» — все
export const badgeOf = (a: Assembly): number =>
  isStats(a.v) ? a.filled : Object.values(a.roles).filter((r) => r === 'set' || r === 'rec' || r === 'stopgap').length;

// у кого есть вещи: персонаж → лучший «N/6» среди собираемых вариантов (плитка, меню, фильтр «с экипировкой»)
export function gearBadges(view: PoolView): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of Object.keys(view.st.pools)) {
    const cp = view.of(id);
    if (!cp?.pieces.length) continue;
    out.set(id, Math.max(0, ...cp.inPlay.map((v) => badgeOf(cp.asm.get(v.key)!))));
  }
  return out;
}

// где у персонажа стоит запись: собираемые варианты, в выбранной или достижимой сборке которых она есть (как usedIn)
export function whereUsed(view: PoolView, charId: string, id: string): Variant[] {
  const cp = view.of(charId);
  return cp ? cp.inPlay.filter((v) => holdsPiece(cp, v, id)) : [];
}
