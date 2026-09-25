import { useMemo } from 'react';
import { setOptions, setUsersInScope } from '../../logic/lists';
import { persons, setTitle } from '../../logic/text';
import { Img } from '../Img';
import type { StepProps } from './EvalPanel';

// Броня: сет виден в названии после «of» (Etheric Gloves of Speed → Speed Set).
export function SetStep({ s, dispatch, ctx }: StepProps) {
  const sel = s.setId ? ctx.idx.SET[s.setId] : undefined;
  const options = useMemo(() => (sel ? null : setOptions(ctx)), [sel, ctx]);
  return (
    <div className="step">
      <div className="step-h">
        <h2>Сет</h2><span className="hint">в названии после «of»</span>
        {sel && <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'set', setId: null })}>сменить</button>}
      </div>
      {sel ? (
        <>
          <div className="picked">
            <Img k={'eq:' + sel.icon} className="pi" />
            <div>
              <b>{sel.name}</b>
              <span>{sel.users ? (ctx.scoped ? `${setUsersInScope(ctx, sel.id)} из ростера · ${sel.users} всего` : `в билдах у ${sel.users}`) : 'нет в билдах outerpedia'}</span>
            </div>
          </div>
          <p className="note-line">{setTitle(sel).replace('\n', ' · ')}</p>
        </>
      ) : options && (
        <>
          <div className="sets">
            {options.live.map(({ set, n }) => (
              <button key={set.id} type="button" className="set" aria-pressed="false" title={setTitle(set)} onClick={() => dispatch({ type: 'set', setId: set.id })}>
                <Img k={'eq:' + set.icon} /><b>{set.short}</b><span>{ctx.scoped ? `${n} из ростера` : persons(n)}</span>
              </button>
            ))}
          </div>
          {options.dead.length > 0 && (
            <>
              <p className="dead-h">Нет ни в одном билде outerpedia — обычно в разбор (нажми, чтобы узнать почему):</p>
              <div className="dead">
                {options.dead.map((set) => (
                  <button key={set.id} type="button" className="deadchip" title={setTitle(set)} onClick={() => dispatch({ type: 'set', setId: set.id })}>
                    <Img k={'eq:' + set.icon} />{set.short}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
