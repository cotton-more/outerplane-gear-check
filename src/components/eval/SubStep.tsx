import { FLAT } from '../../data';
import { maxSubs } from '../../logic/subs';
import { StatIcon } from '../Img';
import type { StepProps } from './EvalPanel';

const SEGMENTS = [1, 2, 3, 4, 5, 6];
const ROLLS = [1, 2, 3, 4];

// Сабстаты: у Legendary до 4, у Epic 3. Отмеченный стат сразу получает 1 жёлтый сегмент.
export function SubStep({ s, dispatch, ctx }: StepProps) {
  const { D, SUB, SUB_LIST } = ctx.idx;
  const keys = Object.keys(s.subs);
  const n = keys.length;
  const full = n >= maxSubs(s.grade);
  const title = (k: string) => (D.statNames[k] || k) + (FLAT.has(k) ? ' (flat)' : '') + (SUB[k] ? ` · +${SUB[k].step}${SUB[k].pct ? '%' : ''} за сегмент` : '');
  return (
    <div className="step">
      <div className="step-h">
        <h2>Сабстаты</h2><span className="hint">{s.grade === 'rare' ? 'у Epic 3' : 'до 4'}</span>
        <button type="button" className={`linkbtn${n ? '' : ' ghost'}`} onClick={() => dispatch({ type: 'clearSubs' })}
          tabIndex={n ? undefined : -1} aria-hidden={n ? undefined : true}>очистить</button>
      </div>
      <div className="subs">
        {SUB_LIST.map((k) => {
          const on = k in s.subs;
          const r = s.subs[k] || 0;
          return (
            <button key={k} type="button" className={`sub${FLAT.has(k) ? ' flat' : ''}`} aria-pressed={on} disabled={k === s.main || (!on && full)}
              title={title(k)} onClick={() => dispatch({ type: 'sub', key: k })}>
              <StatIcon stat={k} /><span className="lab">{k}</span>
              <span className="segs" aria-hidden="true">{SEGMENTS.map((i) => <i key={i} className={on && i <= r ? 'on' : undefined} />)}</span>
            </button>
          );
        })}
      </div>
      {n ? (
        <div className="rolls">
          <p className="rolls-h">Жёлтых сегментов <span className="muted">— 1 по умолчанию; снять стат — нажать на него ещё раз</span></p>
          {keys.map((k) => {
            const r = s.subs[k] || 1;
            return (
              <div key={k} className="roll">
                <span className="roll-k"><StatIcon stat={k} /><span className="lab">{k}</span></span>
                <span className="roll-b" role="group" aria-label={`Жёлтые сегменты ${k}`}>
                  {ROLLS.map((i) => (
                    <button key={i} type="button" aria-pressed={r === i} className={[i < r && 'lit', i === 4 && 'r4'].filter(Boolean).join(' ') || undefined}
                      title={i === 4 ? '4 жёлтых — только из спец. магазинов и Dimensional Supply' : undefined}
                      onClick={() => dispatch({ type: 'roll', key: k, n: i })}>{i}</button>
                  ))}
                </span>
              </div>
            );
          })}
          <p className="note-line">Жёлтые — стартовый ролл: обычно 1–3, 4 — редкость из спец. магазинов и Dimensional Supply. Оранжевые (от Reforge) не считай — это вложения, а не качество дропа.</p>
        </div>
      ) : (
        <p className="note-line">Отметь статы, которые видишь на предмете. Flat ATK/DEF/HP подписаны тоньше: их ценность зависит от базы персонажа.</p>
      )}
    </div>
  );
}
