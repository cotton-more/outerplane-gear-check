// Справка для новичка: карточка при первом запуске (пока ростер пуст) и окно «Справка».
import { useT } from '../i18n';
import { CODE_PREFIX } from '../logic/itemCode';
import { Rich } from './Rich';

export interface InstallInfo { canInstall: boolean; onInstall: () => void; ios: boolean }

const List = ({ items, ordered }: { items: string[]; ordered?: boolean }) => {
  const li = items.map((x) => <li key={x}><Rich text={x} /></li>);
  return ordered ? <ol>{li}</ol> : <ul>{li}</ul>;
};

// установка: на Android — кнопка (beforeinstallprompt), на iPhone и iPad — только вручную через «Поделиться»
function InstallHint({ install }: { install: InstallInfo }) {
  const t = useT();
  if (install.canInstall) {
    return (
      <p className="guide-install">
        <span>{t.ui.canInstall}</span>
        <button type="button" className="btn" onClick={install.onInstall}>{t.ui.install}</button>
      </p>
    );
  }
  if (install.ios) return <p className="guide-install"><span><Rich text={t.ui.iosInstall} /></span></p>;
  return null;
}

export function Welcome({ install, onRoster, onClose }: { install: InstallInfo; onRoster: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <section className="panel welcome" aria-label={t.ui.howTo}>
      <h2>{t.ui.howTo}</h2>
      <List items={t.ui.steps} ordered />
      <InstallHint install={install} />
      <div className="welcome-actions">
        <button type="button" className="btn primary" onClick={onRoster}>{t.ui.markChars}</button>
        <button type="button" className="btn" onClick={onClose}>{t.ui.gotIt}</button>
      </div>
    </section>
  );
}

// содержимое окна «Справка»
export function Help({ install }: { install: InstallInfo }) {
  const t = useT();
  return (
    <div className="guide">
      <h4>{t.ui.howTo}</h4>
      <List items={t.ui.steps} ordered />
      <h4>{t.ui.helpInput}</h4>
      <List items={t.ui.helpInputItems} />
      <h4>{t.ui.verdict}</h4>
      <List items={t.ui.helpVerdicts} />
      <h4>{t.ui.tabChars}</h4>
      <List items={t.ui.helpChars} />
      <h4>{t.ui.helpCode}</h4>
      <p>{t.ui.helpCodeText(`${CODE_PREFIX} KXRM TPWA`)}</p>
      <h4>{t.ui.helpInstall}</h4>
      <InstallHint install={{ ...install, ios: false }} /> {/* для iPhone — строка в списке ниже */}
      <List items={t.ui.helpInstallItems} />
    </div>
  );
}
