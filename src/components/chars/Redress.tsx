// Экран «Переодеть» («Надето», шаг 7): подвид карточки героя — что надеть из его вещей под выбранный билд (logic/wearing
// redressPlan): какие бонусы включатся и выключатся, «Надень из своих» («Надеть все» и «Надеть» у каждой, оружие и аксессуар
// тоже), «Снимешь», «Не хватает». Запись и тост с «Вернуть» — у родителя (CharDetail); onWear/onWearAll нет — только показ.
import type { ReactNode } from 'react';
import { subLabel } from '../../data';
import type { Char } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { hasBt, type Piece } from '../../logic/gear';
import { isStats } from '../../logic/pool';
import { tokensOf, type RedressPlan } from '../../logic/wearing';
import { SlotIcon } from '../Img';
import { PieceName, btText, pieceText } from './BuildGear';

export function Redress({ c, ctx, plan, onBack, onWear, onWearAll }: {
  c: Char; ctx: Ctx; plan: RedressPlan; onBack: () => void; onWear?: (id: string) => void; onWearAll?: (ids: string[]) => void;
}) {
  const t = useT();
  const { SET } = ctx.idx;
  const setName = (id: string) => SET[id]?.short ?? id;
  const build = isStats(plan.v) ? t.ui.byStats : plan.v.name;
  // toWear — вещь, которую надевают: со статами; снимаемая — одной строкой
  const row = (p: Piece, toWear: boolean, act?: ReactNode) => (
    <li key={p.id} className="rd-row">
      <SlotIcon slot={p.slot} />
      <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
      {act}
      <span className="rd-m">{t.ui.slotNames[p.slot]}{hasBt(p.slot, p.grade) && ` · ${btText(t, p.bt)}`}</span>
      {toWear && (
        <span className="bgear-t">
          {tokensOf(ctx, c, plan.v, p).map((k) => (
            <span key={k.key} className={`tok${k.credit >= 1 ? ' ok' : k.credit > 0 ? ' half' : ''}`}>{subLabel(k.key)}<i>{k.lit}</i></span>
          ))}
        </span>
      )}
    </li>
  );
  const ids = plan.wear.map((w) => w.piece.id);
  return (
    <div className="redress">
      <div className="rd-top"><button type="button" className="btn" onClick={onBack}>{t.ui.redressBack(c.name)}</button></div>
      <div className="bgear">
        <h3 className="rd-title">{t.ui.redressTitle(c.name, build)}</h3>
        {(plan.on.length > 0 || plan.off.length > 0) && (
          <div className="rd-chips">
            {plan.on.map((r) => <span key={'on' + r.set + r.n} className="rchip on">{t.ui.redressOn(`${setName(r.set)} ×${r.n}`)}</span>)}
            {plan.off.map((r) => <span key={'off' + r.set + r.n} className="rchip off">{t.ui.redressOff(`${setName(r.set)} ×${r.n}`)}</span>)}
          </div>
        )}
        {plan.wear.length > 0 && (
          <>
            <h4>{t.ui.redressWear(plan.wear.length)}</h4>
            {onWearAll && plan.wear.length > 1 && <button type="button" className="btn primary" onClick={() => onWearAll(ids)}>{t.ui.redressWearAll(plan.wear.length)}</button>}
            <ul className="bgear-list">
              {plan.wear.map((w) => row(w.piece, true, onWear && (
                <button type="button" className="btn small" aria-label={t.ui.wornWearAria(pieceText(ctx, w.piece))} onClick={() => onWear(w.piece.id)}>{t.ui.wornWear}</button>
              )))}
            </ul>
          </>
        )}
        {plan.remove.length > 0 && (
          <>
            <h4>{t.ui.redressTake(plan.remove.length)}</h4>
            <ul className="bgear-list">{plan.remove.map((p) => row(p, false))}</ul>
          </>
        )}
        {plan.missing.length > 0 && (
          <div className="bgear-need">
            {plan.missing.map((m) => <p key={m.set}>{t.ui.missing(setName(m.set), m.need, m.slots, m.t4)}</p>)}
          </div>
        )}
        <p className="muted small rd-foot">{t.ui.redressFooter}</p>
      </div>
    </div>
  );
}
