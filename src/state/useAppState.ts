import { useEffect, useReducer } from 'react';
import type { Index } from '../data';
import { fromPersisted, reducer, restoreItem, toPersisted, toPersistedItem, type AppState } from './appState';
import { storage } from './storage';

// Состояние страницы: стартует из 'ogc.state' (настройки, вкладка) и 'ogc.item' (недовведённый предмет),
// каждое изменение сохраняет туда же.
// boot — поправка стартового состояния (например, персонаж из #slug в адресе).
export function useAppState(idx: Index, boot?: (s: AppState) => AppState) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const s = restoreItem(fromPersisted(storage.get('state', null), idx), storage.get('item', null), idx);
    return boot ? boot(s) : s;
  });
  const saved = JSON.stringify(toPersisted(state));
  useEffect(() => { storage.set('state', JSON.parse(saved)); }, [saved]);
  const item = JSON.stringify(toPersistedItem(state));
  useEffect(() => { storage.set('item', JSON.parse(item)); }, [item]);
  return [state, dispatch] as const;
}
