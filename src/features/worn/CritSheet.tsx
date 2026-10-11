// Шторка «Крит для X» (crit soft cap, decision 5): N — сколько крита герою нужно от вещей, целое 0…100 (по умолчанию 100).
// «−» / «+» по одному, число можно вписать; «Сбросить» — 100. Применяется по «Готово», не сразу. Запись — у родителя
// (CharDetail, setCrit).
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { CRIT_NEED } from '@/features/gear/model/gear';
import { Sheet } from '@/shared/ui/Sheet';

const clamp = (n: number) => Math.max(0, Math.min(CRIT_NEED, Math.round(n)));

export function CritSheet({ c, now, onClose, onSave }: { c: Char; now: number; onClose: () => void; onSave: (n: number) => void }) {
  const t = useT();
  const [text, setText] = useState(String(now));
  const n = /^\d{1,3}$/.test(text) ? clamp(Number(text)) : null;
  const step = (d: number) => setText(String(clamp((n ?? now) + d)));
  return (
    <Sheet title={t.card.critTitle(c.name)} onClose={onClose} className="critsheet">
      <div className="vsheet">
        <p className="crit-about">{t.card.critAbout}</p>
        <div className="crit-n">
          <button type="button" className="btn" aria-label={t.card.critLess} disabled={n === 0} onClick={() => step(-1)}>−</button>
          <label className="crit-in">
            <input inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label={t.card.critN} value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, ''))} onBlur={() => setText(String(n ?? now))} />
            <span aria-hidden="true">%</span>
          </label>
          <button type="button" className="btn" aria-label={t.card.critMore} disabled={n === CRIT_NEED} onClick={() => step(1)}>+</button>
          <button type="button" className="linkbtn crit-reset" disabled={n === CRIT_NEED} onClick={() => setText(String(CRIT_NEED))}>{t.card.critReset}</button>
        </div>
        <button type="button" className="btn primary aim-go" onClick={() => onSave(n ?? now)}>{t.card.critGo}</button>
      </div>
    </Sheet>
  );
}
