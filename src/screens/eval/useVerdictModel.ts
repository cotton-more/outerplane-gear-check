// Вердикт экрана «Оценка»: оценка по порогам (features/eval/verdict evaluate) — без ростера и пока введены не все
// сабстаты (A20, A21); с ростером — исход по «статам + сетам» (features/gear/verdict): штамп, заголовок и строки
// (features/gear/ui/outcomeText), список героев под штампом (heroList). В режиме героя
// (features/tryon) — его строка, «Надеть» и заголовок про него.
import { useMemo, useState } from 'react';
import { FLAT, isArmor, type Index } from '@/game/data';
import { NO_LV, NO_STARS, type Ctx } from '@/game/context';
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
import { fillerWaits, verdictOf, type Result, type Same } from '@/features/gear/verdict';
import { heroList } from '@/features/gear/model/heroList';
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
  // a filler for the first named hero: the footer's "a stopgap needs a good roll" would say the opposite (HISTORY.md 0220)
  if (head) out = { ...raw, ...head, lines: [...head.lines, ...hints], sections: [], ...(r.kind === 'wear' && r.named[0]?.filler ? { foot: '' } : {}) };
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
  const same = r.same ? [sameText(t, idx, r.same)] : [];
  return { ...out, lines: [...same, ...out.lines], plan: upgradePlan(ctx, input, out) };
}

// «Похоже, это Speed-шлем, отложенный для Aer 07.10. Если это он — ничего не делай.»; promised in «Надеть в игре» — «…,
// обещанный Aer в «Надеть в игре». …» (TEXTS S1)
const sameText = (t: Texts, idx: Index, same: Same): string => same.promised
  ? t.fit.samePromised(same.piece.slot, pieceLabel(t, idx)(same.piece), same.c.name)
  : t.fit.same(same.piece.slot, pieceLabel(t, idx)(same.piece), same.c.name, t.fit.date(same.piece.at));

