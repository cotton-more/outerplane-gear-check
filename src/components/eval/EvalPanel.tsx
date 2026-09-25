// Панель ввода предмета: слот → грейд → сет / предмет / main → сабстаты, плюс настройки оценки.
import type { Dispatch } from 'react';
import { GRADE_NAME, GRADES, SLOTS, isArmor } from '../../data';
import type { GearKind } from '../../data/types';
import type { Ctx } from '../../logic/context';
import type { Action, AppState } from '../../state/appState';
import { Img } from '../Img';
import { ItemStep } from './ItemStep';
import { MainStatStep } from './MainStatStep';
import { SetStep } from './SetStep';
import { SubStep } from './SubStep';

export interface StepProps { s: AppState; dispatch: Dispatch<Action>; ctx: Ctx }

const fineHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function EvalPanel({ s, dispatch, ctx, onNext }: StepProps & { onNext: () => void }) {
  const { D } = ctx.idx;
  const kind = s.slot as GearKind;
  return (
    <div className="panel eval-in" id="eval-in">
      <div className="step">
        <div className="step-h"><h2>Слот</h2><span className="hint">что за предмет</span></div>
        <div className="slots">
          {SLOTS.map((sl, i) => (
            <button key={sl.id} type="button" className="slot" aria-pressed={s.slot === sl.id} onClick={() => dispatch({ type: 'slot', slot: sl.id })}>
              <Img k={'eq:' + D.slotIcons[sl.id]} /><span>{sl.name}</span><kbd>{i + 1}</kbd>
            </button>
          ))}
        </div>
      </div>
      <div className="step">
        <div className="step-h"><h2>Грейд</h2><span className="hint">6★ · Etheric = Legendary, Steel = Epic</span></div>
        <div className="grades">
          {GRADES.map((g) => (
            <button key={g} type="button" className={`grade ${g}`} aria-pressed={s.grade === g} onClick={() => dispatch({ type: 'grade', grade: g })}>
              <Img k={'frame:' + g} /><span className="gname">{GRADE_NAME[g]}</span>
            </button>
          ))}
        </div>
      </div>
      {isArmor(s.slot) ? <SetStep s={s} dispatch={dispatch} ctx={ctx} />
        : s.grade === 'rare' ? <MainStatStep s={s} dispatch={dispatch} ctx={ctx} kind={kind} mode="epic" />
        : s.unlisted ? <MainStatStep s={s} dispatch={dispatch} ctx={ctx} kind={kind} mode="unlisted" />
        : <ItemStep s={s} dispatch={dispatch} ctx={ctx} kind={kind} />}
      <SubStep s={s} dispatch={dispatch} ctx={ctx} />
      <div className="actions">
        <button type="button" className="btn primary" onClick={onNext}>Следующий предмет</button>
        <label className="toggle">
          <input type="checkbox" id="opt-roster" checked={s.settings.rosterOnly} onChange={(e) => dispatch({ type: 'settings', patch: { rosterOnly: e.target.checked } })} />
          {' '}только мои персонажи{ctx.roster.size ? ` (${ctx.roster.size})` : ' — отметь их во вкладке «Персонажи»'}
        </label>
        <span className="hk">
          {fineHover() && <><kbd>1</kbd>–<kbd>6</kbd> слот · <kbd>L</kbd>/<kbd>E</kbd> грейд · <kbd>/</kbd> поиск · <kbd>Esc</kbd> сброс</>}
        </span>
      </div>
      <EvalSettings s={s} dispatch={dispatch} />
    </div>
  );
}

function EvalSettings({ s, dispatch }: Omit<StepProps, 'ctx'>) {
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
