// Строки экранов по пулу (GEARPOOL): одна строка на персонажа — его лучший исход (logic/pool outcomeFor) и
// остальные («Ещё: …»). Их читают карточка вердикта, «Сейчас на персонажах», «Кому надеть?» и режим героя.
import { isArmor } from '../data';
import type { Char, SlotId } from '../data/types';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import { heldBy, holds, holdsKind, isStats, OUTCOME_ORDER, outcomeFor, planFor, puts, replaceOf, shownKind, type Assembly, type Outcome, type OutcomeOpts, type PoolView } from './pool';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import type { Variant } from './variants';

export interface CharVs {
  c: Char;
  best: Outcome | null; // главный исход: держащий, где она встаёт, потом по порядку исходов и выигрышу; null — она
                        // только начнёт билд (главная строка — «начнёт …»)
  rows: Outcome[];      // все исходы персонажа (главный — первый, если есть)
  same: number;         // сколько ещё вариантов с тем же исходом («+N» на карточке)
  starts: Variant[];    // с ней начнут собираться
  useful: boolean;      // кнопка «Надеть» / «Заменить» (Р4): главный исход держит и она в нём встаёт, или начнёт билд;
                        // при явном выборе — и тихая «По статам», где она встаёт пустым слотом или лучше (Р11)
  replaces: boolean;    // «Надеть» уберёт вещь её слота (planFor, В1) — подпись «Заменить»; убранные других слотов
                        // «Заменить {слот}» не делают — они только в сообщении (prunedNote)
}

// replace — режим «для героя» из «Примерить замену» (TryOn.replace): «Заменить» есть всегда, запись уходит (planPut)
export interface CharVsOpts extends OutcomeOpts { replace?: string | null }

// у исхода есть «Надеть» (Р4): держит и она в нём встаёт; тихая «По статам» (есть только при явном выборе) — встаёт
// пустым слотом или лучше (Р11)
const gives = (o: Outcome) => puts(o) || (o.quiet && o.used && holdsKind(o));

// держащий, где она встаёт, — первым: у него кнопка (Р4)
const rank = (o: Outcome) => (puts(o) ? 0 : holds(o) ? 1 : 2) * 100 + OUTCOME_ORDER.indexOf(o.kind);
export const byBest = (a: Outcome, z: Outcome) => rank(a) - rank(z) || (z.delta ?? 0) - (a.delta ?? 0);

// Строка персонажа; null — вещь ему ни к чему (исходов нет, ничего не начнёт). Здесь и только здесь решается, есть ли
// кнопка и что на ней: главный исход, «начнёт …» и «Заменить» / «Надеть» — по тому, что сделает putOn (planFor).
// explicit — персонажа выбрал пользователь (поиск по имени, режим героя): тихая строка «По статам» тоже (outcomeFor).
// replace — запись из «Примерить замену» (решение владельца «заменить в любом случае» — (а)): есть в его пуле и того же
// слота — кнопка «Заменить» всегда, лучше вещь или хуже (Р4 не действует), даже без исходов; иначе — как без replace.
// Строки и главный исход — те же, что без него: они говорят, что вещь даст, а кнопка — что сделает «Надеть»
export function charVs(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, only?: string, opts: CharVsOpts = {}): CharVs | null {
  const { replace, ...oo } = opts;
  const o = outcomeFor(ctx, view, charId, item, oo);
  if (!o) return null;
  const rep = !!replaceOf(view.of(charId)?.pieces ?? [], item.slot, replace);
  // вариант, который вещь только начнёт (не соберёт), — не исход, а строка «начнёт собираться» (design-final D.1)
  const all = opts.explicit ? o.rows : o.rows.filter((r) => !r.quiet);
  const rows = (only ? all.filter((r) => r.v.key === only) : all.filter((r) => !r.entering || r.kind === 'completes')).sort(byBest);
  const starts = only ? [] : o.starts;
  if (!rows.length && !starts.length && !rep) return null;
  // Р11: автоматический показ — по сету; строка «По статам» одна героя не приводит
  if (!opts.explicit && !rep && !only && !starts.length && rows.every((r) => isStats(r.v))) return null;
  // встаёт только в новые билды — главная строка «начнёт …», а не исход, где она не встаёт или штамп не держит; «начнёт»
  // главнее и строки «По статам» (находка 28). Главная — исход с «Надеть» (и тихая «По статам» при явном выборе): иначе
  // подпись («ломает») и кнопка («Надеть» в «По статам») говорили бы о разном
  const lead = rows.find((r) => gives(r) && !(starts.length && isStats(r.v))) ?? null;
  const best = lead ?? (starts.length ? null : rows[0] ?? null);
  if (best && best !== rows[0]) rows.splice(0, rows.length, best, ...rows.filter((r) => r !== best));
  const top = rows[0];
  // «+N» — варианты с тем же исходом на экране: «соберёт» у половины связки — это «сет n из m», не «+1» к «соберёт»
  const same = best ? rows.filter((r) => r !== best && shownKind(r) === shownKind(best) && !r.v.dupOf).length : 0;
  // only — строка одного варианта («По статам» или запасная): встаёт пустым слотом или лучше — «Надеть» и у тихой (Р11)
  const useful = rep || (only ? !!top && (isStats(top.v) ? top.used && holdsKind(top) : puts(top)) : o.useful);
  const replaces = useful && !!planFor(ctx, view, charId, item, replace)?.removed.some((p) => p.slot === item.slot);
  return { c: o.c, best, rows, same, starts, useful, replaces };
}

