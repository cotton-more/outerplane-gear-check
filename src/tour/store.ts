// Что игрок уже прошёл в обучении — ключ 'ogc.tour'. Чистые функции; читает и пишет только load/save.
//   first   — главный тур: new (ещё не проходил), done (прошёл), skipped (давний игрок: пришёл до обучения)
//   invited — полоса «Появилось обучение» уже была (показываем один раз)
//   seen    — пройденные шаги и подсказки: id → rev
//   known   — что было в приложении на первом запуске и после каждого обновления: от этого считается «Что нового»
//   since   — дата первого запуска с обучением
//   tips    — подсказки по ходу включены
// Незнакомые id не стираются: вдруг это вкладка с более новой версией.
import { storage } from '../state/storage';

export type First = 'new' | 'done' | 'skipped';
export type Revs = Record<string, number>;

export interface TourStore {
  v: 1;
  first: First;
  invited: boolean;
  seen: Revs;
  known: Revs;
  since: string;
  tips: boolean;
}

const KEY = 'tour';

const revs = (v: unknown): Revs => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([, r]) => Number.isInteger(r) && (r as number) > 0)) as Revs;
};

// Первый запуск с обучением. Давний игрок — отметил персонажей или закрыл карточку «Как пользоваться»: главный тур ему
// не навязываем, один раз предложим полосой. По ogc.state давнего не узнать: страница пишет его с первого же показа.
export function bootTour(raw: unknown, was: { roster: number; welcomeHidden: boolean }, current: Revs, today: string): TourStore {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (r?.v === 1 && (['new', 'done', 'skipped'] as unknown[]).includes(r.first)) {
    return {
      v: 1,
      first: r.first as First,
      invited: r.invited === true,
      seen: revs(r.seen),
      known: revs(r.known),
      since: typeof r.since === 'string' ? r.since : today,
      tips: r.tips !== false,
    };
  }
  const old = was.roster > 0 || was.welcomeHidden;
  return { v: 1, first: old ? 'skipped' : 'new', invited: false, seen: {}, known: { ...current }, since: today, tips: true };
}

// отметить пройденное: берём большую ревизию — вторая вкладка могла отметить больше
export const markSeen = (st: TourStore, ids: Revs): TourStore => {
  const seen = { ...st.seen };
  for (const [id, rev] of Object.entries(ids)) seen[id] = Math.max(seen[id] ?? 0, rev);
  return { ...st, seen };
};

export const loadTour = (): unknown => storage.get<unknown>(KEY, null);

// перед записью сливаем с тем, что уже в хранилище: другая вкладка могла успеть отметить своё
export function mergeTour(st: TourStore, raw: unknown): TourStore {
  if (!raw) return st;
  const cur = bootTour(raw, { roster: 0, welcomeHidden: false }, {}, st.since);
  const known = { ...cur.known };
  for (const [id, rev] of Object.entries(st.known)) known[id] = Math.max(known[id] ?? 0, rev);
  return {
    ...markSeen(st, cur.seen),
    first: cur.first === 'done' ? 'done' : st.first,
    invited: st.invited || cur.invited,
    known,
  };
}

export function saveTour(st: TourStore): TourStore {
  const merged = mergeTour(st, loadTour());
  storage.set(KEY, merged);
  return merged;
}
