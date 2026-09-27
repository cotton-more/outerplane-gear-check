// Типы обучения: шаги главного тура (core.ts) и подсказки, которые модули объявляют в своих *.tour.ts (registry.ts).
import type { Texts } from '../i18n';
import type { Verdict } from '../logic/verdict';
import type { AppState } from '../state/appState';
import type { Anchor, Pin } from './anchors';

// что шаг видит на странице: из этого считаются якорь, текст и «шаг выполнен»
export interface TourCtx {
  s: AppState;
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
  rev: number; // поменялось поведение, которое шаг объясняет, — rev + 1: шаг станет «новым» (этап 2)
  at: (c: TourCtx) => Anchor[];
  // на примере — точные кнопки, которые осталось нажать; пусто — рамка вокруг всего якоря (at)
  pin?: (c: TourCtx) => Pin[];
  // на примере — что на форме не так, как в примере: строка-подсказка под текстом шага (tour.off)
  off?: (c: TourCtx) => OffKey | null;
  done?: (now: TourCtx, start: TourCtx, demo: boolean) => boolean; // нет — только кнопкой «Дальше»
}

// Подсказка модуля — в файле Компонент.tour.ts рядом с компонентом: export default defineTips({...}).
// Показ подсказок по ходу и «Что нового» — этап 2; сейчас реестр только собирает их и проверяет.
export interface Tip {
  id: string;
  rev: number;
  at: Anchor | null;
  since: string; // дата появления, YYYY-MM-DD: новичку не покажем «новым» то, что было до его первого запуска
  when?: (c: TourCtx) => boolean;
}

export const defineTips = (...tips: Tip[]): Tip[] => tips;
