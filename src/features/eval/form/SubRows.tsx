import { useEffect, useRef, type Dispatch } from 'react';
import { FLAT, subLabel } from '@/game/data';
import type { Grade } from '@/game/data/types';
import { useT } from '@/i18n';
import { DROP_LEVEL, MAX_SUBS, levelCap, withinCap, type Subs } from '@/game/item/subs';
import type { FormAction } from './formState';
import { tour, tourItem } from '@/tour/anchors';
import { StatIcon } from '@/game/icons/Img';

// уровень — сколько сегментов горит в игре: 1–4 у свежей вещи, 5–6 — только после Reforge (узкие, приглушены)
const ROLLS = [1, 2, 3, 4, 5, 6];

// Строки отмеченных сабстатов в порядке, как на предмете в игре. Сегменты (уровень 1–6) — прямо в строке,
// нажатие на стат — заменить или убрать его (в окне; сегменты при замене остаются). Отдельной кнопки ✕ нет:
// рядом с игрой окно узкое, и место нужнее названию стата; снять стат можно и повторным нажатием в сетке.
// Добавляют сабстаты сеткой над строками: строки растут вниз, и сетка при вводе не сдвигается.
// У Epic-брони с тремя — кнопка 4-го сабстата (бывает от первого Reforge или сразу с дропа): на телефоне сетку к этому
// времени уже сменила карточка.
// Нажатие, с которым сумма уровней ушла бы выше предела грейда (game/item/subs levelCap), не срабатывает — под строками
// строка «больше N не бывает»; уходит со следующей правкой сабстатов (новый объект subs) или сменой грейда. То же —
// у добавления сабстата сеткой и «+ 4-й» (EvalPanel), поэтому «упёрлось» хранит EvalPanel: cap и onCap. Строка
// появилась — прокрутка к ней ровно настолько, чтобы её было видно (на форме — над нижней плашкой, eval.css), без анимации
export type CapAt = { subs: Subs; grade: Grade }; // на чём нажатие упёрлось в предел

export function SubRows({ subs, grade, fourth, cap, onCap, dispatch, onPick, onAddFourth }: {
  subs: Subs; grade: Grade; fourth: boolean; cap: CapAt | null; onCap: (at: CapAt) => void;
  dispatch: Dispatch<FormAction>; onPick: (editing: string) => void; onAddFourth: () => void;
}) {
  const t = useT();
  const keys = Object.keys(subs);
  const capped = cap?.subs === subs && cap.grade === grade;
  const capRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (capped) capRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [capped, cap]);
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
      {capped && <p ref={capRef} className="seg-cap" role="status">{t.ui.segCap(levelCap(grade))}</p>}
    </div>
  );
}
