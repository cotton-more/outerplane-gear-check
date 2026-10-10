// План обмена (.x/0040-trade/SPEC.md R6.3–R6.6, R8.4, R9, R10.4; «было → станет» — MODEL.md §7 item 3). Главное —
// какие вещи на ком должны быть: у героя — итоговая вещь каждого меняемого слота целиком (как в сборке билда: сет или
// предмет, main, сабстаты с уровнями, T4) — по ней и ищут в Change Gear; у оружия и аксессуара сабстат для Secondary и
// сортировки отмечен ↓ (R9.1). Под вещью — откуда взять («у Ноа», «в инвентаре», владелец 2026-10-04: строки «Искать»
// нет). Только получатели, в порядке выполнения: тех, у кого забрали надетое, не показываем (владелец, 2026-10-04 и
// 2026-10-05). У героя — прирост ценности по заказу в очках, очки статов «было → станет» (упали — «станут слабее на N»),
// for each piece — how many points it gives against the worn one (for a recommended weapon or accessory — «пассивка лучше»),
// половины сетов, которые включатся и выключатся, и части заказа, которым не хватает вещей. Заказ «Заказ: … ▾» — шторка
// OrderSheet, смена — пересчёт. «Не брать» — пересчёт без этой вещи у этого героя. Изменений нет — «Менять нечего» и «Ок».
import { GRADE_NAME, isArmor, subLabel } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import { useT, type Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import { pieceInput, type GearStore } from '@/features/gear/model/gear';
import { itemMains } from '@/game/item/mains';
import { profileFor } from '@/game/build/profile';
import { subWeights } from '@/game/build/score';
import { keyOfHole, keyOfItem, type SearchKey } from '@/features/trade/model/hint';
import type { HoleFill } from '@/features/trade/model/holes';
import type { Move } from '@/features/trade/model/moves';
import type { Missing } from '@/features/trade/model/plan';
import type { HeroLine } from '@/features/trade/model/view';
import { SlotIcon } from '@/game/icons/Img';
import { PieceName, pieceText } from '@/features/gear/ui/pieceText';
import { partText, setName } from '@/game/set/setName';
import { HeroFace } from '@/game/hero/HeroFace';
import { SubToken } from '@/game/item/SubToken';
import { heroName, HeroName } from '@/game/hero/HeroName';
import { BtLabel } from '@/features/gear/ui/pieceText';
import { OrderButton } from './OrderSheet';

type T = Texts;
const pts = (m: number) => m / 1000;
// points the way the plan writes them (to tenths): «+0 очк.» and «слабее на 0 очк.» never occur (stage 10 review); halves round
// away from zero both ways, otherwise a gain of −1.05 read «−1» while «слабее на» read «1,1»
const tenths = (m: number) => Math.sign(m) * Math.round(Math.abs(m) / 100) / 10;

function keyText(t: T, ctx: Ctx, k: SearchKey): string {
  return [k.grade ? GRADE_NAME[k.grade] : t.trade.anyGrade, k.set && setName(ctx.idx, k.set),
    k.main && subLabel(k.main), k.sub && t.trade.keySub(subLabel(k.sub)), k.t4 && 'T4'].filter(Boolean).join(' · ');
}

function gainText(t: T, l: HeroLine): { text: string; cls: string } {
  const n = tenths(l.after - l.before);
  return { text: t.trade.gainPts(n), cls: n > 0 ? 'up' : n < 0 ? 'down' : '' };
}

export function TradePlan({ ctx, st, lines, fills, missing, empty, stale, onSkip, onDone, onCancel, orderName, onOrder }: {
  ctx: Ctx; st: GearStore; lines: readonly HeroLine[]; fills: readonly HoleFill[]; missing: Readonly<Record<string, readonly Missing[]>>;
  empty: boolean; stale: boolean; onSkip: (item: string, hero: string) => void; onDone: () => void; onCancel: () => void;
  orderName: (id: string) => string; onOrder: (id: string) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const name = (id: string) => heroName(idx, id);
  // у закреплённого — цепочка его билда (MODEL.md §0)
  const profile = (id: string) => (idx.CHAR[id] ? profileFor(ctx, idx.CHAR[id], st.pin?.[id]) : null);
  const breaks = new Map(fills.map((f) => [`${f.hero}:${f.slot}`, f.breaks]));
  const from = (m: Move) => (m.from.kind === 'worn' ? t.trade.fromWorn(name(m.from.hero))
    : m.from.kind === 'stock' ? t.trade.fromStock(name(m.from.hero)) : t.trade.fromInventory);

  // a piece's cost: points against the one worn in the slot; for a recommended weapon or accessory — «пассивка лучше»
  const worthRow = (l: HeroLine, m: Move) => {
    const v = l.worth[m.slot];
    if (!v) return null;
    const n = tenths(v.d);
    return (
      <span className={`tpts${n > 0 ? ' up' : n < 0 ? ' down' : ''}`}>
        {[t.trade.itemPts(n), v.passive && t.trade.passive].filter(Boolean).join(' · ')}
      </span>
    );
  };
  const moveRow = (l: HeroLine) => (m: Move) => {
    const p = st.pieces[m.item], P = profile(m.hero);
    if (!p || !P) return null;
    const W = subWeights(ctx, P.chain, P.c, itemMains(idx, pieceInput(p)));
    // оружие и аксессуар: Primary — main в названии, Secondary (и сортировка) — отмечен ↓ среди сабстатов; броню ищут по сету
    const sort = !isArmor(p.slot) ? keyOfItem(P, p).sub : null;
    return (
      <li key={m.slot} className="tmove">
        <div className="bgear-row">
          <SlotIcon slot={m.slot} />
          <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
          <button type="button" className="linkbtn small tskip" onClick={() => onSkip(m.item, m.hero)}>{t.trade.skip}</button>
          <span className="bgear-meta"><BtLabel p={p} />{worthRow(l, m)}<span className="tsrc">{from(m)}</span></span>
          <span className="bgear-t">
            {Object.keys(p.lit).map((k) => {
              const s2 = k === sort;
              return <SubToken key={k} stat={k} lit={p.lit[k]} credit={W.get(k)?.credit ?? 0} sort={s2} title={s2 ? t.trade.sortTitle : undefined} />;
            })}
          </span>
        </div>
      </li>
    );
  };
  const holeRow = (hero: string, slot: SlotId, text: string) => {
    const P = profile(hero);
    return (
      <li key={slot} className="tmove thole">
        <p><SlotIcon slot={slot} /> {text}</p>
        {P && <p className="tkey">{t.trade.search} {keyText(t, ctx, keyOfHole(P, slot, breaks.get(`${hero}:${slot}`) ?? null))}</p>}
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
        const sets = [...l.on.map((p) => t.trade.setOn(setName(idx, p.set), p.n)), ...l.off.map((p) => t.trade.setOff(setName(idx, p.set), p.n))];
        const drop = tenths(l.ptsBefore - l.ptsAfter) > 0;
        const shown = new Set(l.moves.map((m) => m.slot));
        return (
          <section key={l.hero} className="tline to">
            <h4 className="tline-h">
              {c && <HeroFace c={c} />}
              <span className="tline-n">{c ? <HeroName c={c} /> : name(l.hero)}</span>
              <OrderButton name={orderName(l.hero)} onClick={() => onOrder(l.hero)} />
              {!empty && <span className={`tgain ${g.cls}`}>{g.text}</span>}
              {!empty && (
                <span className={`tline-s${drop ? ' down' : ''}`}>
                  {drop ? t.trade.weaker(pts(l.ptsBefore - l.ptsAfter)) : t.trade.stats(pts(l.ptsBefore), pts(l.ptsAfter))}
                </span>
              )}
              {sets.length > 0 && <span className="tline-s">{sets.join(', ')}</span>}
            </h4>
            {(missing[l.hero] ?? []).map((m) => (
              <p key={m.part.set} className="tmiss">{m.t4 ? t.trade.needT4(partText(idx, m.part))
                : t.trade.missing(partText(idx, m.part), setName(idx, m.part.set), m.slots.map((s) => t.ui.slotNom[s]).join(', '))}</p>
            ))}
            <ul className="tmoves">
              {l.moves.map(moveRow(l))}
              {l.empty.filter((s) => !shown.has(s)).map((s) => holeRow(l.hero, s, t.trade.emptySlot(s)))}
            </ul>
            {l.gone.map((id) => st.pieces[id] && <p key={id} className="muted small">{t.trade.gone(pieceText(ctx, st.pieces[id]))}</p>)}
          </section>
        );
      })}
      <div className="tact">
        <button type="button" className="btn primary" onClick={onDone}>{empty ? t.trade.ok : t.trade.done}</button>
        {!empty && <button type="button" className="btn" onClick={onCancel}>{t.trade.cancel}</button>}
      </div>
    </div>
  );
}
