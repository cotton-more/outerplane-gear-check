import { useEffect, useRef } from 'react';
import type { Index } from '@/game/data';
import { heroCodeIn } from '@/features/gear/store/heroCode';

export const slugFromHash = (): string => {
  try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; }
};

// код героя в адресе при запуске (ссылка показа, DEVELOPMENT.md "Storage and URLs"): читается до того, как адрес перепишут
export const heroFromHash = (): string | null => heroCodeIn(location.hash);

// Адрес ↔ открытый персонаж: #demiurge-stella открывает его билды, открытый персонаж пишется в адрес. Ссылка показа
// (#OGH…) в уже открытом приложении — onShow, адрес — снова открытого персонажа: кода в нём не остаётся
export function useHashRoute(idx: Index, tab: string, charId: string | null, openChar: (id: string) => void, onShow: (code: string) => void) {
  const route = () => {
    const c = tab === 'chars' && charId ? idx.CHAR[charId] : null;
    try {
      history.replaceState(null, '', c ? '#' + c.slug : location.pathname + location.search);
    } catch { /* file:// или песочница */ }
  };
  useEffect(route, [idx, tab, charId]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useRef({ charId, openChar, onShow, route });
  current.current = { charId, openChar, onShow, route };
  useEffect(() => {
    const onHash = () => {
      const code = heroFromHash();
      if (code) { current.current.route(); current.current.onShow(code); return; }
      const c = idx.CHAR_BY_SLUG[slugFromHash()];
      if (c && c.id !== current.current.charId) current.current.openChar(c.id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [idx]);
}
