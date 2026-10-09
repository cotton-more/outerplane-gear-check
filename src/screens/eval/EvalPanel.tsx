// Панель ввода предмета — компактная форма, чтобы в разделённом экране весь ввод помещался без прокрутки:
// слот → грейд + сет или main (у брони — и «T4») → у Legendary оружия и аксессуара строка предмета с «T4» → сетка
// сабстатов → строки с сегментами.
// Сет и предмет выбираются в окнах (Sheet); сабстаты — сеткой прямо на форме, уровень — сразу в окне 1–6 у нажатой
// клетки (features/eval/form/LevelAsk), снять — повторным нажатием в сетке. Main тоже без окна:
// у оружия — три кнопки рядом с грейдом, у аксессуара — первое нажатие в сетке (окно — по нажатию на поле main рядом с
// грейдом). «T4» — в конце строки сета или предмета (вопрос 7 ревью eval-only): у Legendary аксессуара предмет поэтому
// своей строкой, как у оружия, — в одной строке с грейдом, main и «T4» на 280px имени не оставалось бы.
// На телефоне, когда вердикт готов, на месте сетки встаёт карточка вердикта.
import { useMemo, useState, type Dispatch } from 'react';
import { GRADE_NAME, GRADES, SLOTS, isArmor, subLabel } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import { fineHover } from '@/shared/layout/useLayout';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { MAX_SUBS, withinCap } from '@/game/item/subs';
import { mainOptions, setSubDemand } from '@/features/eval/form/lists';
import { blocksOf, itemMains as mainLines } from '@/game/item/mains';
import type { Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import type { FormAction, FormState } from '@/features/eval/form/formState';
import { tour, tourItem } from '@/tour/anchors';
import { Frame, GradeFrame, Icon, SetIcon, SlotIcon, StatIcon } from '@/game/icons/Img';
import { Sheet, type Point } from '@/shared/ui/Sheet';
import { BtChip } from '@/features/eval/form/BtChip';
import { ItemPicker } from '@/features/eval/form/ItemPicker';
import { MainButtons } from '@/features/eval/form/MainButtons';
import { MainPicker } from '@/features/eval/form/MainPicker';
import { PickField } from '@/features/eval/form/PickField';
import { SetPicker } from '@/features/eval/form/SetPicker';
import type { BatchAsk, BatchLock } from '@/features/batch/useBatchMode';
import { SubPicker } from '@/features/eval/form/SubPicker';
import { LevelAsk } from '@/features/eval/form/LevelAsk';
import { StatGrid } from '@/features/eval/form/StatGrid';
import { SubRows, type CapAt } from '@/features/eval/form/SubRows';
import { VerdictCard } from './VerdictCard';
import { TryOnStrip } from '@/features/tryon/TryOnStrip';
import type { Char } from '@/game/data/types';
import type { CharVs } from '@/features/gear/model/poolVs';
import { chipLabel } from '@/features/gear/ui/VsChip';
import { EquipButton } from '@/features/gear/ui/EquipButton';
import { BatchButton } from '@/features/batch/ui/BatchButton';

// sub: какой стат заменяем; level: какой стат добавляем — окно уровня у центра нажатой клетки (at); fourth — 4-й у Epic
type Open = null | 'set' | 'item' | 'main' | 'fourth' | { sub: string } | { level: string; at: Point };

// hero — режим «для героя»: полоса над слотами, ✕ — onTryOnEnd; heroNote — строка про героя под карточкой (features/tryon/tryon
// heroNote: не носит, не нужна, «По статам», ничего не даст). vs — лучший исход для строки карточки;
// onEquip — кнопка «Надеть на Caren» / «Заменить шлем Caren» под карточкой (нет — кнопки нет); other и onEquipOther —
// вторая, «или — Rin · Speed ▸»: сразу Rin. Нажата «T4» — «· T4» в подписи обеих. Кнопка только ради ввода надетого
// (vs.asWorn, подпись «Надеть на X», не «Заменить») — под ней «Носит в игре — нажми…». nextNote — «Дальше: Ботинки» под кнопкой
// «Надеть» / «Заменить»: куда встанет форма после неё. sameLine and onTwin — the piece looks like one already set aside
// (guard, useVerdictModel): the card says so and «Это другой» brings the offers back
export function EvalPanel({ s, dispatch, ctx, verdict, cardShown, hint, onReset, nextNote = null, onOpenVerdict, hero, heroNote, onTryOnEnd, vs, onEquip, other, onEquipOther, onStash, sameLine = null, onTwin, strip = null, nextLabel, onBatch, lock = null, ask = null }: {
  s: FormState; dispatch: Dispatch<FormAction>; ctx: Ctx; verdict: VerdictData; cardShown: boolean; hint: string | null;
  onReset: () => void; nextNote?: string | null; onOpenVerdict: () => void;
  hero?: { c: Char } | null; heroNote?: string | null; onTryOnEnd?: () => void; vs?: CharVs | null; onEquip?: (vs: CharVs) => void;
  other?: CharVs | null; onEquipOther?: (vs: CharVs) => void;
  onStash?: (vs: CharVs) => void; // «Отложить для X» под карточкой (у «Оставь» и запаса)
  sameLine?: string | null; onTwin?: () => void;
  strip?: React.ReactNode;        // «Партия · 7 · Список ▸ ✕» instead of the hero strip (features/batch)
  nextLabel?: string;             // «В партию · #8» / «Сохранить #3» instead of «Следующий»
  onBatch?: () => void;           // «Партия» next to «Следующий» (wide screen)
  lock?: BatchLock | null;        // a batch of one kind: other slots and sets are off (features/batch)
  ask?: BatchAsk | null;          // the next batch piece picks its slot / grade again: none pressed, the row highlighted
}) {
  const { SET, ITEM } = ctx.idx;
  const t = useT();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  // новый сабстат (сетка, «+ 4-й») с суммой уровней выше предела не добавляется — строка segCap под строками, как у
  // нажатия сегмента (SubRows); снять стат можно всегда. Сетка: не влезает даже уровень 1 — окно уровня не открывается
  const [cap, setCap] = useState<CapAt | null>(null);
  const fits = (key: string) => withinCap(s.grade, s.subs, { ...s.subs, [key]: 1 });
  const tapGrid = (key: string, cell: HTMLElement) => {
    if (key in s.subs) { dispatch({ type: 'sub', key }); return; }
    if (Object.keys(s.subs).length >= MAX_SUBS) return;
    if (!fits(key)) { setCap({ subs: s.subs, grade: s.grade }); return; }
    const r = cell.getBoundingClientRect();
    setOpen({ level: key, at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
  };
  // 4-й у Epic — с уровнем 1: от первого Reforge он приходит с одним сегментом
  const addFourth = (key: string) => {
    if (!(key in s.subs) && !fits(key)) { setCap({ subs: s.subs, grade: s.grade }); return; }
    dispatch({ type: 'sub', key });
  };
  const armor = isArmor(s.slot);
  const t4 = s.t4 ? t.ui.withT4 : '';
  // строки main: у брони фиксированы сетом, у оружия — flat ATK и выбранный; сабстатов, которые они запрещают, в сетке нет
  const im = useMemo(() => mainLines(ctx.idx, { slot: s.slot, grade: s.grade, setId: s.setId, itemKey: s.itemKey, main: s.main }),
    [ctx.idx, s.slot, s.grade, s.setId, s.itemKey, s.main]);
  const useful = useMemo(() => (armor && s.setId ? setSubDemand(ctx, s.setId, im) : null), [ctx, armor, s.setId, im]);
  const full = Object.keys(s.subs).length >= MAX_SUBS;
  const kind = s.slot as GearKind;
  const epic = s.grade === 'rare';
  const set = armor && s.setId ? SET[s.setId] : undefined;
  const item = !armor && !epic && s.itemKey ? ITEM[kind][s.itemKey] : undefined;
  const itemMains = (key: string) => { const it = ITEM[kind][key]; return it ? [...it.mains, ...it.extraMains] : []; };
  const weapon = s.slot === 'weapon';
  const mainValue = s.main ? <><StatIcon stat={s.main} main />{s.main}</> : undefined;
  const opts = useMemo(() => (armor ? [] : mainOptions(ctx, kind, item, epic)), [ctx, armor, kind, item, epic]);
  const allMains = useMemo(() => (weapon ? mainOptions(ctx, kind, undefined, epic) : []), [ctx, weapon, kind, epic]);
  // у аксессуара без main сетка сначала выбирает main — в игре он сверху предмета
  const mainMode = s.slot === 'accessory' && !s.main && opts.length > 0 ? opts : null;
  const pickMain = (main: string) => dispatch({ type: 'main', main, blocks: blocksOf(ctx.idx, main) });
  // сабстаты уже вводят, а сет, main или предмет не выбран — без него вердикта нет: выделяем, чего не хватает
  const started = Object.keys(s.subs).length > 0;
  const found = !!s.itemKey || s.unlisted;
  const need = !started ? null
    : armor ? (s.setId ? null : 'set')
      : weapon ? (!s.main ? 'main' : !epic && !found ? 'item' : null)
        : epic || s.unlisted ? (s.main ? null : 'main') : found ? null : 'item';
  const itemField = (
    <PickField value={item ? <><Frame item={item} /><span className="pick-t">{item.name}</span></> : s.unlisted ? t.ui.unlisted : undefined}
      placeholder={t.ui.findGear(kind)} onClick={() => setOpen('item')} at="item" need={need === 'item'} />
  );
  const mainField = <PickField value={mainValue} placeholder={t.ui.mainInGrid} onClick={() => setOpen('main')} at="pick" need={need === 'main'} />;
  const btChip = <BtChip on={s.t4} armor={armor} onToggle={() => dispatch({ type: 't4' })} />;

  return (
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
        <div className="formrow">
          <div className={ask?.grade ? 'gradesw need' : 'gradesw'} role="group" aria-label={t.ui.gradeGroup} {...tour('grade')}>
            {GRADES.map((g) => (
              <button key={g} type="button" className={`grade ${g}`} aria-pressed={!ask?.grade && s.grade === g} aria-label={GRADE_NAME[g]} title={`${GRADE_NAME[g]} (${g === 'unique' ? 'Etheric' : 'Steel'})`}
                onClick={() => dispatch({ type: 'grade', grade: g })} {...tourItem(g)}>
                <GradeFrame grade={g} /><span className="gname">{g === 'unique' ? 'L' : 'E'}</span>
              </button>
            ))}
          </div>
          {armor
            ? <>
              <PickField value={set && <><SetIcon set={set} /><span className="pick-t">{set.short}<span className="pick-sfx"> Set</span></span></>} placeholder={t.ui.pickSet}
                onClick={() => (lock?.set && s.setId === lock.set ? lock.explain() : setOpen('set'))} locked={!!lock?.set && s.setId === lock.set} at="pick" need={need === 'set'} />
              {btChip}
            </>
            : <>
              {weapon ? <MainButtons all={allMains} opts={opts} current={s.main} need={need === 'main'} onPick={pickMain} /> : mainField}
              {/* у Epic предмета на форме нет — «T4» рядом с main (.x/0060 SPEC 4.1) */}
              {epic && btChip}
            </>}
        </div>
        {!armor && !epic && <div className="formrow">{itemField}{btChip}</div>}
        <div className="subzone" {...tour('grid')}>
          {cardShown
            ? <>
              <VerdictCard r={verdict} onOpen={onOpenVerdict} vs={vs} named={!hero} note={sameLine} />
              {/* «Надеть» и «или — Rin · Speed ▸» — в один ряд; не влезают — вторая переносится */}
              {((vs && onEquip) || (other && onEquipOther) || (vs && onStash) || onTwin) && (
                <div className="vc-acts">
                  {onTwin && <button type="button" className="btn vc-twin" onClick={onTwin}>{t.fit.twin(s.slot)}</button>}
                  {vs && onStash && <button type="button" className="btn vc-stash" onClick={() => onStash(vs)} {...tour('stash')}><Icon name="archive" />{t.fit.stash(vs.c.name)}</button>}
                  {vs && onEquip && (
                    <EquipButton place="vc-equip" x={vs} slot={t.ui.slotAcc[s.slot]} t4={!!t4} good={vs.h.kind === 'wear'} onEquip={onEquip} />
                  )}
                  {other && onEquipOther && (
                    <button type="button" className="btn vc-other" onClick={() => onEquipOther(other)}>
                      {/* подпись = действие (Р7): заменит — «или — заменить шлем Caren · +2,5 очк.» */}
                      {other.replaces
                        ? t.ui.orReplace(t.ui.slotAcc[s.slot], other.c.name, (chipLabel(t, other) ?? '') + t4)
                        : t.ui.orOther(other.c.name, (chipLabel(t, other) ?? '') + t4)}
                    </button>
                  )}
                </div>
              )}
              {vs?.asWorn && !vs.replaces && onEquip && <p className="vc-wear">{t.ui.equipAsWorn}</p>}
              {nextNote && vs && onEquip && <p className="vc-next">{nextNote}</p>}
              {heroNote && <p className="vc-note">{heroNote}</p>}
            </>
            : <StatGrid subs={s.subs} main={s.main} blocked={im.blocked} full={full} useful={useful} mains={mainMode} onMain={pickMain} onPick={tapGrid} />}
        </div>
        {(hint || mainMode) && <p className="grid-hint">{hint ?? t.ui.mainFirst}</p>}
        <SubRows subs={s.subs} grade={s.grade} fourth={epic} cap={cap} onCap={setCap} dispatch={dispatch} onPick={(editing) => setOpen({ sub: editing })} onAddFourth={() => setOpen('fourth')} />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onReset} {...tour('next')}>{nextLabel ?? t.ui.resetItem}</button>
        {onBatch && <BatchButton onStart={onBatch} />}
        <span className="hk">
          {fineHover() && <><kbd>1</kbd>–<kbd>6</kbd> {t.ui.hkSlot} · <kbd>L</kbd>/<kbd>E</kbd> {t.ui.hkGrade} · <kbd>Esc</kbd> {t.ui.hkReset}</>}
        </span>
      </div>

      {open === 'set' && (
        <Sheet title={t.ui.setSheet} onClose={close}>
          <SetPicker ctx={ctx} current={s.setId} only={lock?.set} onPick={(setId) => { dispatch({ type: 'set', setId }); close(); }} />
        </Sheet>
      )}
      {open === 'item' && (
        <Sheet title={t.ui.legendaryGear(kind)} onClose={close}>
          <ItemPicker ctx={ctx} kind={kind} current={s.itemKey}
            onPick={(key) => { dispatch({ type: 'item', itemKey: key, mains: itemMains(key) }); close(); }}
            onUnlisted={() => { dispatch({ type: 'unlisted' }); close(); }} />
        </Sheet>
      )}
      {open === 'main' && (
        <Sheet title={item ? `Main stat · ${item.name}` : epic ? t.ui.mainEpic(kind) : t.ui.mainUnlisted} onClose={close}>
          <MainPicker ctx={ctx} kind={kind} item={item} epic={epic} current={s.main}
            onPick={(main) => { if (main !== s.main) pickMain(main); close(); }} />
        </Sheet>
      )}
      {open === 'fourth' && (
        <Sheet title={t.ui.fourthSheet} onClose={close}>
          <SubPicker ctx={ctx} subs={s.subs} blocked={im.blocked} editing={null}
            onPick={(key) => { addFourth(key); close(); }} />
        </Sheet>
      )}
      {open !== null && typeof open === 'object' && 'level' in open && (
        <LevelAsk stat={open.level} at={open.at} grade={s.grade} subs={s.subs} onClose={close}
          onPick={(n) => { dispatch({ type: 'sub', key: open.level, n }); close(); }} />
      )}
      {open !== null && typeof open === 'object' && 'sub' in open && (
        <Sheet title={t.ui.replaceSub(subLabel(open.sub))} onClose={close}>
          <SubPicker ctx={ctx} subs={s.subs} blocked={im.blocked} editing={open.sub}
            onPick={(key) => { if (key !== open.sub) dispatch({ type: 'replaceSub', from: open.sub, to: key }); close(); }}
            onRemove={() => { dispatch({ type: 'sub', key: open.sub }); close(); }} />
        </Sheet>
      )}
    </div>
  );
}

