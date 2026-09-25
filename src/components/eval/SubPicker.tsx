import { FLAT } from '../../data';
import type { Ctx } from '../../logic/context';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Окно выбора сабстата: новый (editing = null) или замена уже отмеченного в той же строке.
export function SubPicker({ ctx, subs, main, editing, onPick }: {
  ctx: Ctx; subs: Subs; main: string | null; editing: string | null; onPick: (key: string) => void;
}) {
  const { D, SUB, SUB_LIST } = ctx.idx;
  const title = (k: string) => (D.statNames[k] || k) + (FLAT.has(k) ? ' (flat)' : '') + (SUB[k] ? ` · +${SUB[k].step}${SUB[k].pct ? '%' : ''} за сегмент` : '');
  return (
    <>
      <div className="subgrid">
        {SUB_LIST.map((k) => {
          const taken = (k in subs && k !== editing) || k === main;
          return (
            <button key={k} type="button" className={`subopt${FLAT.has(k) ? ' flat' : ''}`} aria-pressed={k === editing} disabled={taken}
              title={title(k)} onClick={() => onPick(k)}>
              <StatIcon stat={k} /><span>{k}</span>
            </button>
          );
        })}
      </div>
      <p className="note-line">Flat ATK/DEF/HP подписаны тоньше: их ценность зависит от базы персонажа. Жёлтые сегменты отмечаются в строке стата: по умолчанию 1; 4 — только из спецмагазинов и Dimensional Supply. Оранжевые (от Reforge) не считай.</p>
    </>
  );
}
