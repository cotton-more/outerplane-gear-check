import { useMemo, useState } from 'react';
import type { GearKind } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { itemOptions } from '../../logic/lists';
import { Frame, Img } from '../Img';

// Окно выбора Legendary оружия/аксессуара. Поиск не фокусируется сам: в разделённом экране экранная клавиатура
// закрыла бы почти всё окно, а чаще хватает фильтра класса и сортировки по спросу.
export function ItemPicker({ ctx, kind, current, onPick, onUnlisted }: {
  ctx: Ctx; kind: GearKind; current: string | null; onPick: (key: string) => void; onUnlisted: () => void;
}) {
  const t = useT();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const list = useMemo(() => itemOptions(ctx, kind, q, cls), [ctx, kind, q, cls]);
  return (
    <>
      <div className="tools">
        <input className="search" id="item-q" type="search" placeholder={t.ui.itemSearch} value={q}
          onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <div className="filt">
          {Object.entries(ctx.idx.D.classes).map(([k, v]) => (
            <button key={k} type="button" className="fbtn" aria-pressed={cls === k} aria-label={v} title={v} onClick={() => setCls(cls === k ? '' : k)}>
              <Img k={'class:' + k} /><span>{v}</span>
            </button>
          ))}
        </div>
        <button type="button" className="linkbtn unlisted" onClick={onUnlisted}>{t.ui.unlistedLink}</button>
      </div>
      <div className="items">
        {list.length ? list.map(({ i, n }) => (
          <button key={i.key} type="button" className={`item${i.users ? '' : ' unused'}`} aria-pressed={current === i.key} onClick={() => onPick(i.key)}>
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
