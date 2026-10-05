import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import { CloseButton } from './CloseButton';

// Шторка снизу поверх страницы: окна выбора (сет, предмет, main, сабстат) и подробности вердикта.
// Закрывается крестиком, нажатием мимо и Esc (Esc не доходит до горячих клавиш страницы).
// Рисуется в <body>: шторка из карточки персонажа (у неё свой z-index на телефоне) иначе ушла бы под плашку вердикта.
// Открыты две сразу — Esc закрывает верхнюю, а drawer-lock снимается, когда закрыта последняя.
// at — маленькое окно у точки (нажатой клетки), и на телефоне: центр содержимого — на ней, чтобы мышь и палец
// не ехали через экран; у края — прижато внутрь (popPlace). Без выезда: окно уровня сабстата — это ввод (motion.css).
const open: object[] = [];
export type Point = { x: number; y: number };
const EDGE = 8; // отступ окна у точки от краёв экрана

// где встать окну у точки: центр тела окна (без заголовка) — на точке, окно целиком в экране с отступом EDGE;
// не влезает — прижато к левому и верхнему краю. box — размеры окна и смещение тела от его верха, view — экран
export function popPlace(at: Point, box: { w: number; h: number; bodyTop: number; bodyH: number }, view: { w: number; h: number }) {
  const fit = (v: number, size: number, max: number) => Math.max(EDGE, Math.min(v, max - size - EDGE));
  return { left: fit(at.x - box.w / 2, box.w, view.w), top: fit(at.y - box.bodyTop - box.bodyH / 2, box.h, view.h) };
}

export function Sheet({ title, onClose, children, className, at }: {
  title: string; onClose: () => void; children: ReactNode; className?: string; at?: Point;
}) {
  const t = useT();
  const close = useRef(onClose);
  close.current = onClose;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // до первой отрисовки: окно меряется на месте и сразу встаёт у точки, без мелькания по центру
  useLayoutEffect(() => {
    const d = box.current, b = d?.querySelector('.drawer-b');
    if (!at || !d || !b) return;
    const dr = d.getBoundingClientRect(), br = b.getBoundingClientRect();
    setPos(popPlace(at, { w: dr.width, h: dr.height, bodyTop: br.top - dr.top, bodyH: br.height }, { w: window.innerWidth, h: window.innerHeight }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    <div className={at ? 'drawer-back pop' : 'drawer-back'} onClick={onClose}>
      <div ref={box} className={className ? `drawer ${className}` : 'drawer'} role="dialog" aria-modal="true" aria-label={title} style={pos ?? undefined}
        onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <h3>{title}</h3>
          <CloseButton className="drawer-x" label={t.ui.close} onClick={onClose} />
        </div>
        <div className="drawer-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
