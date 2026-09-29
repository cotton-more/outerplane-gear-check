// Окно «Кому надеть?»: вещь с формы — в билд любого персонажа. Сначала билды, которые собираешь (с тем же
// сравнением, что в «Сейчас на персонажах»), потом подходящие билды остальных из ростера (или всех, если ростер пуст);
// имя в поиске ищется среди всех персонажей. В шапке — сама вещь, в строке — что будет: «Заменить шлем — новая лучше».
// «Показать и не по билду» — вещь на замену: в билд можно положить то, что на персонаже сейчас на самом деле.
// «уже надета» не нажимается: запись заменилась бы свежей копией — без Reforge и Breakthrough.
import { useMemo, useState } from 'react';
import { subLabel } from '../../data';
import type { Build, Char } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { buildKey, type GearStore } from '../../logic/gear';
import type { ItemInput } from '../../logic/verdict';
import { equipTargets, type Vs } from '../../logic/vs';
import { Img, SlotIcon } from '../Img';
import { Sheet } from '../Sheet';
import { VsChip } from './VsSection';
import { tour } from '../../tour/anchors';

export function EquipSheet({ ctx, store, item, onEquip, onClose }: {
  ctx: Ctx; store: GearStore; item: ItemInput; onEquip: (c: Char, b: Build) => void; onClose: () => void;
}) {
  const t = useT();
  const { SET, ITEM, D } = ctx.idx;
  const [all, setAll] = useState(false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const chars = useMemo(() => {
    // X не предлагаем, когда в ростере Core Fusion X: в игре его больше нет
    const withBuilds = D.chars.filter((c) => c.builds.length && !ctx.roster.has(ctx.idx.FUSED[c.id]));
    const own = withBuilds.filter((c) => ctx.roster.has(c.id));
    return needle ? withBuilds.filter((c) => c.name.toLowerCase().includes(needle)) : own.length ? own : withBuilds;
  }, [ctx, D, needle]);
  const list = useMemo(() => equipTargets(ctx, store, item, chars, all), [ctx, store, item, chars, all]);
  const acc = t.ui.slotAcc[item.slot];
  const nameOf = (x: Pick<ItemInput, 'slot' | 'setId' | 'itemKey' | 'main'> & { grade: string }) => {
    const what = x.setId ? `${SET[x.setId]?.short ?? x.setId} Set` : [x.itemKey ? ITEM[x.slot as 'weapon' | 'accessory'][x.itemKey]?.name : x.grade === 'rare' ? 'Epic' : '', x.main].filter(Boolean).join(' · ');
    return `${what} · ${x.grade === 'unique' ? 'L' : 'E'}`;
  };
  // что будет по нажатию: «Надеть — шлема нет», «Заменить шлем — новая лучше», «Заменить шлем — сломает сет Immunity»
  const action = (vs: Vs | null) => {
    if (!vs) return t.ui.equipRowOff;
    if (vs.kind === 'worn') return t.ui.equipRowWorn;
    if (vs.kind === 'fill') return t.ui.equipRowFill(t.ui.slotGen[item.slot]);
    if (vs.kind === 'breaks') return t.ui.equipRowBreaks(acc, SET[vs.broken ?? '']?.short ?? vs.broken ?? '');
    return t.ui.equipRowReplace(acc, t.ui.equipHow[vs.why ?? vs.kind]);
  };
  const now = (c: Char, b: Build) => {
    const p = store.pieces[store.builds[buildKey(c.id, b.name)]?.slots[item.slot] ?? ''];
    return p ? t.ui.equipSlotHas(nameOf(p)) : null;
  };
  return (
    <Sheet title={t.ui.equipSheet} onClose={onClose}>
      <div className="equip">
        <div className="equip-item">
          <p><SlotIcon slot={item.slot} /><span><b>{t.ui.slotNames[item.slot]}</b> · {nameOf(item)}</span></p>
          <p className="equip-subs">{Object.entries(item.subs).map(([k, n]) => <span key={k} className="tok">{subLabel(k)}<i>{n}</i></span>)}</p>
        </div>
        <label className="equip-q"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ui.equipSearch} aria-label={t.ui.equipSearch} /></label>
        <label className="toggle" {...tour('equipall')}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t.ui.equipAll}</label>
        {list.length ? (
          <ul className="equip-list">
            {list.map(({ c, b, vs }) => {
              const has = now(c, b);
              return (
                <li key={c.id + '/' + b.name}>
                  <button type="button" className="equip-row" disabled={vs?.kind === 'worn'} onClick={() => onEquip(c, b)}>
                    <Img k={'face:' + c.icon} className="face" />
                    <span className="nm">
                      <b>{c.name}</b> <span className="bn">{b.name}</span>
                      <span className="act">{action(vs)}</span>
                      {has && vs?.kind !== 'worn' && <span className="muted small">{has}</span>}
                    </span>
                    {vs ? (store.builds[vs.key] ? <VsChip vs={vs} /> : null) : <span className="vs off">{t.ui.equipOffBuild}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">{t.ui.equipNone}</p>}
        <p className="muted small">{t.ui.equipNote}</p>
      </div>
    </Sheet>
  );
}
