import type { Dispatch } from 'react';
import { FLAT, subLabel } from '@/game/data';
import type { Grade } from '@/game/data/types';
import { useT } from '@/i18n';
import { MAX_SUBS, withinCap, type Subs } from '@/game/item/subs';
import { CapNote, LevelButtons } from '@/game/item/SubLevels';
import type { FormAction } from './formState';
import { tour, tourItem } from '@/tour/anchors';
import { StatIcon } from '@/game/icons/Img';

// Строки отмеченных сабстатов в порядке, как на предмете в игре. Сегменты (уровень 1–6) — прямо в строке,
// нажатие на стат — заменить или убрать его (в окне; сегменты при замене остаются). Отдельной кнопки ✕ нет:
// рядом с игрой окно узкое, и место нужнее названию стата; снять стат можно и повторным нажатием в сетке.
// Добавляют сабстаты сеткой над строками: строки растут вниз, и сетка при вводе не сдвигается.
// У Epic-брони с тремя — кнопка 4-го сабстата (бывает от первого Reforge или сразу с дропа): на телефоне сетку к этому
// времени уже сменила карточка.
// Нажатие, с которым сумма уровней ушла бы выше предела грейда (game/item/subs levelCap), не срабатывает — под строками
// строка «больше N не бывает»; уходит со следующей правкой сабстатов (новый объект subs) или сменой грейда. То же —
// у добавления сабстата сеткой и «+ 4-й» (EvalPanel), поэтому «упёрлось» хранит EvalPanel: cap и onCap (game/item/SubLevels
// CapNote; на форме строка — над нижней плашкой, eval.css)
export type CapAt = { subs: Subs; grade: Grade }; // на чём нажатие упёрлось в предел

export function SubRows({ subs, grade, fourth, cap, onCap, dispatch, onPick, onAddFourth }: {
  subs: Subs; grade: Grade; fourth: boolean; cap: CapAt | null; onCap: (at: CapAt) => void;
  dispatch: Dispatch<FormAction>; onPick: (editing: string) => void; onAddFourth: () => void;
}) {
  const t = useT();
  const keys = Object.keys(subs);
  const capped = cap?.subs === subs && cap.grade === grade;
  const roll = (key: string, n: number) => {
    if (!withinCap(grade, subs, { ...subs, [key]: n })) { onCap({ subs, grade }); return; }
    dispatch({ type: 'roll', key, n });
  };
  return (
    <div className="subrows" {...tour('rows')}>
      {keys.map((k) => {
        const r = subs[k] || 1;
        return (
          <div key={k} className="subrow">
            <button type="button" className={`pick subkey${FLAT.has(k) ? ' flat' : ''}`} onClick={() => onPick(k)} aria-label={t.ui.subReplace(subLabel(k))} {...tourItem(k)}>
              <StatIcon stat={k} /><span className="lab">{subLabel(k)}</span>
            </button>
            <LevelButtons level={r} label={t.ui.subYellow(subLabel(k))} onTap={(n) => roll(k, n)} />
          </div>
        );
      })}
      {fourth && keys.length === MAX_SUBS - 1 && (
        <button type="button" className="subadd" onClick={onAddFourth} {...tour('fourth')}>+ {t.ui.addFourth}</button>
      )}
      <CapNote shown={capped} grade={grade} at={cap} />
    </div>
  );
}
