// Фильтр кнопками: нажата одна или ни одной (повторное нажатие снимает). options — ключ → подпись, icon — значок ключа.
import type { ReactNode } from 'react';

export function FilterChips({ options, value, onChange, icon }: {
  options: Record<string, string>; value: string; onChange: (v: string) => void; icon: (k: string) => ReactNode;
}) {
  return (
    <div className="filt">
      {Object.entries(options).map(([k, v]) => (
        <button key={k} type="button" className="fbtn" aria-pressed={value === k} onClick={() => onChange(value === k ? '' : k)}>
          {icon(k)}{v}
        </button>
      ))}
    </div>
  );
}
