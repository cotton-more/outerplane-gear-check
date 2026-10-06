// Вердикт экрана «Оценка»: оценка по билдам (features/eval/verdict) → штамп по вещам героев (gear/model/stamp) и материал
// Breakthrough (gear/model/material) → строки «Сейчас на персонажах» (gear/model/poolVs); в режиме героя (features/tryon) —
// строка, «Надеть» и заголовок про него.
import { useMemo } from 'react';
import { isArmor, type Index } from '@/game/data';
import type { Ctx } from '@/game/context';
import { dropSubs } from '@/game/item/subs';
import type { Texts } from '@/i18n';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { itemInput, type FormState } from '@/features/eval/form/formState';
import type { GearStore } from '@/features/gear/model/gear';
import { storeFor } from '@/features/gear/model/fusion';
import { poolView, type PoolView } from '@/features/gear/pool';
import { charsVs, charVs, sectionChars, type CharVs } from '@/features/gear/model/poolVs';
import { betterThanWorn, materialFor, wearLead, withMaterial } from '@/features/gear/model/material';
import { withWorn } from '@/features/gear/model/stamp';
import { heroNote, heroOutcome, heroTitle, type Hero } from '@/features/tryon/tryon';
import { variantName } from '@/features/gear/ui/pieceText';

export function useVerdictModel({ idx, t, ctx, s, store, roster, view, hero, replace, touring, narrow, onEval }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; store: GearStore; roster: ReadonlySet<string>;
  view: PoolView;                 // вид пула на хранилище — один раз на хранилище
  hero: Hero | null; replace: string | null; // режим «для героя» и запись «Примерить замену»
  touring: boolean;
  narrow: boolean; onEval: boolean; // телефон; вкладка «Оценка» открыта
}) {
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const key = JSON.stringify(input);
  const raw = useMemo(() => evaluate(ctx, input), [ctx, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // П9: «Надеть» на героя, у которого будет окно перехода Core Fusion (Core Fusion X при X с вещами), делает putOn после
  // «Да» — на хранилище, где вещи X уже у него (features/gear/model/fusion storeFor): его строка и кнопка — по этому виду пула. Окна не
  // будет или вещи не переходят — общий вид. В обучении окон нет (fusionGate)
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
  // вид пула героя (режим героя на Core Fusion X, а X появился после его начала, — тоже через окно)
  const tview = hero ? viewOf(hero.c.id) : view;
  // строка героя: явный выбор — все его билды и «По статам» (Р11), без only (заметка шага 2: исход по одному варианту
  // прятал «Надеть»); с replace — кнопка «Заменить» есть всегда; wear — «Надеть на X» есть всегда («Надето»: ввод
  // надетого в игре, и у вещи без пользы)
  const heroVs = useMemo(() => (hero ? charVs(ctx, tview, hero.c.id, input, undefined, { explicit: true, replace, wear: true }) : null), [ctx, tview, hero, key, replace]); // eslint-disable-line react-hooks/exhaustive-deps
  // материал: вещь лучше той, для которой она материал, или в режиме героя она встаёт в его билд — «надень». Запись из
  // «Примерить замену» (replace) — та же вещь в игре, введённая заново: себе она не материал
  const mat = useMemo(() => {
    const needs = materialFor(view, input).filter((n) => n.piece.id !== replace);
    const up = needs.length ? betterThanWorn(ctx, view, input, needs) : [];
    const o = heroVs?.best?.used ? heroVs.best : null;
    const aim = hero && o && (o.kind === 'fill' || o.kind === 'up' || o.kind === 'closer' || o.kind === 'completes')
      ? `${hero.c.name} · ${variantName(t, o.v)}` : null;
    return { needs, wear: { up, target: aim, t4: input.bt === 4 } };
  }, [ctx, view, heroVs, hero, key, t, replace]); // eslint-disable-line react-hooks/exhaustive-deps
  // штамп по вещам персонажей (features/gear/model/stamp): такая же у кого-то — «Оставить»; всем, кому подходит, она ничего не даёт —
  // «Разобрать». Вещь — материал и лучше такой же у кого-то — не понижаем (совет «надень»)
  const worn = useMemo(() => withWorn(ctx, view, input, raw, { hold: mat.wear.up.length > 0 }), [ctx, view, raw, mat]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdict = useMemo(() => withMaterial(idx, t, worn, mat.needs, mat.wear), [idx, t, worn, mat]);
  // «Сейчас на персонажах»: кандидаты вердикта, у кого есть вещи, и свои без вещей — им вещь начнёт билд (понизили —
  // прежнего вердикта: они и объясняют, почему «Разобрать»); в режиме героя — одна строка героя
  const vsList = useMemo((): CharVs[] => {
    if (verdict.v === 'idle') return [];
    if (hero) return heroVs ? [heroVs] : [];
    const chars = sectionChars(worn.worn === 'lower' ? raw : verdict).filter((c) => store.pools[c.id]?.length || roster.has(c.id));
    // «Оставляй — лучше надетой такой же» (features/gear/model/material): её владельцы — тоже, даже не кандидаты вердикта (сырой —
    // «Разобрать», секций нет): совет «надень её» — с кнопкой
    const wearers = mat.wear.up.map((n) => idx.CHAR[n.key.slice(0, n.key.indexOf('/'))]).filter((c) => c && !chars.includes(c));
    // герой из заголовка «Оставляй — лучше надетой … X» — первой карточкой, его строка остаётся даже тихой «По статам»:
    // кнопка под ней — про него; прочие — как были
    const lead = wearLead(worn, mat.wear);
    const list = charsVs(ctx, viewOf, input, [...new Set(wearers), ...chars], {}, lead);
    const i = lead ? list.findIndex((x) => x.c.id === lead) : -1;
    return i > 0 ? [list[i], ...list.filter((_, j) => j !== i)] : list;
  }, [ctx, viewOf, raw, worn, verdict, hero, heroVs, store, roster, mat, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  // режим героя: строка про героя (features/tryon/tryon heroNote) — не носит, не нужна («Attack нет в билдах Caren»), «По статам»
  // с «Надеть», ничего не даст (и тогда, когда есть только кнопка «Заменить» из «Примерить замену»)
  const offNote = !hero || verdict.v === 'idle' ? null : heroNote(t, ctx, hero.c, input, heroVs);
  // штамп общий, а заголовок после « — » в режиме героя — и про других, и про него
  const shown = useMemo(() => (hero
    ? { ...verdict, title: heroTitle(t, idx, verdict, hero.c, heroOutcome(ctx, tview, input, heroVs), isArmor(s.slot)) }
    : verdict), [t, idx, ctx, tview, verdict, hero, heroVs]); // eslint-disable-line react-hooks/exhaustive-deps
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  // Без вердикта (не выбран сет, main или предмет) карточка не встаёт: на её месте остаётся сетка, а то, чего не хватает,
  // выделено на форме (EvalPanel need); вопрос — на плашке внизу
  const cardShown = narrow && onEval && verdict.v !== 'idle' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint : null;
  return { input, raw, viewOf, tview, heroVs, mat, worn, verdict, vsList, offNote, shown, nSubs, cardShown, hint };
}
