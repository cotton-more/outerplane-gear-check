// «Вещи Caren · 7» (GEARPOOL): все вещи персонажа по слотам («Шлем · 2»; пустых слотов нет), внутри слота — в порядке
// добавления; у вещи — где стоит («в Speed, Speed/Immu», «во всех билдах») и Breakthrough («· T4», «· T0–T3», как в
// слоте билда; у Epic оружия и аксессуара его нет — gear hasBt). Пулы героев независимы (В9): про других героев строк нет. Ненужная — строка «Caren больше не
// нужна» и «Убрать у Caren». Свёрнуто; нажатие — карточка вещи.
// onRateFor — «Оценить вещь для Caren» (режим «для героя»): справа от заголовка, на 280 — своей строкой (chars.css)
import { SLOTS } from '@/game/data';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { hasBt, type GearStore, type Piece } from '@/features/gear/model/gear';
import { isStats, removeFrom, removeUndo, type CharPool, type PoolView } from '@/features/gear/pool';
import { whereOf } from '@/features/gear/model/poolVs';
import type { GearApi } from '@/features/gear/store/useGear';
import { SlotIcon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';
import { PieceName, btText } from './BuildGear';

export function PoolList({ cp, ctx, gear, view, own, onOpenPiece, onRemoved, onRateFor }: {
  cp: CharPool; ctx: Ctx; gear: GearApi; view: PoolView; own: boolean; onOpenPiece: (id: string) => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
  onRateFor?: () => void;
}) {
  const t = useT();
  const { c, pieces } = cp;
  if (!pieces.length) return null;
  const open = cp.inPlay.filter((v) => !isStats(v) && !v.dupOf);
  const where = (p: Piece) => {
    const at = whereOf(view, c.id, p.id);
    if (at.worn) return t.ui.poolWorn;
    const used = at.builds.filter((v) => !v.dupOf);
    const names = [...new Set(used.map((v) => v.parent.name))];
    const all = open.length > 1 && open.every((v) => used.includes(v));
    return all ? t.ui.poolEverywhere : names.length ? t.ui.poolIn(names.join(', ')) : '';
  };
  const unused = new Set(cp.unused.map((p) => p.id));
  const remove = (p: Piece) => {
    const undo = removeUndo(gear.store, c.id, p);
    gear.set(removeFrom(gear.store, c.id, p.id));
    onRemoved?.(t.ui.removedFrom(c.name), '', undo);
  };
  const groups = SLOTS.map(({ id }) => ({ slot: id, list: pieces.filter((p) => p.slot === id) })).filter((g) => g.list.length);
  return (
    <div className="pool" {...tour('pool')}>
      {onRateFor && !gear.newer && <button type="button" className="btn small pool-rate" onClick={onRateFor}>{t.tryon.rateFor(c.name)}</button>}
      <details>
        <summary>{own ? t.ui.poolTitle(c.name, pieces.length) : t.ui.poolNotInRoster(c.name, pieces.length)}</summary>
        {groups.map(({ slot, list }) => (
          <section key={slot} className="pool-g">
            <h5 className="pool-gh">{t.ui.slotNames[slot]} · {list.length}</h5>
            <ul className="pool-list">
              {list.map((p) => (
                <li key={p.id} className={unused.has(p.id) ? 'unused' : undefined}>
                  <button type="button" className="pool-row" onClick={() => onOpenPiece(p.id)}>
                    <SlotIcon slot={p.slot} />
                    <span className="bgear-n"><PieceName ctx={ctx} p={p} />{hasBt(p.slot, p.grade) && <span className="pm">· {btText(t, p.bt)}</span>}</span>
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
          </section>
        ))}
      </details>
    </div>
  );
}
