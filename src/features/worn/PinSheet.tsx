// Шторка «Набор для X» (.x/0085 FORMULA §6, макет 6.0 решение 7): «По статам — не закреплять» и наборы из билдов героя —
// у каждого сколько его вещей в лучшей раскладке под набор («3 из 4») и билд outerpedia. Предупреждение о чужих сетах и
// «Закрепить»: выбор применяется по кнопке, не сразу. Запись и «Вернуть» — у родителя (CharDetail).
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { comboText } from '@/game/build/builds';
import type { Fill } from './wearing';
import { Sheet } from '@/shared/ui/Sheet';

export function PinSheet({ c, ctx, choices, now, onClose, onPin }: {
  c: Char; ctx: Ctx; choices: Fill[]; now: string | null; onClose: () => void; onPin: (key: string | null) => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<string | null>(now);
  const opt = (key: string | null, name: string, k?: string, sub?: string) => (
    <li key={key ?? ''}>
      <button type="button" role="radio" aria-checked={sel === key} className="arow" onClick={() => setSel(key)}>
        <span className="arow-h"><b>{name}</b>{k && <span className="pin-k">{k}</span>}</span>
        {sub && <span className="arow-l">{sub}</span>}
      </button>
    </li>
  );
  return (
    <Sheet title={t.card.pinTitle(c.name)} onClose={onClose} className="aimsheet">
      <div className="vsheet">
        <ul className="alist" role="radiogroup" aria-label={t.card.pinTitle(c.name)}>
          {opt(null, t.card.pinNone)}
          {choices.map((f) => opt(f.pin.key, comboText(ctx.idx, f.pin.combo), t.card.pinFill(f.k, f.n), f.pin.build.name))}
        </ul>
        {sel !== null && <p className="pin-warn">{t.card.pinWarn(c.name)}</p>}
        <button type="button" className="btn primary aim-go" onClick={() => onPin(sel)}>{t.card.pinGo}</button>
      </div>
    </Sheet>
  );
}
