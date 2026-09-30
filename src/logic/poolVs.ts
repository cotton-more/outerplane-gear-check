// Строки экранов по пулу (GEARPOOL): одна строка на персонажа — его лучший исход (logic/pool outcomeFor) и
// остальные («Ещё: …»). Их читают карточка вердикта, «Сейчас на персонажах», «Кому надеть?» и примерка.
import { isArmor } from '../data';
import type { Char, SlotId } from '../data/types';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { heldBy, holds, holdsKind, isStats, OUTCOME_ORDER, outcomeFor, planFor, puts, shownKind, type Assembly, type Outcome, type OutcomeOpts, type PoolView } from './pool';
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
  useful: boolean;      // кнопка «Надеть» / «Заменить» (Р4): главный исход держит и она в нём встаёт, или начнёт билд;
                        // при явном выборе — и тихая «По статам», где она встаёт пустым слотом или лучше (Р11)
  replaces: boolean;    // «Надеть» уберёт вещь её слота (planFor, Р7) — подпись «Заменить»
}

// у исхода есть «Надеть» (Р4): держит и она в нём встаёт; тихая «По статам» (есть только при явном выборе) — встаёт
// пустым слотом или лучше (Р11)
const gives = (o: Outcome) => puts(o) || (o.quiet && o.used && holdsKind(o));

// держащий, где она встаёт, — первым: у него кнопка (Р4)
const rank = (o: Outcome) => (puts(o) ? 0 : holds(o) ? 1 : 2) * 100 + OUTCOME_ORDER.indexOf(o.kind);
export const byBest = (a: Outcome, z: Outcome) => rank(a) - rank(z) || (z.delta ?? 0) - (a.delta ?? 0);

// Строка персонажа; null — вещь ему ни к чему (исходов нет, ничего не начнёт). Здесь и только здесь решается, есть ли
// кнопка и что на ней: главный исход, «начнёт …» и «Заменить» / «Надеть» — по тому, что сделает putOn (planFor).
// explicit — персонажа выбрал пользователь (поиск по имени, примерка): тихая строка «По статам» тоже (outcomeFor)
export function charVs(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, only?: string, opts: OutcomeOpts = {}): CharVs | null {
  const o = outcomeFor(ctx, view, charId, item, opts);
  if (!o) return null;
  if (o.worn) return { c: o.c, best: null, rows: [], same: 0, worn: o.worn, starts: [], useful: false, replaces: false };
  // вариант, который вещь только начнёт (не соберёт), — не исход, а строка «начнёт собираться» (design-final D.1)
  const all = opts.explicit ? o.rows : o.rows.filter((r) => !r.quiet);
  const rows = (only ? all.filter((r) => r.v.key === only) : all.filter((r) => !r.entering || r.kind === 'completes')).sort(byBest);
  const starts = only ? [] : o.starts;
  if (!rows.length && !starts.length) return null;
  // Р11: автоматический показ — по сету; строка «По статам» одна героя не приводит
  if (!opts.explicit && !only && !starts.length && rows.every((r) => isStats(r.v))) return null;
  // встаёт только в новые билды — главная строка «начнёт …», а не исход, где она не встаёт или штамп не держит; «начнёт»
  // главнее и строки «По статам» (находка 28). Главная — исход с «Надеть» (и тихая «По статам» при явном выборе): иначе
  // подпись («ломает») и кнопка («Надеть» в «По статам») говорили бы о разном
  const lead = rows.find((r) => gives(r) && !(starts.length && isStats(r.v))) ?? null;
  const best = lead ?? (starts.length ? null : rows[0]);
  if (best && best !== rows[0]) rows.splice(0, rows.length, best, ...rows.filter((r) => r !== best));
  const top = rows[0];
  // «+N» — варианты с тем же исходом на экране: «соберёт» у половины связки — это «сет n из m», не «+1» к «соберёт»
  const same = best ? rows.filter((r) => r !== best && shownKind(r) === shownKind(best) && !r.v.dupOf).length : 0;
  // примерка «По статам» (или запасная строка примерки): встаёт пустым слотом или лучше — «Надеть» и у тихой (Р11)
  const useful = only ? !!top && (isStats(top.v) ? top.used && holdsKind(top) : puts(top)) : o.useful;
  const replaces = useful && !!planFor(ctx, view, charId, item)?.removed.length;
  return { c: o.c, best, rows, same, worn: null, starts, useful, replaces };
}

// строки нескольких персонажей: сначала те, кого вещь держит, потом «уже есть», потом прочие. Вид пула — общий или
// свой у героя: тот, на котором «Надеть» на него сделает putOn (Core Fusion X при X — после окна перехода, App)
export function charsVs(ctx: Ctx, view: PoolView | ((charId: string) => PoolView), item: ItemInput, chars: readonly Char[], opts: OutcomeOpts = {}): CharVs[] {
  const viewOf = typeof view === 'function' ? view : () => view;
  const out = chars.map((c) => charVs(ctx, viewOf(c.id), c.id, item, undefined, opts)).filter((x): x is CharVs => !!x);
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

// где у персонажа стоит запись: собираемые варианты, в выбранной или достижимой сборке которых она есть (как usedIn).
// В настоящем варианте броня не из связки, которой больше некого вытеснять (других вещей её слота в пуле нет), — не
// «засчитано»: прочая в пустой слот — не исход. «По статам» — только если больше нигде: не
// повторять его у каждой вещи, но и вещь только в нём — не бездомная. Что пул держит (usedIn), это не меняет
export function whereUsed(view: PoolView, charId: string, id: string): Variant[] {
  const cp = view.of(charId);
  if (!cp) return [];
  const alone = (slot: SlotId) => !cp.pieces.some((p) => p.slot === slot && p.id !== id);
  const counts = (v: Variant) => heldBy(cp, v).some((a) => {
    const slot = (Object.keys(a.slots) as SlotId[]).find((sl) => a.slots[sl]?.id === id);
    return !!slot && !(isArmor(slot) && a.roles[slot] === 'filler' && alone(slot));
  });
  const real = cp.inPlay.filter((v) => !isStats(v) && counts(v));
  return real.length ? real : cp.stat && heldBy(cp, cp.stat).some((a) => Object.values(a.slots).some((e) => e?.id === id)) ? [cp.stat] : [];
}