// строки нескольких персонажей: сначала те, кого вещь держит, потом прочие. Вид пула — общий или
// свой у героя: тот, на котором «Надеть» на него сделает putOn (Core Fusion X при X — после окна перехода, App)
export function charsVs(ctx: Ctx, view: PoolView | ((charId: string) => PoolView), item: ItemInput, chars: readonly Char[], opts: OutcomeOpts = {}): CharVs[] {
  const viewOf = typeof view === 'function' ? view : () => view;
  const out = chars.map((c) => charVs(ctx, viewOf(c.id), c.id, item, undefined, opts)).filter((x): x is CharVs => !!x);
  const key = (x: CharVs) => (x.best ? (holds(x.best) ? 0 : 3) : 2);
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

// где у персонажа стоит запись: собираемые варианты, в выбранной или достижимой сборке которых она есть.
// В настоящем варианте броня не из связки, которой больше некого вытеснять (других вещей её слота в пуле нет), — не
// «засчитано»: прочая в пустой слот — не исход. Нет таких — варианты, которые не собираются («Не собираю» или не
// начат), а пул их сборки держит (held, решение владельца «что держит пул» — (а)): вещь, которую держит только такой
// вариант, — тоже «в нём», а не без строки. «По статам» — никогда: он вещи не держит («Надето», В4). Что пул держит
// (usedIn), это не меняет
export function whereUsed(view: PoolView, charId: string, id: string): Variant[] {
  return whereOf(view, charId, id).builds;
}
// то же и надета ли запись на герое (worn): у надетой «надета» вместо «где стоит», и она не «бездомная» (PoolList)
export interface Where { builds: Variant[]; worn: boolean }
export function whereOf(view: PoolView, charId: string, id: string): Where {
  const cp = view.of(charId);
  if (!cp) return { builds: [], worn: false };
  const alone = (slot: SlotId) => !cp.pieces.some((p) => p.slot === slot && p.id !== id);
  const counts = (v: Variant) => heldBy(cp, v).some((a) => {
    const slot = (Object.keys(a.slots) as SlotId[]).find((sl) => a.slots[sl]?.id === id);
    return !!slot && !(isArmor(slot) && a.roles[slot] === 'filler' && alone(slot));
  });
  const worn = cp.worn.has(id);
  const real = cp.inPlay.filter((v) => !isStats(v) && counts(v));
  if (real.length) return { builds: real, worn };
  return { builds: cp.variants.filter((v) => !isStats(v) && !cp.inPlay.includes(v) && counts(v)), worn };
}
