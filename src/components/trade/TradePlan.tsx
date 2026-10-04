// План обмена (.x/0040-trade/SPEC.md R6.3–R6.6, R8.4, R9, R10.4, R10.5; DESIGN «Экран плана»). Главное — какие вещи на
// ком должны быть: у героя — итоговая вещь каждого меняемого слота целиком (как в сборке билда: сет или предмет, main,
// сабстаты с уровнями, T4) — по ней и ищут в Change Gear; у оружия и аксессуара сабстат для Secondary и сортировки
// отмечен ↓ (R9.1). Под вещью — откуда взять («у Ноа», «в инвентаре», владелец 2026-10-04: строки «Искать» нет). Сначала получатели (в порядке выполнения), потом те, у кого забрали надетое: «▼ −13%», чем закрыта дыра или
// «нет: оружие» и что искать. Очки — комплект по мерилу героя; процент — R10.5. «Не брать» — пересчёт без этой вещи у этого
// героя. У получателя — билд мерила «Speed ▾»: шторка «Билд для X», смена — пересчёт. Изменений нет — «Менять нечего», переключатель и «Ок» (R6.3).
import { GRADE_NAME, isArmor, subLabel } from '../../data';
import type { SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { hasBt, pieceInput, type GearStore } from '../../logic/gear';
import { itemMains } from '../../logic/mains';
import type { PoolView } from '../../logic/pool';
import { subWeights } from '../../logic/score';
import { keyOfHole, keyOfItem, type SearchKey } from '../../logic/trade/hint';
import type { HoleFill } from '../../logic/trade/holes';
import type { Move } from '../../logic/trade/moves';
import { gainOf, type HeroLine } from '../../logic/trade/view';
import { aimVariant } from '../../logic/trade/world';
import { SlotIcon, Img } from '../Img';
import { PieceName, btText, pieceText } from '../chars/BuildGear';


export interface Hint { heroes: string[]; gain: number }
type T = ReturnType<typeof useT>;

function keyText(t: T, ctx: Ctx, k: SearchKey): string {
  return [k.grade ? GRADE_NAME[k.grade] : t.trade.anyGrade, k.set && (ctx.idx.SET[k.set]?.short ?? k.set),
    k.main && subLabel(k.main), k.sub && t.trade.keySub(subLabel(k.sub)), k.t4 && 'T4'].filter(Boolean).join(' · ');
}

function gainText(t: T, l: HeroLine): { text: string; cls: string } {
  const g = gainOf(l.before, l.after);
  const text = g.kind === 'pts' ? t.trade.gainPts(g.n) : t.trade.gainPct(g.n);
  return { text, cls: g.n > 0 ? 'up' : g.n < 0 ? 'down' : '' };
}

export function TradePlan({ ctx, view, st, lines, fills, hint, empty, stale, pinOf, onPin, onSkip, onTake, onDone, onCancel, gaugeName, onAim }: {
  ctx: Ctx; view: PoolView; st: GearStore; lines: readonly HeroLine[]; fills: readonly HoleFill[]; hint: Hint | null | undefined;
  empty: boolean; stale: boolean; pinOf: (id: string) => boolean; onPin: (id: string, on: boolean) => void;
  onSkip: (item: string, hero: string) => void; onTake: (heroes: string[]) => void; onDone: () => void; onCancel: () => void;
  gaugeName: (id: string) => string; onAim: (id: string) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const name = (id: string) => idx.CHAR[id]?.name ?? id;
  const breaks = new Map(fills.map((f) => [`${f.hero}:${f.slot}`, f.breaks]));
  const from = (m: Move) => (m.from.kind === 'worn' ? t.trade.fromWorn(name(m.from.hero))
    : m.from.kind === 'stock' ? t.trade.fromStock(name(m.from.hero)) : t.trade.fromInventory);

  const moveRow = (m: Move) => {
    const p = st.pieces[m.item], c = idx.CHAR[m.hero];
    const v = c && aimVariant(ctx, view, st, m.hero);
    if (!p || !c) return null;
    const W = v ? subWeights(ctx, v.b, c, itemMains(idx, pieceInput(p))) : null;
    // оружие и аксессуар: Primary — main в названии, Secondary (и сортировка) — отмечен ↓ среди сабстатов; броню ищут по сету
    const sort = v && !isArmor(p.slot) ? keyOfItem(ctx, c, v.b, p).sub : null;
    return (
      <li key={m.slot} className="tmove">
        <div className="bgear-row">
          <SlotIcon slot={m.slot} />
          <span className="bgear-n"><PieceName ctx={ctx} p={p} />{hasBt(p.slot, p.grade) && <span className="pm">· {btText(t, p.bt)}</span>}</span>
          <button type="button" className="linkbtn small tskip" onClick={() => onSkip(m.item, m.hero)}>{t.trade.skip}</button>
          <span className="bgear-t">
            {Object.keys(p.lit).map((k) => {
              const cr = W?.get(k)?.credit ?? 0;
              const s2 = k === sort;
              return <span key={k} className={`tok${cr >= 1 ? ' ok' : cr > 0 ? ' half' : ''}${s2 ? ' sort' : ''}`} title={s2 ? t.trade.sortTitle : undefined}>{subLabel(k)}{s2 && ' ↓'}<i>{p.lit[k]}</i></span>;
            })}
          </span>
          <span className="tsrc">{from(m)}</span>
        </div>
      </li>
    );
  };
  const holeRow = (hero: string, slot: SlotId, text: string) => {
    const c = idx.CHAR[hero], v = c && aimVariant(ctx, view, st, hero);
    return (
      <li key={slot} className="tmove thole">
        <p><SlotIcon slot={slot} /> {text}</p>
        {c && v && <p className="tkey">{t.trade.search} {keyText(t, ctx, keyOfHole(ctx, c, v.b, slot, breaks.get(`${hero}:${slot}`) ?? null))}</p>}
      </li>
    );
  };

  return (
    <div className="tplan">
      {stale && <p className="tstale" role="status">{t.trade.stale}</p>}
      {empty && <p className="tnothing">{t.trade.nothing}</p>}
      {lines.map((l) => {
        const g = gainText(t, l);
        const c = idx.CHAR[l.hero];
        const sets = [...l.on.map((p) => t.trade.setOn(idx.SET[p.set]?.short ?? p.set, p.n)), ...l.off.map((p) => t.trade.setOff(idx.SET[p.set]?.short ?? p.set, p.n))];
        const lost = l.receiver ? [] : l.emptied.map((s) => t.trade.noSlot(s));
        const shown = new Set(l.moves.map((m) => m.slot));
        return (
          <section key={l.hero} className={l.receiver ? 'tline to' : 'tline'}>
            <h4 className="tline-h">
              {c && <Img k={'face:' + c.icon} className="face" />}
              <span className="tline-n">{name(l.hero)}</span>
              {l.receiver && <button type="button" className="linkbtn small tline-g" onClick={() => onAim(l.hero)}>{gaugeName(l.hero)} ▾</button>}
              {(!empty || !l.receiver) && <span className={`tgain ${g.cls}`}>{g.text}</span>}
              {[...sets, ...lost].length > 0 && <span className="tline-s">{[...sets, ...lost].join(', ')}</span>}
            </h4>
            <ul className="tmoves">
              {l.moves.map(moveRow)}
              {l.receiver
                ? l.empty.filter((s) => !shown.has(s)).map((s) => holeRow(l.hero, s, t.trade.emptySlot(s)))
                : l.emptied.map((s) => holeRow(l.hero, s, t.trade.emptySlot(s)))}
            </ul>
            {l.gone.map((id) => st.pieces[id] && <p key={id} className="muted small">{t.trade.gone(pieceText(ctx, st.pieces[id]))}</p>)}
            {l.receiver && (
              <label className="toggle tpin">
                <input type="checkbox" checked={pinOf(l.hero)} onChange={(e) => onPin(l.hero, e.target.checked)} />
                {' '}{t.trade.pinAfter}
              </label>
            )}
          </section>
        );
      })}
      {hint && (
        <p className="thint">
          <span>{t.trade.pinnedBetter(hint.heroes.map(name).join(', '), hint.gain / 1000)}</span>
          <button type="button" className="btn small" onClick={() => onTake(hint.heroes)}>{t.trade.take}</button>
        </p>
      )}
      <div className="tact">
        <button type="button" className="btn primary" onClick={onDone}>{empty ? t.trade.ok : t.trade.done}</button>
        {!empty && <button type="button" className="btn" onClick={onCancel}>{t.trade.cancel}</button>}
      </div>
    </div>
  );
}
