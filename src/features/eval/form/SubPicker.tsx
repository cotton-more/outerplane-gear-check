import { FLAT, subLabel } from '@/game/data';
import { useT } from '@/i18n';
import { tour, tourItem } from '@/tour/anchors';
import type { Ctx } from '@/game/context';
import type { Subs } from '@/game/item/subs';
import { StatIcon } from '@/game/icons/Img';

// Окно выбора сабстата: новый (editing = null) или замена уже отмеченного в той же строке — там же «Убрать».
// При замене можно взять и стат из другой строки: он переедет сюда, а та строка освободится (appState, replaceSub);
// у такого стата — номер строки, где он стоит сейчас.
// blocked — сабстаты, которых на предмете не бывает из-за main (см. game/item/mains).
// Раскладка 4 в ряд парами по параметрам, как в сетке на форме: CHC и CHD, ATK% и ATK, DMG UP% и DMG RED%,
// HP% и HP, DEF% и DEF, EFF% и RES%. null — пустая клетка; сабстат, которого здесь нет, встаёт в конец.
const LAYOUT: (string | null)[] = ['SPD', null, 'CHC', 'CHD', 'ATK%', 'ATK', 'DMG UP%', 'DMG RED%', 'HP%', 'HP', 'DEF%', 'DEF', 'EFF', 'RES'];
// noMove — замена стата на записанной вещи (Transistone): в игре он не даёт стат, который уже есть на вещи, —
// такие статы недоступны, переезда строк нет.
export function SubPicker({ ctx, subs, blocked, editing, noMove, onPick, onRemove }: {
  ctx: Ctx; subs: Subs; blocked: Set<string>; editing: string | null; noMove?: boolean; onPick: (key: string) => void; onRemove?: () => void;
}) {
  const { D, SUB, SUB_LIST } = ctx.idx;
  const t = useT();
  const title = (k: string) => (D.statNames[k] || k) + (FLAT.has(k) ? ' (flat)' : '') + (SUB[k] ? t.ui.perSegment(`${SUB[k].step}${SUB[k].pct ? '%' : ''}`) : '');
  const rows = Object.keys(subs);
  // строка, где стат уже стоит (1…4); 0 — не отмечен или это заменяемый
  const rowOf = (k: string) => (k !== editing ? rows.indexOf(k) + 1 : 0);
  const moves = editing !== null && rows.length > 1 && !noMove;
  return (
    <>
      <div className="subgrid" {...tour('subpick')}>
        {[...LAYOUT.filter((k) => k === null || SUB[k]), ...SUB_LIST.filter((k) => !LAYOUT.includes(k))].map((k, i) => {
          if (k === null) return <span key={`gap${i}`} aria-hidden="true" />;
          const row = rowOf(k);
          const taken = (blocked.has(k) && k !== editing) || (row > 0 && (editing === null || !!noMove));
          const move = row > 0 && editing !== null && !noMove;
          return (
            <button key={k} type="button" className={`subopt${FLAT.has(k) ? ' flat' : ''}`} aria-pressed={k === editing} disabled={taken}
              title={move ? t.ui.subMoveTitle(subLabel(k), row) : title(k)} onClick={() => onPick(k)} {...tourItem(k)}>
              <StatIcon stat={k} /><span>{subLabel(k)}</span>{move && <small className="row-n">{row}</small>}
            </button>
          );
        })}
      </div>
      {editing && onRemove && <button type="button" className="btn subremove" onClick={onRemove}>{t.ui.subRemove(subLabel(editing))}</button>}
      {moves && <p className="note-line" {...tour('submove')}>{t.ui.subMoveNote}</p>}
      <p className="note-line">{t.ui.subNote}</p>
    </>
  );
}
