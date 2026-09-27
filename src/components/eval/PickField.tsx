import type { ReactNode } from 'react';
import { tour, type Anchor } from '../../tour/anchors';

// Строка формы, которая открывает окно выбора. Пустая — пунктирная заглушка с подсказкой.
// at — якорь обучения (src/tour/anchors.ts)
export function PickField({ value, placeholder, onClick, className, at }: {
  value?: ReactNode; placeholder: string; onClick: () => void; className?: string; at?: Anchor;
}) {
  const cls = ['pick', value ? '' : 'empty', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} {...(at && tour(at))}>
      <span className="pick-v">{value || placeholder}</span>
      <span className="pick-c" aria-hidden="true">▾</span>
    </button>
  );
}
