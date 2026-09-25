import { SLOT } from '../../data';
import type { GearKind } from '../../data/types';
import { epicMains, legendMains } from '../../logic/builds';
import { mainDemand } from '../../logic/lists';
import { StatIcon } from '../Img';
import type { StepProps } from './EvalPanel';

// Оружие/аксессуар без известной пассивки — решают main stat и ролл:
//   epic     — у Epic пассивки нет (Steel Sword / Steel Necklace);
//   unlisted — Legendary, которого нет в списке (в данных outerpedia), пассивку не оценить.
// Цифра на кнопке — скольким персонажам нужен такой main в этом слоте.
export function MainStatStep({ s, dispatch, ctx, kind, mode }: StepProps & { kind: GearKind; mode: 'epic' | 'unlisted' }) {
  const epic = mode === 'epic';
  const mains = epic ? epicMains(ctx.idx, kind) : legendMains(ctx.idx, kind);
  return (
    <div className="step">
      <div className="step-h">
        <h2>{epic ? 'Main stat' : kind === 'weapon' ? 'Оружие' : 'Аксессуар'}</h2>
        <span className="hint">{epic ? `Epic: Steel ${kind === 'weapon' ? 'Sword' : 'Necklace'}, без пассивки` : 'нет в списке — оценка по main stat'}</span>
        {!epic && <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'item', itemKey: null })}>к списку</button>}
      </div>
      {!epic && <p className="passive">Пассивку оценить нельзя — считаю как временную замену: решают main stat и ролл сабстатов. Выбери main stat:</p>}
      <div className="chips" style={epic ? undefined : { marginTop: 8 }}>
        {mains.map((m) => {
          const n = mainDemand(ctx, kind, m);
          return (
            <button key={m} type="button" className="chip" aria-pressed={s.main === m} onClick={() => dispatch({ type: 'main', main: m })}>
              <StatIcon stat={m} />{m}{n ? <span className="want">{n}</span> : null}
            </button>
          );
        })}
      </div>
      <p className="note-line">Цифра — скольким{ctx.scoped ? ' твоим' : ''} персонажам этот main нужен в слоте {SLOT[kind].ruGen}.</p>
    </div>
  );
}
