// Шторка «X: из своих вещей» — «Переодеть» (.x/0085 FORMULA §3 п. 3, макет 6.0 решение 2): прирост в очках, какие
// половины сетов включатся и выключатся, вещи лучшей раскладки, которых на герое нет, — «вместо …» и «Надеть» у каждой,
// «Надеть все N». Только по пассивке (ранг) — вместо прироста строка о пассивке и, если очки падают, «слабее на N».
// Данные — features/worn/wearing (redressOf); запись и тост с «Вернуть» — у родителя (CharDetail).
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import { namedGain } from '@/features/gear/model/vs';
import type { Profile } from '@/game/build/profile';
import { tokensOf, type Redress as Plan } from './wearing';
import { SlotIcon } from '@/game/icons/Img';
import { BtLabel, PieceName, pieceText } from '@/features/gear/ui/pieceText';
import { partText, setName } from '@/game/set/setName';
import { SubToken } from '@/game/item/SubToken';
import { Sheet } from '@/shared/ui/Sheet';

// the «Переодеть» button: the gain when it is named (from 0.05); otherwise «пассивка лучше» only for a real rank-up
// (a recommended weapon or accessory goes on); a swap with neither (a Legendary for an Epic at equal points, an effect-set
// half at equal V) is plain «Переодеть»
export function redressLabel(t: ReturnType<typeof useT>, plan: Plan): string {
  if (namedGain(plan.pts)) return t.card.redress(t.fit.pts(plan.pts));
  return plan.rankUp ? t.card.redressRank : t.card.redressPlain;
}

export function Redress({ c, ctx, P, plan, onClose, onWear, onWearAll }: {
  c: Char; ctx: Ctx; P: Profile; plan: Plan; onClose: () => void; onWear?: (id: string) => void; onWearAll?: (ids: string[]) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  // «вместо Speed-перчаток»; оружие и аксессуар — по имени
  const was = (p: Piece) => t.card.instead(p.setId ? t.card.insteadPiece(setName(idx, p.setId), p.slot) : pieceText(ctx, p));
  const parts = t.fit.parts(plan.on.map((x) => partText(idx, x)), plan.off.map((x) => partText(idx, x)));
  const ids = plan.wear.map((w) => w.piece.id);
  return (
    <Sheet title={t.card.redressTitle(c.name)} onClose={onClose} className="aimsheet">
      <div className="vsheet">
        <div className="rd-gain">
          {namedGain(plan.pts) && <b>{t.fit.chipGain(t.fit.pts(plan.pts))}</b>}
          {plan.rankUp && <p>{t.fit.rankUp(c.name)}</p>}
          {plan.pts <= -0.05 && <p>{t.trade.weaker(-plan.pts)}</p>}
          {parts && <p>{parts}</p>}
        </div>
        <ul className="bgear-list">
          {plan.wear.map(({ piece: p, replaces }) => (
            <li key={p.id} className="rd-row">
              <SlotIcon slot={p.slot} />
              <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
              {onWear
                ? <button type="button" className="btn small" aria-label={t.ui.wornWearAria(pieceText(ctx, p))} onClick={() => onWear(p.id)}>{t.ui.wornWear}</button>
                : <BtLabel p={p} />}
              <span className="bgear-t">
                {tokensOf(ctx, c, P, p).map((k) => <SubToken key={k.key} stat={k.key} lit={k.lit} credit={k.credit} />)}
              </span>
              {replaces && <span className="rd-was">{was(replaces)}</span>}
            </li>
          ))}
        </ul>
        {onWearAll && ids.length > 1 && <button type="button" className="btn primary aim-go" onClick={() => onWearAll(ids)}>{t.ui.redressWearAll(ids.length)}</button>}
      </div>
    </Sheet>
  );
}
