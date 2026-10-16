// The piece's form below the slot row — one for «Оценка» (screens/eval EvalPanel) and the trade's entry window
// (features/trade EntrySheet, HISTORY.md 0200-boss E2b Q4–Q5): grade + set or main (armor — and «T4») → for a Legendary weapon or
// accessory the item row with «T4» → the substat grid → the rows with segments; the set, item, main and substat pickers.
// zone — what stands in the grid's place (the verdict card on «Оценка»); none — the grid. lock / ask — a batch of one kind
// (features/batch). anchors — the tour's anchors: only the «Оценка» form has them (the entry window lies over the trade).
import { useMemo, useState, type Dispatch, type ReactNode } from 'react';
import { GRADE_NAME, GRADES, isArmor, subLabel } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { MAX_SUBS, withinCap } from '@/game/item/subs';
import { blocksOf, itemMains as mainLines } from '@/game/item/mains';
import { tour, tourItem } from '@/tour/anchors';
import { Frame, GradeFrame, SetIcon, StatIcon } from '@/game/icons/Img';
import { Sheet, type Point } from '@/shared/ui/Sheet';
import { mainOptions, setSubDemand } from './lists';
import type { FormAction, FormState } from './formState';
import { BtChip } from './BtChip';
import { ItemPicker } from './ItemPicker';
import { MainPicker } from './MainPicker';
import { PickField } from './PickField';
import { SetPicker } from './SetPicker';
import { SubPicker } from './SubPicker';
import { LevelAsk } from './LevelAsk';
import { StatGrid } from './StatGrid';
import { SubRows, type CapAt } from './SubRows';

// sub: какой стат заменяем; level: какой стат добавляем — окно уровня у центра нажатой клетки (at); fourth — 4-й у Epic
type Open = null | 'set' | 'item' | 'main' | 'fourth' | { sub: string } | { level: string; at: Point };

const none = {};

export function ItemForm({ s, dispatch, ctx, zone, hint = null, lock = null, ask = null, anchors = true }: {
  s: FormState; dispatch: Dispatch<FormAction>; ctx: Ctx; zone?: ReactNode; hint?: string | null;
  lock?: { grade?: string | null; set?: string | null; explain: () => void } | null; ask?: { grade: boolean } | null; anchors?: boolean;
}) {
  const { SET, ITEM } = ctx.idx;
  const t = useT();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const at = <T,>(x: T) => (anchors ? x : undefined);
  const mark = (x: object) => (anchors ? x : none);
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
  // for an accessory and a weapon (owner 2026-10-09) with no main the grid picks the main first — in the game it is at the top of the piece; for a weapon
  // it is only ATK%, DEF% or HP% — the rest is disabled in the grid
  const mainMode = !armor && !s.main && opts.length > 0 ? opts : null;
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
      placeholder={t.ui.findGear(kind)} onClick={() => setOpen('item')} at={at('item' as const)} need={need === 'item'} />
  );
  const mainField = <PickField value={mainValue} placeholder={t.ui.mainInGrid} onClick={() => setOpen('main')} at={at('pick' as const)} need={need === 'main'} />;
  const btChip = <BtChip on={s.t4} armor={armor} anchor={anchors} onToggle={() => dispatch({ type: 't4' })} />;

  return (
    <>
      <div className="formrow">
        <div className={ask?.grade ? 'gradesw need' : 'gradesw'} role="group" aria-label={t.ui.gradeGroup} {...mark(tour('grade'))}>
          {GRADES.map((g) => (
            <button key={g} type="button" className={lock?.grade && lock.grade !== g ? `grade ${g} off` : `grade ${g}`} aria-pressed={!ask?.grade && s.grade === g}
              aria-label={GRADE_NAME[g]} title={`${GRADE_NAME[g]} (${g === 'unique' ? 'Etheric' : 'Steel'})`} aria-disabled={(lock?.grade && lock.grade !== g) || undefined}
              onClick={() => (lock?.grade && lock.grade !== g ? lock.explain() : dispatch({ type: 'grade', grade: g }))} {...mark(tourItem(g))}>
              <GradeFrame grade={g} /><span className="gname">{g === 'unique' ? 'L' : 'E'}</span>
            </button>
          ))}
        </div>
        {armor
          ? <>
            <PickField value={set && <><SetIcon set={set} /><span className="pick-t">{set.short}<span className="pick-sfx"> Set</span></span></>} placeholder={t.ui.pickSet}
              onClick={() => (lock?.set && s.setId === lock.set ? lock.explain() : setOpen('set'))} locked={!!lock?.set && s.setId === lock.set} at={at('pick' as const)} need={need === 'set'} />
            {btChip}
          </>
          : <>
            {mainField}
            {/* у Epic предмета на форме нет — «T4» рядом с main */}
            {epic && btChip}
          </>}
      </div>
      {!armor && !epic && <div className="formrow">{itemField}{btChip}</div>}
      <div className="subzone" {...mark(tour('grid'))}>
        {zone ?? <StatGrid subs={s.subs} main={s.main} blocked={im.blocked} full={full} useful={useful} mains={mainMode} corner={!armor && opts.length > 0} onMain={pickMain} onPick={tapGrid} />}
      </div>
      {(hint || mainMode) && <p className="grid-hint">{hint ?? t.ui.mainFirst}</p>}
      <SubRows subs={s.subs} grade={s.grade} fourth={epic} cap={cap} onCap={setCap} dispatch={dispatch} onPick={(editing) => setOpen({ sub: editing })} onAddFourth={() => setOpen('fourth')} />

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
    </>
  );
}
