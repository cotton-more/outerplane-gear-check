// Окно «Кому надеть?» («статы + сеты»): вещь с формы — в вещи героя. Без поиска — те из ростера (без ростера — все с
// билдами), кому она «Надень», по приросту очков. Поиск по имени — явный выбор: «Надеть» запишет её на любом найденном
// (TEXTS 23), с приростом, если он есть. Имя ищется среди всех персонажей (без X, когда есть Core Fusion X:
// features/gear/model/fusion). В шапке — сама вещь.
import { useMemo, useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { PoolView } from '@/features/gear/pool';
import { charVs, type CharVs } from '@/features/gear/model/poolVs';
import { partText, setName } from '@/game/set/setName';
import type { ItemInput } from '@/game/item/item';
import { SlotIcon } from '@/game/icons/Img';
import { Sheet } from '@/shared/ui/Sheet';
import { gainOf, VsChip } from './VsChip';
import { tour } from '@/tour/anchors';
import { HeroFace } from '@/game/hero/HeroFace';
import { SubToken } from '@/game/item/SubToken';
import { HeroName } from '@/game/hero/HeroName';

// viewOf — вид пула героя, на котором «Надеть» сделает putOn: у Core Fusion X при X — после окна перехода, вещи X уже
// у него (П9); у прочих — общий вид
export function EquipSheet({ ctx, viewOf, item, onEquip, onClose }: {
  ctx: Ctx; viewOf: (charId: string) => PoolView; item: ItemInput; onEquip: (c: Char) => void; onClose: () => void;
}) {
  const t = useT();
  const { ITEM, D } = ctx.idx;
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const chars = useMemo(() => {
    // X не предлагаем, когда есть Core Fusion X: в игре его больше нет. Core Fusion X при X — окно перехода (App)
    const withBuilds = D.chars.filter((c) => c.builds.length && (!ctx.off.has(c.id) || !!c.fusionOf));
    const own = withBuilds.filter((c) => ctx.roster.has(c.id));
    return needle ? withBuilds.filter((c) => c.name.toLowerCase().includes(needle)) : own.length ? own : withBuilds;
  }, [ctx, D, needle]);
  const list = useMemo(() => chars.map((c) => charVs(ctx, viewOf(c.id), c.id, item, { any: !!needle }))
    .filter((x): x is CharVs => !!x?.useful).sort((a, z) => z.h.dV - a.h.dV), [ctx, viewOf, item, chars, needle]);
  const acc = t.ui.slotAcc[item.slot];
  const nameOf = (x: Pick<ItemInput, 'slot' | 'setId' | 'itemKey' | 'main'> & { grade: string }) => {
    const what = x.setId ? `${setName(ctx.idx, x.setId)} Set` : [x.itemKey ? ITEM[x.slot as 'weapon' | 'accessory'][x.itemKey]?.name : x.grade === 'rare' ? 'Epic' : '', x.main].filter(Boolean).join(' · ');
    return `${what} · ${x.grade === 'unique' ? 'L' : 'E'}`;
  };
  // что будет по нажатию: «Надеть — +2,5 очк.», «Заменить шлем — +2,5 очк. · включит Speed ×2»; нажата «T4» — «· T4» (В4)
  const action = (x: CharVs) => {
    const g = gainOf(x);
    const pts = g === null ? null : t.fit.pts(g);
    const on = x.h.kind === 'wear' && x.h.parts.on.length ? t.fit.rowOn(partText(ctx.idx, x.h.parts.on[0])) : '';
    return (x.replaces ? t.fit.rowReplace(acc, pts) : t.fit.rowEquip(pts)) + on + (item.bt === 4 ? t.ui.withT4 : '');
  };
  return (
    <Sheet title={t.ui.equipSheet} onClose={onClose}>
      <div className="equip">
        <div className="equip-item">
          <p><SlotIcon slot={item.slot} /><span><b>{t.ui.slotNames[item.slot]}</b> · {nameOf(item)}</span></p>
          <p className="equip-subs">{Object.entries(item.subs).map(([k, n]) => <SubToken key={k} stat={k} lit={n} />)}</p>
        </div>
        <label className="equip-q"><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ui.equipSearch} aria-label={t.ui.equipSearch} /></label>
        {list.length ? (
          <ul className="equip-list" {...tour('equipall')}>
            {list.map((x) => (
              <li key={x.c.id}>
                <button type="button" className="equip-row" onClick={() => onEquip(x.c)}>
                  <HeroFace c={x.c} />
                  <span className="nm">
                    <b><HeroName c={x.c} /></b>
                    <span className="act">{action(x)}</span>
                  </span>
                  <VsChip x={x} />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">{needle ? t.ui.equipNoneQ : t.ui.equipNone}</p>}
        <p className="muted small">{t.fit.rowNote}</p>
      </div>
    </Sheet>
  );
}

