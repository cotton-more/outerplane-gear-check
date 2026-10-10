// Галочка с подписью: label.toggle > input + подпись (children).
// label — what the screen reader says when the caption is long (a batch walk step: the whole card is the caption, a tap
// anywhere on it ticks the box).
import type { ReactNode } from 'react';

export function Toggle({ checked, onChange, id, className, label, children }: {
  checked: boolean; onChange: (on: boolean) => void; id?: string; className?: string; label?: string; children: ReactNode;
}) {
  return (
    <label className={className ? `toggle ${className}` : 'toggle'}>
      <input type="checkbox" id={id} checked={checked} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      {' '}{children}
    </label>
  );
}
