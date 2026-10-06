// «Сейчас на персонажах» в подробностях вердикта («статы + сеты», PLAN Д3): до трёх героев, которых назвал вердикт, —
// цепочка героя с отметками вещи, сколько очков она ему даст и что ещё: какие половины сетов включатся и выключатся,
// какие его вещи встанут вместе с ней, почему её держать. Кнопка — только когда «Надеть» что-то значит (poolVs useful).
import { GRADE_NAME, isArmor } from '@/game/data';
import { useT } from '@/i18n';
import type { CharVs } from '@/features/gear/model/poolVs';
import { useIndex } from '@/game/data/IndexContext';
import { Chain } from '@/features/eval/verdict/Chain';
import { tour } from '@/tour/anchors';
import type { ItemInput } from '@/game/item/item';
import { VsChip } from './VsChip';
import { heroLines } from './outcomeText';
import { HeroFace } from '@/game/hero/HeroFace';
import { EquipButton } from './EquipButton';
import { HeroName } from '@/game/hero/HeroName';
import { Icon } from '@/game/icons/Img';
import { usePieceLabel } from './pieceText';

// строки исхода героя (outcomeText heroLines): прирост, половины, вещи пула вместе с ней; у «Оставь» — почему держать
export function OutcomeLines({ x, item }: { x: CharVs; item: ItemInput }) {
  const t = useT();
  const idx = useIndex();
  const label = usePieceLabel();
  return <>{heroLines(t, idx, x.h, item, label).map((l, i) => <p key={i}>{l}</p>)}</>;
}

// t4 — на форме нажата «T4»: «· T4» в подписи кнопки; nextNote — «Дальше: Ботинки» под кнопкой (режим героя)
// onStash — «Отложить для X» у «Оставь» и запаса (решение владельца 2026-10-06)
export function VsSection({ list, item, slot, t4 = false, nextNote = null, onEquip, onStash, onOpenChar }: {
  list: CharVs[]; item: ItemInput; slot: string; t4?: boolean; nextNote?: string | null; onEquip?: (x: CharVs) => void; onStash?: (x: CharVs) => void;
  onOpenChar: (id: string) => void;
}) {
  const t = useT();
  if (!list.length) return null;
  return (
    <div className="v-vs" {...tour('vs')}>
      <h3>{t.ui.vsTitle}</h3>
      <ul>
        {list.map((x) => {
          const w = x.h.replaced;
          return (
            <li key={x.c.id} className={`vs-row vs-${x.h.kind}`}>
              <div className="vs-h">
                <HeroFace c={x.c} />
                <div className="nm">
                  <button type="button" onClick={() => onOpenChar(x.c.id)}><b><HeroName c={x.c} /></b></button>
                  {w && isArmor(w.slot) && <span className="vs-worn">{t.ui.vsWorn(GRADE_NAME[w.grade], w.bt)}</span>}
                </div>
                <VsChip x={x} />
              </div>
              {x.chain.b.subs.length > 0 && <div className="chains"><Chain m={x.chain} /></div>}
              <OutcomeLines x={x} item={item} />
              {onEquip && x.useful && <EquipButton place="vs-act" x={x} slot={slot} t4={t4} good={x.h.kind === 'wear'} onEquip={onEquip} />}
              {onStash && x.stash && <button type="button" className="btn vs-stash" onClick={() => onStash(x)}><Icon name="archive" />{t.fit.stash(x.c.name)}</button>}
              {onEquip && x.asWorn && !x.replaces && <p className="muted small vs-wear">{t.ui.equipAsWorn}</p>}
              {onEquip && x.useful && nextNote && <p className="muted small vs-wear vs-next">{nextNote}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

