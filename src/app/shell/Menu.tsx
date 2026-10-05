// Меню ☰ на телефоне (с нижней плашки): персонажи, кого доодеть, обмен для команды, код, справка, обучение, настройки оценки и подвал.
// «Не всё надето · N» — герои ростера, у которых надето меньше 6 из 6 (фильтры «только мои» и «не всё надето»); N — сколько их.
// «Обмен для команды» — шторка обмена сразу в режиме «Команда» (для одного героя — «К обмену ▸» на его карточке).
import type { Dispatch, ReactNode } from 'react';
import { useT } from '@/i18n';
import type { Action, AppState } from '@/app/appState';
import { EvalSettings } from '@/features/eval/form/EvalSettings';
import { Sheet } from '@/shared/ui/Sheet';
import { RosterOnlyToggle } from '@/features/eval/form/RosterOnlyToggle';

export function Menu({ s, dispatch, rosterSize, news, onClose, onChars, onBare, bareN, onCode, onHelp, onTour, onTrade, footer }: {
  s: AppState; dispatch: Dispatch<Action>; rosterSize: number; news: boolean; onClose: () => void;
  onChars: () => void; onBare: () => void; bareN: number; onCode: () => void; onHelp: () => void; onTour: () => void; onTrade?: () => void; footer: ReactNode;
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
          <button type="button" className="btn" onClick={go(onBare)}>{t.ui.menuBare(bareN)}</button>
          {onTrade && <button type="button" className="btn" onClick={go(onTrade)}>{t.trade.teamOpen}</button>}
          <button type="button" className="btn" onClick={go(onCode)}>{t.ui.enterCode}</button>
          <button type="button" className={news ? 'btn has-news' : 'btn'} onClick={go(onHelp)}>{t.ui.help}</button>
          <button type="button" className="btn" onClick={go(onTour)}>{t.tour.start}</button>
        </div>
        <RosterOnlyToggle id="menu-roster" s={s} dispatch={dispatch} rosterSize={rosterSize} />
        <EvalSettings s={s} dispatch={dispatch} inline />
        {footer}
      </div>
    </Sheet>
  );
}
