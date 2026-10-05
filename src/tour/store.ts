// Что игрок уже прошёл в обучении — ключ 'ogc.tour'. Чистые функции; читает и пишет только load/save.
//   first   — главный тур: new (ещё не проходил), done (прошёл), skipped (давний игрок: пришёл до обучения)
//   invited — полоса «Появилось обучение» уже была (показываем один раз)
//   seen    — пройденные шаги и подсказки: id → rev
//   known   — что игрок уже знает: от этого считается «Что нового» (tips.ts newsOf). При первом запуске — всё, что
//             есть в приложении; давнему игроку — всё, кроме подсказок с news
//   tips    — подсказки по ходу включены; tipsAt — когда их включили или выключили
//   resetAt — когда нажали «Показать подсказки заново»
// Метки времени нужны для двух вкладок: при записи берём то, что поменяли позже, а не то, что в этой вкладке.
// Незнакомые id не стираются: вдруг это вкладка с более новой версией.
import { storage } from '@/shared/storage';

export type First = 'new' | 'done' | 'skipped';
export type Revs = Record<string, number>;

export interface TourStore {
  v: 1;
  first: First;
  invited: boolean;
  seen: Revs;
  known: Revs;
  tips: boolean;
  tipsAt: number;
  resetAt: number;
}

const KEY = 'tour';

const revs = (v: unknown): Revs => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, r]) => Number.isInteger(r) && (r as number) > 0)) as Revs;
};
const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const omit = (r: Revs, ids: readonly string[]) => Object.fromEntries(Object.entries(r).filter(([id]) => !ids.includes(id)));

// Первый запуск с обучением. Давний игрок — отметил персонажей или закрыл карточку «Как пользоваться»: главный тур ему
// не навязываем, один раз предложим полосой. По ogc.state давнего не узнать: страница пишет его с первого же показа.
// news — подсказки с news: давнему игроку они новые (он пришёл раньше, чем о них рассказали), новичку — нет.
export function bootTour(raw: unknown, was: { roster: number; welcomeHidden: boolean }, current: Revs,
  news: readonly string[] = []): TourStore {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (r?.v === 1 && (['new', 'done', 'skipped'] as unknown[]).includes(r.first)) {
    return {
      v: 1,
      first: r.first as First,
      invited: r.invited === true,
      seen: revs(r.seen),
      known: revs(r.known),
      tips: r.tips !== false,
      tipsAt: time(r.tipsAt),
      resetAt: time(r.resetAt),
    };
  }
  const old = was.roster > 0 || was.welcomeHidden;
  return {
    v: 1, first: old ? 'skipped' : 'new', invited: false, seen: {},
    known: old ? omit(current, news) : { ...current }, tips: true, tipsAt: 0, resetAt: 0,
  };
}

// отметить пройденное: берём большую ревизию — вторая вкладка могла отметить больше
export const markSeen = (st: TourStore, ids: Revs): TourStore => {
  const seen = { ...st.seen };
  for (const [id, rev] of Object.entries(ids)) seen[id] = Math.max(seen[id] ?? 0, rev);
  return { ...st, seen };
};

export const loadTour = (): unknown => storage.get<unknown>(KEY, null);

// Перед записью сливаем с тем, что уже в хранилище: другая вкладка могла успеть отметить своё. Пройденное — по большей
// ревизии; выключатель подсказок — кто менял позже; после «Показать заново» увиденные раньше подсказки (tipIds) из
// другой записи не возвращаем.
export function mergeTour(st: TourStore, raw: unknown, tipIds: readonly string[] = []): TourStore {
  if (!raw) return st;
  const cur = bootTour(raw, { roster: 0, welcomeHidden: false }, {});
  const known = { ...cur.known };
  for (const [id, rev] of Object.entries(st.known)) known[id] = Math.max(known[id] ?? 0, rev);
  const mine = st.resetAt >= cur.resetAt ? st : { ...st, seen: omit(st.seen, tipIds) };
  const theirs = cur.resetAt >= st.resetAt ? cur.seen : omit(cur.seen, tipIds);
  const later = cur.tipsAt > st.tipsAt ? cur : st;
  return {
    ...markSeen(mine, theirs),
    first: cur.first === 'done' ? 'done' : st.first,
    invited: st.invited || cur.invited,
    known,
    tips: later.tips,
    tipsAt: later.tipsAt,
    resetAt: Math.max(st.resetAt, cur.resetAt),
  };
}

export function saveTour(st: TourStore, tipIds: readonly string[] = []): TourStore {
  const merged = mergeTour(st, loadTour(), tipIds);
  storage.set(KEY, merged);
  return merged;
}
