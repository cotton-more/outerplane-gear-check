// Строка, которая раскрывается на месте: заголовок со сводкой (note) и стрелкой; тело рисуется, только пока открыта —
// закрытая ничего не считает (резервная копия кодирует всё хранилище). Открытость хранит тот, кто зовёт (open, onToggle).
import type { ReactNode } from 'react';

export function Expand({ id, title, note, open, onToggle, children }: {
  id?: string; title: string; note?: string; open: boolean; onToggle: (open: boolean) => void; children: ReactNode;
}) {
  return (
    <div className={open ? 'xp open' : 'xp'}>
      <button type="button" className="xp-h" id={id} aria-expanded={open} onClick={() => onToggle(!open)}>
        <span className="xp-t">{title}</span>
        {note && <span className="xp-n">{note}</span>}
        <span className="xp-c" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && <div className="xp-b">{children}</div>}
    </div>
  );
}
