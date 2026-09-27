import { FLAT, subLabel } from '../../data';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Окно выбора сабстата: новый (editing = null) или замена уже отмеченного в той же строке — там же «Убрать».
// При замене можно взять и стат из другой строки: он переедет сюда, а та строка освободится (appState, replaceSub);
// у такого стата — номер строки, где он стоит сейчас.
// blocked — сабстаты, которых на предмете не бывает из-за main (см. logic/mains).
export function SubPicker({ ctx, subs, blocked, editing, onPick, onRemove }: {
  ctx: Ctx; subs: Subs; blocked: Set<string>; editing: string | null; onPick: (key: string) => void; onRemove?: () => void;
}) {
  const { D, SUB, SUB_LIST } = ctx.idx;
  const t = useT();
  const title = (k: string) => (D.statNames[k] || k) + (FLAT.has(k) ? ' (flat)' : '') + (SUB[k] ? t.ui.perSegment(`${SUB[k].step}${SUB[k].pct ? '%' : ''}`) : '');
  const rows = Object.keys(subs);
  // строка, где стат уже стоит (1…4); 0 — не отмечен или это заменяемый
  const rowOf = (k: string) => (k !== editing ? rows.indexOf(k) + 1 : 0);
  const moves = editing !== null && rows.length > 1;
  return (
    <>
      <div className="subgrid">
        {SUB_LIST.map((k) => {
          const row = rowOf(k);
          const taken = (blocked.has(k) && k !== editing) || (row > 0 && editing === null);
          const move = row > 0 && editing !== null;
          return (
            <button key={k} type="button" className={`subopt${FLAT.has(k) ? ' flat' : ''}`} aria-pressed={k === editing} disabled={taken}
              title={move ? t.ui.subMoveTitle(subLabel(k), row) : title(k)} onClick={() => onPick(k)}>
              <StatIcon stat={k} /><span>{subLabel(k)}</span>{move && <small className="row-n">{row}</small>}
            </button>
          );
        })}
      </div>
      {editing && onRemove && <button type="button" className="btn subremove" onClick={onRemove}>{t.ui.subRemove(subLabel(editing))}</button>}
      {moves && <p className="note-line">{t.ui.subMoveNote}</p>}
      <p className="note-line">{t.ui.subNote}</p>
    </>
  );
}
