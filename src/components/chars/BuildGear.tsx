// Сборка варианта билда из вещей персонажа (GEARPOOL, logic/pool): 6 слотов, у вещи — сабстаты с сегментами,
// окрашенные по цепочке этого билда, и Breakthrough («T4», «T0–T3», «T?» — не указан); бонусы сетов с уровнем;
// «Собираю»; «Не хватает». Нажатие на вещь — карточка вещи (PieceSheet): узкая правка (Н1) — сегменты 1–6, «T4» у
// брони, 4-й сабстат у Epic с тремя; «Убрать у Caren». Вещь к персонажу кладёт только вердикт («Надеть на…»); «Собрать
// билд», «Примерить» (пустой слот) и «Примерить замену» (вещь) открывают оценку в примерке для этого варианта; на
// вкладке «По статам» — примерку «По статам» (туда встаёт то, что герой носит не по билду, находка 28).
import { useState } from 'react';
import { GRADE_NAME, SLOT, SLOTS, isArmor, subLabel, type Index } from '../../data';
import type { Build, Char, GearKind, SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { MAX_LIT, pieceInput, type Bt, type GearStore, type Piece, type PieceEdit } from '../../logic/gear';
import { itemMains } from '../../logic/mains';
import { t4Only } from '../../logic/builds';
import { tryOnPreset } from '../../logic/tryon';
import { subWeights } from '../../logic/score';
import { lookFor } from '../../logic/vs';
import { DROP_LEVEL, MAX_SUBS, levelCap, withinCap, type Subs } from '../../logic/subs';
import { isStats, markOfVariant, removeFrom, undoRemove, type Assembly, type CharPool, type PoolView } from '../../logic/pool';
import { badgeOf, whereUsed } from '../../logic/poolVs';
import { tierLabel, type BonusRow } from '../../logic/setBonus';
import { buildOfKey, type Variant } from '../../logic/variants';
import type { GearApi } from '../../state/useGear';
import { SlotIcon, StatIcon } from '../Img';
import { tour, tourItem } from '../../tour/anchors';
import { Sheet } from '../Sheet';
import { SubPicker } from '../eval/SubPicker';
import { BtChip } from '../eval/BtChip';

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

// Breakthrough вещи в строке: «T4»; «T0–T3» — ниже T4 (форма брони без «T4», В4); 1–3 — прежняя правка; «T?» — не указан
const btText = (t: ReturnType<typeof useT>, bt: Bt | null): string => (bt === null ? 'T?' : bt === 0 ? t.ui.btBelow : 'T' + bt);

// текст бонуса из данных: T4 — p2/p4, T0–T3 — p2base/p4base
export const bonusText = (idx: Index, r: BonusRow): string => {
  const s = idx.SET[r.set];
  return (r.n === 4 ? (r.tier === 'T4' ? s?.p4 : s?.p4base) : r.tier === 'T4' ? s?.p2 : s?.p2base) ?? '';
};

// Собираю: почему вариант собирается (или нет) — строка рядом с переключателем. Всё — по показанной раскладке, как чип
// и слоты. Собирается он потому, что часть связки можно собрать из пула, а раскладка ради статов её не взяла (Р1), —
// «— Speed ×2 собирается из вещей Caren, но сейчас выгоднее без неё»: «готова» противоречило бы слотам
export function wantWhy(t: ReturnType<typeof useT>, idx: Index, cp: CharPool, st: GearStore, v: Variant): string {
  if (!cp.inPlay.includes(v)) return t.ui.fillingOff;
  if (isStats(v)) return '';
  const a = cp.asm.get(v.key)!;
  if (a.need && a.progress === a.need) return t.ui.fillingWhy.done;
  const mark = markOfVariant(st.marks, v);
  if (mark === 'want') return (st.v1builds as Record<string, unknown> | undefined)?.[v.parentKey] ? t.ui.fillingWhy.prev : '';
  if (a.complete.length) return t.ui.fillingHalf(`${idx.SET[a.complete[0].set]?.short ?? a.complete[0].set} ×${a.complete[0].n}`);
  const reach = cp.reach.get(v.key) ?? a;
  if (reach !== a) {
    const part = reach.complete.find((p) => !a.complete.some((q) => q.set === p.set));
    return part ? t.ui.fillingReach(`${idx.SET[part.set]?.short ?? part.set} ×${part.n}`, cp.c.name) : '';
  }
  // начат (Р14), но не ближе всех — строки нет: «ближе всех» было бы неправдой
  const top = Math.max(0, ...cp.inPlay.filter((x) => !isStats(x)).map((x) => (cp.reach.get(x.key) ?? cp.asm.get(x.key)!).progress));
  return a.progress && a.progress === top ? t.ui.fillingWhy.closest : '';
}

// onTryOn — примерка этого варианта (App): слот и сет подставятся на форму; нет — во время обучения и у новой версии.
// У «По статам» b — его билд (имя STATS): примерка «По статам», а не родителя.
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
  const try_ = onTryOn && ((slot?: SlotId, from?: Piece) => onTryOn(stats ? v.b : v.parent, slot, from, v.sig));
  const setName = (id: string) => idx.SET[id]?.short ?? id;
  // бонусы: все активные с уровнем; «T?» — отметь Breakthrough; сет не из связки — бонус всё равно считается
  const bonusLines = a.bonuses.map((r) => {
    const tier = r.unknownBt ? 'T?' : tierLabel(r.tier);
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
    const others = whereUsed(view, c.id, id).filter((x) => x.key !== v.key && !x.dupOf).map((x) => (isStats(x) ? t.ui.byStatsQ : x.name));
    return others.length ? t.ui.slotAlsoIn(others.join(', ')) : '';
  };
  if (gear.newer) return <div className="bgear" {...tour('bgear')}><p className="muted small">{t.ui.gearNewer}</p></div>;
  if (!cp.pieces.length) {
    return (
      <div className="bgear" {...tour('bgear')}>
        <div className="bgear-none" {...(stats ? tour('stats') : {})}>
          <p>{stats ? t.tryon.emptyStats(c.name) : t.tryon.empty(v.name, c.name)}</p>
          {try_ && <button type="button" className="btn primary" onClick={() => try_()}>{t.tryon.build}</button>}
          {!stats && <p className="muted small">{t.tryon.emptyOr}</p>}
        </div>
      </div>
    );
  }
  // «Не хватает: вещи … Set — первая же начнёт билд» — только пока «По статам» живой (ни один билд не начат)
  const statsNeed = stats && cp.statLive && !!first;
  return (
    <div className="bgear" {...tour('bgear')}>
      <h4 {...(stats ? tour('stats') : {})}>{t.ui.gearTitle(n)}</h4>
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
                  {try_ && <button type="button" className="btn small" onClick={() => try_(slot)} {...tour('gtry')}>{t.tryon.slot}</button>}
                </span>
              </li>
            );
          }
          const W = subWeights(ctx, b, c, itemMains(idx, pieceInput(p)));
          const mark = [isArmor(slot) && a.roles[slot] === 'filler' && !stats ? t.ui.slotOffSet : '', where(p.id)].filter(Boolean).join(' · ');
          return (
            <li key={slot}>
              <button type="button" className="bgear-row" onClick={() => onOpenPiece(p.id)} {...tourItem(slot)}>
                <SlotIcon slot={slot} />
                <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                <span className="bgear-m">{btText(t, p.bt)}</span>
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
      {(missing.length > 0 || statsNeed) && (
        <div className="bgear-need">
          {statsNeed && first ? <p>{t.ui.missingStats(setName(first.set), c.builds[0].name)}</p> : missing.map((m, i) => <p key={i}>{m}</p>)}
          {try_ && free.length > 0 && <button type="button" className="btn small" onClick={() => try_(free[0])}>{t.tryon.slot}</button>}
        </div>
      )}
    </div>
  );
}

