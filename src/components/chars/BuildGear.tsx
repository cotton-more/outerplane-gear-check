// Сборка варианта билда из вещей персонажа (GEARPOOL, logic/pool): 6 слотов, у вещи — сабстаты с сегментами,
// окрашенные по цепочке этого билда, Breakthrough и сколько Reforge сделано; бонусы сетов с уровнем; «Собираю»;
// «Не хватает». Нажатие на вещь — карточка вещи (PieceSheet): оранжевые сегменты после Reforge, Breakthrough, смена
// стата после Transistone, «Убрать у Caren». Вещь к персонажу кладёт только вердикт («Надеть на…»); «Собрать билд»,
// «Примерить» (пустой слот) и «Примерить замену» (вещь) открывают оценку в примерке для этого варианта.
import { useState } from 'react';
import { GRADE_NAME, SLOT, SLOTS, isArmor, subLabel, type Index } from '../../data';
import type { Build, Char, GearKind, SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import {
  addFourth, holdersOf, MAX_LIT, pieceInput, reforgeScale, replaceStat, setYellow, tapSegment, updatePiece, type Bt, type GearStore, type Piece,
} from '../../logic/gear';
import { itemMains } from '../../logic/mains';
import { t4Only } from '../../logic/builds';
import { tryOnPreset } from '../../logic/tryon';
import { subWeights } from '../../logic/score';
import { lookFor } from '../../logic/vs';
import { MAX_SUBS } from '../../logic/subs';
import { isStats, removeEverywhere, removeFrom, undoRemove, type Assembly, type CharPool, type PoolView } from '../../logic/pool';
import { badgeOf, whereUsed } from '../../logic/poolVs';
import type { BonusRow } from '../../logic/setBonus';
import { buildOfKey, type Variant } from '../../logic/variants';
import type { GearApi } from '../../state/useGear';
import { SlotIcon, StatIcon } from '../Img';
import { tour, tourItem } from '../../tour/anchors';
import { Sheet } from '../Sheet';
import { SubPicker } from '../eval/SubPicker';

const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];

