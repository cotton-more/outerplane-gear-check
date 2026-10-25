// Подсказки по ходу и «Что нового»: что показать сейчас. Чистые функции — test/tour/tour.test.ts.
// Подсказка показывается один раз: shown — seen (TipLayer), whether the player closed it or it left on its own.
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

// Новое — подсказка с news, которую игрок ещё не знает в этой ревизии: знакомая подсказка с rev + 1 или появившаяся
// после его первого запуска. Всё, что было в приложении при первом запуске, bootTour сразу кладёт в known, поэтому
// даты выпуска не нужны. Давнему игроку (пришёл раньше обучения) подсказки с news в known не кладутся — для него они новые
export const newsOf = (tips: Tip[], st: TourStore) => tips.filter((t) => t.news && (st.known[t.id] ?? 0) < t.rev);

// Help's tips list (owner, 2026-10-25: nobody reads several screens): on top at most HELP_TOP tips — those shipped in the last
// HELP_DAYS days and the player's unseen news — unseen first (owner, 2026-10-11: new on top), then newest first; the rest
// folded, in TIP_ORDER
export const HELP_TOP = 10;
export const HELP_DAYS = 14;
export function helpTips(tips: Tip[], news: readonly Tip[], today: string): { top: Tip[]; rest: Tip[] } {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - HELP_DAYS);
  const from = d.toISOString().slice(0, 10);
  const top = tips.filter((t) => t.since >= from || news.includes(t))
    .sort((a, z) => +news.includes(z) - +news.includes(a) || (a.since < z.since ? 1 : a.since > z.since ? -1 : tips.indexOf(a) - tips.indexOf(z)))
    .slice(0, HELP_TOP);
  return { top, rest: tips.filter((t) => !top.includes(t)) };
}
