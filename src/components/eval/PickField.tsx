import type { ReactNode } from 'react';

// Строка формы, которая открывает окно выбора. Пустая — пунктирная заглушка с подсказкой.
export function PickField({ value, placeholder, onClick, className }: {
  value?: ReactNode; placeholder: string; onClick: () => void; className?: string;
}) {
  const cls = ['pick', value ? '' : 'empty', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className="pick-v">{value || placeholder}</span>
      <span className="pick-c" aria-hidden="true">▾</span>
    </button>
  );
}