// название вещи и main отдельно: на узком экране обрезается название, а main (DEF% у оружия) остаётся виден
export function PieceName({ ctx, p }: { ctx: Ctx; p: Piece }) {
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

// текст бонуса из данных: T4 — p2/p4, T0–T3 — p2base/p4base
export const bonusText = (idx: Index, r: BonusRow): string => {
  const s = idx.SET[r.set];
  return (r.n === 4 ? (r.tier === 'T4' ? s?.p4 : s?.p4base) : r.tier === 'T4' ? s?.p2 : s?.p2base) ?? '';
};

// Собираю: почему вариант собирается (или нет) — строка рядом с переключателем. Всё — по показанной раскладке, как чип
// и слоты. Собирается он потому, что часть связки можно собрать из пула, а раскладка ради статов её не взяла (Р1), —
// строки нет: «готова» противоречило бы слотам (достижимая больше выбранной, только если собирает часть)
export function wantWhy(t: ReturnType<typeof useT>, idx: Index, cp: CharPool, st: GearStore, v: Variant): string {
  if (!cp.inPlay.includes(v)) return t.ui.fillingOff;
  if (isStats(v)) return '';
  const a = cp.asm.get(v.key)!;
  if (a.need && a.progress === a.need) return t.ui.fillingWhy.done;
  const mark = st.marks?.[v.key] ?? st.marks?.[v.parentKey];
  if (mark === 'want') return (st.v1builds as Record<string, unknown> | undefined)?.[v.parentKey] ? t.ui.fillingWhy.prev : '';
  if (a.complete.length) return t.ui.fillingHalf(`${idx.SET[a.complete[0].set]?.short ?? a.complete[0].set} ×${a.complete[0].n}`);
  if ((cp.reach.get(v.key) ?? a) !== a) return '';
  return a.progress ? t.ui.fillingWhy.closest : '';
}

// onTryOn — примерка этого варианта (App): слот и сет подставятся на форму; нет — во время обучения и у новой версии.
// onOpenPiece — карточка вещи; onWant — переключатель «Собираю»
export function BuildGear({ c, v, cp, ctx, gear, view, onTryOn, onOpenPiece, onWant }: {
  c: Char; v: Variant; cp: CharPool; ctx: Ctx; gear: GearApi; view: PoolView;
  onTryOn?: (b: Build, slot?: SlotId, from?: Piece, combo?: string | null) => void; onOpenPiece: (id: string) => void; onWant: (v: Variant) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const a: Assembly = cp.asm.get(v.key)!;
  const b = v.b;
  const stats = isStats(v);
  const n = badgeOf(a);
  const on = cp.inPlay.includes(v);
  const combo = b.sets[0] ?? [];
  const try_ = onTryOn && ((slot?: SlotId, from?: Piece) => onTryOn(v.parent, slot, from, v.sig));
  const setName = (id: string) => idx.SET[id]?.short ?? id;
  // бонусы: все активные с уровнем; «T?» — отметь Breakthrough; сет не из связки — бонус всё равно считается
  const bonusLines = a.bonuses.map((r) => {
    const tier = r.unknownBt ? 'T?' : r.tier === 'T4' ? 'T4' : 'T0–T3';
    const own = combo.some((p) => p.set === r.set);
    return t.ui.bonusRow(setName(r.set), r.n, tier, bonusText(idx, r)) + (r.unknownBt ? t.ui.markBt : '') + (own ? '' : ` · ${t.ui.incidental(c.name)}`);
  });
  // часть связки с бонусом только на T4, а его нет: «Speed — 1 из 2 · бонус ×2 только на T4»
  const cnt = (set: string) => ARMOR.filter((sl) => a.slots[sl]?.setId === set).length;
  const t4Lines = combo.filter((p) => t4Only(idx.SET[p.set], p.n) && !a.bonuses.some((r) => r.set === p.set && r.n >= p.n))
    .map((p) => t.ui.partT4(setName(p.set), Math.min(cnt(p.set), p.n), p.n));
  // «Слабее всех»: вся броня занята — самая слабая по ценности (вещь не из связки слабее любой) и что ей искать
  const armor = ARMOR.map((slot) => ({ slot, e: a.slots[slot] }));
  const weak = !stats && armor.every((x) => x.e?.piece)
    ? armor.map((x) => ({ ...x, off: a.roles[x.slot] === 'filler', val: a.roles[x.slot] === 'filler' ? -1 : x.e!.v })).reduce((m, z) => (z.val < m.val ? z : m))
    : null;
  const wp = weak?.e?.piece ?? null;
  const look = wp ? lookFor(ctx, c, b, weak!.off ? { ...wp, lit: {} } : wp) : [];
  const lookSet = weak && wp ? tryOnPreset(view, { c, b: v.parent, v }, weak.slot, wp).setId : null;
  // «Не хватает»: части связки — куда (слоты не под этой связкой) и нужен ли T4. По достижимой сборке: того, что уже
  // есть в пуле, не просим, даже если раскладка ради статов его не взяла (Speed ×4 отдал слот Immunity-вещи)
  const reach = cp.reach.get(v.key) ?? a;
  const free = ARMOR.filter((sl) => reach.roles[sl] !== 'set');
  const missing = reach.missing.map((m) => t.ui.missing(setName(m.set), m.n - m.have, free as string[], t4Only(idx.SET[m.set], m.n)));
  const first = c.builds[0]?.sets[0]?.[0];
  const where = (id: string) => {
    const others = whereUsed(view, c.id, id).filter((x) => x.key !== v.key && !x.dupOf).map((x) => (isStats(x) ? t.ui.byStats : x.name));
    const with_ = holdersOf(gear.store, id).filter((h) => h !== c.id).map((h) => idx.CHAR[h]?.name ?? h);
    return [others.length ? t.ui.slotAlsoIn(others.join(', ')) : '', with_.length ? t.ui.slotAlsoWith(with_.join(', ')) : ''].filter(Boolean).join(' · ');
  };
  if (gear.newer) return <div className="bgear" {...tour('bgear')}><p className="muted small">{t.ui.gearNewer}</p></div>;
  if (!cp.pieces.length) {
    return (
      <div className="bgear" {...tour('bgear')}>
        <div className="bgear-none">
          <p>{t.tryon.empty(v.name, c.name)}</p>
          {try_ && <button type="button" className="btn primary" onClick={() => try_()}>{t.tryon.build}</button>}
          <p className="muted small">{t.tryon.emptyOr}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="bgear" {...tour('bgear')}>
      <h4>{t.ui.gearTitle(n)}</h4>
      {!stats && (
        <p className="want-row" {...tour('want')}>
          <button type="button" className="want-btn" aria-pressed={on} onClick={() => onWant(v)}>{t.ui.filling}</button>
          <span className="muted small">{wantWhy(t, idx, cp, gear.store, v)}</span>
        </p>
      )}
      {(bonusLines.length > 0 || t4Lines.length > 0) && (
        <div className="bgear-set">{[...bonusLines, ...t4Lines].map((l, i) => <p key={i}>{l}</p>)}</div>
      )}
      <ul className="bgear-list" {...tour('gslots')}>
        {SLOTS.map(({ id: slot }) => {
          const p = a.slots[slot]?.piece;
          if (!p) {
            return (
              <li key={slot} className="bgear-empty">
                <SlotIcon slot={slot} /><span>{t.ui.slotNames[slot]}</span>
                <span className="bgear-act">
                  {try_ && !stats && <button type="button" className="btn small" onClick={() => try_(slot)} {...tour('gtry')}>{t.tryon.slot}</button>}
                </span>
              </li>
            );
          }
          const W = subWeights(ctx, b, c, itemMains(idx, pieceInput(p)));
          const rf = reforgeScale(p);
          const mark = [isArmor(slot) && a.roles[slot] === 'filler' && !stats ? t.ui.slotOffSet : '', where(p.id)].filter(Boolean).join(' · ');
          return (
            <li key={slot}>
              <button type="button" className="bgear-row" onClick={() => onOpenPiece(p.id)} {...tourItem(slot)}>
                <SlotIcon slot={slot} />
                <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                <span className="bgear-m">{p.bt === null ? 'T?' : 'T' + p.bt}{rf.done < rf.of && <> · Reforge {rf.done}/{rf.of}</>}</span>
                <span className="bgear-t">
                  {Object.keys(p.lit).map((k) => {
                    const cr = W.get(k)?.credit ?? 0;
                    return <span key={k} className={`tok${cr >= 1 ? ' ok' : cr > 0 ? ' half' : ''}`}>{subLabel(k)}<i>{p.lit[k]}</i></span>;
                  })}
                </span>
                {mark && <span className="bgear-mark">{mark}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {weak && wp && (
        <div className="bgear-weak">
          <p>
            {t.ui.weakest(t.ui.slotNom[weak.slot], GRADE_NAME[wp.grade], wp.bt)}
            {look.length > 0 && lookSet && <> {t.ui.weakestLook(`${idx.SET[lookSet]?.short ?? ''} ${SLOT[weak.slot].game}`, look.map(subLabel))}</>}
          </p>
          {try_ && <button type="button" className="btn small" onClick={() => try_(weak.slot, wp)}>{t.ui.weakestTry}</button>}
        </div>
      )}
      {(missing.length > 0 || (stats && first)) && (
        <div className="bgear-need" {...(stats ? tour('stats') : {})}>
          {stats && first ? <p>{t.ui.missingStats(setName(first.set), c.builds[0].name)}</p> : missing.map((m, i) => <p key={i}>{m}</p>)}
          {try_ && !stats && free.length > 0 && <button type="button" className="btn small" onClick={() => try_(free[0])}>{t.tryon.slot}</button>}
        </div>
      )}
    </div>
  );
}

// карточка вещи — одна шторка, окно выбора стата внутри неё (вложенные шторки закрывались бы одним Esc).
// «Убрать у Caren» — только из её вещей; у общей вещи ещё «Разобрал — убрать у всех». onRemoved — сообщение с «Вернуть»
export function PieceSheet({ c, p, ctx, gear, view, onClose, onTry, onRemoved }: {
  c: Char; p: Piece; ctx: Ctx; gear: GearApi; view: PoolView; onClose: () => void; onTry?: () => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<string | 'fourth' | null>(null);
  // Transistone / опечатка: выбран стат (from → to, может быть тот же) — теперь сколько у него жёлтых
  const [swap, setSwap] = useState<{ from: string; to: string } | null>(null);
  const st = gear.store;
  const put = (patch: Partial<Pick<Piece, 'yellow' | 'lit' | 'bt'>>) => gear.set(updatePiece(st, p.id, patch));
  const keys = Object.keys(p.lit);
  const { blocked } = itemMains(ctx.idx, pieceInput(p));
  const holders = holdersOf(st, p.id);
  const others = holders.filter((h) => h !== c.id).map((h) => ctx.idx.CHAR[h]?.name ?? h);
  const builds = [...new Set(whereUsed(view, c.id, p.id).map((v) => buildOfKey(v.key, t.ui.byStats)))];
  const whereText = t.ui.pieceWhere(builds.join(', '), others.join(', '));
  const remove = (all: boolean) => {
    gear.set(all ? removeEverywhere(st, p.id) : removeFrom(st, c.id, p.id));
    onRemoved?.(t.ui.removedFrom(all ? [c.name, ...others].join(', ') : c.name), !all && others.length ? t.ui.stillWith(others.join(', ')) : '',
      (x) => undoRemove(x, p, all ? holders : [c.id]));
    onClose();
  };
  // в заголовке — слот и персонаж; билды — строкой в теле
  const title = t.ui.pieceTitle(t.ui.slotNames[p.slot], c.name);
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
        <p className="muted small">{whereText ? t.ui.gearShared(whereText) : t.ui.pieceNowhere}</p>
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
          <button type="button" className="btn" onClick={() => remove(false)}>{t.ui.pieceRemove(c.name)}</button>
          {others.length > 0 && <button type="button" className="btn bad" onClick={() => remove(true)}>{t.ui.pieceRemoveAll}</button>}
        </div>
        <p className="muted small">{t.ui.pieceRemoveNote(c.name)}</p>
      </div>
    </Sheet>
  );
}
