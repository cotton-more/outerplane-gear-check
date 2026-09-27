import { useEffect, useReducer } from 'react';
import type { Index } from '../data';
import { fromPersisted, reducer, restoreItem, toPersisted, toPersistedItem, type AppState } from './appState';
import { storage } from './storage';

// Состояние страницы: стартует из 'ogc.state' (настройки, вкладка) и 'ogc.item' (недовведённый предмет),
// каждое изменение сохраняет туда же.
// boot — поправка стартового состояния (например, персонаж из #slug в адресе).
// persist = false — не сохранять (идёт обучение): если Android выгрузит страницу посреди тура, в хранилище останется
// вещь, какой она была до него; включили снова — сохраняется текущее.
export function useAppState(idx: Index, boot?: (s: AppState) => AppState, persist = true) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const s = restoreItem(fromPersisted(storage.get('state', null), idx), storage.get('item', null), idx);
    return boot ? boot(s) : s;
  });
  const saved = JSON.stringify(toPersisted(state));
  useEffect(() => { if (persist) storage.set('state', JSON.parse(saved)); }, [saved, persist]);
  const item = JSON.stringify(toPersistedItem(state));
  useEffect(() => { if (persist) storage.set('item', JSON.parse(item)); }, [item, persist]);
  return [state, dispatch] as const;
}
