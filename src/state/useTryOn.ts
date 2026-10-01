import { useState } from 'react';
import type { Index } from '../data';
import { restoreTryOn, type TryOn } from '../logic/tryon';
import { storage } from './storage';

// Режим «для героя» (logic/tryon) — своим ключом 'ogc.tryon', не в 'ogc.state': там ровно тот набор полей, что у прежней
// страницы. Android выгружает PWA, пока ты в игре, — после перезапуска режим тот же.
// persist = false — идёт обучение: режим не пишется (у тура «Экипировка» свой, на примере)
export function useTryOn(idx: Index, persist: boolean): { value: TryOn | null; set: (next: TryOn | null) => void } {
  const [value, setValue] = useState<TryOn | null>(() => restoreTryOn(storage.get<unknown>('tryon', null), idx));
  const set = (next: TryOn | null) => {
    setValue(next);
    if (persist) storage.set('tryon', next);
  };
  return { value, set };
}
