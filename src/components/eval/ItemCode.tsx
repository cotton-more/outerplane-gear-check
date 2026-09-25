// Код предмета для чата гильдии: показать и скопировать свой, открыть чужой.
import { useRef, useState, type FormEvent } from 'react';
import { CODE_PREFIX, decodeItem, encodeItem, type DecodeError } from '../../logic/itemCode';
import type { ItemInput } from '../../logic/verdict';

// строка в вердикте: код текущего предмета и «Скопировать» — вставить в чат игры
export function ShareCode({ item }: { item: ItemInput }) {
  const code = encodeItem(item);
  const el = useRef<HTMLElement>(null);
  const [msg, setMsg] = useState('');
  if (!code) return null;
  const copy = () => {
    const fallback = () => { if (el.current) getSelection()?.selectAllChildren(el.current); setMsg('Выделено — скопируй'); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(`${CODE_PREFIX} ${code}`).then(() => setMsg('Скопировано'), fallback);
    else fallback();
  };
  return (
    <div className="v-share">
      <span className="muted">Код для чата</span>
      <b className="code" ref={el}>{code}</b>
      <span className="muted small" aria-live="polite">{msg}</span>
      <button type="button" className="btn" onClick={copy}>Скопировать</button>
    </div>
  );
}

const ERROR: Record<DecodeError | 'data', string> = {
  empty: 'Введи код из чата.',
  chars: 'В коде только латинские буквы — проверь, нет ли цифр или лишних знаков.',
  check: 'Код не сходится — где-то опечатка. Сверь ещё раз.',
  format: 'Это не код предмета.',
  data: 'Такого предмета нет в твоих данных — обнови приложение (или устарело оно у отправителя).',
};

// окно «Ввести код»: код из чата гильдии → предмет на панели оценки
export function CodeInput({ fits, onLoad }: { fits: (item: ItemInput) => boolean; onLoad: (item: ItemInput) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<keyof typeof ERROR | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const d = decodeItem(text);
    if (!d.ok) setError(d.error);
    else if (!fits(d.item)) setError('data');
    else onLoad(d.item);
  };
  return (
    <form className="codein" onSubmit={submit}>
      <input className="search" autoFocus value={text} placeholder={`${CODE_PREFIX} KXRM TPWA`} aria-label="Код предмета"
        autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        onChange={(e) => { setText(e.target.value); setError(null); }} />
      <button type="submit" className="btn primary">Открыть</button>
      {error && <p className="err" role="alert">{ERROR[error]}</p>}
      <p className="muted small">Код из чата гильдии. Регистр, пробелы и дефисы не важны. Текущий предмет заменится, оценка — по твоему ростеру и настройкам.</p>
    </form>
  );
}
