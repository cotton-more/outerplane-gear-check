// «Ещё» → «Припаркованные» (.x/0204-parked-list, owner 2026-10-13): every parked piece (MODEL.md §5) by the hero whose pool
// holds it — face and name, then the pieces in full as the trade walk draws them, «Убрать» per row. The way out of a parked
// piece is the player's: unlock it in the game, then «Убрать» here — the same removal as the card's «Убрать у X», with
// «Вернуть» in the message (park mark included). The last removal empties the list: App closes the sheet
import type { Ctx } from '@/game/context';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import { useT } from '@/i18n';
import { parkedGroups, type GearStore, type Piece } from '@/features/gear/model/gear';
import { removeFrom, removeUndo } from '@/features/gear/pool';
import type { GearApi } from '@/features/gear/store/useGear';
import { pieceText } from '@/features/gear/ui/pieceText';
import { PieceRow } from '@/features/trade/ui/PieceRow';

// order — the roster, in its order (the groups follow it)
export function ParkedList({ ctx, gear, order, onRemoved }: {
  ctx: Ctx; gear: GearApi; order: readonly string[];
  onRemoved: (text: string, undo: (st: GearStore) => GearStore) => void;
}) {
  const t = useT();
  const groups = parkedGroups(gear.store, order);
  const remove = (hero: string, name: string, p: Piece) => {
    const undo = removeUndo(gear.store, hero, p);
    gear.set(removeFrom(gear.store, hero, p.id));
    onRemoved(t.ui.removedFrom(name), undo);
  };
  return (
    <div className="parked">
      <p className="muted small">{t.ui.parkedTop}</p>
      {groups.map(({ hero, pieces }) => {
        const c = ctx.idx.CHAR[hero];
        const name = c?.name ?? hero;
        return (
          <section key={hero} className="parked-hero" aria-label={name}>
            <h4 className="parked-h">{c && <HeroFace c={c} />}{c ? <HeroName c={c} /> : <span>{hero}</span>}</h4>
            <ul className="bgear-list">
              {pieces.map((p) => (
                <li key={p.id}>
                  <PieceRow ctx={ctx} p={p} action={
                    <button type="button" className="btn small parked-rm"
                      aria-label={t.ui.parkedRemoveAria(name, `${t.ui.slotNom[p.slot]} ${pieceText(ctx, p)}`)}
                      onClick={() => remove(hero, name, p)}>{t.ui.parkedRemove}</button>
                  } />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
