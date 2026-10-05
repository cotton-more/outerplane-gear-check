// «Ещё» — одна шторка и на телефоне (кнопка ☰ на нижней плашке), и на ПК (кнопка ⋯ в шапке); .x/0070-more-sheet SPEC 1.
// Сверху вниз: переходы (только на узком экране: ★ Персонажи, «Доодеть · N», «Обмен для команды»); уведомления, пока
// актуальны (новая версия, установка, подсказка для iPhone); «Ввести код», «Справка», «Обучение»; «Настройки» (только мои,
// «Оценка» со сводкой, язык, значки); «Данные» («Резервная копия» и «О приложении» раскрываются на месте); внизу — обязательная
// фраза VA Games, всегда на виду (не прокручивается). Нажатие на переход или действие закрывает шторку и выполняет его.
import { useState, type Dispatch } from 'react';
import { useT, type Lang } from '@/i18n';
import type { Action, AppState } from '@/app/appState';
import { EvalSettings } from '@/features/eval/form/EvalSettings';
import { RosterOnlyToggle } from '@/features/eval/form/RosterOnlyToggle';
import type { GearApi } from '@/features/gear/store/useGear';
import { BackupIO } from '@/features/roster/BackupIO';
import type { RosterApi } from '@/features/roster/useRoster';
import { Expand } from '@/shared/ui/Expand';
import { Notice } from '@/shared/ui/Notice';
import { Sheet } from '@/shared/ui/Sheet';
import { About } from './About';
import type { InstallInfo } from './Guide';
import { IconSwitch, LangSwitch } from './Switches';

export function More({ s, dispatch, rosterSize, todressN, news, narrow, touring, rosterApi, gear, onBackup, lang, onLang, gameIcons, onIcons, install, onAppUpdate,
  onClose, onChars, onTodress, onTrade, onCode, onHelp, onTour }: {
  s: AppState; dispatch: Dispatch<Action>; rosterSize: number; todressN: number; news: boolean;
  narrow: boolean;                       // телефон: сверху переходы (на ПК вкладки в шапке)
  touring: boolean;                      // идёт обучение: вместо поля копии — пояснение (на странице пример, не вещи игрока)
  rosterApi: RosterApi; gear: GearApi; onBackup: (text: string) => string;
  lang: Lang; onLang: (l: Lang) => void; gameIcons: boolean; onIcons: (game: boolean) => void;
  install: InstallInfo; onAppUpdate?: () => void;
  onClose: () => void; onChars: () => void; onTodress: () => void; onTrade?: () => void; onCode: () => void; onHelp: () => void; onTour: () => void;
}) {
  const t = useT();
  const [backupOpen, setBackupOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const go = (f: () => void) => () => { onClose(); f(); };
  return (
    <Sheet title={t.ui.more} onClose={onClose} foot={<p className="more-rights">{t.ui.rights}</p>}>
      <div className="more">
        {narrow && (
          <div className="more-nav">
            <button type="button" className="btn" onClick={go(onChars)}>
              {rosterSize ? <><span className="vb-star">★</span> {t.ui.tabChars} {rosterSize}</> : `☆ ${t.ui.tabChars}`}
            </button>
            <button type="button" className="btn" onClick={go(onTodress)}>{t.ui.menuBare(todressN)}</button>
            {onTrade && <button type="button" className="btn" onClick={go(onTrade)}>{t.trade.teamOpen}</button>}
          </div>
        )}
        {(onAppUpdate || install.canInstall || install.ios) && (
          <div className="more-notes">
            {onAppUpdate && <Notice text={t.ui.updateReady} action={t.ui.updateAction} onAction={onAppUpdate} />}
            {install.canInstall && <Notice text={t.ui.canInstall} action={t.ui.installApp} onAction={install.onInstall} />}
            {install.ios && <p className="more-ios small muted">{t.ui.iosMore}</p>}
          </div>
        )}
        <div className="more-acts">
          <button type="button" className="btn" onClick={go(onCode)}>{t.ui.enterCode}</button>
          <button type="button" className={news ? 'btn has-news' : 'btn'} onClick={go(onHelp)}>{t.ui.help}</button>
          <button type="button" className="btn" onClick={go(onTour)}>{t.tour.start}</button>
        </div>
        <section className="more-group" aria-label={t.ui.moreSettings}>
          <h4>{t.ui.moreSettings}</h4>
          <RosterOnlyToggle id="menu-roster" s={s} dispatch={dispatch} rosterSize={rosterSize} />
          <EvalSettings s={s} dispatch={dispatch} />
          <LangSwitch lang={lang} onLang={onLang} />
          <IconSwitch game={gameIcons} onChange={onIcons} />
        </section>
        <section className="more-group" aria-label={t.ui.moreData}>
          <h4>{t.ui.moreData}</h4>
          <Expand id="more-backup" title={t.ui.backup} open={backupOpen} onToggle={setBackupOpen}>
            {touring
              ? <p className="small muted">{t.ui.gearCodeTour}</p>
              : <BackupIO rosterApi={rosterApi} gear={gear} onBackup={onBackup} onDone={onClose} />}
          </Expand>
          <Expand id="more-about" title={t.ui.about} open={aboutOpen} onToggle={setAboutOpen}>
            <About lang={lang} appUpdate={!!onAppUpdate} />
          </Expand>
        </section>
      </div>
    </Sheet>
  );
}
