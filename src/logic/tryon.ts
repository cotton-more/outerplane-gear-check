// Оценка для героя (В7, В10; прежде — примерка одного билда). Цель — герой: строка карточки, «Сейчас на персонажах» и
// «Надеть» — про него, по всем его билдам; штамп общий по ростеру, а заголовок после « — » говорит и про других, и про
// героя, чтобы штамп и строка не спорили. Входы — в карточке персонажа: «Оценить вещь для …», «Собрать билд»,
// «Примерить» (пустой слот), «Слабее всех», «Примерить замену» (вещь) — они только ставят слот и сет на форму
// (build/combo — предустановка) и включают режим героя; «Следующий» его не сбрасывает. «Примерить замену» ещё
// запоминает запись (replace): «Надеть» заменит её в любом случае (решение владельца (а), logic/pool planPut). replace —
// на одну введённую вещь (вопрос 1 (б) ревью eval-only): его снимают «Следующий», load другой вещи, смена слота и
// «Надеть» (App), режим героя остаётся.
import { isArmor, type Index } from '../data';
import type { Char, SlotId } from '../data/types';
import type { Texts } from '../i18n';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { uniqChars } from './builds';
import { holds, isStats, outcomeFor, shownKind, statsUseful, statVariant, STATS, type Outcome, type PoolView } from './pool';
import { byBest, type CharVs } from './poolVs';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import { wearable } from './vs';
import { variantsOf, type Variant } from './variants';

// build — предустановка формы: билд (STATS — «По статам», у персонажа с билдами); нет — режим героя без неё.
// combo — подпись связки варианта (logic/variants); нет — у билда одна связка или берём самую собранную.
// replace — id записи его пула из «Примерить замену»; есть ли она ещё в пуле, проверяет тот, кто её использует
// (planPut, charVs: replaceOf) — запись могли убрать и после чтения из хранилища
export interface TryOn { charId: string; build?: string; combo?: string; replace?: string }
// тот же режим без replace (на одну вещь — App снимает его)
export function noReplace(t: TryOn): TryOn {
  const { replace, ...rest } = t;
  return rest;
}
// герой режима и вариант предустановки формы (heroTarget); v нет — предустановки нет
export interface Hero { c: Char; v?: Variant }

// из хранилища: персонажа в данных больше нет (или это не запись) — режима героя нет. Билда больше нет — режим героя
// без предустановки (build и combo отбрасываем); старое { charId, build } — режим героя с предустановкой. replace —
// только строка
export function restoreTryOn(raw: unknown, idx: Index): TryOn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = typeof r.charId === 'string' ? idx.CHAR[r.charId] : undefined;
  if (!c) return null;
  const build = typeof r.build !== 'string' ? null
    : r.build === STATS ? (c.builds.length ? STATS : null)
      : c.builds.some((b) => b.name === r.build) ? r.build : null;
  return {
    charId: c.id,
    ...(build ? { build } : {}),
    ...(build && build !== STATS && typeof r.combo === 'string' ? { combo: r.combo } : {}),
    ...(typeof r.replace === 'string' && r.replace ? { replace: r.replace } : {}),
  };
}

// цель режима героя: герой и вариант предустановки (только для формы, tryOnPreset; сравнение — по всем билдам).
// Вариант: STATS — «По статам»; билд — вариант из combo, его нет в данных (или combo нет) — собранный больше других
// (view), при равенстве первый; build нет или устарел — без варианта. Герой без билдов (его так не включить, а в
// хранилище бывает от старых данных) — режима героя нет
export function heroTarget(idx: Index, t: TryOn | null, view?: PoolView | null): Hero | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  if (!c?.builds.length) return null; // без билдов сравнивать не с чем (ни билдов, ни «По статам»)
  const v = t!.build === STATS ? statVariant(c) ?? undefined : t!.build ? presetOf(idx, c, t!, view) : undefined;
  return v ? { c, v } : { c };
}

function presetOf(idx: Index, c: Char, t: TryOn, view?: PoolView | null): Variant | undefined {
  const b = c.builds.find((x) => x.name === t.build);
  if (!b) return undefined;
  const vs = variantsOf(idx, c).filter((v) => v.parent === b);
  const exact = t.combo ? vs.find((v) => v.sig === t.combo) : undefined;
  const asm = view?.of(c.id)?.asm;
  return exact ?? vs.reduce((best, x) => ((asm?.get(x.key)?.progress ?? 0) > (asm?.get(best.key)?.progress ?? 0) ? x : best), vs[0]);
}

// что поставить на форму: слот; у брони — сет, которого варианту не хватает (у «Примерить замену» — сет той вещи,
// если он варианту нужен: вещь не по билду меняют на свою); в связке — первый сет, которого меньше, чем нужно.
// У «По статам» связки нет, варианта нет — сет той вещи или никакого. Грейд не трогаем.
export function tryOnPreset(view: PoolView | null, hero: Hero, slot: SlotId, from?: Piece | null): { slot: SlotId; setId: string | null } {
  if (!isArmor(slot)) return { slot, setId: null };
  const v = hero.v;
  if (!v || isStats(v)) return { slot, setId: from?.setId ?? null };
  const combo = v.b.sets[0] ?? [];
  if (from?.setId && combo.some((p) => p.set === from.setId)) return { slot, setId: from.setId };
  const a = view?.of(hero.c.id)?.asm.get(v.key);
  const count = (set: string) => (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).filter((sl) => a?.slots[sl]?.setId === set).length;
  const part = combo.find((p) => count(p.set) < p.n) ?? combo[0];
  return { slot, setId: part?.set ?? null };
}

