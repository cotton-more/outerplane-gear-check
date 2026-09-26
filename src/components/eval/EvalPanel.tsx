// Панель ввода предмета — компактная форма, чтобы в разделённом экране весь ввод помещался без прокрутки:
// слот → грейд + сет/предмет/main → сетка сабстатов → строки с жёлтыми сегментами.
// Сет, предмет и main выбираются в окнах (Sheet); сабстаты — сеткой прямо на форме, одним нажатием.
// На телефоне, когда вердикт готов, на месте сетки встаёт карточка вердикта.
import { useMemo, useState, type Dispatch } from 'react';
import { GRADE_NAME, GRADES, SLOTS, isArmor } from '../../data';
import type { GearKind } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { maxSubs } from '../../logic/subs';
import { setSubDemand } from '../../logic/lists';
import type { Verdict as VerdictData } from '../../logic/verdict';
import type { Action, AppState } from '../../state/appState';
import { Frame, Img, StatIcon } from '../Img';
import { Sheet } from '../Sheet';
import { ItemPicker } from './ItemPicker';
import { MainPicker } from './MainPicker';
import { PickField } from './PickField';
import { SetPicker } from './SetPicker';
import { SubPicker } from './SubPicker';
import { StatGrid } from './StatGrid';
import { SubRows } from './SubRows';
import { VerdictCard } from './Verdict';

type Open = null | 'set' | 'item' | 'main' | { sub: string }; // sub: какой стат заменяем

const fineHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function EvalPanel({ s, dispatch, ctx, verdict, cardShown, hint, onReset, onHelp, onCode, onOpenVerdict }: {
  s: AppState; dispatch: Dispatch<Action>; ctx: Ctx; verdict: VerdictData; cardShown: boolean; hint: string | null;
  onReset: () => void; onHelp: () => void; onCode: () => void; onOpenVerdict: () => void;
}) {
  const { D, SET, ITEM } = ctx.idx;
  const t = useT();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const armor = isArmor(s.slot);
  const useful = useMemo(() => (armor && s.setId ? setSubDemand(ctx, s.setId) : null), [ctx, armor, s.setId]);
  const full = Object.keys(s.subs).length >= maxSubs(s.grade);
  const kind = s.slot as GearKind;
  const epic = s.grade === 'rare';
  const set = armor && s.setId ? SET[s.setId] : undefined;
  const item = !armor && !epic && s.itemKey ? ITEM[kind][s.itemKey] : undefined;
  const hasMains = (key: string) => { const it = ITEM[kind][key]; return !!it && (it.mains.length > 0 || it.extraMains.length > 0); };
  const mainRow = !armor && !epic && (s.unlisted || (!!s.itemKey && hasMains(s.itemKey)));
  const mainValue = s.main ? <><StatIcon stat={s.main} />{s.main}</> : undefined;

  return (
    <div className="panel eval-in" id="eval-in">
      <div className="form">
        <div className="slotrow" role="group" aria-label={t.ui.slot}>
          {SLOTS.map((sl, i) => (
            <button key={sl.id} type="button" className="slot" aria-pressed={s.slot === sl.id} aria-label={sl.name} title={sl.name}
              onClick={() => dispatch({ type: 'slot', slot: sl.id })}>
              <Img k={'eq:' + D.slotIcons[sl.id]} /><span>{sl.name}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="formrow">
          <div className="gradesw" role="group" aria-label={t.ui.gradeGroup}>
            {GRADES.map((g) => (
              <button key={g} type="button" className={`grade ${g}`} aria-pressed={s.grade === g} aria-label={GRADE_NAME[g]} title={`${GRADE_NAME[g]} (${g === 'unique' ? 'Etheric' : 'Steel'})`}
                onClick={() => dispatch({ type: 'grade', grade: g })}>
                <Img k={'frame:' + g} /><span className="gname">{g === 'unique' ? 'L' : 'E'}</span>
              </button>
            ))}
          </div>
          {armor
            ? <PickField value={set && <><Img k={'eq:' + set.icon} />{set.short} Set</>} placeholder={t.ui.pickSet} onClick={() => setOpen('set')} />
            : epic
              ? <PickField value={mainValue} placeholder="Main stat" onClick={() => setOpen('main')} />
              : <PickField value={item ? <><Frame item={item} /><span className="pick-t">{item.name}</span></> : s.unlisted ? t.ui.unlisted : undefined}
                  placeholder={t.ui.findGear(kind)} onClick={() => setOpen('item')} />}
          {mainRow && <PickField className="main" value={mainValue} placeholder="Main stat" onClick={() => setOpen('main')} />}
        </div>
        <div className="subzone">
          {cardShown
            ? <VerdictCard r={verdict} onOpen={onOpenVerdict} />
            : <StatGrid subs={s.subs} main={s.main} full={full} useful={useful} onPick={(key) => dispatch({ type: 'sub', key })} />}
        </div>
        {hint && <p className="grid-hint">{hint}</p>}
        <SubRows subs={s.subs} dispatch={dispatch} onPick={(editing) => setOpen({ sub: editing })} />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onReset}>{t.ui.resetItem}</button>
        <button type="button" className="btn" onClick={onCode}>{t.ui.enterCode}</button>
        <button type="button" className="btn" onClick={onHelp}>{t.ui.help}</button>
        <label className="toggle">
          <input type="checkbox" id="opt-roster" checked={s.settings.rosterOnly} onChange={(e) => dispatch({ type: 'settings', patch: { rosterOnly: e.target.checked } })} />
          {' '}{t.ui.rosterOnly}{ctx.roster.size ? ` (${ctx.roster.size})` : t.ui.rosterOnlyEmpty}
        </label>
        <span className="hk">
          {fineHover() && <><kbd>1</kbd>–<kbd>6</kbd> {t.ui.hkSlot} · <kbd>L</kbd>/<kbd>E</kbd> {t.ui.hkGrade} · <kbd>Esc</kbd> {t.ui.hkReset}</>}
        </span>
      </div>
      <EvalSettings s={s} dispatch={dispatch} />

      {open === 'set' && (
        <Sheet title={t.ui.setSheet} onClose={close}>
          <SetPicker ctx={ctx} current={s.setId} onPick={(setId) => { dispatch({ type: 'set', setId }); close(); }} />
        </Sheet>
      )}
      {open === 'item' && (
        <Sheet title={t.ui.legendaryGear(kind)} onClose={close}>
          <ItemPicker ctx={ctx} kind={kind} current={s.itemKey}
            onPick={(key) => { dispatch({ type: 'item', itemKey: key }); setOpen(hasMains(key) ? 'main' : null); }}
            onUnlisted={() => { dispatch({ type: 'unlisted' }); setOpen('main'); }} />
        </Sheet>
      )}
      {open === 'main' && (
        <Sheet title={item ? `Main stat · ${item.name}` : epic ? t.ui.mainEpic(kind) : t.ui.mainUnlisted} onClose={close}>
          <MainPicker ctx={ctx} kind={kind} item={item} epic={epic} current={s.main}
            onPick={(main) => { if (main !== s.main) dispatch({ type: 'main', main }); close(); }} />
        </Sheet>
      )}
      {open !== null && typeof open === 'object' && (
        <Sheet title={t.ui.replaceSub(open.sub)} onClose={close}>
          <SubPicker ctx={ctx} subs={s.subs} main={s.main} editing={open.sub}
            onPick={(key) => { if (key !== open.sub) dispatch({ type: 'replaceSub', from: open.sub, to: key }); close(); }} />
        </Sheet>
      )}
    </div>
  );
}

// Настройки оценки: под формой на широком экране; на телефоне — в меню (inline — без сворачивания).
export function EvalSettings({ s, dispatch, inline }: { s: AppState; dispatch: Dispatch<Action>; inline?: boolean }) {
  const t = useT();
  const st = s.settings;
  const set = (patch: Partial<typeof st>) => dispatch({ type: 'settings', patch });
  const cur = t.ui.settingsNow(st.stage === 'end', st.fodder, st.lv120, st.quirks);
  const body = (
      <div className="settings-body">
        <div className="seg" role="group" aria-label={t.ui.stageGroup}>
          <span className="muted small">{t.ui.stage}</span>
          <button type="button" className="fbtn" aria-pressed={st.stage === 'grow'} onClick={() => set({ stage: 'grow' })}>{t.ui.stageGrow}</button>
          <button type="button" className="fbtn" aria-pressed={st.stage === 'end'} onClick={() => set({ stage: 'end' })}>{t.ui.stageEnd}</button>
        </div>
        <label className="toggle">
          <input type="checkbox" id="opt-fodder" checked={st.fodder} onChange={(e) => set({ fodder: e.target.checked })} />
          {' '}{t.ui.fodder} <span className="muted">{t.ui.fodderNote}</span>
        </label>
        <div className="seg" role="group" aria-label={t.ui.levelGroup}>
          <span className="muted small">{t.ui.level}</span>
          <button type="button" className="fbtn" aria-pressed={!st.lv120} onClick={() => set({ lv120: false })}>lv 100</button>
          <button type="button" className="fbtn" aria-pressed={st.lv120} onClick={() => set({ lv120: true })}>lv 120 (Limit Break)</button>
        </div>
        <label className="toggle">
          <input type="checkbox" id="opt-quirks" checked={st.quirks} onChange={(e) => set({ quirks: e.target.checked })} />
          {' '}{t.ui.quirks} <span className="muted">{t.ui.quirksNote}</span>
        </label>
        <p className="muted small">{t.ui.flatNote}</p>
      </div>
  );
  if (inline) return body;
  return (
    <details className="settings" id="settings" open={s.settingsOpen} onToggle={(e) => dispatch({ type: 'settingsOpen', open: e.currentTarget.open })}>
      <summary>{t.ui.settings} <span className="cur">· {cur.join(' · ')}</span></summary>
      {body}
    </details>
  );
}
