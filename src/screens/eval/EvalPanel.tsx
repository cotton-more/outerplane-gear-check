// Панель ввода предмета — компактная форма, чтобы в разделённом экране весь ввод помещался без прокрутки:
// слот → грейд + сет или main (у брони — и «T4») → у Legendary оружия и аксессуара строка предмета с «T4» → сетка
// сабстатов → строки с сегментами. Everything below the slot row is features/eval/form ItemForm (shared with the trade's
// entry window).
// Сет и предмет выбираются в окнах (Sheet); сабстаты — сеткой прямо на форме, уровень — сразу в окне 1–6 у нажатой
// клетки (features/eval/form/LevelAsk), снять — повторным нажатием в сетке. Main тоже без окна:
// у оружия — три кнопки рядом с грейдом, у аксессуара — первое нажатие в сетке (окно — по нажатию на поле main рядом с
// грейдом). «T4» — в конце строки сета или предмета (решение владельца 2026-10-01/02): у Legendary аксессуара предмет поэтому
// своей строкой, как у оружия, — в одной строке с грейдом, main и «T4» на 280px имени не оставалось бы.
// На телефоне, когда вердикт готов, на месте сетки встаёт карточка вердикта.
import type { Dispatch } from 'react';
import { SLOTS } from '@/game/data';
import { fineHover } from '@/shared/layout/useLayout';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import type { FormAction, FormState } from '@/features/eval/form/formState';
import { tour, tourItem } from '@/tour/anchors';
import { Icon, SlotIcon } from '@/game/icons/Img';
import { ItemForm } from '@/features/eval/form/ItemForm';
import type { BatchAsk, BatchLock } from '@/features/batch/useBatchMode';
import { VerdictCard } from './VerdictCard';
import { TryOnStrip } from '@/features/tryon/TryOnStrip';
import type { Char } from '@/game/data/types';
import type { CharVs } from '@/features/gear/model/poolVs';
import type { HeroRow } from '@/features/gear/model/heroList';
import { NextHeroes } from '@/features/gear/ui/HeroList';
import { EquipButton } from '@/features/gear/ui/EquipButton';
import { BatchButton } from '@/features/batch/ui/BatchButton';

