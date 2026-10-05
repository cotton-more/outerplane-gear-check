import { useLayoutEffect, useState, type CSSProperties } from 'react';

// Сообщение с «Вернуть» на ПК — внизу над колонкой, где действовали (форма; на «Персонажах» — список), а не по центру
// окна: там его край ложился на кнопки колонки вердикта («Заменить шлем Caren» поднимается на место надетой строки)
// и карточки персонажа. На телефоне колонок нет — оно над плашкой вердикта (CSS). on — сообщение на экране.
export function useToastPlace(on: boolean, columnId: string): CSSProperties | undefined {
  const [place, setPlace] = useState<CSSProperties>();
  useLayoutEffect(() => {
    const el = on ? document.getElementById(columnId) : null;
    if (!el) { setPlace(undefined); return; }
    const put = () => {
      const r = el.getBoundingClientRect();
      setPlace(r.width ? { left: r.left + r.width / 2, maxWidth: r.width - 24 } : undefined);
    };
    put();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(put);
    ro?.observe(el);
    window.addEventListener('resize', put);
    return () => { ro?.disconnect(); window.removeEventListener('resize', put); };
  }, [on, columnId]);
  return place;
}