export function useVerdictModel({ idx, t, ctx, s, store, roster, view, hero, replace, touring, narrow, onEval, batch = false, promised }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; store: GearStore; roster: ReadonlySet<string>;
  view: PoolView;                 // вид пула на хранилище — один раз на хранилище
  hero: Hero | null; replace: string | null; // режим «для героя» и запись «Примерить замену»
  touring: boolean;
  narrow: boolean; onEval: boolean; // телефон; вкладка «Оценка» открыта
  batch?: boolean;                // «Партия»: pieces are entered without a verdict (MODEL.md §8)
  promised?: ReadonlySet<string>; // records with a live promise in «Надеть в игре» (features/ingame promisedAll): the guard
}) {
  // вердикт зависит только от предмета, настроек и пулов — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const key = JSON.stringify(input);
  // early «Разбирай» on a few substats waits while a roster hero's slot for it is empty: a filler whatever the rest rolls
  // (gear/verdict fillerWaits, HISTORY.md 0220) — «отметь остальные», as when the rest could still make it
  const raw = useMemo(() => {
    const r = evaluate(ctx, input);
    const n = Object.keys(input.subs).length, of = dropSubs(input.grade);
    if (batch || r.v !== 'junk' || !n || n >= of || !fillerWaits(ctx, (id) => view.hero(id), input)) return r;
    return { ...r, v: 'idle' as const, title: t.verdict.markRest(n, of), lines: [], sections: r.sections.map((sec) => ({ ...sec, collapsed: false })) };
  }, [ctx, key, view, batch]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Надеть» на героя, у которого будет окно перехода Core Fusion (Core Fusion X при X с вещами), делает putOn после
  // «Да» — на хранилище, где вещи X уже у него (features/gear/model/fusion storeFor): его исход и кнопка — по этому виду пула.
  // Окна не будет или вещи не переходят — общий вид. В обучении окон нет (fusionGate)
  const viewOf = useMemo(() => {
    const memo = new Map<string, PoolView>();
    return (id: string): PoolView => {
      if (touring) return view;
      let v = memo.get(id);
      if (!v) {
        const st = storeFor(idx, roster, store, id);
        // the switch moves X's ★ and level to CF too: count CF with them, as after «Да»
        const moved = st.stars !== store.stars || st.lv !== store.lv;
        v = st === store ? view : poolView(moved ? { ...ctx, stars: st.stars ?? NO_STARS, lv: st.lv ?? NO_LV } : ctx, st);
        memo.set(id, v);
      }
      return v;
    };
  }, [idx, ctx, roster, store, view, touring]);
  const tview = hero ? viewOf(hero.c.id) : view;
  // «Это другой» (owner, 2026-10-07): the piece looks like one already set aside and the player says it's a second copy —
  // for this very input only, any change on the form asks again
  const [twinAt, setTwinAt] = useState<string | null>(null);
  const twin = twinAt === key;
  // исход по ростеру; null — по порогам (ростера нет) или введены не все сабстаты
  const res = useMemo(() => (batch ? null : verdictOf(ctx, (id) => viewOf(id).hero(id), input, { twin, promised })), [ctx, viewOf, key, twin, batch, promised]); // eslint-disable-line react-hooks/exhaustive-deps
  // Guard: while it looks like a set-aside piece, only the hero who has it keeps a button — «Надеть» wears that very
  // record (useFormFlow). Others get no «Надеть» or «Отложить» until «Это другой»: one helmet, two records otherwise.
  // A promised look-alike (same.promised) leaves nobody a button: its record is already worn
  const same = res?.same ?? null;
  const quietRow = (x: CharVs): CharVs => ({ ...x, useful: false, stash: false });
  const verdict = useMemo(() => (res && raw.v !== 'idle' ? fromResult(ctx, raw, res, input) : raw), [ctx, raw, res]); // eslint-disable-line react-hooks/exhaustive-deps
  // режим героя — одна строка героя: «Надеть на X»
  // есть всегда («Надето»: ввод надетого в игре), с «Примерить замену» — «Заменить»
  const heroVs = useMemo(() => {
    if (!hero) return null;
    const x = charVs(ctx, tview, hero.c.id, input, { replace, wear: true });
    if (x && same && (same.c.id !== hero.c.id || same.promised)) return quietRow(x);
    // «Отложить для X» и в режиме героя: вещь ему «Оставь» или запас (В6 ревью этапа 10), и она, похоже, у него ещё не
    // отложена
    const forHim = x && (x.h.kind === 'keep' || (res?.kind === 'material' && res.sub === 'reserve' && res.reserve.some((c) => c.id === hero.c.id)));
    return x && forHim && !same ? { ...x, stash: true } : x;
  }, [ctx, tview, hero, key, replace, res]); // eslint-disable-line react-hooks/exhaustive-deps
  // the hero list under the stamp (features/gear/model/heroList); hero mode has its single row instead (heroVs)
  const list = useMemo(() => (verdict.v === 'idle' || hero ? [] : heroList(ctx, viewOf, input, res)), [ctx, viewOf, verdict, hero, res]); // eslint-disable-line react-hooks/exhaustive-deps
  // строка под карточкой: в режиме героя — про героя (features/tryon/tryon heroNote)
  const offNote = verdict.v === 'idle' || !hero ? null : heroNote(t, ctx, hero.c, input, heroVs);
  // штамп общий, а заголовок после « — » в режиме героя — и про него
  const shown = useMemo(() => (hero ? { ...verdict, title: heroTitle(t, verdict, hero.c, heroVs, res?.named[0]?.c.id ?? null) } : verdict),
    [t, verdict, hero, heroVs, res]);
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  // Без вердикта (не выбран сет, main или предмет) карточка не встаёт: на её месте остаётся сетка, а то, чего не хватает,
  // выделено на форме (EvalPanel need); вопрос — на плашке внизу
  const cardShown = narrow && onEval && !batch && verdict.v !== 'idle' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint : null;
  // the guard's line on the phone card and «Это другой» on the card and in the details
  const sameLine = same ? sameText(t, idx, same) : null;
  const onTwin = same ? () => setTwinAt(key) : undefined;
  return { input, raw, res, viewOf, tview, heroVs, verdict, list, offNote, shown, nSubs, cardShown, hint, same, sameLine, onTwin };
}
