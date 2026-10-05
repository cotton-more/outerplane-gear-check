// Туры обучения (tours.ts): что сейчас показано, откладывание вещи игрока и запись пройденного в 'ogc.tour'.
// Тур идёт с чистого листа: вещь на форме откладывается в память и возвращается в конце, а сохранение страницы на это
// время выключено (App → useAppState persist). На примере в конце всегда возвращается прежняя вещь; на своей —
// своя остаётся, а если на форме до тура тоже была вещь, игрок выбирает, какую оставить.
// Туров несколько — «Обучение» сначала спрашивает, какой (pick). Вкладка и открытый персонаж тоже возвращаются.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Action } from '@/app/appState';
import type { Tab } from '@/shared/tab';
import { itemInput } from '@/features/eval/form/formState';
import { storage } from '@/shared/storage';
import type { ItemInput } from '@/game/item/item';
import { TIPS } from './registry';
import { bootTour, loadTour, markSeen, saveTour, type Revs, type TourStore } from './store';
import { TOURS, tourSeenId } from './tours';
import type { Step, StepId, Tip, TourCtx, TourId } from './types';

export type Phase =
  | { kind: 'pick' }   // какое обучение
  | { kind: 'choose' } // главный тур: пример или своя вещь
  | { kind: 'step'; i: number; start: TourCtx }
  | { kind: 'end'; choice: boolean }; // choice — спросить, какую вещь оставить

export interface Run { id: TourId; phase: Phase; demo: boolean; saved: ItemInput; tab: Tab; charId: string | null }

export const stepsOf = (id: TourId): Step[] => TOURS[id].steps;

// есть что терять — то же, что у «Вернуть» после «Следующего»
export const hasItem = (it: ItemInput) => Object.keys(it.subs).length > 0 || !!it.itemKey || !!it.unlisted;

const stepRevs = (): Revs => Object.fromEntries(Object.values(TOURS).flatMap((d) => d.steps.map((st) => [st.id, st.rev])));
const TIP_IDS = TIPS.map((tp) => tp.id);
const NEWS_IDS = TIPS.filter((tp) => tp.news).map((tp) => tp.id);
export const currentRevs = (): Revs => ({ ...stepRevs(), ...Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])) });

