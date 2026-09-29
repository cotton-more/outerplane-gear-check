import { useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { EMPTY_GEAR, type GearStore } from '../logic/gear';
import { newerGear, restoreGear } from '../logic/gearStore';
import { storage } from './storage';

export interface GearApi {
  store: GearStore;
  set: (next: GearStore) => void;
  newer: boolean; // экипировку сохранила более новая версия страницы: здесь пусто и ничего не пишется — обнови страницу
}

// Экипировка в 'ogc.gear' (logic/gear). Пишем только после действия игрока: при чтении непонятное отбрасывается,
// и перезапись на загрузке стёрла бы то, что понимает более новая версия страницы.
// persist = false — идёт обучение: вещи не пишутся, а на странице — пусто (тур идёт на примере)
// Другая вкладка или PWA рядом (Android держит её в памяти часами) могли записать своё: перечитываем хранилище по
// событию storage и когда страница снова на экране — иначе следующее действие здесь стёрло бы их записи.
export function useGear(idx: Index, persist: boolean): GearApi {
  const [store, setStore] = useState<GearStore>(() => restoreGear(storage.get<unknown>('gear', null), idx));
  const [newer, setNewer] = useState(() => newerGear(storage.get<unknown>('gear', null)));
  const pending = useRef(false); // действие во время тура — записать, когда он кончится
  const live = useRef(persist);
  live.current = persist;
  useEffect(() => {
    if (!pending.current || !persist) return;
    storage.set('gear', store);
    pending.current = false;
  }, [store, persist]);
  useEffect(() => {
    if (!storage.available()) return; // без хранилища живём в памяти — перечитывать нечего
    const reload = () => {
      if (pending.current) return;
      const raw = storage.get<unknown>('gear', null);
      setStore(restoreGear(raw, idx));
      setNewer(newerGear(raw));
    };
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === storage.key('gear')) reload(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [idx]);
  const set = (next: GearStore) => {
    if (newer) return;
    setStore(next);
    if (live.current) storage.set('gear', next); else pending.current = true;
  };
  return useMemo(() => ({ store: persist ? store : EMPTY_GEAR, set, newer }), [store, persist, newer]); // eslint-disable-line react-hooks/exhaustive-deps
}
