import { useEffect, useMemo, useState } from 'react';
import type { GearKind } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { itemOptions } from './lists';
import { ClassIcon, Frame } from '@/game/icons/Img';
import { fineHover } from '@/shared/layout/useLayout';

// Окно выбора Legendary оружия/аксессуара.
// Search gets focus only with a mouse and keyboard (fineHover): on a phone the on-screen keyboard would cover most of
// the sheet in split screen. Typing that leaves exactly one item picks it, as if it were tapped: first it lights up
// (motion.css m-pick), then after SOON ms it is picked (owner: 300 ms was too short to notice) — an instant pick looks like a glitch. Typing on cancels it;
// the class filter alone never picks.
export const SOON = 750;

export function ItemPicker({ ctx, kind, current, onPick, onUnlisted }: {
  ctx: Ctx; kind: GearKind; current: string | null; onPick: (key: string) => void; onUnlisted: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [focus] = useState(fineHover);
  const [soon, setSoon] = useState<string | null>(null);
  const list = useMemo(() => itemOptions(ctx, kind, q, cls), [ctx, kind, q, cls]);
  const type = (v: string) => {
    setQ(v);
    const left = v.trim() ? itemOptions(ctx, kind, v, cls) : [];
    setSoon(left.length === 1 ? left[0].i.key : null);
  };
  useEffect(() => {
    if (!soon) return;
    const id = setTimeout(() => onPick(soon), SOON);
    return () => clearTimeout(id);
  }, [soon]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="tools">
        <input className="search" id="item-q" type="search" placeholder={t.ui.itemSearch} value={q} autoFocus={focus}
          onChange={(e) => type(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <div className="filt">
          {Object.entries(ctx.idx.D.classes).map(([k, v]) => (
            <button key={k} type="button" className="fbtn" aria-pressed={cls === k} aria-label={v} title={v} onClick={() => { setCls(cls === k ? '' : k); setSoon(null); }}>
              <ClassIcon cls={k} /><span>{v}</span>
            </button>
          ))}
        </div>
        <button type="button" className="linkbtn unlisted" onClick={onUnlisted}>{t.ui.unlistedLink}</button>
      </div>
      <div className="items">
        {list.length ? list.map(({ i, n }) => (
          <button key={i.key} type="button" className={`item${i.users ? '' : ' unused'}${soon === i.key ? ' soon' : ''}`} aria-pressed={current === i.key} onClick={() => onPick(i.key)}>
            <Frame item={i} />
            <div style={{ minWidth: 0 }}>
              <b>{i.name}</b>
              <span>{i.passives[0] ? i.passives[0].name : t.ui.noPassive} · {i.users ? (ctx.scoped ? t.ui.inRoster(n) : t.ui.inBuilds(n)) : t.ui.notInBuilds}</span>
            </div>
          </button>
        )) : (
          <div className="empty">
            <p style={{ margin: '0 0 8px' }}>{t.ui.nothingFound(!!cls)}</p>
            <button type="button" className="btn" onClick={onUnlisted}>{t.ui.unlistedButton}</button>
          </div>
        )}
      </div>
    </>
  );
}
