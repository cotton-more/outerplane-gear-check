import type { ReactNode } from 'react';
import { tour, type Anchor } from '@/tour/anchors';

// Строка формы, которая открывает окно выбора. Пустая — пунктирная заглушка с подсказкой.
// at — якорь обучения (src/tour/anchors.ts); need — без этого поля вердикта нет, а сабстаты уже вводят: выделить
// locked — fixed by a batch of one set (features/batch): looks off, no ▾, a tap only says why (onClick)
export function PickField({ value, placeholder, onClick, className, at, need, locked }: {
  value?: ReactNode; placeholder: string; onClick: () => void; className?: string; at?: Anchor; need?: boolean; locked?: boolean;
}) {
  const cls = ['pick', value ? '' : 'empty', need && 'need', locked && 'locked', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-disabled={locked || undefined} onClick={onClick} {...(at && tour(at))}>
      <span className="pick-v">{value || placeholder}</span>
      {!locked && <span className="pick-c" aria-hidden="true">▾</span>}
    </button>
  );
}
