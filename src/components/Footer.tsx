// Подвал: откуда данные и их версия, лицензии, версия приложения и готовое её обновление, установка, язык и значки.
// На телефоне он же — внизу меню ☰.
import { useIndex } from './IndexContext';
import type { InstallInfo } from './Guide';
import { LANG_NAME, LANGS, useT, type Lang } from '../i18n';
import { MIT_HOLDERS, MIT_TEXT } from '../licenses';

// «Язык: Русский · English» — в подвале и в справке
export function LangSwitch({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const t = useT();
  return (
    <div className="seg lang" role="group" aria-label={t.ui.language}>
      <span className="muted small">{t.ui.language}:</span>
      {LANGS.map((l) => <button key={l} type="button" className="fbtn" lang={l} aria-pressed={lang === l} onClick={() => onLang(l)}>{LANG_NAME[l]}</button>)}
    </div>
  );
}

// дата последнего коммита кода — в часовом поясе того, кто смотрит
const buildDate = (lang: Lang) => new Date(__BUILD__.date).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

// «Иконки: свои · из игры» — сравнить свои значки с картинками из игры (портреты персонажей — из игры всегда)
function IconSwitch({ game, onChange }: { game: boolean; onChange: (game: boolean) => void }) {
  const t = useT();
  return (
    <div className="seg lang" role="group" aria-label={t.ui.icons}>
      <span className="muted small">{t.ui.icons}:</span>
      <button type="button" className="fbtn" aria-pressed={!game} onClick={() => onChange(false)}>{t.ui.iconsOwn}</button>
      <button type="button" className="fbtn" aria-pressed={game} onClick={() => onChange(true)}>{t.ui.iconsGame}</button>
    </div>
  );
}

// onAppUpdate — ждёт обновление только приложения (hooks/usePwa): вместо строки про обновления — «Готова новая версия»
// с кнопкой, для тех, кто хочет сразу. Само оно включится при следующем запуске, а Android может неделями не выгружать PWA
export function Footer({ install, lang, onLang, gameIcons, onIcons, onAppUpdate }: {
  install: InstallInfo; lang: Lang; onLang: (l: Lang) => void; gameIcons: boolean; onIcons: (game: boolean) => void; onAppUpdate?: () => void;
}) {
  const m = useIndex().D.meta;
  const t = useT();
  const when = (m.commitDate || m.generatedAt || '').slice(0, 10);
  return (
    <footer className="foot" id="foot">
      <span>
        {t.ui.footData} <a href="https://github.com/Sevih/outerpedia" target="_blank" rel="noopener">outerpedia</a> (curated gear-reco, © 2026 Sevih, MIT) · {t.ui.footGameVersion} {m.gameVersion || '?'} · {t.ui.footSnapshot} {when}
        {m.commit && <> · <span className="mono">{String(m.commit).slice(0, 7)}</span></>} · {t.ui.footCounts(m.counts.characters, m.counts.withBuilds, m.counts.builds)}
      </span>
      {onAppUpdate && <span>{t.ui.footUpdateReady} <button type="button" className="btn" onClick={onAppUpdate}>{t.ui.updateAction}</button></span>}
      <span>
        {!window.OGC_PWA ? <>{t.ui.footUpdateSingle} <span className="mono">task build:single</span> {t.ui.footUpdateSingleWhere}{' '}</>
          : !onAppUpdate && <>{t.ui.footUpdatePwa}{' '}</>}
        {t.ui.footRights}
      </span>
      <details className="lic">
        <summary>{t.ui.licenses}</summary>
        {MIT_HOLDERS.map((h) => <p key={h.what}><a href={h.url} target="_blank" rel="noopener">{t.ui.licenseWhat[h.what]}</a><br />{h.who}</p>)}
        {MIT_TEXT.split('\n\n').map((para) => <p key={para.slice(0, 20)} className="mit">{para.replace(/\n/g, ' ')}</p>)}
      </details>
      {__BUILD__.hash && <span>{t.ui.footBuild(buildDate(lang), __BUILD__.hash, __BUILD__.dirty)}</span>}
      {install.canInstall && <span><button type="button" className="btn" onClick={install.onInstall}>{t.ui.installApp}</button></span>}
      {install.ios && <span>{t.ui.iosFooter}</span>}
      <LangSwitch lang={lang} onLang={onLang} />
      <IconSwitch game={gameIcons} onChange={onIcons} />
    </footer>
  );
}
