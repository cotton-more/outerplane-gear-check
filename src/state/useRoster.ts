import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { storage } from './storage';
import { readStored } from './stored';

export interface RosterApi {
  roster: ReadonlySet<string>;           // только персонажи, которые есть в текущих данных
  list: () => string[];                  // весь ростер сейчас, по порядку (с незнакомыми id) — для операций и «Вернуть»
  toggle: (id: string) => void;
  add: (ids: string[]) => string[];      // кого добавили
  remove: (ids: string[]) => void;
  replace: (ids: string[]) => void;
  clear: () => void;
}

// Ростер в 'ogc.roster' — id персонажей в порядке добавления.
// Незнакомые id (персонаж на время пропал из данных outerpedia) не стираем, а просто не показываем.
// Читается вместе с экипировкой (state/stored): все, у кого есть вещи, — в ростере (Р16); в хранилище и X, и Core Fusion X
// (сохранено до правила) — только Core Fusion. Нормализация что-то поменяла — записана сразу при чтении (Р17).
// Сам хук правила перехода не знает — окна и пакетные добавления в App; здесь только страховка: X и Core Fusion X
// вместе не записываются (остаётся Core Fusion).
// Другая вкладка или PWA рядом (Android держит её в памяти часами) могли поменять ростер: перечитываем его по событию
// storage и когда страница снова на экране — иначе следующая звёздочка здесь стёрла бы их правку, а с «только мои
// персонажи» вердикт молча перестал бы учитывать пропавшего персонажа.
export function useRoster(idx: Index): RosterApi {
  const [list, setList] = useState<string[]>(() => readStored(idx).roster);
  // текущий список для операций: итог добавления нужен сразу (сообщение), а не после следующей отрисовки
  const cur = useRef(list);
  const read = useRef(list); // пришло из хранилища — писать обратно незачем
  useEffect(() => {
    if (list === read.current) return;
    storage.set('roster', list);
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!storage.available()) return; // без хранилища живём в памяти — перечитывать нечего
    const reload = () => { read.current = cur.current = readStored(idx).roster; setList(cur.current); };
    // экипировка тоже: от неё зависит Core Fusion
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === storage.key('roster') || e.key === storage.key('gear')) reload(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [idx]);
  const roster = useMemo(() => new Set(list.filter((id) => idx.CHAR[id])), [list, idx]);

  const write = useCallback((next: string[]) => {
    const both = new Set(next);
    cur.current = next.filter((id, i) => next.indexOf(id) === i && !both.has(idx.FUSED[id]));
    setList(cur.current);
  }, [idx]);
  const get = useCallback(() => cur.current, []);
  const add = useCallback((ids: string[]) => {
    const added = [...new Set(ids)].filter((id) => !cur.current.includes(id));
    if (added.length) write([...cur.current, ...added]);
    return added;
  }, [write]);
  const toggle = useCallback((id: string) => {
    if (cur.current.includes(id)) write(cur.current.filter((x) => x !== id)); else add([id]);
  }, [add, write]);
  const remove = useCallback((ids: string[]) => write(cur.current.filter((id) => !ids.includes(id))), [write]);
  const replace = useCallback((ids: string[]) => write(ids), [write]);
  const clear = useCallback(() => write([]), [write]);
  return { roster, list: get, toggle, add, remove, replace, clear };
}
