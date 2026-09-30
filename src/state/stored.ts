// Экипировка ('ogc.gear') и ростер ('ogc.roster') читаются вместе: правило Core Fusion смотрит на оба (logic/fusion).
// Нормализуем в памяти; пишут useGear и useRoster только после действия игрока — перезапись на загрузке стёрла бы то,
// что понимает более новая версия страницы. Один разбор на одно содержимое хранилища: его читают оба хука.
import type { Index } from '../data';
import { loadGear, newerGear, type Loaded } from '../logic/gearStore';
import { storage } from './storage';

export interface Stored extends Loaded { newer: boolean }

let last: { key: string; idx: Index; r: Stored; flushed?: boolean } | null = null;
const keyNow = () => `${storage.raw('gear')}\u0000${storage.raw('roster')}`;

// Первое действие игрока пишет свой ключ — нормализация Core Fusion, которую он видел в сеансе, пишется целиком: второй
// ключ — как его нормализовали при чтении (иначе после перезагрузки половина правки пропала бы: ростер без X и CF, а
// вещи — снова у X). Вызывать перед своей записью. Хранилище успели поменять (другая вкладка) — второй ключ не трогаем;
// экипировку сохранила более новая версия — её не пишем.
export function flushFusion(idx: Index, own: 'gear' | 'roster'): void {
  const p = last;
  if (!p || p.idx !== idx || p.flushed || !p.r.fixes.length || p.key !== keyNow()) return;
  p.flushed = true;
  if (own === 'gear') storage.set('roster', p.r.roster);
  else if (!p.r.newer) storage.set('gear', p.r.st);
}

export function readStored(idx: Index): Stored {
  const key = keyNow();
  if (last && last.key === key && last.idx === idx) return last.r;
  const raw = storage.get<unknown>('gear', null);
  const list = storage.get<unknown>('roster', []);
  const roster = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  const r = { ...loadGear(raw, idx, roster), newer: newerGear(raw) };
  last = { key, idx, r };
  return r;
}
