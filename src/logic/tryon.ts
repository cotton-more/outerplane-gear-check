// Оценка для героя (В7, В10; прежде — примерка одного билда). Цель — герой: строка карточки, «Сейчас на персонажах» и
// «Надеть» — про него, по всем его билдам; штамп общий по ростеру, а заголовок после « — » говорит и про других, и про
// героя, чтобы штамп и строка не спорили. Входы — в карточке персонажа: «Оценить вещь для …», «Собрать билд»,
// «Примерить» (пустой слот), «Слабее всех», «Примерить замену» (вещь) — они только ставят слот и сет на форму
// (build/combo — предустановка) и включают режим героя; «Следующий» его не сбрасывает. «Примерить замену» ещё
// запоминает запись (replace): «Надеть» заменит её в любом случае (решение владельца (а), logic/pool planPut).
// Прежняя примерка билда (tryOnTarget, Target, tryOnTitle, offLine) — до шага 10: её зовёт App.
import { isArmor, type Index } from '../data';
import type { Build, Char, SlotId } from '../data/types';
import type { Texts } from '../i18n';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { comboText, uniqChars } from './builds';
import { isStats, outcomeFor, shownKind, statVariant, STATS, type Outcome, type PoolView } from './pool';
import { byBest, type CharVs } from './poolVs';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import { wearable } from './vs';
import { variantsOf, type Variant } from './variants';

// build — предустановка формы: билд (STATS — «По статам», у персонажа с билдами); нет — режим героя без неё.
// combo — подпись связки варианта (logic/variants); нет — у билда одна связка или берём самую собранную.
// replace — id записи его пула из «Примерить замену»; есть ли она ещё в пуле, проверяет тот, кто её использует
// (planPut, charVs: replaceOf) — запись могли убрать и после чтения из хранилища
export interface TryOn { charId: string; build?: string; combo?: string; replace?: string }
// b — у «По статам» его билд (имя STATS, без связки): имя для показа — targetName
export interface Target { c: Char; b: Build; v: Variant }

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
// Вариант — как в tryOnTarget: из combo, иначе самый собранный по view; build нет или устарел — без варианта
export function heroTarget(idx: Index, t: TryOn | null, view?: PoolView | null): { c: Char; v?: Variant } | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  if (!c) return null;
  const v = t!.build ? tryOnTarget(idx, t, view)?.v : undefined;
  return v ? { c, v } : { c };
}

// вариант примерки: тот, что в combo; его нет в данных (или combo нет) — вариант, собранный больше других (view),
// при равенстве первый
export function tryOnTarget(idx: Index, t: TryOn | null, view?: PoolView | null): Target | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  if (c && t!.build === STATS) {
    const stat = statVariant(c);
    return stat ? { c, b: stat.b, v: stat } : null;
  }
  const b = c?.builds.find((x) => x.name === t!.build);
  if (!c || !b) return null;
  const vs = variantsOf(idx, c).filter((v) => v.parent === b);
  const exact = t!.combo ? vs.find((v) => v.sig === t!.combo) : undefined;
  const asm = view?.of(c.id)?.asm;
  const v = exact ?? vs.reduce((best, x) => ((asm?.get(x.key)?.progress ?? 0) > (asm?.get(best.key)?.progress ?? 0) ? x : best), vs[0]);
  return { c, b, v };
}

// что поставить на форму: слот; у брони — сет, которого варианту не хватает (у «Примерить замену» — сет той вещи,
// если он варианту нужен: вещь не по билду меняют на свою); в связке — первый сет, которого меньше, чем нужно.
// У «По статам» связки нет — сет той вещи или никакого. Грейд не трогаем.
export function tryOnPreset(view: PoolView | null, target: Target, slot: SlotId, from?: Piece | null): { slot: SlotId; setId: string | null } {
  if (!isArmor(slot)) return { slot, setId: null };
  if (isStats(target.v)) return { slot, setId: from?.setId ?? null };
  const combo = target.v.b.sets[0] ?? [];
  if (from?.setId && combo.some((p) => p.set === from.setId)) return { slot, setId: from.setId };
  const a = view?.of(target.c.id)?.asm.get(target.v.key);
  const count = (set: string) => (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).filter((sl) => a?.slots[sl]?.setId === set).length;
  const part = combo.find((p) => count(p.set) < p.n) ?? combo[0];
  return { slot, setId: part?.set ?? null };
}

