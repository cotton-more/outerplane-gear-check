// Панель ввода предмета — компактная форма, чтобы в разделённом экране весь ввод помещался без прокрутки:
// слот → грейд + сет/предмет/main → строки сабстатов. Конкретные значения выбираются в окнах (Sheet).
import { useEffect, useRef, useState, type Dispatch } from 'react';
import { GRADE_NAME, GRADES, SLOTS, isArmor } from '../../data';
import type { GearKind } from '../../data/types';
import type { Ctx } from '../../logic/context';
import { maxSubs } from '../../logic/subs';
import { fitsData, type Action, type AppState } from '../../state/appState';
import { Frame, Img, StatIcon } from '../Img';
import { Sheet } from '../Sheet';
import { CodeInput } from './ItemCode';
import { ItemPicker } from './ItemPicker';
import { MainPicker } from './MainPicker';
import { PickField } from './PickField';
import { SetPicker } from './SetPicker';
import { SubPicker } from './SubPicker';
import { SubRows } from './SubRows';

type Open = null | 'set' | 'item' | 'main' | 'code' | { sub: string | null }; // sub: какой стат заменяем (null — новый)

const fineHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function EvalPanel({ s, dispatch, ctx, onNext }: { s: AppState; dispatch: Dispatch<Action>; ctx: Ctx; onNext: () => void }) {
  const { D, SET, ITEM } = ctx.idx;
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  // окно закрылось — следующая пустая строка сабстата встаёт над плашкой вердикта, если была под ней.
  // В эффекте, а не сразу: к этому моменту шторка уже сняла блокировку прокрутки страницы.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open === null && wasOpen.current) document.querySelector('.form .subadd')?.scrollIntoView({ block: 'nearest' });
    wasOpen.current = open !== null;
  }, [open]);
  const armor = isArmor(s.slot);
  const kind = s.slot as GearKind;
  const epic = s.grade === 'rare';
  const set = armor && s.setId ? SET[s.setId] : undefined;
  const item = !armor && !epic && s.itemKey ? ITEM[kind][s.itemKey] : undefined;
  const hasMains = (key: string) => { const it = ITEM[kind][key]; return !!it && (it.mains.length > 0 || it.extraMains.length > 0); };
  const mainRow = !armor && !epic && (s.unlisted || (!!s.itemKey && hasMains(s.itemKey)));
  const mainValue = s.main ? <><StatIcon stat={s.main} />{s.main}</> : undefined;
  const gearName = kind === 'weapon' ? 'Оружие' : 'Аксессуар';

  return (
    <div className="panel eval-in" id="eval-in">
      <div className="form">
        <div className="slotrow" role="group" aria-label="Слот">
          {SLOTS.map((sl, i) => (
            <button key={sl.id} type="button" className="slot" aria-pressed={s.slot === sl.id} aria-label={sl.name} title={sl.name}
              onClick={() => dispatch({ type: 'slot', slot: sl.id })}>
              <Img k={'eq:' + D.slotIcons[sl.id]} /><span>{sl.name}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
        <div className="formrow">
          <div className="gradesw" role="group" aria-label="Грейд: Etheric — Legendary, Steel — Epic">
            {GRADES.map((g) => (
              <button key={g} type="button" className={`grade ${g}`} aria-pressed={s.grade === g} aria-label={GRADE_NAME[g]} title={`${GRADE_NAME[g]} (${g === 'unique' ? 'Etheric' : 'Steel'})`}
                onClick={() => dispatch({ type: 'grade', grade: g })}>
                <Img k={'frame:' + g} /><span className="gname">{g === 'unique' ? 'L' : 'E'}</span>
              </button>
            ))}
          </div>
          {armor
            ? <PickField value={set && <><Img k={'eq:' + set.icon} />{set.short} Set</>} placeholder="Выбрать сет" onClick={() => setOpen('set')} />
            : epic
              ? <PickField value={mainValue} placeholder="Main stat" onClick={() => setOpen('main')} />
              : <PickField value={item ? <><Frame item={item} /><span className="pick-t">{item.name}</span></> : s.unlisted ? 'Нет в списке' : undefined}
                  placeholder={`${gearName} — найти`} onClick={() => setOpen('item')} />}
        </div>
        {mainRow && <div className="formrow"><PickField className="main" value={mainValue} placeholder="Main stat" onClick={() => setOpen('main')} /></div>}
        <SubRows subs={s.subs} grade={s.grade} dispatch={dispatch} onPick={(editing) => setOpen({ sub: editing })} />
      </div>

      <div className="actions">
        <button type="button" className="btn primary" onClick={onNext}>Следующий предмет</button>
        <button type="button" className="btn" onClick={() => setOpen('code')}>Ввести код</button>
        <label className="toggle">
          <input type="checkbox" id="opt-roster" checked={s.settings.rosterOnly} onChange={(e) => dispatch({ type: 'settings', patch: { rosterOnly: e.target.checked } })} />
          {' '}только мои персонажи{ctx.roster.size ? ` (${ctx.roster.size})` : ' — отметь их во вкладке «Персонажи»'}
        </label>
        <span className="hk">
          {fineHover() && <><kbd>1</kbd>–<kbd>6</kbd> слот · <kbd>L</kbd>/<kbd>E</kbd> грейд · <kbd>Esc</kbd> следующий</>}
        </span>
      </div>
      <EvalSettings s={s} dispatch={dispatch} />

      {open === 'set' && (
        <Sheet title="Сет — в названии после «of»" onClose={close}>
          <SetPicker ctx={ctx} current={s.setId} onPick={(setId) => { dispatch({ type: 'set', setId }); close(); }} />
        </Sheet>
      )}
      {open === 'item' && (
        <Sheet title={`Legendary ${gearName.toLowerCase()}`} onClose={close}>
          <ItemPicker ctx={ctx} kind={kind} current={s.itemKey}
            onPick={(key) => { dispatch({ type: 'item', itemKey: key }); setOpen(hasMains(key) ? 'main' : null); }}
            onUnlisted={() => { dispatch({ type: 'unlisted' }); setOpen('main'); }} />
        </Sheet>
      )}
      {open === 'main' && (
        <Sheet title={item ? `Main stat · ${item.name}` : epic ? `Main stat · Epic ${gearName.toLowerCase()}` : 'Main stat · нет в списке'} onClose={close}>
          <MainPicker ctx={ctx} kind={kind} item={item} epic={epic} current={s.main}
            onPick={(main) => { if (main !== s.main) dispatch({ type: 'main', main }); close(); }} />
        </Sheet>
      )}
      {open === 'code' && (
        <Sheet title="Код предмета" onClose={close}>
          <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); close(); }} />
        </Sheet>
      )}
      {open !== null && typeof open === 'object' && (
        <Sheet title={open.sub ? `Заменить ${open.sub}` : `Сабстат ${Object.keys(s.subs).length + 1} из ${maxSubs(s.grade)}`} onClose={close}>
          <SubPicker ctx={ctx} subs={s.subs} main={s.main} editing={open.sub}
            onPick={(key) => {
              if (!open.sub) dispatch({ type: 'sub', key });
              else if (key !== open.sub) dispatch({ type: 'replaceSub', from: open.sub, to: key });
              close();
            }} />
        </Sheet>
      )}
    </div>
  );
}

