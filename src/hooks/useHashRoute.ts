import { useEffect, useRef } from 'react';
import type { Index } from '../data';

export const slugFromHash = (): string => {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
};

// Адрес ↔ открытый персонаж: #demiurge-stella открывает его билды, открытый персонаж пишется в адрес.
export function useHashRoute(idx: Index, tab: string, charId: string | null, openChar: (id: string) => void) {
  useEffect(() => {
    const c = tab === 'chars' && charId ? idx.CHAR[charId] : null;
    try {
      history.replaceState(null, '', c ? '#' + c.slug : location.pathname + location.search);
    } catch { /* file:// или песочница */ }
  }, [idx, tab, charId]);

  const current = useRef({ charId, openChar });
  current.current = { charId, openChar };
  useEffect(() => {
    const onHash = () => {
      const c = idx.CHAR_BY_SLUG[slugFromHash()];
      if (c && c.id !== current.current.charId) current.current.openChar(c.id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [idx]);
}
