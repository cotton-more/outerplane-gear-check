// План обмена (.x/0040-trade/SPEC.md R6.3–R6.6, R8.4, R9, R10.4, R10.5; DESIGN «Экран плана»). Главное — какие вещи на
// ком должны быть: у героя — итоговая вещь каждого меняемого слота целиком (как в сборке билда: сет или предмет, main,
// сабстаты с уровнями, T4) — по ней и ищут в Change Gear; у оружия и аксессуара сабстат для Secondary и сортировки
// отмечен ↓ (R9.1). Под вещью — откуда взять («у Ноа», «в инвентаре», владелец 2026-10-04: строки «Искать» нет). Только
// получатели, в порядке выполнения: тех, у кого забрали надетое, не показываем (владелец, 2026-10-04 и 2026-10-05). Очки —
// комплект по мерилу героя; процент — R10.5. «Не брать» — пересчёт без этой вещи у этого героя. У героя — билд мерила
// «Speed ▾» (как на карточке героя): шторка «Билд для X», смена — пересчёт. Изменений нет — «Менять нечего», переключатель
// и «Ок» (R6.3).
import { GRADE_NAME, isArmor, subLabel } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import { useT, type Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import { pieceInput, type GearStore } from '@/features/gear/model/gear';
import { hasBt } from '@/game/item/item';
import { itemMains } from '@/game/item/mains';
import type { PoolView } from '@/features/gear/pool';
import { subWeights } from '@/game/build/score';
import { keyOfHole, keyOfItem, type SearchKey } from '@/features/trade/model/hint';
import type { HoleFill } from '@/features/trade/model/holes';
import type { Move } from '@/features/trade/model/moves';
import { gainOf, type HeroLine } from '@/features/trade/model/view';
import { aimVariant } from '@/features/trade/model/world';
import { SlotIcon } from '@/game/icons/Img';
import { AimButton } from '@/features/worn/AimSheet';
import { PieceName, btText, pieceText } from '@/features/gear/ui/pieceText';
import { setName } from '@/game/set/setName';
import { heroName } from '@/game/hero/heroName';
import { HeroFace } from '@/game/hero/HeroFace';
import { SubToken } from '@/game/item/SubToken';
import { Toggle } from '@/shared/ui/Toggle';


export interface Hint { heroes: string[]; gain: number }
type T = Texts;

function keyText(t: T, ctx: Ctx, k: SearchKey): string {
  return [k.grade ? GRADE_NAME[k.grade] : t.trade.anyGrade, k.set && setName(ctx.idx, k.set),
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
  const name = (id: string) => heroName(idx, id);
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
              const s2 = k === sort;
              return <SubToken key={k} stat={k} lit={p.lit[k]} credit={W?.get(k)?.credit ?? 0} sort={s2} title={s2 ? t.trade.sortTitle : undefined} />;
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
        const sets = [...l.on.map((p) => t.trade.setOn(setName(idx, p.set), p.n)), ...l.off.map((p) => t.trade.setOff(setName(idx, p.set), p.n))];
        const shown = new Set(l.moves.map((m) => m.slot));
        return (
          <section key={l.hero} className="tline to">
            <h4 className="tline-h">
              {c && <HeroFace c={c} />}
              <span className="tline-n">{name(l.hero)}</span>
              <AimButton name={gaugeName(l.hero)} aria={t.ui.wornChangeAria(name(l.hero))} onClick={() => onAim(l.hero)} />
              {!empty && <span className={`tgain ${g.cls}`}>{g.text}</span>}
              {sets.length > 0 && <span className="tline-s">{sets.join(', ')}</span>}
            </h4>
            <ul className="tmoves">
              {l.moves.map(moveRow)}
              {l.empty.filter((s) => !shown.has(s)).map((s) => holeRow(l.hero, s, t.trade.emptySlot(s)))}
            </ul>
            {l.gone.map((id) => st.pieces[id] && <p key={id} className="muted small">{t.trade.gone(pieceText(ctx, st.pieces[id]))}</p>)}
            <Toggle className="tpin" checked={pinOf(l.hero)} onChange={(on) => onPin(l.hero, on)}>{t.trade.pinAfter}</Toggle>
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
