// Примерка: оценка вещи для одного персонажа и билда. Входы — в карточке персонажа: «Собрать билд», «Примерить»
// (пустой слот), «Примерить замену» (вещь). Сравнение — только с этим билдом, «Надеть» — сразу в него,
// «Следующий» примерку не сбрасывает. Штамп остаётся общим: вещь могут ждать другие, — а заголовок после « — »
// говорит и про других, и про неё, чтобы штамп и строка не спорили. Цель бывает и «По статам» (build = STATS,
// находка 28): вещи персонажа по цепочке, без сетов.
import { isArmor, type Index } from '../data';
import type { Build, Char, SlotId } from '../data/types';
import type { Texts } from '../i18n';
import type { Piece } from './gear';
import { comboText, uniqChars } from './builds';
import { isStats, shownKind, statVariant, STATS, type Outcome, type PoolView } from './pool';
import { bestRow, type Verdict } from './verdict';
import { variantsOf, type Variant } from './variants';

// combo — подпись связки варианта (logic/variants); нет — у билда одна связка или берём самую собранную.
// build = STATS — «По статам» (у персонажа с билдами)
export interface TryOn { charId: string; build: string; combo?: string }
// b — у «По статам» его билд (имя STATS, без связки): имя для показа — targetName
export interface Target { c: Char; b: Build; v: Variant }

// из хранилища: персонажа или билда в данных больше нет — примерки нет
export function restoreTryOn(raw: unknown, idx: Index): TryOn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = typeof r.charId === 'string' ? idx.CHAR[r.charId] : undefined;
  if (!c || typeof r.build !== 'string') return null;
  if (r.build === STATS) return c.builds.length ? { charId: c.id, build: STATS } : null;
  if (!c.builds.some((b) => b.name === r.build)) return null;
  return { charId: c.id, build: r.build, ...(typeof r.combo === 'string' ? { combo: r.combo } : {}) };
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
export function tryRowOf(idx: Index, o: Outcome | null, worn: boolean): TryRow | null {
  if (worn) return { kind: 'worn' };
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
  if (res.v === 'idle') return res.title;
  // вещь уже у персонажа (logic/worn) — заголовок «уже у Caren» уже про неё, «уже на Caren» не повторяем
  if (res.worn === 'home' && row?.kind === 'worn') return res.title;
  const T = t.tryon;
  const i = res.title.indexOf(' — ');
  const head = i >= 0 ? res.title.slice(0, i) : res.title;
  const tail = i >= 0 ? res.title.slice(i + 3) : '';
  const name = target.c.name, build = targetName(t, target);
  const kind = row?.kind ?? (isStats(target.v) ? 'nothing' : 'off');
  const clause = (temp: boolean) => T.clause(kind, name, build, temp, row ?? {});
  if (res.v === 'junk' || res.v === 'fodder') {
    // понизили, потому что всем, кому подходит, она ничего не даёт (logic/worn), и этот вариант среди них — заголовок уже про него
    if (res.worn === 'lower' && res.wornBy?.includes(target.v.key)) return res.title;
    if (kind === 'fill' || kind === 'up' || kind === 'closer' || kind === 'completes') return `${head} — ${T.butWear(row?.empty ? 'fill' : kind, name)}`;
    const mine = clause(false);
    return `${head} — ${tail ? `${tail}; ${mine}` : mine}`;
  }
  const top = bestRow(res);
  const sec = top ? res.sections.find((x) => x.rows[0] === top.row) : undefined;
  const others = sec ? uniqChars(sec.rows.filter((r) => r.c.id !== target.c.id)).map((c) => c.name) : [];
  // лучшей строки нет («Спорно», «не для твоего ростера») — причина вердикта остаётся, к ней — про неё
  const lead = sec ? (others.length ? T.others(others, armor) : '') : tail;
  const parts = [lead, clause(res.v === 'temp')].filter(Boolean);
  // в заголовке не было « — » («Твоим не подходит, но предмет хороший») — второе тире не ставим
  return i >= 0 ? `${head} — ${parts.join('; ')}` : `${head}; ${parts.join('; ')}`;
}
