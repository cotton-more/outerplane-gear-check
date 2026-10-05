// Варианты связок билда (GEARPOOL, game/build/variants): чипы — лучший вариант и ещё два, «ещё N ▾» — шторка со всеми,
// их сбором и «Собираю» (как в блоке билда: нет вещей — нет «Собираю»). Чип выбирает, какую раскладку показать
// (своё состояние карточки).
import { useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import type { CharPool } from '@/features/gear/pool';
import type { Variant } from '@/game/build/variants';
import { tour } from '@/tour/anchors';
import { Sheet } from '@/shared/ui/Sheet';
import { wantWhy } from './BuildGear';

// что отличает вариант: имя без имени билда («Defense mix · Penetration» → «Penetration»)
const short = (v: Variant) => v.name.slice(v.parent.name.length + 3) || v.name;

export function VariantChips({ list, cur, cp, ctx, st, onPick, onWant }: {
  list: Variant[]; cur: Variant; cp: CharPool; ctx: Ctx; st: GearStore; onPick: (v: Variant) => void; onWant: (v: Variant) => void;
}) {
  const t = useT();
  const [all, setAll] = useState(false);
  if (list.length < 2) return null;
  const prog = (v: Variant) => { const a = cp.asm.get(v.key)!; return `${a.progress}/${a.need}`; };
  const shown = list.slice(0, 3);
  if (!shown.includes(cur)) shown[2] = cur;
  const parent = list[0].parent;
  const common = parent.sets[0].filter((p) => parent.sets.every((cb) => cb.some((q) => q.set === p.set)));
  return (
    <>
      <div className="vchips" role="group" aria-label={parent.name} {...tour('variants')}>
        {shown.map((v) => (
          <button key={v.key} type="button" className="vchip" aria-pressed={v === cur} onClick={() => onPick(v)}>
            {short(v)} <span className="n">{prog(v)}</span>
          </button>
        ))}
        {list.length > 3 && <button type="button" className="vchip" onClick={() => setAll(true)}>{t.ui.chipsMore(list.length - 3)}</button>}
      </div>
      {all && (
        <Sheet title={t.ui.variantsTitle(parent.name, list.length)} onClose={() => setAll(false)}>
          <div className="vsheet">
            <p className="muted small">{common.length === 1 ? t.ui.variantsNote(ctx.idx.SET[common[0].set]?.short ?? common[0].set) : t.ui.variantsNoteAny}</p>
            <ul className="vlist">
              {list.map((v) => (
                <li key={v.key}>
                  <button type="button" className="vrow" aria-pressed={v === cur} onClick={() => { onPick(v); setAll(false); }}>
                    <b>{short(v)}</b> <span className="n">{prog(v)}</span>
                  </button>
                  {cp.pieces.length > 0 && (
                    <>
                      <button type="button" className="want-btn" aria-pressed={cp.inPlay.includes(v)} onClick={() => onWant(v)}>{t.ui.filling}</button>
                      <span className="muted small">{wantWhy(t, ctx.idx, cp, st, v)}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      )}
    </>
  );
}
