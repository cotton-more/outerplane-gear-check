import { useMemo } from 'react';
import type { Ctx } from '@/game/context';
import { setOptions } from './lists';
import { useT } from '@/i18n';
import { setTitle } from '@/game/text';
import { tour, tourItem } from '@/tour/anchors';
import { SetIcon } from '@/game/icons/Img';

// Окно выбора сета: плотная сетка, сначала те, что нужны большему числу персонажей (в ростере, если он включён).
export function SetPicker({ ctx, current, onPick }: { ctx: Ctx; current: string | null; onPick: (setId: string) => void }) {
  const t = useT();
  const { live, dead } = useMemo(() => setOptions(ctx), [ctx]);
  return (
    <>
      <div className="sets" {...tour('sets')}>
        {live.map(({ set, n }) => (
          <button key={set.id} type="button" className="set" aria-pressed={current === set.id} title={setTitle(set)} onClick={() => onPick(set.id)} {...tourItem(set.short)}>
            <SetIcon set={set} /><b>{set.short}</b><span>{n}</span>
          </button>
        ))}
      </div>
      <p className="note-line">{t.ui.setDemandNote(ctx.scoped, ctx.idx.D.meta.counts.withBuilds)}</p>
      {dead.length > 0 && (
        <>
          <p className="dead-h">{t.ui.deadSets}</p>
          <div className="dead">
            {dead.map((set) => (
              <button key={set.id} type="button" className="deadchip" aria-pressed={current === set.id} title={setTitle(set)} onClick={() => onPick(set.id)}>
                <SetIcon set={set} />{set.short}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
