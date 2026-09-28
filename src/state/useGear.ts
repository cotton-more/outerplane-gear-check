import { useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { EMPTY_GEAR, restoreGear, type GearStore } from '../logic/gear';
import { storage } from './storage';

export interface GearApi {
  store: GearStore;
  set: (next: GearStore) => void;
}

// Экипировка в 'ogc.gear' (logic/gear). Пишем только после действия игрока: при чтении непонятное отбрасывается,
// и перезапись на загрузке стёрла бы то, что понимает более новая версия страницы.
// persist = false — идёт обучение: вещи не пишутся, а на странице — пусто (тур идёт на примере)
export function useGear(idx: Index, persist: boolean): GearApi {
  const [store, setStore] = useState<GearStore>(() => restoreGear(storage.get<unknown>('gear', null), idx));
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current && persist) storage.set('gear', store);
  }, [store, persist]);
  const set = (next: GearStore) => { dirty.current = true; setStore(next); };
  return useMemo(() => ({ store: persist ? store : EMPTY_GEAR, set }), [store, persist]); // eslint-disable-line react-hooks/exhaustive-deps
}
