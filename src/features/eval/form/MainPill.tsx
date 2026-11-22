import type { ReactNode } from 'react';
import { useT } from '@/i18n';
import { tour, type Anchor } from '@/tour/anchors';
import type { MainOption } from './lists';

// The main stat on the form without a window (owner 2026-11-22, prototype «Main без окошка»).
//
// MainPill — a weapon: its mains are only ATK%, HP% and DEF%, so all of them stand in the pill of the star controls (picked — a raised plate)
// (.lv-pill / .lv-seg of chars.css) next to the grade, and the grid goes straight to substats. `all` — the slot's mains in
// a fixed order (the pill keeps its width); one the chosen item can't have is disabled, one nobody needs is grey (tappable).
// A tap on the chosen one clears it, as the grid's «main» cell does.
//
// MainChip — an accessory has 4–12 mains: the first tap in the grid picks it (StatGrid main mode), then it sits here in a
// pill as wide as a weapon's (the main on a raised plate and «сменить»); a tap puts the grid back to picking the main (`open`), the
// substats stay. No main yet — the same pill with «Main ↓» pointing at the grid. So the second row is always «main pill + T».
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
  // the same pill as a weapon's, as wide (owner 2026-11-22: the row is always «main pill + T»): empty — «Main ↓» inside;
  // chosen — the main on a raised plate and «сменить» after it
  if (!main) return <span className={need ? 'lv-pill mainchip empty need' : 'lv-pill mainchip empty'} {...(at && tour(at))}><span className="mc-none">{t.ui.mainInGrid}</span></span>;
  return (
    <button type="button" className={open ? 'lv-pill mainchip open' : 'lv-pill mainchip'} aria-expanded={open} title={t.ui.mainChange} onClick={onToggle} {...(at && tour(at))}>
      <span className="lv-seg on">{SHORT[main] ?? main}</span><span className="mc-act">{open ? t.ui.mainChipOpen : t.ui.mainChipChange}</span>
    </button>
  );
}

// ItemPill — a weapon's or accessory's item in the same pill as the main (owner 2026-11-22): empty — «Оружие — найти ▾»;
// picked — the item on a raised plate (its picture and name) and «сменить»; a tap opens the item sheet (40–60 items, no
// segments). value null with `fixed` — an Epic: its game name («Steel Sword») in the pill, nothing to pick
export function ItemPill({ value, placeholder, fixed = false, need = false, at, onClick }: {
  value: ReactNode | null; placeholder: string; fixed?: boolean; need?: boolean; at?: Anchor; onClick?: () => void;
}) {
  const t = useT();
  if (fixed) return <span className="lv-pill itempill fixed"><span className="mc-none">{placeholder}</span></span>;
  if (!value) {
    return (
      <button type="button" className={need ? 'lv-pill itempill empty need' : 'lv-pill itempill empty'} onClick={onClick} {...(at && tour(at))}>
        <span className="mc-none">{placeholder}</span><span className="ip-car" aria-hidden="true">▾</span>
      </button>
    );
  }
  return (
    <button type="button" className="lv-pill itempill" title={t.ui.mainChipChange} onClick={onClick} {...(at && tour(at))}>
      <span className="lv-seg on">{value}</span><span className="mc-act">{t.ui.mainChipChange}</span>
    </button>
  );
}
