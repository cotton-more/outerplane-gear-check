import { useMemo } from 'react';
import type { Ctx } from '../../logic/context';
import { setOptions } from '../../logic/lists';
import { persons, setTitle } from '../../logic/text';
import { Img } from '../Img';

// Окно выбора сета: сначала те, что нужны большему числу персонажей (в ростере, если он включён).
export function SetPicker({ ctx, current, onPick }: { ctx: Ctx; current: string | null; onPick: (setId: string) => void }) {
  const { live, dead } = useMemo(() => setOptions(ctx), [ctx]);
  return (
    <>
      <div className="sets">
        {live.map(({ set, n }) => (
          <button key={set.id} type="button" className="set" aria-pressed={current === set.id} title={setTitle(set)} onClick={() => onPick(set.id)}>
            <Img k={'eq:' + set.icon} /><b>{set.short}</b><span>{ctx.scoped ? `${n} из ростера` : persons(n)}</span>
          </button>
        ))}
      </div>
      {dead.length > 0 && (
        <>
          <p className="dead-h">Нет ни в одном билде outerpedia — обычно в разбор:</p>
          <div className="dead">
            {dead.map((set) => (
              <button key={set.id} type="button" className="deadchip" aria-pressed={current === set.id} title={setTitle(set)} onClick={() => onPick(set.id)}>
                <Img k={'eq:' + set.icon} />{set.short}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
