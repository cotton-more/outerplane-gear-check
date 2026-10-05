// Сообщение внизу с одной кнопкой («Вернуть»); без onAction — без кнопки. Где встаёт на ПК — useToastPlace (style).
import type { CSSProperties } from 'react';

export function Toast({ text, note, action, onAction, className, style }: {
  text: string; note?: string; action: string; onAction?: () => void; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={className ? `toast ${className}` : 'toast'} role="status" style={style}>
      <span>{text}{note && <small>{note}</small>}</span>
      {onAction && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}
