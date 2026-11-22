import { useT } from '@/i18n';
import { tour, type Anchor } from '@/tour/anchors';
import type { MainOption } from './lists';

// The main stat on the form without a window (owner 2026-11-22, prototype «Main без окошка»).
//
// MainPill — a weapon: its mains are only ATK%, HP% and DEF%, so all of them stand in the gold pill of the star controls
// (.lv-pill / .lv-seg of chars.css) next to the grade, and the grid goes straight to substats. `all` — the slot's mains in
// a fixed order (the pill keeps its width); one the chosen item can't have is disabled, one nobody needs is grey (tappable).
// A tap on the chosen one clears it, as the grid's «main» cell does.
//
// MainChip — an accessory has 4–12 mains: the first tap in the grid picks it (StatGrid main mode), then it sits here as a
// gold chip; a tap puts the grid back to picking the main (`open`), the substats stay. No main yet — a quiet line pointing
// at the grid.
const SHORT: Record<string, string> = { 'DMG UP%': 'DMG↑%', 'DMG RED%': 'DMG↓%', 'CDMG RED%': 'CD↓%' };

export function MainPill({ all, opts, main, need, at, onPick }: {
  all: readonly string[]; opts: MainOption[]; main: string | null; need: boolean; at?: Anchor; onPick: (key: string) => void;
}) {
  const t = useT();
  return (
    <div className={need ? 'lv-pill mainpill need' : 'lv-pill mainpill'} role="group" aria-label={t.ui.mainGroup} {...(at && tour(at))}>
      {all.map((k) => {
        const o = opts.find((x) => x.key === k);
        const on = main === k;
        const cls = ['lv-seg', on && 'on', o && !o.want && !on && 'grey'].filter(Boolean).join(' ');
        return (
          <button key={k} type="button" className={cls} aria-pressed={on} disabled={!o}
            title={o?.rare ? `${k} — ${t.ui.fixedOnly}` : on ? t.ui.mainCell(k) : k} onClick={() => onPick(k)}>{k}</button>
        );
      })}
    </div>
  );
}

export function MainChip({ main, open, need, at, onToggle }: {
  main: string | null; open: boolean; need: boolean; at?: Anchor; onToggle: () => void;
}) {
  const t = useT();
  if (!main) return <span className={need ? 'mainchip-none need' : 'mainchip-none'} {...(at && tour(at))}>{t.ui.mainInGrid}</span>;
  return (
    <button type="button" className={open ? 'mainchip open' : 'mainchip'} aria-expanded={open} title={t.ui.mainChange} onClick={onToggle} {...(at && tour(at))}>
      <span>{SHORT[main] ?? main}</span><small>{open ? t.ui.mainChipOpen : t.ui.mainChipChange}</small>
    </button>
  );
}
