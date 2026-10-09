// Экипировка ('ogc.gear') и ростер ('ogc.roster') читаются вместе: правило «вещи только у героев ростера» (Р16) и Core
// Fusion смотрят на оба (features/gear/model/fusion normalizeStored). Нормализация что-то поменяла — сразу пишем оба ключа (Р17):
// иначе сообщение о ней повторялось бы при каждом запуске, а половина правки могла потеряться. Не пишем, если экипировку
// сохранила более новая версия страницы (эта её не понимает — перезапись стёрла бы её) или хранилища нет. Ничего не
// поменялось — не пишем. Чтение что-то отбросило (саб не из данных, отметка или поле новой версии — readsWhole) — тоже
// не пишем: нормализуем в памяти, пишем после действия игрока, как до Р17 (старая закэшированная PWA с прежним снимком
// данных иначе стёрла бы то, что понимает новая). Во время обучения не пишем ничего (holdStoredWrites).
// Хранилище прежней версии (v1, v2) пишем в v3 сразу — так же, один раз (.x/0085 PLAN Д11). Игроку прежней модели (были
// вещи) — разовое сообщение о переносе (takeModelNote, флаг 'ogc.modelNote').
// Устаревшие закрепления (билд пропал из outerpedia) переносятся или снимаются здесь же (fixPins, В3 и В5 ревью этапа 10) —
// только при целом чтении и данных страницы не старше уже виденных ('ogc.dataSeen' — дата коммита outerpedia): у старой
// закэшированной PWA билда из новых данных нет, а закрепление на него — не устаревшее. Иначе ключ лежит как был (профиль
// и так считает такого героя «По статам»). Сообщение — вместе с остальными после загрузки (takeLoadNote).
// Один разбор на одно содержимое хранилища: его читают оба хука.
import type { Index } from '@/game/data';
import { changed } from '@/features/gear/model/fusion';
import { fixPins } from '@/features/gear/model/gear';
import { loadGear, newerGear, oldMarks, oldModel, readsWhole, type Loaded } from './gearStore';
import { storage } from '@/shared/storage';

export interface Stored extends Loaded { newer: boolean }

// note — что поменяла нормализация этого разбора, для сообщения после загрузки; забирается один раз (takeLoadNote)
type Note = Pick<Loaded, 'fixes' | 'added'> & { pins: [string, string][] };
// model — the store of the old model was read and the upgrade notice has not been shown yet (takeModelNote);
// marks — it had marks / «Не отдавать надетое» / a chosen build (the notice then adds a sentence about the reset)
let last: { key: string; idx: Index; r: Stored; note: Note | null; model: boolean; marks: boolean } | null = null;
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
  // строка есть, а разобрать её не вышло (сбой записи, формат не JSON) — get отдал null, как при пустом ключе: не пишем
  const unreadable = (key: string, v: unknown) => v === null && storage.raw(key) !== null;
  const whole = readsWhole(raw, idx) && !unreadable('gear', raw) && !unreadable('roster', list)
    && (list === null || (Array.isArray(list) && list.length === roster.length));
  const migrated = raw !== null && typeof raw === 'object' && ((raw as { v?: unknown }).v === 1 || (raw as { v?: unknown }).v === 2);
  const page = idx.D.meta?.commitDate ?? '';
  const seen = storage.get<unknown>('dataSeen', null);
  const fresh = !page || typeof seen !== 'string' || page >= seen;
  if (page && fresh && seen !== page && storage.available()) storage.set('dataSeen', page);
  const pins = whole && fresh && !r.newer ? fixPins(idx, r.st) : { st: r.st, gone: [] };
  const pinsMoved = pins.st !== r.st;
  r.st = pins.st;
  if ((changed(r) || migrated || pinsMoved) && !r.newer && !held && whole && storage.available()) {
    storage.set('roster', r.roster);
    storage.set('gear', r.st);
  }
  const note = changed(r) || pins.gone.length ? { fixes: r.fixes, added: r.added, pins: pins.gone } : null;
  const model = oldModel(raw) && !storage.get('modelNote', false);
  last = { key: keyNow(), idx, r, note, model, marks: model && oldMarks(raw) };
  return r;
}

// сообщение после загрузки: что поменяла нормализация (один раз — второй вызов вернёт null)
export function takeLoadNote(idx: Index): Note | null {
  readStored(idx);
  const n = last!.note;
  last!.note = null;
  return n;
}

// the upgrade notice (TEXTS 41): non-null once in a lifetime, the flag is written at once; marks — add the sentence about
// the cleared marks (TEXTS 15)
export function takeModelNote(idx: Index): { marks: boolean } | null {
  readStored(idx);
  if (!last!.model) return null;
  const marks = last!.marks;
  last!.model = false;
  last!.marks = false;
  storage.set('modelNote', true);
  return { marks };
}
