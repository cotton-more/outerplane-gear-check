import { FLAT, subLabel } from '../../data';
import { useT } from '../../i18n';
import { tour, tourItem } from '../../tour/anchors';
import type { Ctx } from '../../logic/context';
import type { Gamble } from '../../logic/gamble';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Окно выбора сабстата: новый (editing = null) или замена уже отмеченного в той же строке — там же «Убрать».
// При замене можно взять и стат из другой строки: он переедет сюда, а та строка освободится (appState, replaceSub);
// у такого стата — номер строки, где он стоит сейчас.
// blocked — сабстаты, которых на предмете не бывает из-за main (см. logic/mains).
// Раскладка 4 в ряд парами по параметрам, как в сетке на форме: CHC и CHD, ATK% и ATK, DMG UP% и DMG RED%,
// HP% и HP, DEF% и DEF, EFF% и RES%. null — пустая клетка; сабстат, которого здесь нет, встаёт в конец.
const LAYOUT: (string | null)[] = ['SPD', null, 'CHC', 'CHD', 'ATK%', 'ATK', 'DMG UP%', 'DMG RED%', 'HP%', 'HP', 'DEF%', 'DEF', 'EFF', 'RES'];
// lucky — окно 4-го сабстата у Epic: с какими статами вещь вытянет кубик Reforge (logic/gamble), точкой цветом цели.
export function SubPicker({ ctx, subs, blocked, editing, lucky, onPick, onRemove }: {
  ctx: Ctx; subs: Subs; blocked: Set<string>; editing: string | null; lucky?: Gamble | null; onPick: (key: string) => void; onRemove?: () => void;
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
      <div className="subgrid" {...tour('subpick')}>
        {[...LAYOUT.filter((k) => k === null || SUB[k]), ...SUB_LIST.filter((k) => !LAYOUT.includes(k))].map((k, i) => {
          if (k === null) return <span key={`gap${i}`} aria-hidden="true" />;
          const row = rowOf(k);
          const taken = (blocked.has(k) && k !== editing) || (row > 0 && editing === null);
          const move = row > 0 && editing !== null;
          const hit = lucky?.hits.find((h) => h.key === k);
          return (
            <button key={k} type="button" className={`subopt${FLAT.has(k) ? ' flat' : ''}`} aria-pressed={k === editing} disabled={taken}
              title={move ? t.ui.subMoveTitle(subLabel(k), row) : title(k)} onClick={() => onPick(k)} {...tourItem(k)}>
              <StatIcon stat={k} /><span>{subLabel(k)}</span>{move && <small className="row-n">{row}</small>}
              {hit && <><i className={`lucky-dot${hit.v === 'temp' ? ' t' : ''}`} aria-hidden="true" /><span className="sr-only"> {t.ui.fourthLucky(t.ui.verdictLabel[hit.v])}</span></>}
            </button>
          );
        })}
      </div>
      {editing && onRemove && <button type="button" className="btn subremove" onClick={onRemove}>{t.ui.subRemove(subLabel(editing))}</button>}
      {lucky && (['keep', 'temp'] as const).filter((v) => lucky.hits.some((h) => h.v === v)).map((v) => (
        <p key={v} className="note-line"><i className={`lucky-dot${v === 'temp' ? ' t' : ''}`} aria-hidden="true" /> {t.ui.fourthLucky(t.ui.verdictLabel[v])}</p>
      ))}
      {moves && <p className="note-line" {...tour('submove')}>{t.ui.subMoveNote}</p>}
      <p className="note-line">{t.ui.subNote}</p>
    </>
  );
}
