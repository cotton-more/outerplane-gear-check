// Обучение на странице (src/tour): что тур видит (TourCtx), пример тура «Экипировка», карточка новичка «Как
// пользоваться», полосы «Появилось обучение» и «Что нового», подсказки по ходу. Когда что показывать — здесь,
// как показывать — src/tour.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Index } from '@/game/data';
import type { ItemInput } from '@/game/item/item';
import type { Verdict } from '@/features/eval/verdict/verdict';
import type { GearStore } from '@/features/gear/model/gear';
import { holdStoredWrites } from '@/features/gear/store/stored';
import type { TryOn } from '@/features/tryon/tryon';
import { fineHover, type Layout } from '@/shared/layout/useLayout';
import { storage } from '@/shared/storage';
import { gearDemo } from '@/tour/gear';
import { TIPS } from '@/tour/registry';
import { newsOf } from '@/tour/tips';
import type { StepId, Tip, TourCtx, TourId } from '@/tour/types';
import { useTour } from '@/tour/useTour';
import type { Action, AppState } from './appState';

// пример тура «Экипировка»: своя экипировка и свой режим героя в памяти
export type Demo = { store: GearStore; tryOn: TryOn | null } | null;

export function useOnboarding({ idx, s, dispatch, roster, layout, nSubs, shown, verdict, stampKind, material, hero, gearSeq,
  verdictOpen, pieceOpen, helpOpen, formUndo, setDemo, setTouring, onTourRunning, closeSheets }: {
  idx: Index; s: AppState; dispatch: Dispatch<Action>; roster: ReadonlySet<string>; layout: Layout;
  nSubs: number; shown: Verdict; verdict: Verdict;
  stampKind: Verdict['v'];               // штамп по вещам героев (gear/model/stamp), до материала
  material: { up: readonly unknown[]; target: string | null }; // совет «надень её» (gear/model/material)
  hero: boolean; gearSeq: number;
  verdictOpen: boolean; pieceOpen: boolean; helpOpen: boolean;
  formUndo: ItemInput | null;            // на экране «Вернуть» формы — полосы не показываем
  setDemo: Dispatch<SetStateAction<Demo>>;
  setTouring: (on: boolean) => void;
  onTourRunning: () => void;             // тур начался или кончился: снять «Вернуть» формы и экипировки
  closeSheets: () => void;               // перед туром: закрыть Справку и шторку вердикта
}) {
  // карточка «Как пользоваться» — новичку, пока он не отметил своих персонажей и не закрыл её
  const [welcomeHidden, setWelcomeHidden] = useState(() => storage.get('welcomeHidden', false));
  const hideWelcome = () => { storage.set('welcomeHidden', true); setWelcomeHidden(true); };
  const tourCtx: TourCtx = {
    s, roster: roster.size, set: (s.setId && idx.SET[s.setId]?.short) || null, nSubs, verdict: shown, narrow: layout.narrow,
    verdictOpen: verdictOpen && layout.narrow, keys: fineHover(),
    pieceOpen, tryOn: hero, gearSeq,
    // подсказка «Фоддер, а не разбор: эта пойдёт ей на Breakthrough» — не когда совет «надень её»
    // («Фоддер» от понижения B3 — не материал: он из withWorn, а не из withMaterial)
    material: shown.v === 'fodder' && stampKind !== 'fodder' && !material.up.length && !material.target,
    // подсказка «все уже носят не хуже»: её текст — про «Разобрать»
    worn: verdict.worn === 'lower' && shown.v === 'junk',
  };
  // тур «Экипировка» — только если персонаж примера есть в данных
  const tours = useMemo<TourId[]>(() => (gearDemo(idx) ? ['core', 'gear'] : ['core']), [idx]);
  const onTourRun = useCallback((id: TourId | null) => {
    const d = id === 'gear' ? gearDemo(idx) : null;
    setDemo(d ? { store: d.store, tryOn: null } : null);
    if (d) dispatch({ type: 'openChar', id: d.c.id, reveal: 'keep' });
  }, [idx, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
  // шаги тура «Экипировка». Карточка вещи — снова Caren, если её карточку закрыли. «Оценка для Caren» — на форму вещь
  // примера (вводить ничего не нужно) и режим героя примера, если шаги 1–2 прошли «Дальше»: иначе шаги 3–5 говорили бы о том,
  // чего на экране нет
  const onTourStep = useCallback((id: TourId, step: StepId) => {
    const d = id === 'gear' ? gearDemo(idx) : null;
    if (!d) return;
    if (step === 'gPiece') dispatch({ type: 'openChar', id: d.c.id, reveal: 'keep' });
    if (step !== 'gCard') return;
    setDemo((x) => x && (x.tryOn ? x : { ...x, tryOn: { charId: d.c.id, build: d.b.name } }));
    dispatch({ type: 'load', item: d.item });
  }, [idx, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps
  // onRunning у тура — один на всё время (useTour держит его с первого показа): свежий onTourRunning — через ref
  const running = useRef(onTourRunning);
  useEffect(() => { running.current = onTourRunning; });
  const tour = useTour({
    c: tourCtx, dispatch, was: { roster: roster.size, welcomeHidden }, tours, onTour: onTourRun, onStep: onTourStep,
    // «Вернуть» экипировки тоже: после тура оно вернуло бы экипировку тура (пример или пусто) поверх записей игрока
    // в обучении и запись нормализации при чтении хранилища (Р17) не срабатывает — ничего не пишем
    onRunning: useCallback((on: boolean) => { holdStoredWrites(on); setTouring(on); running.current(); }, [setTouring]),
    onDone: hideWelcome,
  });
  useEffect(() => () => holdStoredWrites(false), []); // страницу закрыли посреди обучения
  // открыл Справку — новое просмотрено; пометка «новое» в ней остаётся, пока Справка открыта
  const [helpNews, setHelpNews] = useState<Tip[]>([]);
  // id не задан — «Какое обучение?» (туров несколько); новичку из карточки и из «Появилось обучение» — главный
  const startTour = (id?: TourId) => { closeSheets(); setHelpNews([]); tour.start(id); };
  const openTours = () => startTour();
  const welcomeShown = s.tab === 'eval' && !welcomeHidden && roster.size === 0 && !tour.run;
  // Обучение само предлагаем только в окне повыше (layout.tall): в полоске разделённого экрана места мало — подождём,
  // пока приложение откроют крупнее. Кнопка «Обучение» в меню и Справке работает всегда.
  // «Появилось обучение» — один раз: давнему игроку и новичку, который отметил персонажей раньше, чем прошёл тур
  // (закрыл карточку «Понятно» — от тура уже отказался). Показали — отмечено; до закрытия полоса видна в этом запуске
  const inviteDue = tour.available && !tour.store.invited
    && (tour.store.first === 'skipped' || (tour.store.first === 'new' && !welcomeHidden));
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteShown = (inviteOpen || inviteDue) && layout.tall && !tour.run && !welcomeShown && s.tab === 'eval' && !formUndo;
  useEffect(() => {
    if (inviteShown && !inviteOpen) { setInviteOpen(true); tour.markInvited(); }
  }, [inviteShown]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Что нового» после обновления: полоса сама, «Позже» — до следующего запуска; точка на ☰ и «Справке», пока не просмотрено
  const news = useMemo(() => newsOf(TIPS, tour.store), [tour.store]);
  const [newsLater, setNewsLater] = useState(false);
  const [forcedTip, setForcedTip] = useState<Tip | null>(null);
  const newsShown = layout.tall && tour.available && news.length > 0 && !newsLater && !tour.run && !welcomeShown && !inviteShown
    && s.tab === 'eval' && !formUndo;
  // «Показать»: у новости с туром — тур («Экипировка»), иначе — сама подсказка
  const showNews = () => {
    tour.knowTips(news);
    if (news[0].tour) startTour(news[0].tour); else setForcedTip(news[0]);
  };
  useEffect(() => {
    if (!helpOpen || !news.length) return;
    setHelpNews(news);
    tour.knowTips(news);
  }, [helpOpen, news]); // eslint-disable-line react-hooks/exhaustive-deps
  const tipsOn = layout.tall && tour.available && !tour.run && !welcomeShown && !inviteShown && !newsShown && !formUndo;
  const onForced = useCallback(() => setForcedTip(null), []);
  return {
    tour, tourCtx, tours, startTour, openTours,
    welcomeShown, hideWelcome,
    inviteShown, closeInvite: () => setInviteOpen(false),
    news, newsShown, showNews, newsLater: () => setNewsLater(true),
    helpNews, clearHelpNews: () => setHelpNews([]),
    tipsOn, forcedTip, onForced,
  };
}