export function useTour({ c, dispatch, was, tours, onRunning, onTour, onStep, onDone }: {
  c: TourCtx;
  dispatch: Dispatch<Action>;
  was: { roster: number; welcomeHidden: boolean }; // для первого запуска с обучением: давний ли игрок
  tours: TourId[]; // какие туры можно пройти (у «Экипировки» нужен персонаж примера в данных)
  // тур начался или закончился — в том же нажатии, что и смена вещи на форме: выключить или включить сохранение
  // страницы и убрать «Вернуть» (иначе он вернул бы вещь из тура поверх отложенной)
  onRunning: (on: boolean) => void;
  onTour: (id: TourId | null) => void; // начались шаги этого тура (пример экипировки — App) или тур закончился
  onStep: (id: TourId, step: StepId) => void; // шаг начался
  onDone: () => void; // главный тур пройден до конца
}) {
  const available = useMemo(() => storage.available(), []);
  // исходную точку пишем сразу: иначе у того, кто обучение не трогает, «Что нового» считалось бы от каждого запуска
  const [store, setStore] = useState<TourStore>(() => {
    const st = bootTour(loadTour(), was, currentRevs(), NEWS_IDS);
    return available ? saveTour(st, TIP_IDS) : st;
  });
  const update = useCallback((f: (st: TourStore) => TourStore) => setStore((st) => {
    const next = f(st);
    return available ? saveTour(next, TIP_IDS) : next;
  }), [available]);

  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const cur = useRef(c);
  cur.current = c;

  const toursRef = useRef(tours);
  toursRef.current = tours;
  const stepAt = (id: TourId, i: number): Phase => (i < stepsOf(id).length ? { kind: 'step', i, start: cur.current } : { kind: 'end', choice: false });

  // id не задан и туров несколько — сначала «Какое обучение?»
  const start = useCallback((id?: TourId) => {
    const now = cur.current;
    const again = runRef.current;
    // тур уже идёт («Обучение» нажали ещё раз): начать сначала, но отложенной остаётся вещь игрока, а не форма тура
    const saved = again ? again.saved : itemInput(now.s);
    if (!again) onRunning(true);
    else onTour(null);
    // чистый лист: слот и грейд прежние, остальное пусто
    dispatch({ type: 'load', item: { slot: saved.slot, grade: saved.grade, setId: null, itemKey: null, main: null, unlisted: false, subs: {} } });
    const base = { saved, tab: again ? again.tab : now.s.tab, charId: again ? again.charId : now.s.charId };
    const which = id ?? (toursRef.current.length > 1 ? null : 'core');
    if (!which) { setRun({ ...base, id: 'core', demo: true, phase: { kind: 'pick' } }); return; }
    if (TOURS[which].demoOnly) {
      onTour(which);
      setRun({ ...base, id: which, demo: true, phase: stepAt(which, 0) });
      onStep(which, stepsOf(which)[0].id);
      return;
    }
    setRun({ ...base, id: which, demo: true, phase: { kind: 'choose' } });
  }, [dispatch, onRunning, onTour, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Какое обучение?» → выбранный тур с начала (отложенная вещь та же)
  const pick = useCallback((id: TourId) => {
    const r = runRef.current;
    if (!r) return;
    if (TOURS[id].demoOnly) {
      onTour(id);
      setRun({ ...r, id, demo: true, phase: stepAt(id, 0) });
      onStep(id, stepsOf(id)[0].id);
    } else setRun({ ...r, id, phase: { kind: 'choose' } });
  }, [onTour, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback((demo: boolean) => {
    const r = runRef.current;
    if (!r) return;
    onTour(r.id);
    setRun({ ...r, demo, phase: stepAt(r.id, 0) });
    onStep(r.id, stepsOf(r.id)[0].id);
  }, [onTour, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // конец тура: вернуть отложенную вещь (keep — оставить ту, что сейчас на форме)
  const finish = useCallback((keep: boolean) => {
    const r = runRef.current;
    if (!r) return;
    if (!keep) { dispatch({ type: 'load', item: r.saved }); dispatch({ type: 'tab', tab: r.tab }); }
    dispatch({ type: 'selectChar', id: r.charId });
    setRun(null);
    onTour(null);
    onRunning(false);
  }, [dispatch, onRunning, onTour]);

  // «Готово» на последней карточке и крестик посреди тура решают одинаково
  const keepOwn = (r: Run) => !r.demo && hasItem(itemInput(cur.current.s));
  const close = useCallback(() => {
    const r = runRef.current;
    if (!r) return;
    if (keepOwn(r) && hasItem(r.saved)) { setRun({ ...r, phase: { kind: 'end', choice: true } }); return; }
    finish(keepOwn(r));
  }, [finish]);

  const advance = useCallback(() => {
    const r = runRef.current;
    if (!r || r.phase.kind !== 'step') return;
    const step = stepsOf(r.id)[r.phase.i];
    update((st) => markSeen(st, { [step.id]: step.rev }));
    const phase = stepAt(r.id, r.phase.i + 1);
    if (phase.kind === 'end') {
      if (r.id === 'core') {
        update((st) => ({ ...st, first: 'done' }));
        onDone();
      }
      update((st) => markSeen(st, { [tourSeenId(r.id)]: TOURS[r.id].rev }));
      phase.choice = keepOwn(r) && hasItem(r.saved);
    }
    setRun({ ...r, phase });
    if (phase.kind === 'step') onStep(r.id, stepsOf(r.id)[phase.i].id);
  }, [update, onDone, onStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // шаг выполнен — сразу следующий
  useEffect(() => {
    if (run?.phase.kind !== 'step') return;
    const step = stepsOf(run.id)[run.phase.i];
    if (step.done?.(c, run.phase.start, run.demo)) advance();
  }, [c, run, advance]);

  // Esc: открытое окно закрывается само (Sheet, шторка персонажа); у шага может быть свой Esc (esc — на «Следующий»
  // это сам «Следующий»); в остальных случаях Esc закрывает обучение — и не доходит до горячих клавиш, иначе стёр бы вещь
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const b = document.body.classList;
      if (b.contains('drawer-lock') || b.contains('sheet-open')) return;
      const r = runRef.current;
      if (r?.phase.kind === 'step' && stepsOf(r.id)[r.phase.i].esc?.(cur.current)) return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [run !== null, close]); // eslint-disable-line react-hooks/exhaustive-deps

  const markInvited = useCallback(() => update((st) => ({ ...st, invited: true })), [update]);
  // подсказки: увидел (закрыл или нажал, на что она показывает); «Что нового» просмотрено; вкл/выкл; показать заново
  const seeTip = useCallback((tip: Tip) => update((st) => markSeen(st, { [tip.id]: tip.rev })), [update]);
  const knowTips = useCallback((tips: Tip[]) => update((st) => ({
    ...st, known: { ...st.known, ...Object.fromEntries(tips.map((tp) => [tp.id, tp.rev])) },
  })), [update]);
  const setTips = useCallback((on: boolean) => update((st) => ({ ...st, tips: on, tipsAt: Date.now() })), [update]);
  const resetTips = useCallback(() => update((st) => ({
    ...st, tips: true, tipsAt: Date.now(), resetAt: Date.now(),
    seen: Object.fromEntries(Object.entries(st.seen).filter(([id]) => !TIP_IDS.includes(id as never))),
  })), [update]);

  return { store, available, run, start, pick, choose, advance, close, finish, markInvited, seeTip, knowTips, setTips, resetTips };
}

export type TourApi = ReturnType<typeof useTour>;
