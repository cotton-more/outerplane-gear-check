import type { Dispatch } from 'react';
import { FLAT } from '../../data';
import { useT } from '../../i18n';
import { MAX_SUBS, type Subs } from '../../logic/subs';
import type { Action } from '../../state/appState';
import { StatIcon } from '../Img';

const ROLLS = [1, 2, 3, 4];

// Строки отмеченных сабстатов в порядке, как на предмете в игре. Жёлтые сегменты — прямо в строке,
// нажатие на стат — заменить или убрать его (в окне; сегменты при замене остаются). Отдельной кнопки ✕ нет:
// рядом с игрой окно узкое, и место нужнее названию стата; снять стат можно и повторным нажатием в сетке.
// Добавляют сабстаты сеткой над строками: строки растут вниз, и сетка при вводе не сдвигается.
// У Epic-брони с тремя — кнопка 4-го сабстата от Reforge: на телефоне сетку к этому времени уже сменила карточка.
export function SubRows({ subs, epic, fourth, dispatch, onPick, onAddFourth }: {
  subs: Subs; epic: boolean; fourth: boolean; dispatch: Dispatch<Action>; onPick: (editing: string) => void; onAddFourth: () => void;
}) {
  const t = useT();
  const keys = Object.keys(subs);
  return (
    <div className="subrows">
      {keys.map((k, i) => {
        const r = subs[k] || 1;
        return (
          <div key={k} className="subrow">
            <button type="button" className={`pick subkey${FLAT.has(k) ? ' flat' : ''}`} onClick={() => onPick(k)} aria-label={t.ui.subReplace(k)}>
              <StatIcon stat={k} /><span className="lab">{k}</span>
              {epic && i === MAX_SUBS - 1 && <span className="subtag">Reforge</span>}
            </button>
            <span className="roll-b" role="group" aria-label={t.ui.subYellow(k)}>
              {ROLLS.map((n) => (
                <button key={n} type="button" aria-pressed={r === n} className={[n < r && 'lit', n === 4 && 'r4'].filter(Boolean).join(' ') || undefined}
                  title={n === 4 ? t.ui.yellow4 : undefined}
                  onClick={() => dispatch({ type: 'roll', key: k, n })}>{n}</button>
              ))}
            </span>
          </div>
        );
      })}
      {fourth && keys.length === MAX_SUBS - 1 && (
        <button type="button" className="subadd" onClick={onAddFourth}>+ {t.ui.addFourth}</button>
      )}
    </div>
  );
}
