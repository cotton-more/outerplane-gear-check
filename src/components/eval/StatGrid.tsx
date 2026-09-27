import { FLAT, MAIN_LAYOUT, subLabel } from '../../data';
import { useT } from '../../i18n';
import { tourItem } from '../../tour/anchors';
import type { MainOption } from '../../logic/lists';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Сетка сабстатов прямо на форме вместо окна выбора: одно нажатие — стат встаёт в следующую строку с 1 жёлтым,
// повторное — снимает его.
// Раскладка 7×2 по параметрам: пары стоят одна над другой — CHC над CHD, ATK% над ATK, DMG UP% над DMG RED%,
// HP% над HP, DEF% над DEF, EFF% над RES%; слева SPD и атака, справа защита. %-статы над своими flat-версиями,
// чтобы «есть ли на предмете %» решалось местом кнопки, а не чтением подписи. null — пустая клетка.
// useful — спрос билдов выбранного сета: ярче — нужен, блёклый — не нужен никому.
// mains — у аксессуара без main: сетка сначала выбирает main (он в игре сверху предмета), потом сабстаты.
// Flat-статы main не бывают — на их местах PEN% и CDMG RED%, которые бывают только main; остальные на своих местах.
// Выбранный main отмечен в сетке «main»; нажатие снимает его, и сетка снова выбирает main.
// blocked — сабстаты, которых на предмете не бывает из-за main (фиксированного у брони и оружия или выбранного):
// клетка с пометкой «main». Игра сравнивает стат вместе с видом: flat EFF в main не мешает сабстату EFF% —
// у аксессуара с main EFF клетка EFF% остаётся обычной (main тогда виден в поле main над сеткой).
// Сабстаты подписаны, как на вещи в игре (subLabel: EFF%, RES%), main — без %: flat RES ботинок сабстатом не бывает,
// и клетка RES% рядом с ним — другой стат.
const GRID: (string | null)[] = [
  'SPD', 'CHC', 'ATK%', 'DMG UP%', 'HP%', 'DEF%', 'EFF',
  null, 'CHD', 'ATK', 'DMG RED%', 'HP', 'DEF', 'RES',
];
// пятизнаковые подписи (DMG↑%, DMG↓%) в узком разделённом экране не влезают — класс long ужимает шрифт по ширине сетки
const long = (label: string) => (label.length >= 5 ? ' long' : '');
const gap = (i: number) => <span key={`gap${i}`} className="sg-gap" aria-hidden="true" />;
// подписи — не длиннее пяти знаков: в разделённом экране клетка ~24 px. CDMG RED% — «CD↓%»: «CDMG↓» обрезалось бы в «DMG↓»
const SHORT: Record<string, string> = { 'DMG UP%': 'DMG↑%', 'DMG RED%': 'DMG↓%', 'CDMG RED%': 'CD↓%' };

export function StatGrid({ subs, main, blocked, full, useful, mains, onPick, onMain }: {
  subs: Subs; main: string | null; blocked: Set<string>; full: boolean; useful: Map<string, number> | null;
  mains: MainOption[] | null; onPick: (key: string) => void; onMain: (key: string) => void;
}) {
  const t = useT();
  if (mains) {
    return (
      <div className="statgrid main-mode" role="group" aria-label={t.ui.mainGroup}>
        {MAIN_LAYOUT.map((k, i) => {
          if (k === null) return gap(i);
          const o = mains.find((x) => x.key === k);
          const cls = ['sg', o && (o.want ? 'u1' : 'u0'), o?.rare && 'rare'].filter(Boolean).join(' ') + long(SHORT[k] ?? k);
          return (
            <button key={k} type="button" className={cls} disabled={!o} title={o?.rare ? `${k} — ${t.ui.fixedOnly}` : k} aria-label={k} onClick={() => onMain(k)}>
              <StatIcon stat={k} main /><span>{SHORT[k] ?? k}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="statgrid" role="group" aria-label={t.ui.addSub}>
      {GRID.map((k, i) => {
        if (k === null) return gap(i);
        if (blocked.has(k) && !(k in subs)) {
          // выбранный main снимается нажатием; фиксированная строка (HP% шлема, flat ATK оружия) — нет
          const chosen = k === main;
          return (
            <button key={k} type="button" className={`sg is-main${chosen ? '' : ' fixed'}${long(SHORT[k] ?? k)}`} disabled={!chosen}
              title={chosen ? t.ui.mainCell(k) : t.ui.fixedMainCell(k)} onClick={chosen ? () => onMain(k) : undefined}>
              <small>main</small><span>{SHORT[k] ?? k}</span>
            </button>
          );
        }
        const credit = useful ? useful.get(k) ?? 0 : null;
        const tone = credit === null ? '' : credit >= 1 ? 'u1' : credit > 0 ? 'u2' : 'u0';
        const cls = ['sg', FLAT.has(k) && 'flat', tone].filter(Boolean).join(' ') + long(SHORT[k] ?? subLabel(k));
        const on = k in subs;
        const label = subLabel(k);
        return (
          <button key={k} type="button" className={cls} aria-pressed={on} disabled={full && !on} {...tourItem(k)}
            title={on ? t.ui.subRemove(label) : credit === null ? label : t.ui.usefulTitle(label, credit)} onClick={() => onPick(k)}>
            <StatIcon stat={k} /><span>{SHORT[k] ?? label}</span>
          </button>
        );
      })}
    </div>
  );
}
