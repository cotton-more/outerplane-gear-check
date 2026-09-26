import { FLAT } from '../../data';
import { useT } from '../../i18n';
import type { MainOption } from '../../logic/lists';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Сетка сабстатов прямо на форме вместо окна выбора: одно нажатие — стат встаёт в следующую строку с 1 жёлтым,
// повторное — снимает его.
// Раскладка 7×2: %-статы над своими flat-версиями (ATK% над ATK, HP% над HP, DEF% над DEF),
// чтобы «есть ли на предмете %» решалось местом кнопки, а не чтением подписи.
// useful — спрос билдов выбранного сета: ярче — нужен, блёклый — не нужен никому.
// mains — у аксессуара без main: сетка сначала выбирает main (он в игре сверху предмета), потом сабстаты.
// Flat-статы main не бывают — на их местах PEN% и CDMG RED%, которые бывают только main; остальные на своих местах.
// Выбранный main отмечен в сетке «main»; нажатие снимает его, и сетка снова выбирает main.
const GRID = ['SPD', 'CHC', 'CHD', 'ATK%', 'HP%', 'DEF%', 'DMG UP%', 'EFF', 'RES', 'DMG RED%', 'ATK', 'HP', 'DEF'];
const MAIN_GRID = ['SPD', 'CHC', 'CHD', 'ATK%', 'HP%', 'DEF%', 'DMG UP%', 'EFF', 'RES', 'DMG RED%', 'PEN%', 'CDMG RED%'];
// подписи — не длиннее пяти знаков: в разделённом экране клетка ~24 px. CDMG RED% — «CD↓%»: «CDMG↓» обрезалось бы в «DMG↓»
const SHORT: Record<string, string> = { 'DMG UP%': 'DMG↑%', 'DMG RED%': 'DMG↓%', 'CDMG RED%': 'CD↓%' };

export function StatGrid({ subs, main, full, useful, mains, onPick, onMain }: {
  subs: Subs; main: string | null; full: boolean; useful: Map<string, number> | null;
  mains: MainOption[] | null; onPick: (key: string) => void; onMain: (key: string) => void;
}) {
  const t = useT();
  if (mains) {
    return (
      <div className="statgrid main-mode" role="group" aria-label={t.ui.mainGroup}>
        {MAIN_GRID.map((k) => {
          const o = mains.find((x) => x.key === k);
          const cls = ['sg', o && (o.want ? 'u1' : 'u0'), o?.rare && 'rare'].filter(Boolean).join(' ');
          return (
            <button key={k} type="button" className={cls} disabled={!o} title={o?.rare ? `${k} — ${t.ui.fixedOnly}` : k} aria-label={k} onClick={() => onMain(k)}>
              <StatIcon stat={k} /><span>{SHORT[k] ?? k}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="statgrid" role="group" aria-label={t.ui.addSub}>
      {GRID.map((k) => {
        if (k === main) {
          return (
            <button key={k} type="button" className="sg is-main" title={t.ui.mainCell(k)} onClick={() => onMain(k)}>
              <small>main</small><span>{SHORT[k] ?? k}</span>
            </button>
          );
        }
        const credit = useful ? useful.get(k) ?? 0 : null;
        const tone = credit === null ? '' : credit >= 1 ? 'u1' : credit > 0 ? 'u2' : 'u0';
        const cls = ['sg', FLAT.has(k) && 'flat', tone].filter(Boolean).join(' ');
        const on = k in subs;
        return (
          <button key={k} type="button" className={cls} aria-pressed={on} disabled={full && !on}
            title={on ? t.ui.subRemove(k) : credit === null ? k : t.ui.usefulTitle(k, credit)} onClick={() => onPick(k)}>
            <StatIcon stat={k} /><span>{SHORT[k] ?? k}</span>
          </button>
        );
      })}
    </div>
  );
}
