import { FLAT } from '../../data';
import { useT } from '../../i18n';
import type { Subs } from '../../logic/subs';
import { StatIcon } from '../Img';

// Сетка сабстатов прямо на форме вместо окна выбора: одно нажатие — стат встаёт в следующую строку с 1 жёлтым.
// Раскладка 7×2: %-статы над своими flat-версиями (ATK% над ATK, HP% над HP, DEF% над DEF),
// чтобы «есть ли на предмете %» решалось местом кнопки, а не чтением подписи.
// useful — спрос билдов выбранного сета: ярче — нужен, блёклый — не нужен никому.
const GRID = ['SPD', 'CHC', 'CHD', 'ATK%', 'HP%', 'DEF%', 'DMG UP%', 'EFF', 'RES', 'DMG RED%', 'ATK', 'HP', 'DEF'];
const SHORT: Record<string, string> = { 'DMG UP%': 'DMG↑%', 'DMG RED%': 'DMG↓%' };

export function StatGrid({ subs, main, full, useful, onPick }: {
  subs: Subs; main: string | null; full: boolean; useful: Map<string, number> | null; onPick: (key: string) => void;
}) {
  const t = useT();
  return (
    <div className="statgrid" role="group" aria-label={t.ui.addSub}>
      {GRID.map((k) => {
        const credit = useful ? useful.get(k) ?? 0 : null;
        const tone = credit === null ? '' : credit >= 1 ? 'u1' : credit > 0 ? 'u2' : 'u0';
        const cls = ['sg', FLAT.has(k) && 'flat', tone].filter(Boolean).join(' ');
        return (
          <button key={k} type="button" className={cls} aria-pressed={k in subs} disabled={k in subs || k === main || full}
            title={credit === null ? k : t.ui.usefulTitle(k, credit)} onClick={() => onPick(k)}>
            <StatIcon stat={k} /><span>{SHORT[k] ?? k}</span>
          </button>
        );
      })}
    </div>
  );
}