// то, что говорит о варианте примерки заголовок: исход, сбор, часть связки. null — вещь варианту не подходит
export interface TryRow { kind: string; n?: number; m?: number; part?: string; empty?: boolean } // empty — её слот пуст
export function tryRowOf(idx: Index, o: Outcome | null): TryRow | null {
  if (!o || o.kind === 'stats') return null;
  const part = (set: string | null | undefined, n?: number) => (set ? `${idx.SET[set]?.short ?? set} ×${n ?? 2}` : undefined);
  if (shownKind(o) === 'closer') return { kind: 'closer', n: o.after.progress, m: o.after.need, empty: !o.worn };
  if (o.kind === 'capped') return { kind: 'capped', part: part(o.t4?.set, o.t4?.n) };
  if (o.surplus && o.part) return { kind: 'surplus', part: part(o.part.set, o.part.n) };
  return { kind: o.kind, empty: !o.worn };
}

// имя цели для показа: «По статам» или билд
export const targetName = (t: Texts, target: Target): string => (isStats(target.v) ? t.ui.byStats : target.b.name);

// «Не по билду Speed: Attack в его связках нет.»
export const offLine = (t: Texts, idx: Index, target: Target, setId: string | null): string =>
  t.tryon.offBuild(target.b.name, setId ? idx.SET[setId]?.short ?? setId : null, target.b.sets.map((cb) => comboText(idx, cb)).join(` ${t.ui.or} `));

// Заголовок в примерке: то, что было до « — » (слово вердикта), и дальше — кому ещё нужна и что с ней.
//   «Оставляй — нужна Titia и Kappa; у Caren соберёт Speed/Immu», «Разбирай — но у Caren слот пуст: надень, пока нет лучше»
// armor — броня («нужна»), иначе оружие или аксессуар («нужен»). Цель «По статам», а строки нет (полезных статов
// нет, Р13) — «ничего не даст», а не «не по билду»
export function tryOnTitle(t: Texts, res: Verdict, target: Target, row: TryRow | null, armor = true): string {
  const kind = row?.kind ?? (isStats(target.v) ? 'nothing' : 'off');
  const clause = (temp: boolean) => t.tryon.clause(kind, target.c.name, targetName(t, target), temp, row ?? {});
  return titleWith(t, res, target.c, row, clause, !!res.wornBy?.includes(target.v.key), armor);
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

// общее у заголовков примерки и героя. lowered — штамп понизили (logic/worn: всем, кому подходит, она ничего не
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
// из 4», как прежде в примерке пустого билда
export function heroOutcome(ctx: Ctx, view: PoolView, item: ItemInput, vs: CharVs | null): Outcome | null {
  if (!vs) return null;
  if (vs.best || !vs.starts.length) return vs.best;
  const rows = outcomeFor(ctx, view, vs.c.id, item, { explicit: true })?.rows ?? [];
  return rows.filter((r) => r.entering && vs.starts.includes(r.v)).sort(byBest)[0] ?? null;
}

// строка под карточкой в режиме героя (как offNote примерки в App): не для его класса — «не носит»; главное — «По
// статам» с «Надеть» (вещь не по билду, а по статам подходит, Р11) — «положит её в «По статам»»; сета брони нет ни в
// одном его билде — offHero «Caren она не нужна: Attack нет в билдах Caren». Иначе строки нет: что с вещью — в заголовке
export function heroNote(t: Texts, ctx: Ctx, c: Char, item: ItemInput, vs: CharVs | null): string | null {
  if (!wearable(ctx, c, item)) return t.tryon.noClass(c.name);
  if (vs?.useful && vs.best && isStats(vs.best.v)) return t.tryon.offStats(c.name);
  const set = item.setId;
  if (!isArmor(item.slot) || !set || c.builds.some((b) => b.sets.some((cb) => cb.some((p) => p.set === set)))) return null;
  return t.tryon.offHero(c.name, ctx.idx.SET[set]?.short ?? set);
}
