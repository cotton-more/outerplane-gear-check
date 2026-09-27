// Подсказки по ходу и «Что нового»: что показать сейчас. Чистые функции — test/tour.test.ts.
// Подсказка показывается один раз: пока игрок её не закрыл и не нажал на то, на что она показывает.
// Не навязываемся: одна за раз, не больше трёх за запуск, не чаще раза в 20 секунд и только после паузы в нажатиях.
import type { Anchor } from './anchors';
import type { TourStore } from './store';
import type { Tip, TourCtx } from './types';

export const LIMITS = { perLaunch: 3, gapMs: 20_000, idleMs: 1_500 };

export interface TipSession { shown: number; lastAt: number }

export const unseen = (tips: Tip[], st: TourStore) => tips.filter((t) => (st.seen[t.id] ?? 0) < t.rev);

export function nextTip(tips: Tip[], st: TourStore, c: TourCtx, sess: TipSession, now: number, lastInput: number,
  onScreen: (a: Anchor) => boolean): Tip | null {
  if (!st.tips || sess.shown >= LIMITS.perLaunch) return null;
  if (sess.shown > 0 && now - sess.lastAt < LIMITS.gapMs) return null;
  if (now - lastInput < LIMITS.idleMs) return null;
  return unseen(tips, st).find((t) => (!t.when || t.when(c)) && onScreen(t.at)) ?? null;
}

// Новое — подсказка с news, которую игрок ещё не видел в этой ревизии: знакомая подсказка с rev + 1 или новая,
// появившаяся после его первого запуска (иначе новичку «новым» было бы всё подряд)
export const newsOf = (tips: Tip[], st: TourStore) => tips.filter((t) => t.news && (st.known[t.id] ?? 0) < t.rev
  && (t.id in st.known || t.since > st.since));