// Карточка вещи — узкая правка (Н1): сегменты сабстатов 1–6 одним цветом (нажатие ставит уровень, на текущий — на
// один меньше, не ниже 1), «T4» у брони, «+ 4-й сабстат» у Epic с тремя (уровень 1, В-А2). Стат не меняется:
// Transistone — ввести вещь заново (pieceEditNote). Нажатие, с которым сумма уровней ушла бы выше предела грейда
// (logic/subs levelCap), не срабатывает — строка «больше N не бывает», как на форме (SubRows); уходит со следующей
// правкой. Правку делает onEdit (CharDetail: gear updateIn — у этого героя, общая запись делится, шторка идёт за новым
// id). Кнопки уровня — как на форме: 5–6 (после Reforge) узкие. Окно выбора 4-го — внутри этой же шторки (вложенные
// закрывались бы одним Esc). «Убрать у Caren» — только из её вещей (пулы независимы, В9); onRemoved — сообщение с «Вернуть»
export function PieceSheet({ c, p, ctx, gear, view, onClose, onEdit, onTry, onRemoved }: {
  c: Char; p: Piece; ctx: Ctx; gear: GearApi; view: PoolView; onClose: () => void; onEdit: (patch: PieceEdit) => void; onTry?: () => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
}) {
  const t = useT();
  const [fourth, setFourth] = useState(false);
  const [capAt, setCapAt] = useState<Subs | null>(null); // на каких уровнях нажатие упёрлось в предел
  const keys = Object.keys(p.lit);
  const { blocked } = itemMains(ctx.idx, pieceInput(p));
  const builds = [...new Set(whereUsed(view, c.id, p.id).map((v) => buildOfKey(v.key, t.ui.byStatsQ)))];
  const edit = (lit: Subs, patch: PieceEdit) => {
    if (!withinCap(p.grade, p.lit, lit)) { setCapAt(p.lit); return; }
    onEdit(patch);
  };
  const tap = (k: string, n: number) => {
    const to = n === p.lit[k] ? Math.max(1, n - 1) : n;
    if (to !== p.lit[k]) edit({ ...p.lit, [k]: to }, { lit: { [k]: to } });
  };
  const remove = () => {
    gear.set(removeFrom(gear.store, c.id, p.id));
    onRemoved?.(t.ui.removedFrom(c.name), '', (x) => undoRemove(x, p, [c.id]));
    onClose();
  };
  const canFourth = p.grade === 'rare' && keys.length === MAX_SUBS - 1;
  // в заголовке — слот и персонаж; билды — строкой в теле
  const title = t.ui.pieceTitle(t.ui.slotNames[p.slot], c.name);
  if (fourth) {
    return (
      <Sheet title={t.ui.fourthSheet} onClose={() => setFourth(false)}>
        <SubPicker ctx={ctx} subs={p.lit} blocked={blocked} editing={null}
          onPick={(k) => { edit({ ...p.lit, [k]: 1 }, { add: k }); setFourth(false); }} />
      </Sheet>
    );
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="piece" {...tour('gpiece')}>
        <div className="piece-top">
          <p className="piece-n"><PieceName ctx={ctx} p={p} /></p>
          {isArmor(p.slot) && <BtChip anchor={false} on={p.bt === 4} onToggle={() => onEdit({ bt: p.bt === 4 ? 0 : 4 })} />}
        </div>
        <p className="muted small">{builds.length ? t.ui.poolIn(builds.join(', ')) : t.ui.pieceNowhere}</p>
        <div className="subrows">
          {keys.map((k) => (
            <div key={k} className="subrow">
              <span className="subkey"><StatIcon stat={k} /><span className="lab">{subLabel(k)}</span></span>
              <span className="roll-b" role="group" aria-label={subLabel(k)}>
                {Array.from({ length: MAX_LIT }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" aria-pressed={p.lit[k] === n} className={[n < p.lit[k] && 'lit', n > DROP_LEVEL && 'after'].filter(Boolean).join(' ') || undefined}
                    aria-label={t.ui.segLabel(n)} title={n > DROP_LEVEL ? t.ui.segAfter : undefined} onClick={() => tap(k, n)}>{n}</button>
                ))}
              </span>
            </div>
          ))}
          {canFourth && <button type="button" className="subadd" onClick={() => setFourth(true)}>+ {t.ui.addFourth}</button>}
          {capAt === p.lit && <p className="seg-cap" role="status">{t.ui.segCap(levelCap(p.grade))}</p>}
        </div>
        <p className="muted small">{t.ui.pieceEditNote(c.name)}</p>
        <div className="piece-act">
          <button type="button" className="btn primary" onClick={onClose}>{t.ui.pieceDone}</button>
          {onTry && <button type="button" className="btn" onClick={onTry} {...tourItem('try')}>{t.tryon.replace}</button>}
          <button type="button" className="btn" onClick={remove}>{t.ui.pieceRemove(c.name)}</button>
        </div>
        <p className="muted small">{t.ui.pieceRemoveNote(c.name)}</p>
      </div>
    </Sheet>
  );
}

