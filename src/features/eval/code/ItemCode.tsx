// Код предмета для чата гильдии: показать и скопировать свой, открыть чужой.
import { useRef, useState, type FormEvent } from 'react';
import { useT } from '@/i18n';
import { CODE_PREFIX, decodeItem, encodeItem, type DecodeError } from './codec';
import type { ItemInput } from '@/game/item/item';
import { tour } from '@/tour/anchors';
import { copyText } from '@/shared/copyText';

// строка в вердикте: код текущего предмета и «Скопировать» — вставить в чат игры
export function ShareCode({ item }: { item: ItemInput }) {
  const t = useT();
  const code = encodeItem(item);
  const el = useRef<HTMLElement>(null);
  const [msg, setMsg] = useState('');
  if (!code) return null;
  const copy = () => {
    copyText(`${CODE_PREFIX} ${code}`, () => setMsg(t.ui.copied), () => { if (el.current) getSelection()?.selectAllChildren(el.current); setMsg(t.ui.codeSelected); });
  };
  return (
    <div className="v-share" {...tour('code')}>
      <span className="muted">{t.ui.codeForChat}</span>
      <b className="code" ref={el}>{code}</b>
      <span className="muted small" aria-live="polite">{msg}</span>
      <button type="button" className="btn" onClick={copy}>{t.ui.copy}</button>
    </div>
  );
}

// окно «Ввести код»: код из чата гильдии → предмет на панели оценки. other — сначала другие коды (код героя, резервная
// копия, .x/0060 SPEC 3.3): true — разобрался сам, строка — что сказать, null — это не они, читаем код предмета
export function CodeInput({ fits, onLoad, other }: {
  fits: (item: ItemInput) => boolean; onLoad: (item: ItemInput) => void; other?: (text: string) => true | string | null;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const [error, setError] = useState<DecodeError | 'data' | { text: string } | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const o = other?.(text) ?? null;
    if (o === true) return;
    if (o !== null) { setError({ text: o }); return; }
    const d = decodeItem(text);
    if (!d.ok) setError(d.error);
    else if (!fits(d.item)) setError('data');
    else onLoad(d.item);
  };
  return (
    <form className="codein" onSubmit={submit}>
      <input className="search" autoFocus value={text} placeholder={`${CODE_PREFIX} KXRM TPWA`} aria-label={t.ui.codeSheet}
        autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        onChange={(e) => { setText(e.target.value); setError(null); }} />
      <button type="submit" className="btn primary">{t.ui.codeOpen}</button>
      {error && <p className="err" role="alert">{typeof error === 'string' ? t.ui.codeErrors[error] : error.text}</p>}
      <p className="muted small">{t.ui.codeHint}</p>
    </form>
  );
}
