// Кнопка ✕: закрыть шторку, плашку, полосу обучения или снять отметку. label — что скажет диктор; вид — по className.
export function CloseButton({ label, onClick, className, title }: {
  label: string; onClick: () => void; className: string; title?: string;
}) {
  return <button type="button" className={className} aria-label={label} title={title} onClick={onClick}>✕</button>;
}
