import { FLAT } from '../../data';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Окно выбора сабстата: новый (editing = null) или замена уже отмеченного в той же строке — там же «Убрать».
export function SubPicker({ ctx, subs, main, editing, onPick, onRemove }: {
  ctx: Ctx; subs: Subs; main: string | null; editing: string | null; onPick: (key: string) => void; onRemove?: () => void;
}) {
  const { D, SUB, SUB_LIST } = ctx.idx;
  const t = useT();
  const title = (k: string) => (D.statNames[k] || k) + (FLAT.has(k) ? ' (flat)' : '') + (SUB[k] ? t.ui.perSegment(`${SUB[k].step}${SUB[k].pct ? '%' : ''}`) : '');
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
      {editing && onRemove && <button type="button" className="btn subremove" onClick={onRemove}>{t.ui.subRemove(editing)}</button>}
      <p className="note-line">{t.ui.subNote}</p>
    </>
  );
}
