import { useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { EMPTY_GEAR, type GearStore } from '../logic/gear';
import { storage } from './storage';
import { flushFusion, readStored } from './stored';

export interface GearApi {
  store: GearStore;
  set: (next: GearStore) => void;
  newer: boolean; // экипировку сохранила более новая версия страницы: здесь пусто и ничего не пишется — обнови страницу
}

// Экипировка в 'ogc.gear' (logic/gear). Пишем только после действия игрока: при чтении непонятное отбрасывается,
// и перезапись на загрузке стёрла бы то, что понимает более новая версия страницы. Читается вместе с ростером: Core
// Fusion нормализуется в памяти (state/stored, logic/fusion).
// persist = false — идёт обучение: на странице пусто (тур идёт на примере), set ничего не делает и после тура
// ничего не пишется — действие из пустого стора тура стёрло бы все вещи игрока
// Другая вкладка или PWA рядом (Android держит её в памяти часами) могли записать своё: перечитываем хранилище по
// событию storage и когда страница снова на экране — иначе следующее действие здесь стёрло бы их записи.
export function useGear(idx: Index, persist: boolean): GearApi {
  const [store, setStore] = useState<GearStore>(() => readStored(idx).st);
  const [newer, setNewer] = useState(() => readStored(idx).newer);
  const live = useRef(persist);
  live.current = persist;
  useEffect(() => {
    if (!storage.available()) return; // без хранилища живём в памяти — перечитывать нечего
    const reload = () => {
      const r = readStored(idx);
      setStore(r.st);
      setNewer(r.newer);
    };
    // ростер тоже: от него зависит Core Fusion
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === storage.key('gear') || e.key === storage.key('roster')) reload(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [idx]);
  const set = (next: GearStore) => {
    if (newer || !live.current) return;
    setStore(next);
    flushFusion(idx, 'gear');
    storage.set('gear', next);
  };
  return useMemo(() => ({ store: persist ? store : EMPTY_GEAR, set, newer }), [store, persist, newer]); // eslint-disable-line react-hooks/exhaustive-deps
}
