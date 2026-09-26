import type { Dispatch } from 'react';
import { FLAT } from '../../data';
import { useT } from '../../i18n';
import type { Subs } from '../../logic/subs';
import type { Action } from '../../state/appState';
import { StatIcon } from '../Img';

const ROLLS = [1, 2, 3, 4];

// Строки отмеченных сабстатов в порядке, как на предмете в игре. Жёлтые сегменты — прямо в строке,
// нажатие на стат — заменить его (сегменты остаются). Добавляют сабстаты сеткой над строками:
// строки растут вниз, и сетка при вводе не сдвигается.
export function SubRows({ subs, dispatch, onPick }: {
  subs: Subs; dispatch: Dispatch<Action>; onPick: (editing: string) => void;
}) {
  const t = useT();
  const keys = Object.keys(subs);
  return (
    <div className="subrows">
      {keys.map((k) => {
        const r = subs[k] || 1;
        return (
          <div key={k} className="subrow">
            <button type="button" className={`pick subkey${FLAT.has(k) ? ' flat' : ''}`} onClick={() => onPick(k)} aria-label={t.ui.subReplace(k)}>
              <StatIcon stat={k} /><span className="lab">{k}</span>
            </button>
            <span className="roll-b" role="group" aria-label={t.ui.subYellow(k)}>
              {ROLLS.map((n) => (
                <button key={n} type="button" aria-pressed={r === n} className={[n < r && 'lit', n === 4 && 'r4'].filter(Boolean).join(' ') || undefined}
                  title={n === 4 ? t.ui.yellow4 : undefined}
                  onClick={() => dispatch({ type: 'roll', key: k, n })}>{n}</button>
              ))}
            </span>
            <button type="button" className="subdel" aria-label={t.ui.subRemove(k)} onClick={() => dispatch({ type: 'sub', key: k })}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
