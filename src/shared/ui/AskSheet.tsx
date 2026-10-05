// Окно-вопрос: заголовок, текст и две кнопки — «Да» (своя подпись) и «Отмена». «Отмена» и закрытие ничего не меняют.
// kind — класс окна (fusion-ask, roster-ask).
import { useT } from '@/i18n';
import { Sheet } from './Sheet';

export function AskSheet({ title, text, yes, kind, onYes, onClose }: {
  title: string; text: string; yes: string; kind: string; onYes: () => void; onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet title={title} onClose={onClose} className="ask">
      <div className={`twin ${kind}`}>
        <p>{text}</p>
        <div className="piece-act twin-act">
          <button type="button" className="btn primary" onClick={onYes}>{yes}</button>
          <button type="button" className="btn" onClick={onClose}>{t.ui.cancel}</button>
        </div>
      </div>
    </Sheet>
  );
}
