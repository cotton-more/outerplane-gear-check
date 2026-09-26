import { useMemo } from 'react';
import type { GearKind, Item } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { mainOptions } from '../../logic/lists';
import { classText } from '../../logic/text';
import { StatIcon } from '../Img';

// Окно выбора main stat (у аксессуара — по нажатию на поле main; быстрый путь — первое нажатие в сетке).
//   «нужен» — что просят билды для пассивки предмета из списка; пунктиром — только у фиксированных копий;
//   цифра — скольким персонажам нужен такой main в этом слоте (Epic, «нет в списке» или пассивку не берут).
export function MainPicker({ ctx, kind, item, epic, current, onPick }: {
  ctx: Ctx; kind: GearKind; item?: Item; epic: boolean; current: string | null; onPick: (main: string) => void;
}) {
  const t = useT();
  const opts = useMemo(() => mainOptions(ctx, kind, item, epic), [ctx, kind, item, epic]);
  const forPassive = opts.some((o) => o.n === null);
  return (
    <>
      {item && (
        <div className="picked-item">
          <p className="small muted">{classText(item, ctx.idx.D.classes, t.anyClass)}{item.src ? ' · ' + item.src : ''}</p>
          {item.passives.map((p, i) => <p key={i} className="passive"><b>{p.name}.</b> {p.desc}</p>)}
          {item.key.includes(':') && <p className="note-line">{t.ui.classVersions}</p>}
        </div>
      )}
      <div className="chips">
        {opts.map((o) => (
          <button key={o.key} type="button" className={`chip${o.rare ? ' rare-main' : ''}`} aria-pressed={current === o.key} onClick={() => onPick(o.key)}
            title={o.rare ? t.ui.fixedOnly : undefined}>
            <StatIcon stat={o.key} />{o.key}
            {o.n === null ? o.want && <span className="want">{t.ui.wanted}</span> : o.n > 0 && <span className="want">{o.n}</span>}
          </button>
        ))}
      </div>
      <p className="note-line">
        {forPassive ? t.ui.wantedNote(ctx.scoped, !!item?.extraMains.length) : t.ui.demandNote(ctx.scoped, kind)}
      </p>
    </>
  );
}
