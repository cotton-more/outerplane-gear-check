// Вердикт экрана «Оценка»: оценка по порогам (features/eval/verdict evaluate) — без ростера и пока введены не все
// сабстаты (A20, A21); с ростером — исход по «статам + сетам» (features/gear/verdict): штамп, заголовок и строки
// (features/gear/ui/outcomeText), до трёх героев в «Сейчас на персонажах», тихая строка (вопрос 12). В режиме героя
// (features/tryon) — его строка, «Надеть» и заголовок про него.
import { useMemo } from 'react';
import { FLAT, isArmor, type Index } from '@/game/data';
import type { Ctx } from '@/game/context';
import { dropSubs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';
import { namesLine } from '@/game/text';
import type { Texts } from '@/i18n';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { upgradePlan } from '@/features/eval/verdict/upgrade';
import type { Verdict } from '@/features/eval/verdict/verdict';
import { itemInput, type FormState } from '@/features/eval/form/formState';
import type { GearStore } from '@/features/gear/model/gear';
import { storeFor } from '@/features/gear/model/fusion';
import { poolView, type PoolView } from '@/features/gear/pool';
import { charVs, type CharVs } from '@/features/gear/model/poolVs';
import { verdictOf, type Result } from '@/features/gear/verdict';
import { resultHead } from '@/features/gear/ui/outcomeText';
import { pieceLabel } from '@/features/gear/ui/pieceText';
import { heroNote, heroTitle, type Hero } from '@/features/tryon/tryon';

// Вердикт по исходу ростера. Прежний (raw) даёт то, чего исход не знает: строки «Проверь HP: flat», кому из не ростера
// она «Оставить» («Спорно»), причину «Разобрать», когда она никому не годная
function fromResult(ctx: Ctx, raw: Verdict, r: Result, input: ItemInput): Verdict {
  const { idx, t } = ctx;
  const flat = new Set([...FLAT].map((k) => t.verdict.flatHint(k)));
  const hints = raw.lines.filter((l) => flat.has(l));
  const armor = isArmor(input.slot);
  const head = resultHead(t, idx, r, input, pieceLabel(t, idx));
  let out: Verdict;
  if (head) out = { ...raw, ...head, lines: [...head.lines, ...hints], sections: [] };
  else if (r.kind === 'maybe') {
    const names = namesLine(r.maybe.map((c) => ({ c })), t.more, 4);
    out = {
      ...raw, v: 'maybe', title: raw.v === 'maybe' ? raw.title : armor ? t.armor.maybeTitle : t.gear.maybeTitle,
      lines: [armor ? t.armor.maybeOthers(names) : t.gear.othersMain(names), ...hints], sections: raw.sections.filter((sec) => sec.dim),
    };
  } else {
    // «Разобрать»: кому она годная, у тех уже не хуже (TEXTS 18, как прежде); никому — причина прежнего вердикта
    const by = r.heroes.filter((h) => h.bar).map((h) => h.c.name);
    out = by.length ? { ...raw, v: 'junk', title: t.fit.junkBy(by), lines: [t.worn.line, t.worn.stale, ...hints], sections: [] }
      : raw.v === 'junk' ? { ...raw, sections: [] }
      : { ...raw, v: 'junk', title: armor ? t.armor.junkTitle : t.gear.junkRosterTitle, lines: hints, sections: [] };
  }
  // похоже, это отложенная раньше вещь — первой строкой (решение владельца 2026-10-06)
  const same = r.same ? [t.fit.same(r.same.piece.slot, pieceLabel(t, idx)(r.same.piece), r.same.c.name, t.fit.date(r.same.piece.at))] : [];
  return { ...out, lines: [...same, ...out.lines], plan: upgradePlan(ctx, input, out) };
}

// тихая строка (вопрос 12): слабая вещь дала бы герою больше, чем есть
const quietLine = (t: Texts, r: Result | null, slot: string): string | null => {
  const q = r?.quiet;
  if (!q) return null;
  return q.slotEmpty ? t.fit.quietEmpty(q.c.name, slot, q.stats) : t.fit.quietBetter(q.c.name, t.fit.pts(q.dV), q.stats);
};

export function useVerdictModel({ idx, t, ctx, s, store, roster, view, hero, replace, touring, narrow, onEval }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; store: GearStore; roster: ReadonlySet<string>;
  view: PoolView;                 // вид пула на хранилище — один раз на хранилище
  hero: Hero | null; replace: string | null; // режим «для героя» и запись «Примерить замену»
  touring: boolean;
  narrow: boolean; onEval: boolean; // телефон; вкладка «Оценка» открыта
}) {
  // вердикт зависит только от предмета, настроек и пулов — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const key = JSON.stringify(input);
  const raw = useMemo(() => evaluate(ctx, input), [ctx, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // П9: «Надеть» на героя, у которого будет окно перехода Core Fusion (Core Fusion X при X с вещами), делает putOn после
  // «Да» — на хранилище, где вещи X уже у него (features/gear/model/fusion storeFor): его исход и кнопка — по этому виду пула.
  // Окна не будет или вещи не переходят — общий вид. В обучении окон нет (fusionGate)
  const viewOf = useMemo(() => {
    const memo = new Map<string, PoolView>();
    return (id: string): PoolView => {
      if (touring) return view;
      let v = memo.get(id);
      if (!v) {
        const st = storeFor(idx, roster, store, id);
        v = st === store ? view : poolView(ctx, st);
        memo.set(id, v);
      }
      return v;
    };
  }, [idx, ctx, roster, store, view, touring]);
  const tview = hero ? viewOf(hero.c.id) : view;
  // исход по ростеру; null — по порогам (ростера нет) или введены не все сабстаты
  const res = useMemo(() => verdictOf(ctx, (id) => viewOf(id).hero(id), input), [ctx, viewOf, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdict = useMemo(() => (res && raw.v !== 'idle' ? fromResult(ctx, raw, res, input) : raw), [ctx, raw, res]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Сейчас на персонажах»: герои, которых назвал вердикт (до трёх); в режиме героя — одна строка героя: «Надеть на X»
  // есть всегда («Надето»: ввод надетого в игре), с «Примерить замену» — «Заменить»
  const heroVs = useMemo(() => {
    if (!hero) return null;
    const x = charVs(ctx, tview, hero.c.id, input, { replace, wear: true });
    // «Отложить для X» и в режиме героя: вещь ему «Оставь», и она, похоже, у него ещё не отложена
    return x && x.h.kind === 'keep' && res?.same?.c.id !== hero.c.id ? { ...x, stash: true } : x;
  }, [ctx, tview, hero, key, replace, res]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsList = useMemo((): CharVs[] => {
    if (verdict.v === 'idle') return [];
    if (hero) return heroVs ? [heroVs] : [];
    // «Отложить для X» — у «Оставь» и запаса, кроме героя, у которого она, похоже, уже отложена
    const stash = (c: { id: string }) => res?.same?.c.id !== c.id;
    const named = (res?.named ?? []).map((h) => charVs(ctx, viewOf(h.c.id), h.c.id, input, { h, stash: h.kind === 'keep' && stash(h.c) }));
    const reserve = res?.kind === 'material' && res.sub === 'reserve' ? res.reserve.filter(stash).map((c) => charVs(ctx, viewOf(c.id), c.id, input, { stash: true })) : [];
    return [...named, ...reserve].filter((x): x is CharVs => !!x);
  }, [ctx, viewOf, verdict, hero, heroVs, res]); // eslint-disable-line react-hooks/exhaustive-deps
  // строка под карточкой: в режиме героя — про героя (features/tryon/tryon heroNote), иначе — тихая строка (вопрос 12)
  const offNote = verdict.v === 'idle' ? null : hero ? heroNote(t, ctx, hero.c, input, heroVs) : quietLine(t, res, s.slot);
  // штамп общий, а заголовок после « — » в режиме героя — и про него
  const shown = useMemo(() => (hero ? { ...verdict, title: heroTitle(t, verdict, hero.c, heroVs, res?.named[0]?.c.id ?? null) } : verdict),
    [t, verdict, hero, heroVs, res]);
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  // Без вердикта (не выбран сет, main или предмет) карточка не встаёт: на её месте остаётся сетка, а то, чего не хватает,
  // выделено на форме (EvalPanel need); вопрос — на плашке внизу
  const cardShown = narrow && onEval && verdict.v !== 'idle' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint : null;
  return { input, raw, res, viewOf, tview, heroVs, verdict, vsList, offNote, shown, nSubs, cardShown, hint };
}
