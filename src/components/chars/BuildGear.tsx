// Что надето в билде персонажа (logic/gear): 6 слотов, у вещи — сабстаты с сегментами, окрашенные по цепочке этого
// билда, Breakthrough и сколько Reforge сделано. Нажатие на вещь — карточка вещи: оранжевые сегменты после Reforge,
// Breakthrough, смена стата после Transistone (и его жёлтых), «Снять». Вещь в билд кладёт только вердикт («Надеть на…»);
// «Собрать билд», «Примерить» (пустой слот) и «Примерить замену» (вещь) открывают оценку в примерке для этого билда.
import { useEffect, useState } from 'react';
import { GRADE_NAME, SLOT, SLOTS, isArmor, subLabel } from '../../data';
import type { Build, Char, GearKind, SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import {
  addFourth, buildKey, MAX_LIT, moveBuild, orphanBuilds, pieceInput, reforgeScale, replaceStat, setYellow, share, tapSegment, unequip, updatePiece, usedIn,
  type Bt, type Piece,
} from '../../logic/gear';
import { itemMains } from '../../logic/mains';
import { t4Only } from '../../logic/builds';
import { subWeights } from '../../logic/score';
import { fits, lookFor, pieceValue } from '../../logic/vs';
import { MAX_SUBS } from '../../logic/subs';
import type { GearApi } from '../../state/useGear';
import { SlotIcon, StatIcon } from '../Img';
import { tour, tourItem } from '../../tour/anchors';
import { Sheet } from '../Sheet';
import { SubPicker } from '../eval/SubPicker';

// имя билда по ключу; прежний (его нет в данных) — тоже по имени, без id персонажа
const buildOf = (c: Char, key: string) => c.builds.find((b) => buildKey(c.id, b.name) === key)?.name ?? key.slice(c.id.length + 1);

// название вещи и main отдельно: на узком экране обрезается название, а main (DEF% у оружия) остаётся виден
function PieceName({ ctx, p }: { ctx: Ctx; p: Piece }) {
  const name = p.setId
    ? `${ctx.idx.SET[p.setId]?.short ?? p.setId} Set`
    : (p.itemKey ? ctx.idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? (p.grade === 'rare' ? 'Epic' : '');
  const main = p.setId ? null : p.main;
  return (
    <>
      <span className={`gl ${p.grade === 'unique' ? 'L' : 'E'}`}>{p.grade === 'unique' ? 'L' : 'E'}</span>
      {name && <span className="pn">{name}</span>}
      {main && <span className="pm">{name ? '· ' : ''}{main}</span>}
    </>
  );
}

// onTryOn — примерка для этого билда (App): слот и сет подставятся на форму; нет — во время обучения и у новой версии
// onPieceOpen — открыта ли карточка вещи (для тура «Экипировка»)
export function BuildGear({ c, b, ctx, gear, active, onTryOn, onPieceOpen }: {
  c: Char; b: Build; ctx: Ctx; gear: GearApi; active: boolean; onTryOn?: (b: Build, slot?: SlotId, from?: Piece) => void;
  onPieceOpen?: (open: boolean) => void;
}) {
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
  // собран Speed ×2 (бонус только на T4) — какой Breakthrough у его вещей: самый низкий, не указан — null
  const lowBt = (set: string): number | null => {
    const bts = Object.entries(slots).filter(([sl]) => isArmor(sl as SlotId)).map(([, id]) => st.pieces[id]).filter((p) => p?.setId === set).map((p) => p!.bt);
    return bts.some((x) => x === null) ? null : Math.min(...(bts as number[]));
  };
  const setLine = (p: { set: string; n: number }) => {
    const name = ctx.idx.SET[p.set]?.short ?? p.set, have = count[p.set] ?? 0;
    if (have < p.n || !t4Only(ctx.idx.SET[p.set], p.n)) return t.ui.gearSet(name, have, p.n);
    const bt = lowBt(p.set);
    return bt === 4 ? t.ui.gearSet(name, have, p.n) : t.ui.gearSetT4(name, p.n, bt);
  };
  // «Взять из Speed»: этот слот пуст, а в другом собираемом билде персонажа есть вещь, которая этому билду подходит
  // (сет из его связок; оружие и аксессуар — с main, который этот билд просит)
  const takeFrom = (slot: SlotId) => {
    for (const other of c.builds) {
      if (other === b) continue;
      const id = st.builds[buildKey(c.id, other.name)]?.slots[slot];
      const p = id ? st.pieces[id] : undefined;
      if (p && fits(ctx, b, pieceInput(p))) return { id: p.id, build: other.name };
    }
    return null;
  };
  const piece = open ? st.pieces[slots[open] ?? ''] : undefined;
  const shownPiece = active && !!open && !!piece;
  useEffect(() => { onPieceOpen?.(shownPiece); }, [shownPiece]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPieceOpen?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  // «Слабее всех»: вся броня надета — самая слабая по ценности для билда (как в сравнении) и что ей искать
  const armor = SLOTS.filter((x) => isArmor(x.id)).map((x) => ({ slot: x.id, p: st.pieces[slots[x.id] ?? ''] }));
  const weak = n > 0 && armor.every((x) => x.p)
    ? armor.map((x) => ({ ...x, v: pieceValue(ctx, c, b, x.p!) })).reduce((a, z) => (z.v < a.v ? z : a))
    : null;
  const look = weak ? lookFor(ctx, c, b, weak.p!) : [];
  // другие билды персонажа, где ничего не надето: вердикт для них вещей не просит
  const idle = n > 0 ? c.builds.filter((x) => x !== b && !st.builds[buildKey(c.id, x.name)]).map((x) => x.name) : [];
  const orphans = gear.newer ? [] : orphanBuilds(st, c.id, c.builds.map((x) => x.name));
  return (
    <div className="bgear" {...tour('bgear')}>
      <h4>{t.ui.gearTitle(n)}</h4>
      {orphans.map((o) => (
        <p key={o.key} className="bgear-old">
          <span>{t.ui.gearOld(o.name, o.n)}</span>
          <button type="button" className="btn small" onClick={() => gear.set(moveBuild(st, o.key, key))}>{t.ui.gearMove}</button>
        </p>
      ))}
      {gear.newer ? <p className="muted small">{t.ui.gearNewer}</p> : !n ? (
        <div className="bgear-none">
          <p>{t.tryon.empty(b.name, c.name)}</p>
          {onTryOn && <button type="button" className="btn primary" onClick={() => onTryOn(b)} {...tour('gtry')}>{t.tryon.build}</button>}
          <p className="muted small">{t.tryon.emptyOr}</p>
        </div>
      ) : (
        <>
          {combo && <p className="bgear-set">{combo.map(setLine).join(' · ')}</p>}
          <ul className="bgear-list" {...tour('gslots')}>
            {SLOTS.map(({ id: slot }) => {
              const p = st.pieces[slots[slot] ?? ''];
              if (!p) {
                const take = takeFrom(slot);
                return (
                  <li key={slot} className="bgear-empty">
                    <SlotIcon slot={slot} /><span>{t.ui.slotNames[slot]}</span>
                    <span className="bgear-act">
                      {take && <button type="button" className="btn small" onClick={() => gear.set(share(st, key, slot, take.id))}>{t.ui.gearTake(take.build)}</button>}
                      {onTryOn && <button type="button" className="btn small" onClick={() => onTryOn(b, slot)} {...tour('gtry')}>{t.tryon.slot}</button>}
                    </span>
                  </li>
                );
              }
              const W = subWeights(ctx, b, c, itemMains(ctx.idx, pieceInput(p)));
              const rf = reforgeScale(p);
              return (
                <li key={slot}>
                  <button type="button" className="bgear-row" onClick={() => setOpen(slot)} {...tourItem(slot)}>
                    <SlotIcon slot={slot} />
                    <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                    <span className="bgear-m">{p.bt === null ? 'T?' : 'T' + p.bt}{rf.done < rf.of && <> · Reforge {rf.done}/{rf.of}</>}</span>
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
          {weak && (
            <div className="bgear-weak">
              <p>
                {t.ui.weakest(t.ui.slotNom[weak.slot], GRADE_NAME[weak.p!.grade], weak.p!.bt)}
                {look.length > 0 && weak.p!.setId && <> {t.ui.weakestLook(`${ctx.idx.SET[weak.p!.setId]?.short ?? ''} ${SLOT[weak.slot].game}`, look.map(subLabel))}</>}
              </p>
              {onTryOn && <button type="button" className="btn small" onClick={() => onTryOn(b, weak.slot, weak.p)}>{t.ui.weakestTry}</button>}
            </div>
          )}
          {idle.length > 0 && <p className="muted small">{t.ui.gearIdle(idle.join(', '))}</p>}
        </>
      )}
      {active && open && piece && <PieceSheet c={c} b={b} bkey={key} slot={open} p={piece} ctx={ctx} gear={gear} onClose={() => setOpen(null)}
        onTry={onTryOn && (() => { setOpen(null); onTryOn(b, open, piece); })} />}
    </div>
  );
}

// карточка вещи — одна шторка, окно выбора стата внутри неё (вложенные шторки закрывались бы одним Esc)
function PieceSheet({ c, b, bkey, slot, p, ctx, gear, onClose, onTry }: {
  c: Char; b: Build; bkey: string; slot: SlotId; p: Piece; ctx: Ctx; gear: GearApi; onClose: () => void; onTry?: () => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<string | 'fourth' | null>(null);
  // Transistone / опечатка: выбран стат (from → to, может быть тот же) — теперь сколько у него жёлтых
  const [swap, setSwap] = useState<{ from: string; to: string } | null>(null);
  const st = gear.store;
  const put = (patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>) => gear.set(updatePiece(st, p.id, patch));
  const others = usedIn(st, p.id).filter((k) => k !== bkey).map((k) => buildOf(c, k));
  const keys = Object.keys(p.lit);
  const { blocked } = itemMains(ctx.idx, pieceInput(p));
  // в заголовке — слот и билд: длинное имя персонажа (Kitsune of Eternity Tamamo-no-Mae) отрезало бы билд; имя — в теле
  const title = t.ui.pieceTitle(t.ui.slotNames[slot], b.name);
  if (swap) {
    const orange = p.lit[swap.from] - p.yellow[swap.from];
    const done = (n: number) => { put(setYellow(replaceStat(p, swap.from, swap.to), swap.to, n)); setSwap(null); };
    return (
      <Sheet title={t.ui.yellowSheet(subLabel(swap.to))} onClose={() => setSwap(null)}>
        <div className="piece">
          <div className="seg piece-bt" role="group" aria-label={t.ui.yellowSheet(subLabel(swap.to))}>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" className="fbtn" aria-pressed={swap.from === swap.to && p.yellow[swap.from] === n}
                disabled={n + orange > MAX_LIT} onClick={() => done(n)}>{n}</button>
            ))}
          </div>
          <p className="muted small">{t.ui.yellowNote(orange)}</p>
          <p className="muted small">{t.ui.yellow4}</p>
        </div>
      </Sheet>
    );
  }
  if (pick) {
    return (
      <Sheet title={pick === 'fourth' ? t.ui.fourthSheet : t.ui.replaceSub(subLabel(pick))} onClose={() => setPick(null)}>
        <SubPicker ctx={ctx} subs={p.yellow} blocked={blocked} editing={pick === 'fourth' ? null : pick} noMove
          onPick={(k) => { if (pick === 'fourth') put(addFourth(p, k)); else setSwap({ from: pick, to: k }); setPick(null); }} />
      </Sheet>
    );
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="piece" {...tour('gpiece')}>
        <p className="piece-n"><PieceName ctx={ctx} p={p} /></p>
        <p className="muted small">{c.name}</p>
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
                    aria-pressed={n <= p.lit[k]} aria-label={t.ui.segLabel(n, n <= p.yellow[k] ? 'y' : n <= p.lit[k] ? 'o' : '')}
                    onClick={() => put(tapSegment(p, k, n))}>{n}</button>
                ))}
              </span>
            </div>
          ))}
          {p.grade === 'rare' && keys.length === MAX_SUBS - 1 && <button type="button" className="subadd" onClick={() => setPick('fourth')}>+ {t.ui.addFourth}</button>}
        </div>
        <p className="muted small">{t.ui.pieceSegHint}</p>
        {p.grade === 'rare' && keys.length === MAX_SUBS - 1 && <p className="muted small">{t.ui.pieceNoFourth}</p>}
        <p className="small">{t.ui.pieceReforge(reforgeScale(p).done, reforgeScale(p).of)}</p>
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
          {onTry && <button type="button" className="btn" onClick={onTry} {...tourItem('try')}>{t.tryon.replace}</button>}
          <button type="button" className="btn" onClick={() => { gear.set(unequip(st, bkey, slot)); onClose(); }}>{t.ui.pieceRemove}</button>
        </div>
      </div>
    </Sheet>
  );
}
