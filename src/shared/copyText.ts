// Скопировать текст в буфер обмена: вышло — ok; буфера нет или он запрещён — fallback (выделить, чтобы скопировали сами).
export function copyText(text: string, ok: () => void, fallback: () => void): void {
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
  else fallback();
}
