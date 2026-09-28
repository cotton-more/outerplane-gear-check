// Плашка над страницей с одной кнопкой: «Вышли новые данные» (только с новыми данными — не на правки приложения,
// hooks/usePwa) и «Версия для ПК».
export function Notice({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <p className="fitnote">
      <span>{text}</span>
      <button type="button" onClick={onAction}>{action}</button>
    </p>
  );
}
