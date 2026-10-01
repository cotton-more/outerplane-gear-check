import { useState, type Dispatch } from 'react';
import { FLAT, subLabel } from '../../data';
import type { Grade } from '../../data/types';
import { useT } from '../../i18n';
import { DROP_LEVEL, MAX_SUBS, levelCap, withinCap, type Subs } from '../../logic/subs';
import type { Action } from '../../state/appState';
import { tour, tourItem } from '../../tour/anchors';
import { StatIcon } from '../Img';

// уровень — сколько сегментов горит в игре: 1–4 у свежей вещи, 5–6 — только после Reforge (узкие, приглушены)
const ROLLS = [1, 2, 3, 4, 5, 6];

// Строки отмеченных сабстатов в порядке, как на предмете в игре. Сегменты (уровень 1–6) — прямо в строке,
// нажатие на стат — заменить или убрать его (в окне; сегменты при замене остаются). Отдельной кнопки ✕ нет:
// рядом с игрой окно узкое, и место нужнее названию стата; снять стат можно и повторным нажатием в сетке.
// Добавляют сабстаты сеткой над строками: строки растут вниз, и сетка при вводе не сдвигается.
// У Epic-брони с тремя — кнопка 4-го сабстата от Reforge: на телефоне сетку к этому времени уже сменила карточка.
// Нажатие, с которым сумма уровней ушла бы выше предела грейда (logic/subs levelCap), не срабатывает — под строками
// строка «больше N не бывает»; уходит со следующей правкой сабстатов (новый объект subs) или сменой грейда
export function SubRows({ subs, grade, epic, fourth, dispatch, onPick, onAddFourth }: {
  subs: Subs; grade: Grade; epic: boolean; fourth: boolean; dispatch: Dispatch<Action>; onPick: (editing: string) => void; onAddFourth: () => void;
}) {
  const t = useT();
  const keys = Object.keys(subs);
  const [capAt, setCapAt] = useState<{ subs: Subs; grade: Grade } | null>(null); // на чём нажатие упёрлось в предел
  const roll = (key: string, n: number) => {
    if (!withinCap(grade, subs, { ...subs, [key]: n })) { setCapAt({ subs, grade }); return; }
    dispatch({ type: 'roll', key, n });
  };
  return (
    <div className="subrows" {...tour('rows')}>
      {keys.map((k, i) => {
        const r = subs[k] || 1;
        return (
          <div key={k} className="subrow">
            <button type="button" className={`pick subkey${FLAT.has(k) ? ' flat' : ''}`} onClick={() => onPick(k)} aria-label={t.ui.subReplace(subLabel(k))} {...tourItem(k)}>
              <StatIcon stat={k} /><span className="lab">{subLabel(k)}</span>
              {epic && i === MAX_SUBS - 1 && <span className="subtag">Reforge</span>}
            </button>
            <span className="roll-b" role="group" aria-label={t.ui.subYellow(subLabel(k))}>
              {ROLLS.map((n) => (
                <button key={n} type="button" aria-pressed={r === n} className={[n < r && 'lit', n > DROP_LEVEL && 'after'].filter(Boolean).join(' ') || undefined}
                  title={n > DROP_LEVEL ? t.ui.segAfter : undefined}
                  onClick={() => roll(k, n)}>{n}</button>
              ))}
            </span>
          </div>
        );
      })}
      {fourth && keys.length === MAX_SUBS - 1 && (
        <button type="button" className="subadd" onClick={onAddFourth} {...tour('fourth')}>+ {t.ui.addFourth}</button>
      )}
      {capAt?.subs === subs && capAt.grade === grade && <p className="seg-cap" role="status">{t.ui.segCap(levelCap(grade))}</p>}
    </div>
  );
}
