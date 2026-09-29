import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Index } from '../data';
import { storage } from './storage';

// Что сделало добавление: added — кого добавили; replaced — Core Fusion X вытеснил X; refused — X не добавлен, потому
// что в ростере (или в том же наборе) уже Core Fusion X. По нему — сообщение и «Вернуть» (App)
export interface RosterChange {
  added: string[];
  replaced: { fusion: string; base: string }[];
  refused: { base: string; fusion: string }[];
}

export interface RosterApi {
  roster: ReadonlySet<string>;           // только персонажи, которые есть в текущих данных
  toggle: (id: string) => RosterChange;
  add: (ids: string[]) => RosterChange;
  remove: (ids: string[]) => void;
  replace: (ids: string[]) => void;
  revert: (ch: RosterChange) => void;    // «Вернуть»: убрать добавленных, вернуть вытесненных
  clear: () => void;
}

const read = (): string[] => {
  const raw = storage.get<unknown>('roster', []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
};

const NONE: RosterChange = { added: [], replaced: [], refused: [] };

// Core Fusion X заменяет X (решение владельца): оба в списке — остаётся Core Fusion
export function withoutFused(idx: Index, ids: readonly string[]): string[] {
  const has = new Set(ids);
  return ids.filter((id) => !has.has(idx.FUSED[id]));
}

// добавить ids к cur: X при Core Fusion X в ростере или в том же наборе — не добавляем; Core Fusion X — убирает X
export function addTo(idx: Index, cur: readonly string[], ids: readonly string[]): { next: string[]; ch: RosterChange } {
  const incoming = new Set(ids);
  const ch: RosterChange = { added: [], replaced: [], refused: [] };
  let next = [...cur];
  for (const id of ids) {
    if (next.includes(id)) continue;
    const fusion = idx.FUSED[id];
    if (fusion && (next.includes(fusion) || incoming.has(fusion))) { ch.refused.push({ base: id, fusion }); continue; }
    const base = idx.CHAR[id]?.fusionOf;
    if (base && next.includes(base)) { next = next.filter((x) => x !== base); ch.replaced.push({ fusion: id, base }); }
    next.push(id);
    ch.added.push(id);
  }
  return { next, ch };
}

// Ростер в 'ogc.roster' — id персонажей в порядке добавления.
// Незнакомые id (персонаж на время пропал из данных outerpedia) не стираем, а просто не показываем.
// В хранилище и X, и Core Fusion X (сохранено до этого правила) — в ростере только Core Fusion; хранилище чистится
// при следующей записи.
// Другая вкладка или PWA рядом (Android держит её в памяти часами) могли поменять ростер: перечитываем его по событию
// storage и когда страница снова на экране — иначе следующая звёздочка здесь стёрла бы их правку, а с «только мои
// персонажи» вердикт молча перестал бы учитывать пропавшего персонажа.
export function useRoster(idx: Index): RosterApi {
  const [stored, setStored] = useState<string[]>(read);
  // текущий список для операций: итог добавления нужен сразу (сообщение), а не после следующей отрисовки
  const cur = useRef(stored);
  const reloaded = useRef(false); // пришло из хранилища — писать обратно незачем
  useEffect(() => {
    if (reloaded.current) { reloaded.current = false; return; }
    storage.set('roster', stored);
  }, [stored]);
  useEffect(() => {
    if (!storage.available()) return; // без хранилища живём в памяти — перечитывать нечего
    const reload = () => { reloaded.current = true; cur.current = read(); setStored(cur.current); };
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === storage.key('roster')) reload(); };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  const roster = useMemo(() => new Set(withoutFused(idx, stored).filter((id) => idx.CHAR[id])), [stored, idx]);

  const write = useCallback((next: string[]) => { cur.current = withoutFused(idx, next); setStored(cur.current); }, [idx]);
  const add = useCallback((ids: string[]) => {
    const { next, ch } = addTo(idx, withoutFused(idx, cur.current), ids);
    if (ch.added.length) write(next);
    return ch;
  }, [idx, write]);
  const toggle = useCallback((id: string) => {
    const now = withoutFused(idx, cur.current);
    if (!now.includes(id)) return add([id]);
    write(now.filter((x) => x !== id));
    return NONE;
  }, [idx, add, write]);
  const remove = useCallback((ids: string[]) => write(cur.current.filter((id) => !ids.includes(id))), [write]);
  const revert = useCallback((ch: RosterChange) => {
    const next = cur.current.filter((id) => !ch.added.includes(id));
    write([...next, ...ch.replaced.map((r) => r.base).filter((id) => !next.includes(id))]);
  }, [write]);
  const replace = useCallback((ids: string[]) => write(addTo(idx, [], ids).next), [idx, write]);
  const clear = useCallback(() => write([]), [write]);
  return { roster, toggle, add, remove, replace, revert, clear };
}
