// «Ещё» → «О приложении»: откуда данные, их версия и снимок, сколько персонажей и билдов; как обновить; сборка приложения;
// лицензии.
import { useIndex } from '@/game/data/IndexContext';
import { useT, type Lang } from '@/i18n';
import { MIT_HOLDERS, MIT_TEXT } from './licenses';

// дата последнего коммита кода — в часовом поясе того, кто смотрит
const buildDate = (lang: Lang) => new Date(__BUILD__.date).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

// appUpdate — ждёт обновление только приложения (app/usePwa): тогда «Готова новая версия» уже наверху «Ещё», и про то, как
// обновления приходят, здесь не повторяем
export function About({ lang, appUpdate }: { lang: Lang; appUpdate: boolean }) {
  const m = useIndex().D.meta;
  const t = useT();
  const when = (m.commitDate || m.generatedAt || '').slice(0, 10);
  return (
    <div className="about">
      <p>
        {t.ui.aboutData} <a href="https://github.com/Sevih/outerpedia" target="_blank" rel="noopener">outerpedia</a> (curated gear-reco, © 2026 Sevih, MIT) · {t.ui.aboutGameVersion} {m.gameVersion || '?'} · {t.ui.aboutSnapshot} {when}
        {m.commit && <> · <span className="mono">{String(m.commit).slice(0, 7)}</span></>} · {t.ui.aboutCounts(m.counts.characters, m.counts.withBuilds, m.counts.builds)}
      </p>
      {!window.OGC_PWA
        ? <p>{t.ui.aboutUpdateSingle} <span className="mono">task build:single</span> {t.ui.aboutUpdateSingleWhere}</p>
        : !appUpdate && <p>{t.ui.aboutUpdatePwa}</p>}
      {__BUILD__.hash && <p>{t.ui.aboutBuild(buildDate(lang), __BUILD__.hash, __BUILD__.dirty)}</p>}
      <details className="lic">
        <summary>{t.ui.licenses}</summary>
        {MIT_HOLDERS.map((h) => <p key={h.what}><a href={h.url} target="_blank" rel="noopener">{t.ui.licenseWhat[h.what]}</a><br />{h.who}</p>)}
        {MIT_TEXT.split('\n\n').map((para) => <p key={para.slice(0, 20)} className="mit">{para.replace(/\n/g, ' ')}</p>)}
      </details>
    </div>
  );
}
