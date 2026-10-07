// Переключатель сегментами: подпись и кнопки, нажата одна (aria-pressed). label — как показать (с двоеточием или без; пусто —
// без подписи), group — что скажет диктор; children — после кнопок (например, «Сбросить»).
import type { ReactNode } from 'react';

export interface SegOption<V> { value: V; label: ReactNode; lang?: string }

export function SegSwitch<V extends string | boolean>({ label, group, options, value, onChange, className, children }: {
  label: string; group: string; options: readonly SegOption<V>[]; value: V; onChange: (v: V) => void;
  className?: string; children?: ReactNode;
}) {
  return (
    <div className={className ? `seg ${className}` : 'seg'} role="group" aria-label={group}>
      {label && <span className="muted small">{label}</span>}
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="fbtn" lang={o.lang} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
      {children}
    </div>
  );
}
