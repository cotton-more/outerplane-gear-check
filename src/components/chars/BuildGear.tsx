// Что надето в билде персонажа (logic/gear): 6 слотов, у вещи — сабстаты с сегментами, окрашенные по цепочке этого
// билда, Breakthrough и сколько Reforge сделано. Нажатие на вещь — карточка вещи: оранжевые сегменты после Reforge,
// Breakthrough, смена стата после Transistone, «Снять». Вещь в билд кладёт только вердикт («Надеть на…»).
import { useEffect, useState } from 'react';
import { SLOTS, isArmor, subLabel } from '../../data';
import type { Build, Char, GearKind, SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import {
  addFourth, buildKey, MAX_LIT, pieceInput, reforgesDone, replaceStat, share, tapSegment, unequip, updatePiece, usedIn,
  type Bt, type Piece,
} from '../../logic/gear';
import { itemMains } from '../../logic/mains';
import { subWeights } from '../../logic/score';
import { MAX_SUBS } from '../../logic/subs';
import type { GearApi } from '../../state/useGear';
import { SlotIcon, StatIcon } from '../Img';
import { Sheet } from '../Sheet';
import { SubPicker } from '../eval/SubPicker';

const buildOf = (c: Char, key: string) => c.builds.find((b) => buildKey(c.id, b.name) === key)?.name ?? key;

function pieceName(ctx: Ctx, p: Piece): string {
  if (p.setId) return `${ctx.idx.SET[p.setId]?.short ?? p.setId} Set`;
  const it = p.itemKey ? ctx.idx.ITEM[p.slot as GearKind][p.itemKey] : undefined;
  return [it?.name ?? (p.grade === 'rare' ? 'Epic' : ''), p.main].filter(Boolean).join(' · ');
}

export function BuildGear({ c, b, ctx, gear, active }: { c: Char; b: Build; ctx: Ctx; gear: GearApi; active: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<SlotId | null>(null);
  // ушли с вкладки («← Оценка», #slug, «назад») — карточка вещи закрывается, а не висит поверх «Оценки»
  useEffect(() => { if (!active) setOpen(null); }, [active]);
  const st = gear.store;
  const key = buildKey(c.id, b.name);
  const slots = st.builds[key]?.slots ?? {};
  const n = Object.keys(slots).length;
  // сколько вещей каждого сета из связок билда
  const count: Record<string, number> = {};
  for (const [slot, id] of Object.entries(slots)) if (isArmor(slot as SlotId) && st.pieces[id]?.setId) count[st.pieces[id].setId!] = (count[st.pieces[id].setId!] ?? 0) + 1;
  const combo = b.sets.find((cb) => cb.every((p) => (count[p.set] ?? 0) >= p.n)) ?? b.sets.find((cb) => cb.some((p) => count[p.set])) ?? null;
  // «Взять из Speed»: этот слот пуст, а в другом собираемом билде персонажа есть вещь, которая этому билду подходит
  const takeFrom = (slot: SlotId) => {
    for (const other of c.builds) {
      if (other === b) continue;
      const id = st.builds[buildKey(c.id, other.name)]?.slots[slot];
      const p = id ? st.pieces[id] : undefined;
      if (p && (!p.setId || b.sets.some((cb) => cb.some((x) => x.set === p.setId)))) return { id: p.id, build: other.name };
    }
    return null;
  };
  const piece = open ? st.pieces[slots[open] ?? ''] : undefined;
  return (
    <div className="bgear">
      <h4>{t.ui.gearTitle(n)}</h4>
      {!n ? <p className="muted small">{t.ui.gearNone}</p> : (
        <>
          {combo && <p className="bgear-set">{combo.map((p) => t.ui.gearSet(ctx.idx.SET[p.set]?.short ?? p.set, count[p.set] ?? 0, p.n)).join(' · ')}</p>}
          <ul className="bgear-list">
            {SLOTS.map(({ id: slot }) => {
              const p = st.pieces[slots[slot] ?? ''];
              if (!p) {
                const take = takeFrom(slot);
                return (
                  <li key={slot} className="bgear-empty">
                    <SlotIcon slot={slot} /><span>{t.ui.slotNames[slot]}</span>
                    {take && <button type="button" className="btn small" onClick={() => gear.set(share(st, key, slot, take.id))}>{t.ui.gearTake(take.build)}</button>}
                  </li>
                );
              }
              const W = subWeights(ctx, b, c, itemMains(ctx.idx, pieceInput(p)));
              const done = reforgesDone(p);
              return (
                <li key={slot}>
                  <button type="button" className="bgear-row" onClick={() => setOpen(slot)}>
                    <SlotIcon slot={slot} />
                    <span className="bgear-n"><span className={`gl ${p.grade === 'unique' ? 'L' : 'E'}`}>{p.grade === 'unique' ? 'L' : 'E'}</span>{pieceName(ctx, p)}</span>
                    <span className="bgear-m">{p.bt === null ? 'T?' : 'T' + p.bt}{done < 6 && <> · Reforge {done}/6</>}</span>
                    <span className="bgear-t">
                      {Object.keys(p.lit).map((k) => {
                        const cr = W.get(k)?.credit ?? 0;
                        return <span key={k} className={`tok${cr >= 1 ? ' ok' : cr > 0 ? ' half' : ''}`}>{subLabel(k)}<i>{p.lit[k]}</i></span>;
                      })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {active && open && piece && <PieceSheet c={c} b={b} bkey={key} slot={open} p={piece} ctx={ctx} gear={gear} onClose={() => setOpen(null)} />}
    </div>
  );
}

// карточка вещи — одна шторка, окно выбора стата внутри неё (вложенные шторки закрывались бы одним Esc)
function PieceSheet({ c, b, bkey, slot, p, ctx, gear, onClose }: {
  c: Char; b: Build; bkey: string; slot: SlotId; p: Piece; ctx: Ctx; gear: GearApi; onClose: () => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<string | 'fourth' | null>(null);
  const st = gear.store;
  const put = (patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>) => gear.set(updatePiece(st, p.id, patch));
  const others = usedIn(st, p.id).filter((k) => k !== bkey).map((k) => buildOf(c, k));
  const keys = Object.keys(p.lit);
  const { blocked } = itemMains(ctx.idx, pieceInput(p));
  const title = t.ui.pieceTitle(t.ui.slotNames[slot], c.name, b.name);
  if (pick) {
    return (
      <Sheet title={pick === 'fourth' ? t.ui.fourthSheet : t.ui.replaceSub(subLabel(pick))} onClose={() => setPick(null)}>
        <SubPicker ctx={ctx} subs={p.yellow} blocked={blocked} editing={pick === 'fourth' ? null : pick} noMove
          onPick={(k) => { if (pick === 'fourth') put(addFourth(p, k)); else if (k !== pick) put(replaceStat(p, pick, k)); setPick(null); }} />
      </Sheet>
    );
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="piece">
        <p className="piece-n"><span className={`gl ${p.grade === 'unique' ? 'L' : 'E'}`}>{p.grade === 'unique' ? 'L' : 'E'}</span> {pieceName(ctx, p)}</p>
        {others.length > 0 && <p className="muted small">{t.ui.gearShared(others.join(', '))}</p>}
        <div className="subrows">
          {keys.map((k) => (
            <div key={k} className="subrow">
              <button type="button" className="pick subkey" onClick={() => setPick(k)} aria-label={t.ui.subReplace(subLabel(k))}>
                <StatIcon stat={k} /><span className="lab">{subLabel(k)}</span>
              </button>
              <span className="roll-b seg6" role="group" aria-label={subLabel(k)}>
                {Array.from({ length: MAX_LIT }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={n <= p.yellow[k] ? 'y' : n <= p.lit[k] ? 'o' : undefined}
                    aria-pressed={n <= p.lit[k]} onClick={() => put(tapSegment(p, k, n))}>{n}</button>
                ))}
              </span>
            </div>
          ))}
          {p.grade === 'rare' && keys.length === MAX_SUBS - 1 && <button type="button" className="subadd" onClick={() => setPick('fourth')}>+ {t.ui.addFourth}</button>}
        </div>
        <p className="muted small">{t.ui.pieceSegHint}</p>
        <p className="small">{t.ui.pieceReforge(reforgesDone(p))}</p>
        <div className="seg piece-bt" role="group" aria-label="Breakthrough">
          <span className="muted small">Breakthrough</span>
          {([0, 1, 2, 3, 4] as Bt[]).map((n) => (
            <button key={n} type="button" className="fbtn" aria-pressed={p.bt === n} onClick={() => put({ bt: p.bt === n ? null : n })}>T{n}</button>
          ))}
          {p.bt === null && <span className="muted small">{t.ui.pieceBtUnknown}</span>}
        </div>
        <p className="muted small">{t.ui.pieceStatHint}</p>
        <div className="piece-act">
          <button type="button" className="btn primary" onClick={onClose}>{t.ui.pieceDone}</button>
          <button type="button" className="btn" onClick={() => { gear.set(unequip(st, bkey, slot)); onClose(); }}>{t.ui.pieceRemove}</button>
        </div>
      </div>
    </Sheet>
  );
}
