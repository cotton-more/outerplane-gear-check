// Окно «Кому надеть?» (GEARPOOL): вещь с формы — в вещи персонажа. Строка на персонажа, без выбора билда: только те,
// кому вещь встанет в билд (соберёт, сет 3 из 4, пустой слот, новая лучше) или начнёт новый, и неактивная «Уже есть».
// Без поиска — по сету, как вердикт (Р11). Поиск по имени — явный выбор: вещь не по билду, но с полезными статами
// встанет персонажу в «По статам» (находка 28). Вещь без полезных статов не попадает никому (Р13). Сначала держащие
// исходы, потом «начнёт»; имя ищется среди всех персонажей (без X, когда есть Core Fusion X: logic/fusion). В шапке —
// сама вещь.
import { useMemo, useState } from 'react';
import { subLabel } from '../../data';
import type { Char } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { holds, type PoolView } from '../../logic/pool';
import { charsVs, whereUsed, type CharVs } from '../../logic/poolVs';
import { buildOfKey } from '../../logic/variants';
import type { ItemInput } from '../../logic/verdict';
import { Img, SlotIcon } from '../Img';
import { Sheet } from '../Sheet';
import { VsChip } from './VsSection';
import { tour } from '../../tour/anchors';

export function EquipSheet({ ctx, view, item, onEquip, onClose }: {
  ctx: Ctx; view: PoolView; item: ItemInput; onEquip: (c: Char) => void; onClose: () => void;
}) {
  const t = useT();
  const { SET, ITEM, D } = ctx.idx;
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const chars = useMemo(() => {
    // X не предлагаем, когда есть Core Fusion X: в игре его больше нет. Core Fusion X при X — окно перехода (App)
    const withBuilds = D.chars.filter((c) => c.builds.length && !ctx.off.has(c.id));
    const own = withBuilds.filter((c) => ctx.roster.has(c.id));
    return needle ? withBuilds.filter((c) => c.name.toLowerCase().includes(needle)) : own.length ? own : withBuilds;
  }, [ctx, D, needle]);
  const list = useMemo(() => charsVs(ctx, view, item, chars, { explicit: !!needle }).filter((x) => x.useful || x.worn)
    .sort((a, z) => rank(a) - rank(z)), [ctx, view, item, chars, needle]);
  const acc = t.ui.slotAcc[item.slot];
  const nameOf = (x: Pick<ItemInput, 'slot' | 'setId' | 'itemKey' | 'main'> & { grade: string }) => {
    const what = x.setId ? `${SET[x.setId]?.short ?? x.setId} Set` : [x.itemKey ? ITEM[x.slot as 'weapon' | 'accessory'][x.itemKey]?.name : x.grade === 'rare' ? 'Epic' : '', x.main].filter(Boolean).join(' · ');
    return `${what} · ${x.grade === 'unique' ? 'L' : 'E'}`;
  };
  const bn = (key: string) => buildOfKey(key, t.ui.byStats);
  // что будет по нажатию: «Надеть — соберёт Speed», «Заменить шлем — новая лучше · Speed», «Надеть — начнёт Speed»
  const action = (x: CharVs) => {
    if (x.worn) return t.ui.equipRowWorn([...new Set(whereUsed(view, x.c.id, x.worn.id).map((v) => bn(v.key)))].join(', ') || t.ui.byStats);
    const o = x.best;
    if (!o || o.entering || !o.used) return t.ui.equipRowStarts([...new Set(x.starts.map((v) => v.name))].join(', ') || (o ? bn(o.v.key) : ''));
    if (o.kind === 'completes') return t.ui.equipRowCompletes(bn(o.v.key));
    if (o.kind === 'closer') return t.ui.equipRowCloser(bn(o.v.key), o.after.progress, o.after.need);
    if (x.replaces) return t.ui.equipRowReplace(acc, bn(o.v.key));
    return o.kind === 'fill' ? t.ui.equipRowFill(bn(o.v.key)) : t.ui.equipRowEq(bn(o.v.key));
  };
  return (
    <Sheet title={t.ui.equipSheet} onClose={onClose}>
      <div className="equip">
        <div className="equip-item">
          <p><SlotIcon slot={item.slot} /><span><b>{t.ui.slotNames[item.slot]}</b> · {nameOf(item)}</span></p>
          <p className="equip-subs">{Object.entries(item.subs).map(([k, n]) => <span key={k} className="tok">{subLabel(k)}<i>{n}</i></span>)}</p>
        </div>
        <label className="equip-q"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ui.equipSearch} aria-label={t.ui.equipSearch} /></label>
        {list.length ? (
          <ul className="equip-list" {...tour('equipall')}>
            {list.map((x) => (
              <li key={x.c.id}>
                <button type="button" className="equip-row" disabled={!!x.worn} onClick={() => onEquip(x.c)}>
                  <Img k={'face:' + x.c.icon} className="face" />
                  <span className="nm">
                    <b>{x.c.name}</b>
                    <span className="act">{action(x)}</span>
                  </span>
                  <VsChip o={x.best} starts={!x.worn && (!x.best || x.best.entering || !x.best.used)} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{needle ? t.ui.equipNoneQ : t.ui.equipNone}</p>}
        <p className="muted small">{t.ui.equipNote}</p>
      </div>
    </Sheet>
  );
}

// держащие исходы на собираемых вариантах, потом «начнёт», потом «уже есть»
const rank = (x: CharVs) => (x.worn ? 2 : x.best && holds(x.best) && x.best.used && !x.best.entering ? 0 : 1);