// то, что говорит об исходе героя заголовок: исход, сбор, часть связки. null — вещь варианту не подходит
interface TryRow { kind: string; n?: number; m?: number; part?: string; empty?: boolean } // empty — её слот пуст
function tryRowOf(idx: Index, o: Outcome | null): TryRow | null {
  if (!o || o.kind === 'stats') return null;
  const part = (set: string | null | undefined, n?: number) => (set ? `${idx.SET[set]?.short ?? set} ×${n ?? 2}` : undefined);
  if (shownKind(o) === 'closer') return { kind: 'closer', n: o.after.progress, m: o.after.need, empty: !o.worn };
  if (o.kind === 'capped') return { kind: 'capped', part: part(o.t4?.set, o.t4?.n) };
  if (o.surplus && o.part) return { kind: 'surplus', part: part(o.part.set, o.part.n) };
  return { kind: o.kind, empty: !o.worn };
}

// Заголовок в режиме героя (В7, В10): штамп общий, после « — » — кому ещё нужна и лучший исход героя по всем его
// билдам (o — heroOutcome): «Оставляй — у Caren соберёт Speed/Immu». Исхода нет (вещь ему ни к чему, или «только
// статы») — про героя ничего: строку под карточкой даёт heroNote
export function heroTitle(t: Texts, idx: Index, res: Verdict, c: Char, o: Outcome | null, armor = true): string {
  const row = tryRowOf(idx, o);
  const build = o ? (isStats(o.v) ? t.ui.byStats : o.v.parent.name) : '';
  const clause = (temp: boolean) => (row ? t.tryon.clause(row.kind, c.name, build, temp, row) : '');
  return titleWith(t, res, c, row, clause, !!o && !!res.wornBy?.includes(o.v.key), armor);
}

// заголовок героя. lowered — штамп понизили (logic/worn: всем, кому подходит, она ничего не
// даёт), и этот исход среди них — заголовок уже про него. Пустая фраза про героя — не добавляем
function titleWith(t: Texts, res: Verdict, c: Char, row: TryRow | null, clause: (temp: boolean) => string, lowered: boolean, armor: boolean): string {
  if (res.v === 'idle') return res.title;
  const T = t.tryon;
  const i = res.title.indexOf(' — ');
  const head = i >= 0 ? res.title.slice(0, i) : res.title;
  const tail = i >= 0 ? res.title.slice(i + 3) : '';
  const kind = row?.kind;
  if (res.v === 'junk' || res.v === 'fodder') {
    if (res.worn === 'lower' && lowered) return res.title;
    if (kind === 'fill' || kind === 'up' || kind === 'closer' || kind === 'completes') return `${head} — ${T.butWear(row?.empty ? 'fill' : kind, c.name)}`;
    const mine = clause(false);
    if (!mine) return res.title;
    return `${head} — ${tail ? `${tail}; ${mine}` : mine}`;
  }
  const top = bestRow(res);
  const sec = top ? res.sections.find((x) => x.rows[0] === top.row) : undefined;
  const others = sec ? uniqChars(sec.rows.filter((r) => r.c.id !== c.id)).map((x) => x.name) : [];
  // лучшей строки нет («Спорно», «не для твоего ростера») — причина вердикта остаётся, к ней — про неё
  const lead = sec ? (others.length ? T.others(others, armor) : '') : tail;
  const parts = [lead, clause(res.v === 'temp')].filter(Boolean);
  if (!parts.length) return res.title;
  // в заголовке не было « — » («Твоим не подходит, но предмет хороший») — второе тире не ставим
  return i >= 0 ? `${head} — ${parts.join('; ')}` : `${head}; ${parts.join('; ')}`;
}

// Исход героя для заголовка (В7, В10): главный по всем его билдам (vs — charVs(…, { explicit: true }) без only).
// Вещь только начнёт билд (главного нет, есть «начнёт …») — лучшая строка того, что она начнёт: «Caren · Speed: сет 1
// из 4»
export function heroOutcome(ctx: Ctx, view: PoolView, item: ItemInput, vs: CharVs | null): Outcome | null {
  if (!vs) return null;
  if (vs.best || !vs.starts.length) return vs.best;
  const rows = outcomeFor(ctx, view, vs.c.id, item, { explicit: true })?.rows ?? [];
  return rows.filter((r) => r.entering && vs.starts.includes(r.v)).sort(byBest)[0] ?? null;
}

// строка под карточкой в режиме героя: не для его класса — «не носит»; главное — «По статам» с «Надеть» (вещь не по
// билду, а по статам подходит, Р11) — «встанет в «По статам»»; сета брони нет ни в одном его билде (и встать с
// выигрышем ей некуда) — offHero «Caren она не нужна: Attack нет в билдах Caren»; ни исхода, ни «начнёт» и полезных
// ему статов у вещи правда нет (Р13: в «По статам» она ничего не стоит; vs нет или есть только кнопка «Заменить» из
// «Примерить замену») — «ничего не даст: полезных статов нет». Иначе строки нет: исходов нет, потому что в пуле не
// хуже, — это скажут чип и заголовок (решение оркестратора, refute-10 п. 5: иначе «полезных статов нет» у вещи с ними)
export function heroNote(t: Texts, ctx: Ctx, c: Char, item: ItemInput, vs: CharVs | null): string | null {
  if (!wearable(ctx, c, item)) return t.tryon.noClass(c.name);
  if (vs?.useful && vs.best && isStats(vs.best.v)) return t.tryon.offStats(c.name);
  const set = item.setId;
  if (isArmor(item.slot) && set && !(vs?.best && holds(vs.best)) && !c.builds.some((b) => b.sets.some((cb) => cb.some((p) => p.set === set)))) {
    return t.tryon.offHero(c.name, ctx.idx.SET[set]?.short ?? set);
  }
  return !vs?.best && !vs?.starts.length && !statsUseful(ctx, c, item) ? t.tryon.noStats(c.name) : null;
}
