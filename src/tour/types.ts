// Типы обучения: шаги главного тура (core.ts) и подсказки, которые модули объявляют в своих *.tour.ts (registry.ts).
import type { Texts } from '../i18n';
import type { Verdict } from '../logic/verdict';
import type { AppState } from '../state/appState';
import type { Anchor, Pin } from './anchors';

// что шаг видит на странице: из этого считаются якорь, текст и «шаг выполнен»
export interface TourCtx {
  s: AppState;
  roster: number;       // сколько персонажей отмечено
  set: string | null;   // название выбранного сета (set.short)
  nSubs: number;
  verdict: Verdict;
  narrow: boolean;      // телефон: вердикт карточкой и плашкой внизу, а не колонкой справа
  verdictOpen: boolean; // открыта шторка вердикта
  keys: boolean;        // есть клавиатура и мышь — в тексте можно назвать горячие клавиши
}

// подстановки для текста шага (ru.ts и en.ts, раздел tour.steps)
export interface StepText {
  demo: boolean;  // тур на примере: текст называет, что нажать
  keys: boolean;
  kind: 'armor' | 'weapon' | 'accessory';
  legend: boolean;
  narrow: boolean;
  n: number;      // сколько сабстатов отмечено
  of: number;     // сколько нужно для вердикта
}

export type StepId = keyof Texts['tour']['steps'];
export type OffKey = keyof Texts['tour']['off'];

export interface Step {
  id: StepId;
  rev: number; // записывается в seen, но пока ни на что не влияет: о новом в шаге давним игрокам — подсказкой с news
  at: (c: TourCtx) => Anchor[];
  // на примере — точные кнопки, которые осталось нажать; пусто — рамка вокруг всего якоря (at)
  pin?: (c: TourCtx) => Pin[];
  // на примере — что на форме не так, как в примере: строка-подсказка под текстом шага (tour.off)
  off?: (c: TourCtx) => OffKey | null;
  done?: (now: TourCtx, start: TourCtx, demo: boolean) => boolean; // нет — только кнопкой «Дальше»
}

// Подсказка модуля — в файле Компонент.tour.ts рядом с компонентом: export default defineTips({...}).
// Показывается один раз, когда её якорь на экране и when() верно (tips.ts); текст — tour.tips[id] в ru.ts и en.ts.
export type TipId = keyof Texts['tour']['tips'];
export interface Tip {
  id: TipId;
  rev: number;    // поменялось то, что подсказка объясняет, — rev + 1: покажется снова (и в «Что нового», если news)
  at: Anchor;
  since: string;  // дата появления функции, YYYY-MM-DD: новичку не покажем «новым» то, что было до его первого запуска
  when?: (c: TourCtx) => boolean;
  news?: boolean; // попадает в «Что нового»; короткая строка — tour.news[id]
}

export const defineTips = (...tips: Tip[]): Tip[] => tips;
