// Главный тур: что сейчас показано, откладывание вещи игрока и запись пройденного в 'ogc.tour'.
// Тур идёт с чистого листа: вещь на форме откладывается в память и возвращается в конце, а сохранение страницы на это
// время выключено (App → useAppState persist). На примере в конце всегда возвращается прежняя вещь; на своей —
// своя остаётся, а если на форме до тура тоже была вещь, игрок выбирает, какую оставить.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { itemInput, type Action, type Tab } from '../state/appState';
import { storage } from '../state/storage';
import type { ItemInput } from '../logic/verdict';
import { CORE } from './core';
import { TIPS } from './registry';
import { bootTour, loadTour, markSeen, saveTour, type Revs, type TourStore } from './store';
import type { TourCtx } from './types';

export type Phase =
  | { kind: 'choose' }
  | { kind: 'step'; i: number; start: TourCtx }
  | { kind: 'end'; choice: boolean }; // choice — спросить, какую вещь оставить

export interface Run { phase: Phase; demo: boolean; saved: ItemInput; tab: Tab }

// есть что терять — то же, что у «Вернуть» после «Следующего»
export const hasItem = (it: ItemInput) => Object.keys(it.subs).length > 0 || !!it.itemKey || !!it.unlisted;

const coreRevs = (): Revs => Object.fromEntries(CORE.map((st) => [st.id, st.rev]));
export const currentRevs = (): Revs => ({ ...coreRevs(), ...Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])) });
const today = () => new Date().toISOString().slice(0, 10);

export function useTour({ c, dispatch, was, onRunning, onDone }: {
  c: TourCtx;
  dispatch: Dispatch<Action>;
  was: { roster: number; welcomeHidden: boolean }; // для первого запуска с обучением: давний ли игрок
  // тур начался или закончился — в том же нажатии, что и смена вещи на форме: выключить или включить сохранение
  // страницы и убрать «Вернуть» (иначе он вернул бы вещь из тура поверх отложенной)
  onRunning: (on: boolean) => void;
  onDone: () => void; // главный тур пройден до конца
}) {
  const available = useMemo(() => storage.available(), []);
  // исходную точку пишем сразу: иначе у того, кто обучение не трогает, «Что нового» считалось бы от каждого запуска
  const [store, setStore] = useState<TourStore>(() => {
    const st = bootTour(loadTour(), was, currentRevs(), today());
    return available ? saveTour(st) : st;
  });
  const update = useCallback((f: (st: TourStore) => TourStore) => setStore((st) => {
    const next = f(st);
    return available ? saveTour(next) : next;
  }), [available]);

  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const cur = useRef(c);
  cur.current = c;

  const start = useCallback(() => {
    const now = cur.current;
    onRunning(true);
    const saved = itemInput(now.s);
    // чистый лист: слот и грейд прежние, остальное пусто
    dispatch({ type: 'load', item: { slot: saved.slot, grade: saved.grade, setId: null, itemKey: null, main: null, unlisted: false, subs: {} } });
    setRun({ phase: { kind: 'choose' }, demo: true, saved, tab: now.s.tab });
  }, [dispatch, onRunning]);

  const stepAt = (i: number): Phase => (i < CORE.length ? { kind: 'step', i, start: cur.current } : { kind: 'end', choice: false });

  const choose = useCallback((demo: boolean) => setRun((r) => (r ? { ...r, demo, phase: stepAt(0) } : r)), []);

  // конец тура: вернуть отложенную вещь (keep — оставить ту, что сейчас на форме)
  const finish = useCallback((keep: boolean) => {
    const r = runRef.current;
    if (!r) return;
    if (!keep) { dispatch({ type: 'load', item: r.saved }); dispatch({ type: 'tab', tab: r.tab }); }
    setRun(null);
    onRunning(false);
  }, [dispatch, onRunning]);

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
    const step = CORE[r.phase.i];
    update((st) => markSeen(st, { [step.id]: step.rev }));
    const phase = stepAt(r.phase.i + 1);
    if (phase.kind === 'end') {
      update((st) => ({ ...st, first: 'done' }));
      onDone();
      phase.choice = keepOwn(r) && hasItem(r.saved);
    }
    setRun({ ...r, phase });
  }, [update, onDone]);

  // шаг выполнен — сразу следующий
  useEffect(() => {
    if (run?.phase.kind !== 'step') return;
    const step = CORE[run.phase.i];
    if (step.done?.(c, run.phase.start, run.demo)) advance();
  }, [c, run, advance]);

  // Esc: открытое окно закрывается само (Sheet, шторка персонажа); на шаге «Следующий» Esc и есть «Следующий»;
  // в остальных случаях Esc закрывает обучение — и не доходит до горячих клавиш, иначе стёр бы вещь
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const b = document.body.classList;
      if (b.contains('drawer-lock') || b.contains('sheet-open')) return;
      const r = runRef.current;
      if (r?.phase.kind === 'step' && CORE[r.phase.i].id === 'next') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [run !== null, close]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissInvite = useCallback(() => update((st) => ({ ...st, invited: true })), [update]);

  return { store, available, run, start, choose, advance, close, finish, dismissInvite };
}

export type TourApi = ReturnType<typeof useTour>;
