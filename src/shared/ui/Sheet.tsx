import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';

// Шторка снизу поверх страницы: окна выбора (сет, предмет, main, сабстат) и подробности вердикта.
// Закрывается крестиком, нажатием мимо и Esc (Esc не доходит до горячих клавиш страницы).
// Рисуется в <body>: шторка из карточки персонажа (у неё свой z-index на телефоне) иначе ушла бы под плашку вердикта.
// Открыты две сразу — Esc закрывает верхнюю, а drawer-lock снимается, когда закрыта последняя.
const open: object[] = [];
export function Sheet({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const t = useT();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = {};
    open.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || open[open.length - 1] !== me) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    document.body.classList.add('drawer-lock');
    return () => {
      window.removeEventListener('keydown', onKey, true);
      open.splice(open.indexOf(me), 1);
      if (!open.length) document.body.classList.remove('drawer-lock');
    };
  }, []);
  return createPortal(
    <div className="drawer-back" onClick={onClose}>
      <div className={className ? `drawer ${className}` : 'drawer'} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <h3>{title}</h3>
          <button type="button" className="drawer-x" aria-label={t.ui.close} onClick={onClose}>✕</button>
        </div>
        <div className="drawer-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
