import { useMemo, useState } from 'react';
import type { GearKind } from '../../data/types';
import type { Ctx } from '../../logic/context';
import { itemOptions } from '../../logic/lists';
import { Frame, Img } from '../Img';

// Окно выбора Legendary оружия/аксессуара. Поиск не фокусируется сам: в разделённом экране экранная клавиатура
// закрыла бы почти всё окно, а чаще хватает фильтра класса и сортировки по спросу.
export function ItemPicker({ ctx, kind, current, onPick, onUnlisted }: {
  ctx: Ctx; kind: GearKind; current: string | null; onPick: (key: string) => void; onUnlisted: () => void;
}) {
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const list = useMemo(() => itemOptions(ctx, kind, q, cls), [ctx, kind, q, cls]);
  return (
    <>
      <div className="tools">
        <input className="search" id="item-q" type="search" placeholder="Название или пассивка: Caracal…" value={q}
          onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search" />
        <div className="filt">
          {Object.entries(ctx.idx.D.classes).map(([k, v]) => (
            <button key={k} type="button" className="fbtn" aria-pressed={cls === k} onClick={() => setCls(cls === k ? '' : k)}>
              <Img k={'class:' + k} />{v}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn unlisted" onClick={onUnlisted}>Нет в списке — оценить по main stat</button>
      <div className="items">
        {list.length ? list.map(({ i, n }) => (
          <button key={i.key} type="button" className={`item${i.users ? '' : ' unused'}`} aria-pressed={current === i.key} onClick={() => onPick(i.key)}>
            <Frame item={i} />
            <div style={{ minWidth: 0 }}>
              <b>{i.name}</b>
              <span>{i.passives[0] ? i.passives[0].name : 'без пассивки'} · {i.users ? (ctx.scoped ? `${n} из ростера` : `в билдах у ${n}`) : 'нет в билдах'}</span>
            </div>
          </button>
        )) : <p className="empty">Ничего не нашлось. Проверь написание{cls ? ' или сними фильтр класса' : ''}.</p>}
      </div>
    </>
  );
}