// hero — режим «для героя»: полоса над слотами, ✕ — onTryOnEnd; heroNote — строка про героя под карточкой (features/tryon/tryon
// heroNote: не носит, не нужна, «По статам», ничего не даст). vs — лучший исход для строки карточки;
// onEquip — кнопка «Надеть на Caren» / «Заменить шлем Caren» под карточкой (нет — кнопки нет); other и onEquipOther —
// next — строка следующих героев «Sigma +7,4 · Maxie +6,5 · ещё 51 ▸» (0230), её нажатие открывает шторку вердикта. Нажата «T4» — «· T4» в подписи. Кнопка только ради ввода надетого
// (vs.asWorn, подпись «Надеть на X», не «Заменить») — под ней «Носит в игре — нажми…». nextNote — «Дальше: Ботинки» под кнопкой
// «Надеть» / «Заменить»: where the form goes after it. sameLine and onTwin — the piece looks like one already set aside
// (guard, useVerdictModel): the card says so and «Это другой» brings the offers back
export function EvalPanel({ s, dispatch, ctx, verdict, cardShown, hint, onReset, nextNote = null, onOpenVerdict, hero, heroNote, onTryOnEnd, vs, onEquip, next = [], onStash, sameLine = null, onTwin, holders = null, below = null, strip = null, nextLabel, marks, onBatch, lock = null, ask = null }: {
  s: FormState; dispatch: Dispatch<FormAction>; ctx: Ctx; verdict: VerdictData; cardShown: boolean; hint: string | null;
  onReset: () => void; nextNote?: string | null; onOpenVerdict: () => void;
  hero?: { c: Char } | null; heroNote?: string | null; onTryOnEnd?: () => void; vs?: CharVs | null; onEquip?: (vs: CharVs) => void;
  next?: HeroRow[];               // the heroes after the pick, in the list's order: the line under the card, a tap opens the sheet
  onStash?: (vs: CharVs) => void; // «Отложить для X» под карточкой (у «Оставь» и запаса)
  sameLine?: string | null; onTwin?: () => void;
  holders?: React.ReactNode;      // who already has this very piece (features/gear/ui/Holders): under the phone card
  below?: React.ReactNode;        // under the form panel, in the left column: «Надеть в игре» (wide screen)
  strip?: React.ReactNode;        // «Партия · 7 · Список ▸ ✕» instead of the hero strip (features/batch)
  nextLabel?: string;             // «В партию · #8» / «Сохранить #3» instead of «Следующий»
  marks?: React.ReactNode;        // «E» and «🔒» after it (features/batch BatchMarks)
  onBatch?: () => void;           // «Партия» next to «Следующий» (wide screen)
  lock?: BatchLock | null;        // a batch of one kind: other slots and sets are off (features/batch)
  ask?: BatchAsk | null;          // the next batch piece picks its slot / grade again: none pressed, the row highlighted
}) {
  const t = useT();
  const t4 = s.t4 ? t.ui.withT4 : '';

  return (
    <div className="eval-left">
    <div className="panel eval-in" id="eval-in">
      <div className="form">
        {strip ?? (hero && onTryOnEnd && <TryOnStrip c={hero.c} onEnd={onTryOnEnd} />)}
        <div className={ask?.slot ? 'slotrow need' : 'slotrow'} role="group" aria-label={t.ui.slot} {...tour('slot')}>
          {SLOTS.map((sl, i) => (
            <button key={sl.id} type="button" className={lock && !lock.slots.includes(sl.id) ? 'slot off' : 'slot'} aria-pressed={!ask?.slot && s.slot === sl.id} aria-label={sl.name} title={sl.name}
              aria-disabled={(lock && !lock.slots.includes(sl.id)) || undefined}
              onClick={() => (lock && !lock.slots.includes(sl.id) ? lock.explain() : dispatch({ type: 'slot', slot: sl.id }))} {...tourItem(sl.id)}>
              <SlotIcon slot={sl.id} /><span>{sl.name}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <ItemForm s={s} dispatch={dispatch} ctx={ctx} hint={hint} lock={lock} ask={ask} zone={cardShown ? <>
              <VerdictCard r={verdict} onOpen={onOpenVerdict} vs={vs} named={!hero} note={sameLine} />
              {/* «Надеть» / «Отложить» — в один ряд; не влезают — вторая переносится */}
              {((vs && onEquip) || (vs && onStash) || onTwin) && (
                <div className="vc-acts">
                  {onTwin && <button type="button" className="btn vc-twin" onClick={onTwin}>{t.fit.twin(s.slot)}</button>}
                  {vs && onStash && <button type="button" className="btn vc-stash" onClick={() => onStash(vs)} {...tour('stash')}><Icon name="archive" />{t.fit.stash(vs.c.name)}</button>}
                  {vs && onEquip && (
                    <EquipButton place="vc-equip" x={vs} slot={t.ui.slotAcc[s.slot]} t4={!!t4} good={vs.h.kind === 'wear'} onEquip={onEquip} />
                  )}
                </div>
              )}
              {next.length > 0 && <NextHeroes rows={next} onOpen={onOpenVerdict} />}
              {vs?.asWorn && !vs.replaces && onEquip && <p className="vc-wear">{t.ui.equipAsWorn}</p>}
              {nextNote && vs && onEquip && <p className="vc-next">{nextNote}</p>}
              {heroNote && <p className="vc-note">{heroNote}</p>}
              {holders}
        </> : undefined} />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onReset} {...tour('next')}>{nextLabel ?? t.ui.resetItem}</button>
        {marks}
        {onBatch && <BatchButton onStart={onBatch} />}
        <span className="hk">
          {fineHover() && <><kbd>1</kbd>–<kbd>6</kbd> {t.ui.hkSlot} · <kbd>L</kbd>/<kbd>E</kbd> {t.ui.hkGrade} · <kbd>Esc</kbd> {t.ui.hkReset}</>}
        </span>
      </div>

    </div>
    {below}
    </div>
  );
}

