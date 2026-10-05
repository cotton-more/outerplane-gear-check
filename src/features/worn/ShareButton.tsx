// «Поделиться» во вкладке «Надето» (.x/0060-share-code SPEC 3.1): ссылка показа героя — адрес сайта и код героя после «#».
// Есть системное «Поделиться» (Android) — оно; отмена ничего не делает. Нет — ссылка в буфер и «Ссылка скопирована»;
// нет и буфера — ссылка строкой, выделенная, чтобы скопировать вручную.
import { useRef, useState } from 'react';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import { copyText } from '@/shared/copyText';

export const shareLink = (code: string): string => `${location.origin}${location.pathname}#${code}`;

export function ShareButton({ code }: { code: string }) {
  const t = useT();
  const [msg, setMsg] = useState('');
  const [manual, setManual] = useState<string | null>(null);
  const el = useRef<HTMLElement>(null);
  const share = () => {
    const url = shareLink(code);
    if (typeof navigator.share === 'function') {
      navigator.share({ url }).catch(() => {});
      return;
    }
    copyText(url, () => { setManual(null); setMsg(t.ui.linkCopied); }, () => {
      setMsg('');
      setManual(url);
      requestAnimationFrame(() => { if (el.current) getSelection()?.selectAllChildren(el.current); });
    });
  };
  return (
    <span className="worn-share">
      <button type="button" className="btn small" onClick={share} {...tour('share')}>{t.ui.share}</button>
      {msg && <span className="muted small" role="status">{msg}</span>}
      {manual && <b className="code share-link" ref={el}>{manual}</b>}
    </span>
  );
}
