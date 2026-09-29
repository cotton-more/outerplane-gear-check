// «Вещи Caren · 7» (GEARPOOL): все вещи персонажа — где каждая стоит («в Speed, Speed/Immu», «во всех билдах»,
// «и у Rin»); ненужная — строка «Caren больше не нужна» и «Убрать у Caren». Свёрнуто; нажатие — карточка вещи.
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { holdersOf, type GearStore, type Piece } from '../../logic/gear';
import { isStats, removeFrom, undoRemove, type CharPool, type PoolView } from '../../logic/pool';
import { whereUsed } from '../../logic/poolVs';
import { buildOfKey } from '../../logic/variants';
import type { GearApi } from '../../state/useGear';
import { SlotIcon } from '../Img';
import { tour } from '../../tour/anchors';
import { PieceName } from './BuildGear';

export function PoolList({ cp, ctx, gear, view, own, onOpenPiece, onRemoved }: {
  cp: CharPool; ctx: Ctx; gear: GearApi; view: PoolView; own: boolean; onOpenPiece: (id: string) => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
}) {
  const t = useT();
  const { c, pieces } = cp;
  if (!pieces.length) return null;
  const open = cp.inPlay.filter((v) => !isStats(v) && !v.dupOf);
  const where = (p: Piece) => {
    const used = whereUsed(view, c.id, p.id).filter((v) => !v.dupOf);
    const names = [...new Set(used.map((v) => buildOfKey(v.key, t.ui.byStats)))];
    const all = open.length > 1 && open.every((v) => used.includes(v));
    const others = holdersOf(gear.store, p.id).filter((h) => h !== c.id).map((h) => ctx.idx.CHAR[h]?.name ?? h);
    return [all ? t.ui.poolEverywhere : names.length ? t.ui.poolIn(names.join(', ')) : '', others.length ? t.ui.poolWith(others.join(', ')) : ''].filter(Boolean).join(' · ');
  };
  const unused = new Set(cp.unused.map((p) => p.id));
  const remove = (p: Piece) => {
    gear.set(removeFrom(gear.store, c.id, p.id));
    const others = holdersOf(gear.store, p.id).filter((h) => h !== c.id).map((h) => ctx.idx.CHAR[h]?.name ?? h);
    onRemoved?.(t.ui.removedFrom(c.name), others.length ? t.ui.stillWith(others.join(', ')) : '', (x) => undoRemove(x, p, [c.id]));
  };
  return (
    <details className="pool" {...tour('pool')}>
      <summary>{own ? t.ui.poolTitle(c.name, pieces.length) : t.ui.poolNotInRoster(c.name, pieces.length)}</summary>
      <ul className="pool-list">
        {pieces.map((p) => (
          <li key={p.id} className={unused.has(p.id) ? 'unused' : undefined}>
            <button type="button" className="pool-row" onClick={() => onOpenPiece(p.id)}>
              <SlotIcon slot={p.slot} />
              <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
              <span className="pool-w">{where(p)}</span>
            </button>
            {unused.has(p.id) && !gear.newer && (
              <p className="pool-unused">
                <span>{t.ui.poolUnused(c.name)}</span>
                <button type="button" className="btn small" onClick={() => remove(p)}>{t.ui.pieceRemove(c.name)}</button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
