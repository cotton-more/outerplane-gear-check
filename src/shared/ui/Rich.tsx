import { Fragment } from 'react';

// Строка вердикта: логика отдаёт обычный текст, а **так** — жирным.
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}</>;
}
