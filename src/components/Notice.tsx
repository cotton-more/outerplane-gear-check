// Плашка над страницей с одной кнопкой: «Вышли новые данные» (только с новыми данными — не на правки приложения,
// hooks/usePwa), «Версия для ПК» и «Выбрал билды… · Проверить». onClose — необязательный ✕ (последняя из них).
import { useT } from '../i18n';

export function Notice({ text, action, onAction, onClose }: { text: string; action: string; onAction: () => void; onClose?: () => void }) {
  const t = useT();
  return (
    <p className="fitnote">
      <span>{text}</span>
      <button type="button" onClick={onAction}>{action}</button>
      {onClose && <button type="button" className="notice-x" aria-label={t.ui.close} onClick={onClose}>✕</button>}
    </p>
  );
}
