// Меню ☰ на телефоне (с нижней плашки): персонажи, код, справка, обучение, настройки оценки и подвал.
import type { Dispatch, ReactNode } from 'react';
import { useT } from '../i18n';
import type { Action, AppState } from '../state/appState';
import { EvalSettings } from './eval/EvalPanel';
import { Sheet } from './Sheet';

export function Menu({ s, dispatch, rosterSize, news, onClose, onChars, onCode, onHelp, onTour, footer }: {
  s: AppState; dispatch: Dispatch<Action>; rosterSize: number; news: boolean; onClose: () => void;
  onChars: () => void; onCode: () => void; onHelp: () => void; onTour: () => void; footer: ReactNode;
}) {
  const t = useT();
  const go = (f: () => void) => () => { onClose(); f(); };
  return (
    <Sheet title={t.ui.menu} onClose={onClose}>
      <div className="menu">
        <div className="menu-nav">
          <button type="button" className="btn" onClick={go(onChars)}>
            {rosterSize ? <><span className="vb-star">★</span> {rosterSize} · </> : '☆ '}{t.ui.tabChars}
          </button>
          <button type="button" className="btn" onClick={go(onCode)}>{t.ui.enterCode}</button>
          <button type="button" className={news ? 'btn has-news' : 'btn'} onClick={go(onHelp)}>{t.ui.help}</button>
          <button type="button" className="btn" onClick={go(onTour)}>{t.tour.start}</button>
        </div>
        <label className="toggle">
          <input type="checkbox" id="menu-roster" checked={s.settings.rosterOnly} onChange={(e) => dispatch({ type: 'settings', patch: { rosterOnly: e.target.checked } })} />
          {' '}{t.ui.rosterOnly}{rosterSize ? ` (${rosterSize})` : t.ui.rosterOnlyEmpty}
        </label>
        <EvalSettings s={s} dispatch={dispatch} inline />
        {footer}
      </div>
    </Sheet>
  );
}
