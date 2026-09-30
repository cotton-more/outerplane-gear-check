// Строки экранов по пулу (GEARPOOL): одна строка на персонажа — его лучший исход (logic/pool outcomeFor) и
// остальные («Ещё: …»). Их читают карточка вердикта, «Сейчас на персонажах», «Кому надеть?» и примерка.
import type { Char } from '../data/types';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { holds, holdsPiece, isStats, OUTCOME_ORDER, outcomeFor, planFor, puts, type Assembly, type Outcome, type PoolView } from './pool';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import type { Variant } from './variants';

export interface CharVs {
  c: Char;
  best: Outcome | null; // главный исход: держащий, где она встаёт, потом по порядку исходов и выигрышу; null — «уже
                        // есть» или она только начнёт билд (главная строка — «начнёт …»)
  rows: Outcome[];      // все исходы персонажа (главный — первый, если есть)
  same: number;         // сколько ещё вариантов с тем же исходом («+N» на карточке)
  worn: Piece | null;   // такая же вещь уже у персонажа
  starts: Variant[];    // с ней начнут собираться
  useful: boolean;      // кнопка «Надеть» / «Заменить» (Р4): главный исход держит и она в нём встаёт, или начнёт билд
  replaces: boolean;    // «Надеть» уберёт вещь её слота (planFor, Р7) — подпись «Заменить»
}

// держащий, где она встаёт, — первым: у него кнопка (Р4)
const rank = (o: Outcome) => (puts(o) ? 0 : holds(o) ? 1 : 2) * 100 + OUTCOME_ORDER.indexOf(o.kind);
export const byBest = (a: Outcome, z: Outcome) => rank(a) - rank(z) || (z.delta ?? 0) - (a.delta ?? 0);

// Строка персонажа; null — вещь ему ни к чему (исходов нет, ничего не начнёт). Здесь и только здесь решается, есть ли
// кнопка и что на ней: главный исход, «начнёт …» и «Заменить» / «Надеть» — по тому, что сделает putOn (planFor)
export function charVs(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, only?: string): CharVs | null {
  const o = outcomeFor(ctx, view, charId, item);
  if (!o) return null;
  if (o.worn) return { c: o.c, best: null, rows: [], same: 0, worn: o.worn, starts: [], useful: false, replaces: false };
  // вариант, который вещь только начнёт (не соберёт), — не исход, а строка «начнёт собираться» (design-final D.1);
  // исход «По статам», которого с ней не будет, — не исход
  const live = o.rows.filter((r) => !(o.statGone && isStats(r.v)));
  const rows = (only ? live.filter((r) => r.v.key === only) : live.filter((r) => !r.entering || r.kind === 'completes')).sort(byBest);
  const starts = only ? [] : o.starts;
  if (!rows.length && !starts.length) return null;
  // встаёт только в новые билды — главная строка «начнёт …», а не исход, где она не встаёт или штамп не держит
  const top = rows[0] ?? null;
  const best = (top && puts(top)) || !starts.length ? top : null;
  const same = best ? rows.filter((r) => r !== best && r.kind === best.kind && !r.v.dupOf).length : 0;
  const useful = only ? !!top && puts(top) : o.useful;
  const replaces = useful && !!planFor(ctx, view, charId, item)?.removed.length;
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
