// Окно «Кому надеть?»: вещь с формы — в билд любого персонажа. Сначала билды, которые собираешь (с тем же
// сравнением, что в «Сейчас на персонажах»), потом подходящие билды остальных из ростера (или всех, если ростер пуст).
// «Показать и не по билду» — вещь на замену: в билд можно положить то, что на персонаже сейчас на самом деле.
import { useMemo, useState } from 'react';
import type { Build, Char } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { buildKey, type GearStore } from '../../logic/gear';
import type { ItemInput } from '../../logic/verdict';
import { equipTargets } from '../../logic/vs';
import { Img } from '../Img';
import { Sheet } from '../Sheet';
import { VsChip } from './VsSection';

export function EquipSheet({ ctx, store, item, onEquip, onClose }: {
  ctx: Ctx; store: GearStore; item: ItemInput; onEquip: (c: Char, b: Build) => void; onClose: () => void;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const chars = useMemo(() => {
    const own = ctx.idx.D.chars.filter((c) => c.builds.length && ctx.roster.has(c.id));
    return own.length ? own : ctx.idx.D.chars.filter((c) => c.builds.length);
  }, [ctx]);
  const list = useMemo(() => equipTargets(ctx, store, item, chars, all), [ctx, store, item, chars, all]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? list.filter((x) => x.c.name.toLowerCase().includes(needle)) : list;
  const slotName = t.ui.slotNames[item.slot];
  const now = (c: Char, b: Build) => {
    const id = store.builds[buildKey(c.id, b.name)]?.slots[item.slot];
    const p = id ? store.pieces[id] : undefined;
    if (!p) return t.ui.equipSlotEmpty;
    const what = p.setId ? `${ctx.idx.SET[p.setId]?.short ?? p.setId} Set` : p.itemKey ? ctx.idx.ITEM[p.slot as 'weapon' | 'accessory'][p.itemKey]?.name ?? '' : p.main ?? '';
    return t.ui.equipSlotHas(`${what}${p.grade === 'unique' ? ' · L' : ' · E'}`);
  };
  return (
    <Sheet title={t.ui.equipSheet} onClose={onClose}>
      <div className="equip">
        <label className="equip-q"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ui.equipSearch} aria-label={t.ui.equipSearch} /></label>
        <label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t.ui.equipAll}</label>
        {shown.length ? (
          <ul className="equip-list">
            {shown.map(({ c, b, vs }) => (
              <li key={c.id + '/' + b.name}>
                <button type="button" className="equip-row" onClick={() => onEquip(c, b)}>
                  <Img k={'face:' + c.icon} className="face" />
                  <span className="nm"><b>{c.name}</b> <span className="bn">{b.name}</span><span className="muted small">{slotName}: {now(c, b)}</span></span>
                  {vs ? (store.builds[vs.key] ? <VsChip vs={vs} /> : null) : <span className="vs off">{t.ui.equipOffBuild}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{t.ui.equipNone}</p>}
        <p className="muted small">{t.ui.equipNote}</p>
      </div>
    </Sheet>
  );
}
