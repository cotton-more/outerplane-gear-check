// Галочка с подписью: label.toggle > input + подпись (children).
import type { ReactNode } from 'react';

export function Toggle({ checked, onChange, id, className, children }: {
  checked: boolean; onChange: (on: boolean) => void; id?: string; className?: string; children: ReactNode;
}) {
  return (
    <label className={className ? `toggle ${className}` : 'toggle'}>
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {' '}{children}
    </label>
  );
}
