import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { storage } from './storage';

export interface RosterApi {
  roster: ReadonlySet<string>;           // только персонажи, которые есть в текущих данных
  toggle: (id: string) => void;
  add: (ids: string[]) => void;
  remove: (ids: string[]) => void;
  replace: (ids: string[]) => void;
  clear: () => void;
}

const read = (): string[] => {
  const raw = storage.get<unknown>('roster', []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};

// Ростер в 'ogc.roster' — id персонажей в порядке добавления.
// Незнакомые id (персонаж на время пропал из данных outerpedia) не стираем, а просто не показываем.
// Другая вкладка или PWA рядом (Android держит её в памяти часами) могли поменять ростер: перечитываем его по событию
// storage и когда страница снова на экране — иначе следующая звёздочка здесь стёрла бы их правку, а с «только мои
// персонажи» вердикт молча перестал бы учитывать пропавшего персонажа.
export function useRoster(idx: Index): RosterApi {
  const [stored, setStored] = useState<string[]>(read);
  const reloaded = useRef(false); // пришло из хранилища — писать обратно незачем
  useEffect(() => {
    if (reloaded.current) { reloaded.current = false; return; }
    storage.set('roster', stored);
  }, [stored]);
  useEffect(() => {
    if (!storage.available()) return; // без хранилища живём в памяти — перечитывать нечего
    const reload = () => { reloaded.current = true; setStored(read()); };
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === storage.key('roster')) reload(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const roster = useMemo(() => new Set(stored.filter((id) => idx.CHAR[id])), [stored, idx]);

  const toggle = useCallback((id: string) => setStored((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);
  const add = useCallback((ids: string[]) => setStored((s) => [...s, ...ids.filter((id, i) => !s.includes(id) && ids.indexOf(id) === i)]), []);
  const remove = useCallback((ids: string[]) => setStored((s) => s.filter((id) => !ids.includes(id))), []);
  const replace = useCallback((ids: string[]) => setStored([...new Set(ids)]), []);
  const clear = useCallback(() => setStored([]), []);
  return { roster, toggle, add, remove, replace, clear };
}
