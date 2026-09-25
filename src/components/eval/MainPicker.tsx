import { useMemo } from 'react';
import { SLOT } from '../../data';
import type { GearKind, Item } from '../../data/types';
import { buildsOf, epicMains, gearList, gearRef, legendMains } from '../../logic/builds';
import type { Ctx } from '../../logic/context';
import { mainDemand } from '../../logic/lists';
import { classText } from '../../logic/text';
import { StatIcon } from '../Img';

// Окно выбора main stat.
//   item — у Legendary предмета из списка: «нужен» = что просят билды для этой пассивки; пунктиром — только у фиксированных копий;
//   без item — Epic или «нет в списке»: цифра = скольким персонажам нужен такой main в этом слоте.
export function MainPicker({ ctx, kind, item, epic, current, onPick }: {
  ctx: Ctx; kind: GearKind; item?: Item; epic: boolean; current: string | null; onPick: (main: string) => void;
}) {
  const { idx } = ctx;
  const wanted = useMemo(() => (item ? new Set(buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === item.key))
    .filter((x) => ctx.inScope(x.c)).flatMap((x) => gearRef(x.b, kind, item.key).mains)) : null), [idx, ctx, kind, item]);
  const mains = item ? [...item.mains, ...item.extraMains] : epic ? epicMains(idx, kind) : legendMains(idx, kind);
  return (
    <>
      {item && (
        <div className="picked-item">
          <p className="small muted">{classText(item, idx.D.classes)}{item.src ? ' · ' + item.src : ''}</p>
          {item.passives.map((p, i) => <p key={i} className="passive"><b>{p.name}.</b> {p.desc}</p>)}
          {item.key.includes(':') && <p className="note-line">У классовых версий одно имя — класс видно по суффиксу пассивки: Aggression — Striker, Determination — Defender, Precision — Ranger, Mystery — Mage, Blessing — Healer.</p>}
        </div>
      )}
      <div className="chips">
        {mains.map((m) => {
          const rare = !!item?.extraMains.includes(m);
          const n = wanted ? 0 : mainDemand(ctx, kind, m);
          return (
            <button key={m} type="button" className={`chip${rare ? ' rare-main' : ''}`} aria-pressed={current === m} onClick={() => onPick(m)}
              title={rare ? 'Только у фиксированных копий (ивенты, Dimensional Supply)' : undefined}>
              <StatIcon stat={m} />{m}
              {wanted ? wanted.has(m) && <span className="want">нужен</span> : n > 0 && <span className="want">{n}</span>}
            </button>
          );
        })}
      </div>
      <p className="note-line">
        {wanted
          ? `«нужен» — что просят билды${ctx.scoped ? ' твоих персонажей' : ''} для этой пассивки${item?.extraMains.length ? '; пунктиром — только у фиксированных копий' : ''}.`
          : `Цифра — скольким${ctx.scoped ? ' твоим' : ''} персонажам этот main нужен в слоте ${SLOT[kind].ruGen}.`}
      </p>
    </>
  );
}
