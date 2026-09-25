import { useEffect, useRef, type ReactNode } from 'react';

// Шторка снизу поверх страницы: окна выбора (сет, предмет, main, сабстат) и подробности вердикта.
// Закрывается крестиком, нажатием мимо и Esc (Esc не доходит до горячих клавиш страницы).
export function Sheet({ title, onClose, children, className }: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey, true);
    document.body.classList.add('drawer-lock');
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('drawer-lock');
    };
  }, []);
  return (
    <div className="drawer-back" onClick={onClose}>
      <div className={className ? `drawer ${className}` : 'drawer'} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <h3>{title}</h3>
          <button type="button" className="drawer-x" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-b">{children}</div>
      </div>
    </div>
  );
}
