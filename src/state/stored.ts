// Экипировка ('ogc.gear') и ростер ('ogc.roster') читаются вместе: правило «вещи только у героев ростера» (Р16) и Core
// Fusion смотрят на оба (logic/fusion normalizeStored). Нормализация что-то поменяла — сразу пишем оба ключа (Р17):
// иначе сообщение о ней повторялось бы при каждом запуске, а половина правки могла потеряться. Не пишем, если экипировку
// сохранила более новая версия страницы (эта её не понимает — перезапись стёрла бы её) или хранилища нет. Ничего не
// поменялось — не пишем. Чтение что-то отбросило (саб не из данных, отметка или поле новой версии — readsWhole) — тоже
// не пишем: нормализуем в памяти, пишем после действия игрока, как до Р17 (старая закэшированная PWA с прежним снимком
// данных иначе стёрла бы то, что понимает новая). Во время обучения не пишем ничего (holdStoredWrites).
// Один разбор на одно содержимое хранилища: его читают оба хука.
import type { Index } from '../data';
import { changed } from '../logic/fusion';
import { loadGear, newerGear, readsWhole, type Loaded } from '../logic/gearStore';
import { storage } from './storage';

export interface Stored extends Loaded { newer: boolean }

// note — что поменяла нормализация этого разбора, для сообщения после загрузки; забирается один раз (takeLoadNote)
type Note = Pick<Loaded, 'fixes' | 'added'>;
let last: { key: string; idx: Index; r: Stored; note: Note | null } | null = null;
let held = false;
// идёт обучение — запись нормализации при чтении не срабатывает (App, onRunning)
export const holdStoredWrites = (on: boolean) => { held = on; };
const keyNow = () => `${storage.raw('gear')}\u0000${storage.raw('roster')}`;

export function readStored(idx: Index): Stored {
  const key = keyNow();
  if (last && last.key === key && last.idx === idx) return last.r;
  const raw = storage.get<unknown>('gear', null);
  const list = storage.get<unknown>('roster', null);
  const roster = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  const r = { ...loadGear(raw, idx, roster), newer: newerGear(raw) };
  const whole = readsWhole(raw, idx) && (list === null || (Array.isArray(list) && list.length === roster.length));
  if (changed(r) && !r.newer && !held && whole && storage.available()) {
    storage.set('roster', r.roster);
    storage.set('gear', r.st);
  }
  last = { key: keyNow(), idx, r, note: changed(r) ? { fixes: r.fixes, added: r.added } : null };
  return r;
}

// сообщение после загрузки: что поменяла нормализация (один раз — второй вызов вернёт null)
export function takeLoadNote(idx: Index): Note | null {
  readStored(idx);
  const n = last!.note;
  last!.note = null;
  return n;
}
