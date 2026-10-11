// The sheet «Крит для X» (MODEL.md §12 items 1 and 3, decisions 5, 6 and 10): N — how much crit the hero needs, an integer
// 0…100 (100 by default). No visible title (owner; the title is for screen readers only). On top — the bar (CritBar): the
// zone where crit counts in full (up to N − 15), the soft zone (N − 15 … N), extra crit (above N); the hero's face stands on
// the bar at their crit with the number under it, N with its flag above the bar. The bar follows the number at once while
// it changes. Then «Герой · вещи», the number row (before the text, so it stays above «Готово» in short windows), the text.
// «−» / «+» by one, the number can be typed; «Сбросить» — 100. Applied on «Готово», not at once. The parent stores it
// (CharDetail, setCrit). No new words: only approved texts and numbers.
import { useState, type CSSProperties } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { CRIT_NEED } from '@/features/gear/model/gear';
import { CRIT_KNEE } from '@/game/stat/curve';
import { HeroFace } from '@/game/hero/HeroFace';
import { Sheet } from '@/shared/ui/Sheet';

const clamp = (n: number) => Math.max(0, Math.min(CRIT_NEED, Math.round(n)));
// the shown crit: floored, so it never shows more than the app counts
export const shownCrit = (total: number) => Math.floor(total + 1e-9);

// the zone of the crit against N: '' — counts in full, ' near' — from N − 15 (counts less), ' over' — from N (nothing)
export const critZone = (total: number, need: number): string =>
  (total >= need ? ' over' : total >= need - CRIT_KNEE ? ' near' : '');

// «Крит: 98%» with the number in bold — the approved line, split around its number
export function CritText({ total }: { total: number }) {
  const t = useT();
  const v = shownCrit(total), text = t.card.critLine(v), num = `${v}%`, at = text.lastIndexOf(num);
  if (at < 0) return <span>{text}</span>;
  return <span className="crit-t">{text.slice(0, at)}<b>{num}</b>{text.slice(at + num.length)}</span>;
}

// The bar: the zones on 0 … a round number past both the crit and 100, lit up to the hero's crit. mini — the card's line
// (no face, no flag); otherwise the sheet's: the hero's face at their crit with the number under it, the flag at N
export function CritBar({ c, total, need, mini = false }: { c: Char; total: number; need: number; mini?: boolean }) {
  const top = Math.max(CRIT_NEED + 20, Math.ceil((total + 10) / 10) * 10);
  const at = (x: number) => `${(Math.max(0, Math.min(top, x)) / top) * 100}%`;
  const vars = { '--knee': at(Math.max(0, need - CRIT_KNEE)), '--need': at(need), '--me': at(total), '--el': `var(--el-${c.element})` } as CSSProperties;
  return (
    <span className={`crit-bar${mini ? ' mini' : ''}${critZone(total, need)}`} style={vars} aria-hidden="true">
      <span className="cb-track"><span className="cb-zones" /><span className="cb-zones cb-lit" /></span>
      {!mini && <span className="cb-need"><span>{need}%</span></span>}
      {!mini && <span className="cb-me"><HeroFace c={c} round /><b>{shownCrit(total)}%</b></span>}
    </span>
  );
}

// own — the hero's part of the crit (base, class, quirks): «Герой 20% · вещи 25%» under the bar, adding up to the shown crit
export function CritSheet({ c, now, total, own, onClose, onSave }: {
  c: Char; now: number; total: number; own: number; onClose: () => void; onSave: (n: number) => void;
}) {
  const t = useT();
  const [text, setText] = useState(String(now));
  const n = /^\d{1,3}$/.test(text) ? clamp(Number(text)) : null;
  const need = n ?? now;
  const step = (d: number) => setText(String(clamp(need + d)));
  return (
    <Sheet title={t.card.critTitle(c.name)} onClose={onClose} className="critsheet" bare>
      <div className="vsheet">
        <CritBar c={c} total={total} need={need} />
        <p className="crit-split">{t.card.critSplit(Math.floor(own + 1e-9), shownCrit(total) - Math.floor(own + 1e-9))}</p>
        <div className="crit-n">
          <button type="button" className="btn crit-step" aria-label={t.card.critLess} disabled={n === 0} onClick={() => step(-1)}>−</button>
          <label className="crit-in">
            <input inputMode="numeric" pattern="[0-9]*" maxLength={3} aria-label={t.card.critN} value={text}
              onChange={(e) => setText(e.target.value.replace(/\D/g, ''))} onBlur={() => setText(String(need))} />
            <span aria-hidden="true">%</span>
          </label>
          <button type="button" className="btn crit-step" aria-label={t.card.critMore} disabled={n === CRIT_NEED} onClick={() => step(1)}>+</button>
          <button type="button" className="linkbtn crit-reset" disabled={n === CRIT_NEED} onClick={() => setText(String(CRIT_NEED))}>{t.card.critReset}</button>
        </div>
        <p className="crit-about">{t.card.critAbout}</p>
        <button type="button" className="btn primary aim-go" onClick={() => onSave(need)}>{t.card.critGo}</button>
      </div>
    </Sheet>
  );
}
