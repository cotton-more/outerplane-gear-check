// Поле с кодом для переноса между браузерами (ростер, экипировка): подпись, сам код, «Скопировать», свои кнопки и строка
// о том, что вышло. Код поменялся (key) — поле показывает свежий. actions получают текст поля и строку для ответа.
import { useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { copyText } from '@/shared/copyText';

export function CodeBox({ id, label, code, msgId, actions }: {
  id: string; label: string; code: string; msgId?: string;
  actions: (io: { value: () => string; say: (msg: string) => void }) => ReactNode;
}) {
  const t = useT();
  const ta = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const copy = () => {
    const el = ta.current;
    if (!el) return;
    copyText(el.value, () => setMsg(t.ui.copied), () => { el.select(); setMsg(t.ui.rosterSelected); });
  };
  return (
    <div className="roster-io">
      <label className="small muted" htmlFor={id}>{label}</label>
      <textarea key={code} id={id} ref={ta} defaultValue={code} />
      <div className="filt">
        <button type="button" className="btn" onClick={copy}>{t.ui.copy}</button>
        {actions({ value: () => ta.current?.value || '', say: setMsg })}
        <span className="small muted" id={msgId} role="status">{msg}</span>
      </div>
    </div>
  );
}
