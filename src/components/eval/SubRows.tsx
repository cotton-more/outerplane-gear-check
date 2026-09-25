import type { Dispatch } from 'react';
import { FLAT } from '../../data';
import type { Grade } from '../../data/types';
import { maxSubs, type Subs } from '../../logic/subs';
import type { Action } from '../../state/appState';
import { StatIcon } from '../Img';

const ROLLS = [1, 2, 3, 4];
const ROWS = maxSubs('unique');

// Строки сабстатов: всегда четыре, как у Legendary, чтобы форма не прыгала при смене грейда.
// У Epic сабстатов три — лишняя строка неактивна. Пустая строка открывает окно выбора;
// у заполненной жёлтые сегменты отмечаются прямо в строке.
export function SubRows({ subs, grade, dispatch, onPick }: {
  subs: Subs; grade: Grade; dispatch: Dispatch<Action>; onPick: (editing: string | null) => void;
}) {
  const keys = Object.keys(subs);
  const empty = Math.max(0, maxSubs(grade) - keys.length);
  const off = ROWS - Math.max(maxSubs(grade), keys.length);
  return (
    <div className="subrows">
      {keys.map((k) => {
        const r = subs[k] || 1;
        return (
          <div key={k} className="subrow">
            <button type="button" className={`pick subkey${FLAT.has(k) ? ' flat' : ''}`} onClick={() => onPick(k)} aria-label={`${k} — заменить`}>
              <StatIcon stat={k} /><span className="lab">{k}</span>
            </button>
            <span className="roll-b" role="group" aria-label={`Жёлтые сегменты ${k}`}>
              {ROLLS.map((n) => (
                <button key={n} type="button" aria-pressed={r === n} className={[n < r && 'lit', n === 4 && 'r4'].filter(Boolean).join(' ') || undefined}
                  title={n === 4 ? '4 жёлтых — только из спецмагазинов и Dimensional Supply' : undefined}
                  onClick={() => dispatch({ type: 'roll', key: k, n })}>{n}</button>
              ))}
            </span>
            <button type="button" className="subdel" aria-label={`Убрать ${k}`} onClick={() => dispatch({ type: 'sub', key: k })}>✕</button>
          </div>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <button key={'e' + i} type="button" className="pick empty subadd" onClick={() => onPick(null)}>
          <span className="pick-v">+ сабстат</span>
        </button>
      ))}
      {Array.from({ length: off }, (_, i) => (
        <button key={'x' + i} type="button" className="pick empty suboff" disabled aria-label="У Epic три сабстата" title="У Epic три сабстата" />
      ))}
    </div>
  );
}
