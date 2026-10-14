// «Ввести» in the trade walk (HISTORY.md 0200-boss E2b Q4–Q5, owner 2026-10-13): the piece the player put into an empty slot from
// the inventory, entered right in the plan — no trip to «Оценка». The slot is set by the line; the rest is the form's
// (features/eval/form ItemForm): grade, set or item, main, substats with their segments, «T4». Under it, live: what the
// piece gives the hero and what is off (wrong main, none of the needed stats), or how many substats are still missing.
// «Готово» keeps it in the walk; it is recorded on the hero only by the walk's «Сделал».
import { useReducer } from 'react';
import type { SlotId } from '@/game/data/types';
import { subLabel } from '@/game/data';
import type { ItemInput } from '@/game/item/item';
import { dropSubs } from '@/game/item/subs';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { EMPTY_ITEM, formReducer, itemInput, type FormState } from '@/features/eval/form/formState';
import { ItemForm } from '@/features/eval/form/ItemForm';
import { formPiece } from '@/features/gear/verdict';
import { profileFor } from '@/game/build/profile';
import { heroName } from '@/game/hero/HeroName';
import { Sheet } from '@/shared/ui/Sheet';
import { adviceOf } from '@/features/trade/model/hint';
import { isArmor } from '@/game/data';

// the piece is whole: the grade's substats, a set (armor) or a main and, for a Legendary weapon or accessory, its item
const whole = (s: FormState): boolean => Object.keys(s.subs).length >= dropSubs(s.grade)
  && (isArmor(s.slot) ? !!s.setId : !!s.main && (s.grade === 'rare' || !!s.itemKey || s.unlisted));

export function EntrySheet({ ctx, hero, slot, initial, pin, onSave, onClose }: {
  ctx: Ctx; hero: string; slot: SlotId; initial: ItemInput | null; pin?: string; onSave: (x: ItemInput) => void; onClose: () => void;
}) {
  const t = useT();
  const [s, dispatch] = useReducer(formReducer<FormState>, null, (): FormState => {
    const blank: FormState = { slot, grade: 'unique', ...EMPTY_ITEM, settings: ctx.settings, settingsOpen: false };
    return initial ? formReducer(blank, { type: 'load', item: { ...initial, slot } }) : blank;
  });
  const name = heroName(ctx.idx, hero);
  const c = ctx.idx.CHAR[hero];
  const P = c ? profileFor(ctx, c, pin) : null;
  const ok = whole(s);
  const a = ok && P ? adviceOf(P, formPiece(itemInput(s))) : null;
  const n = a ? Math.round(a.pts * 10) / 10 : 0;
  const off = a?.main ? t.trade.advMain(name, a.main.map(subLabel).join('/')) : a?.look ? t.trade.advNone(a.look.map(subLabel).join(', ')) : null;
  return (
    <Sheet title={t.trade.entryTitle(slot, name)} onClose={onClose} className="trade-entry">
      <div className="form tentry">
        <ItemForm s={s} dispatch={dispatch} ctx={ctx} anchors={false} />
        <p className={`tlive${!ok ? ' wait' : off ? ' warn' : ''}`} role="status">
          <span>{!ok ? t.trade.incomplete(Object.keys(s.subs).length, dropSubs(s.grade)) : off ?? t.trade.entryFor(name)}</span>
          {ok && a && <span className="tpts up">{t.trade.itemPts(n)}</span>}
        </p>
        <div className="tact">
          <button type="button" className="btn primary" aria-disabled={!ok || undefined} onClick={() => { if (ok) onSave(itemInput(s)); }}>{t.trade.save}</button>
          <button type="button" className="btn" onClick={onClose}>{t.trade.cancel}</button>
        </div>
      </div>
    </Sheet>
  );
}
