// Вкладка «Пул» карточки героя (.x/0085 макет 6.0, решение 5): все вещи героя по слотам, справа — почему пул её держит
// (TEXTS 28, одна причина по старшинству: надета › лучший {сет} на T4 › лучший {сет} › по статам › в запасе). Не держит —
// «больше не нужна» и «Убрать у X» (FORMULA §5 п. 6, молча ничего не удаляется). Нажатие — карточка вещи. Внизу —
// «Оценить вещь для X» (режим «для героя»).
import { SLOTS } from '@/game/data';
import type { Char } from '@/game/data/types';
import { useT, type Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import { type GearStore, type Piece } from '@/features/gear/model/gear';
import { removeFrom, removeUndo } from '@/features/gear/pool';
import type { HeroPool } from '@/features/gear/verdict';
import { reasonOf, type Reason } from '@/features/gear/pool/info';
import type { GearApi } from '@/features/gear/store/useGear';
import { setName } from '@/game/set/setName';
import type { Index } from '@/game/data';
import { SlotIcon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';
import { BtLabel, PieceName } from './pieceText';

// причина словами (TEXTS 28)
export const reasonText = (t: Texts, idx: Index, r: Reason): string =>
  (r.kind === 'best' ? t.fit.why.best(setName(idx, r.set)) : r.kind === 'bestT4' ? t.fit.why.bestT4(setName(idx, r.set)) : t.fit.why[r.kind]);

// hp — пул героя по «статам + сетам»; у героя без билдов (null) причин нет
export function PoolList({ c, pieces, hp, ctx, gear, onOpenPiece, onRemoved, onRateFor }: {
  c: Char; pieces: readonly Piece[]; hp: HeroPool | null; ctx: Ctx; gear: GearApi; onOpenPiece: (id: string) => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
  onRateFor?: () => void;
}) {
  const t = useT();
  const remove = (p: Piece) => {
    const undo = removeUndo(gear.store, c.id, p);
    gear.set(removeFrom(gear.store, c.id, p.id));
    onRemoved?.(t.ui.removedFrom(c.name), '', undo);
  };
  const list = SLOTS.flatMap(({ id }) => pieces.filter((p) => p.slot === id));
  return (
    <div className="pool" {...tour('pool')}>
      <ul className="bgear-list">
        {list.map((p) => {
          const r = hp ? reasonOf(hp.info, p) : null;
          const unused = !!hp && !r;
          return (
            <li key={p.id} className={unused ? 'unused' : undefined}>
              <button type="button" className="bgear-row pool-row" onClick={() => onOpenPiece(p.id)}>
                <SlotIcon slot={p.slot} />
                <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                <span className={'pool-why' + (r?.kind === 'worn' ? ' worn' : '')}>{r ? reasonText(t, ctx.idx, r) : unused ? t.fit.unneeded : <BtLabel p={p} />}</span>
              </button>
              {unused && !gear.newer && (
                <p className="pool-unused">
                  <button type="button" className="btn small" onClick={() => remove(p)}>{t.ui.pieceRemove(c.name)}</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {onRateFor && !gear.newer && <button type="button" className="btn pool-rate" onClick={onRateFor}>{t.tryon.rateFor(c.name)}</button>}
    </div>
  );
}