function EvalSettings({ s, dispatch }: { s: AppState; dispatch: Dispatch<Action> }) {
  const st = s.settings;
  const set = (patch: Partial<typeof st>) => dispatch({ type: 'settings', patch });
  const cur = [st.stage === 'end' ? 'эндгейм' : 'развитие', st.fodder ? 'коплю фоддер' : 'без фоддера брони', st.lv120 ? 'lv 120' : 'lv 100', st.quirks ? 'Quirks' : 'без Quirks'];
  return (
    <details className="settings" id="settings" open={s.settingsOpen} onToggle={(e) => dispatch({ type: 'settingsOpen', open: e.currentTarget.open })}>
      <summary>Настройки оценки <span className="cur">· {cur.join(' · ')}</span></summary>
      <div className="settings-body">
        <div className="seg" role="group" aria-label="Этап аккаунта">
          <span className="muted small">Этап:</span>
          <button type="button" className="fbtn" aria-pressed={st.stage === 'grow'} onClick={() => set({ stage: 'grow' })}>Развитие — держу временные замены</button>
          <button type="button" className="fbtn" aria-pressed={st.stage === 'end'} onClick={() => set({ stage: 'end' })}>Эндгейм — только рекомендованное</button>
        </div>
        <label className="toggle">
          <input type="checkbox" id="opt-fodder" checked={st.fodder} onChange={(e) => set({ fodder: e.target.checked })} />
          {' '}коплю Legendary броню для Breakthrough <span className="muted">(не дотянувшие по сабстатам станут «Фоддер», а не «Разобрать»)</span>
        </label>
        <div className="seg" role="group" aria-label="Уровень персонажей">
          <span className="muted small">Уровень персонажей:</span>
          <button type="button" className="fbtn" aria-pressed={!st.lv120} onClick={() => set({ lv120: false })}>lv 100</button>
          <button type="button" className="fbtn" aria-pressed={st.lv120} onClick={() => set({ lv120: true })}>lv 120 (Limit Break)</button>
        </div>
        <label className="toggle">
          <input type="checkbox" id="opt-quirks" checked={st.quirks} onChange={(e) => set({ quirks: e.target.checked })} />
          {' '}Quirks прокачаны <span className="muted">(Base → Quirk: бонусы статов по элементу и классу)</span>
        </label>
        <p className="muted small">Уровень и Quirks влияют только на сравнение flat и % у ATK/DEF/HP: %-сабстат умножает собственную базу персонажа (уровень + эволюции + flat-бонусы Quirks), а flat прибавляет фиксированное число. Чем выше база, тем выгоднее %.</p>
      </div>
    </details>
  );
}
