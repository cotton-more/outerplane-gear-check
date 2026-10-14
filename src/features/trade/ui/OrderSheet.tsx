// Заказ героя в обмене (MODEL.md §7 item 1): «Заказ: По статам ▾» у героя плана — шторка с вариантами: «По статам» и
// наборы из его билдов (combosOf); у закреплённого — один вариант «Закреплено: …» (жёстко, MODEL.md §6). In the one-hero
// trade the choice lives in the sheet, like «Не брать» (closed — forgotten); on «Команда» it is the build under a spot
// (OrderPill), kept with the team in 'ogc.boss' (HISTORY.md 0200-boss E2). Смена — пересчёт; на другой заказ обмен сам не переключается.
import type { Char, Combo } from '@/game/data/types';
import { Icon, SetIcon } from '@/game/icons/Img';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { combosOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { comboSig } from '@/game/build/variants';
import { STATS } from '@/features/trade/model/world';
import { RadioRow } from '@/shared/ui/RadioRow';
import { Sheet } from '@/shared/ui/Sheet';

// подпись заказа: «По статам» или набор «Speed ×2 + Immunity ×2»; подписи, которой у героя нет, — «По статам»
export function orderName(ctx: Ctx, c: Char | undefined, order: string, stats: string): string {
  const combo = c && order !== STATS ? combosOf(c).find((x) => comboSig(x) === order) : undefined;
  return combo ? comboText(ctx.idx, combo) : stats;
}

// short — под плиткой в ромбе (52 px на колонку): только имя заказа и ▾, полная фраза — подсказкой и для диктора.
// ▾ stays outside the name: in a narrow window a long name ends in an ellipsis, the ▾ (it opens a list) is never cut
export function OrderButton({ name, short, onClick }: { name: string; short?: boolean; onClick: () => void }) {
  const t = useT();
  const full = t.trade.order(name);
  return (
    <button type="button" className="aimb" title={full} aria-label={short ? full : undefined} onClick={onClick}>
      <span className="aimb-n">{short ? name : full}</span> ▾
    </button>
  );
}

// the build under a spot on «Команда» (HISTORY.md 0200-boss E2): «статы ▾», or the combo's set icons with ×N; pinned — the gold
// outline and a pin (the pin is the order, hard; changed on the hero's card). label — the full phrase for a screen reader
export function OrderPill({ ctx, combo, pinned, label, onClick }: {
  ctx: Ctx; combo: Combo | null; pinned: boolean; label: string; onClick: () => void;
}) {
  const t = useT();
  return (
    <button type="button" className={`opill${pinned ? ' pin' : ''}${combo && combo.length > 1 ? ' two' : ''}`} aria-label={label} title={label} onClick={onClick}>
      {combo ? combo.map((p) => <span key={p.set} className="opill-s"><SetIcon set={ctx.idx.SET[p.set]} />{p.n}</span>) : t.trade.byStatsShort}
      {pinned ? <Icon name="pin" className="opill-pin" /> : <span className="opill-c" aria-hidden="true">▾</span>}
    </button>
  );
}

export function OrderSheet({ c, ctx, order, pinned = null, onClose, onChoose }: {
  c: Char; ctx: Ctx; order: string; pinned?: string | null; onClose: () => void; onChoose: (order: string) => void;
}) {
  const t = useT();
  const options = pinned ? [{ key: order, name: pinned }]
    : [{ key: STATS, name: t.ui.byStats }, ...combosOf(c).map((x) => ({ key: comboSig(x), name: comboText(ctx.idx, x) }))];
  const now = pinned ? order : options.some((o) => o.key === order) ? order : STATS;
  return (
    <Sheet title={c.name} onClose={onClose} className="aimsheet">
      <div className="vsheet">
        <ul className="alist" role="radiogroup" aria-label={c.name}>
          {options.map((o) => (
            <RadioRow key={o.key} checked={o.key === now} name={o.name} onClick={() => (o.key === now ? onClose() : onChoose(o.key))} />
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
