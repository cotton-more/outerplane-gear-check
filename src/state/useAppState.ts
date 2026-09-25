import { useEffect, useReducer } from 'react';
import type { Index } from '../data';
import { fromPersisted, reducer, toPersisted, type AppState } from './appState';
import { storage } from './storage';

// Состояние страницы: стартует из 'ogc.state', каждое изменение сохраняет туда же.
// boot — поправка стартового состояния (например, персонаж из #slug в адресе).
export function useAppState(idx: Index, boot?: (s: AppState) => AppState) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const s = fromPersisted(storage.get('state', null), idx);
    return boot ? boot(s) : s;
  });
  const saved = JSON.stringify(toPersisted(state));
  useEffect(() => { storage.set('state', JSON.parse(saved)); }, [saved]);
  return [state, dispatch] as const;
}
