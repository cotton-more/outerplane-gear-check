import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Index } from '../data';
import { storage } from './storage';

export interface RosterApi {
  roster: ReadonlySet<string>;           // только персонажи, которые есть в текущих данных
  toggle: (id: string) => void;
  add: (ids: string[]) => void;
  replace: (ids: string[]) => void;
  clear: () => void;
}

// Ростер в 'ogc.roster' — id персонажей в порядке добавления.
// Незнакомые id (персонаж на время пропал из данных outerpedia) не стираем, а просто не показываем.
export function useRoster(idx: Index): RosterApi {
  const [stored, setStored] = useState<string[]>(() => {
    const raw = storage.get<unknown>('roster', []);
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  });
  useEffect(() => { storage.set('roster', stored); }, [stored]);
  const roster = useMemo(() => new Set(stored.filter((id) => idx.CHAR[id])), [stored, idx]);

  const toggle = useCallback((id: string) => setStored((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);
  const add = useCallback((ids: string[]) => setStored((s) => [...s, ...ids.filter((id, i) => !s.includes(id) && ids.indexOf(id) === i)]), []);
  const replace = useCallback((ids: string[]) => setStored([...new Set(ids)]), []);
  const clear = useCallback(() => setStored([]), []);
  return { roster, toggle, add, replace, clear };
}
