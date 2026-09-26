import { useCallback, useEffect, useMemo, useState } from 'react';
import { CharDetail } from './components/chars/CharDetail';
import { CharList } from './components/chars/CharList';
import { EvalPanel } from './components/eval/EvalPanel';
import { Help, Welcome, type InstallInfo } from './components/Guide';
import { VBar, Verdict, VerdictSheet } from './components/eval/Verdict';
import { Header } from './components/Header';
import { useIndex } from './components/IndexContext';
import { Notice } from './components/Notice';
import { Sheet } from './components/Sheet';
import { slugFromHash, useHashRoute } from './hooks/useHashRoute';
import { useHotkeys } from './hooks/useHotkeys';
import { useLayout } from './hooks/useLayout';
import { usePwa } from './hooks/usePwa';
import type { Index } from './data';
import { LANG_NAME, LANGS, LangContext, TEXTS, savedLang, useT, type Lang } from './i18n';
import { makeCtx } from './logic/context';
import { evaluate } from './logic/evaluate';
import { charMatches } from './logic/lists';
import type { ItemInput } from './logic/verdict';
import { itemInput, reducer, type Action, type AppState, type Tab } from './state/appState';
import { storage } from './state/storage';
import { useAppState } from './state/useAppState';
import { useRoster } from './state/useRoster';
import { MIT_HOLDERS, MIT_TEXT } from './licenses';

// открыть персонажа; если фильтры списка его прячут — сбросить их (у персонажа без билдов — ещё и «показать без билдов»)
function openCharAction(idx: Index, s: AppState, roster: ReadonlySet<string>, id: string): Action {
  const c = idx.CHAR[id];
  const reveal = !c || charMatches(c, s, roster) ? 'keep' : c.builds.length ? 'filters' : 'filters+all';
  return { type: 'openChar', id, reveal };
}

export function App() {
  const idx = useIndex();
  const layout = useLayout();
  const rosterApi = useRoster(idx);
  const { roster } = rosterApi;
  // #slug в адресе при загрузке важнее сохранённой вкладки
  const [s, dispatch] = useAppState(idx, (init) => {
    const c = idx.CHAR_BY_SLUG[slugFromHash()];
    return c ? reducer(init, openCharAction(idx, init, roster, c.id)) : init;
  });
  const [lang, setLang] = useState<Lang>(savedLang);
  const t = TEXTS[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const changeLang = (l: Lang) => { storage.set('lang', l); setLang(l); };
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t), [idx, s.settings, roster, t]);
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const verdict = useMemo(() => evaluate(ctx, input), [ctx, ...Object.values(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pwa = usePwa();
  const [fitHidden, setFitHidden] = useState(() => storage.get('fitnoteHidden', false));
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // «Следующий» убрал предмет по ошибке — несколько секунд его можно вернуть
  const [undo, setUndo] = useState<ItemInput | null>(null);
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(id);
  }, [undo]);
  // карточка «Как пользоваться» — новичку, пока он не отметил своих персонажей и не закрыл её
  const [welcomeHidden, setWelcomeHidden] = useState(() => storage.get('welcomeHidden', false));
  const install: InstallInfo = { canInstall: pwa.canInstall, onInstall: pwa.install, ios: pwa.iosInstall };

  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id)), [idx, s, roster, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar);

  const onReset = () => {
    const cur = itemInput(s);
    setVerdictOpen(false);
    dispatch({ type: 'reset' });
    setUndo(Object.keys(cur.subs).length || cur.itemKey || cur.main || cur.unlisted ? cur : null);
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onUndo = () => { if (undo) dispatch({ type: 'load', item: undo }); setUndo(null); };
  useHotkeys(s, dispatch, layout, onReset);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });

  return (
    <LangContext.Provider value={t}>
      <div className="app">
        <Header tab={s.tab} onTab={onTab} rosterSize={roster.size} />
        {pwa.updateReady && <div id="updnote"><Notice text={t.ui.updateNotice} action={t.ui.updateAction} onAction={pwa.applyUpdate} /></div>}
        {layout.desktopModeOnPhone && !fitHidden && (
          <div id="fitnote">
            <Notice text={t.ui.desktopModeNotice}
              action={t.ui.gotIt} onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
          </div>
        )}
        {s.tab === 'eval' && !welcomeHidden && roster.size === 0 && (
          <Welcome install={install} onRoster={() => onTab('chars')} onClose={() => { storage.set('welcomeHidden', true); setWelcomeHidden(true); }} />
        )}
        <main>
          <section id="view-eval" className="view eval" role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            <EvalPanel s={s} dispatch={dispatch} ctx={ctx} onReset={onReset} onHelp={() => setHelpOpen(true)} />
            {!layout.narrow && <Verdict r={verdict} s={s} dispatch={dispatch} onOpenChar={openChar} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={rosterApi} />
            <CharDetail key={s.charId ?? ''} charId={s.charId} ctx={ctx} rosterApi={rosterApi}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} />
        <VBar r={verdict} show={layout.narrow} compact={layout.tiny} tab={s.tab} rosterSize={roster.size} onTab={onTab} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
        {undo && s.tab === 'eval' && (
          <div className="toast" role="status"><span>{t.ui.undoText}</span><button type="button" onClick={onUndo}>{t.ui.undoAction}</button></div>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => setHelpOpen(false)}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={verdict} s={s} dispatch={dispatch} onOpenChar={openChar} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </LangContext.Provider>
  );
}

// «Язык: Русский · English» — в подвале и в справке
function LangSwitch({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const t = useT();
  return (
    <div className="seg lang" role="group" aria-label={t.ui.language}>
      <span className="muted small">{t.ui.language}:</span>
      {LANGS.map((l) => <button key={l} type="button" className="fbtn" lang={l} aria-pressed={lang === l} onClick={() => onLang(l)}>{LANG_NAME[l]}</button>)}
    </div>
  );
}

function Footer({ install, lang, onLang }: { install: InstallInfo; lang: Lang; onLang: (l: Lang) => void }) {
  const m = useIndex().D.meta;
  const t = useT();
  const when = (m.commitDate || m.generatedAt || '').slice(0, 10);
  return (
    <footer className="foot" id="foot">
      <span>
        {t.ui.footData} <a href="https://github.com/Sevih/outerpedia" target="_blank" rel="noopener">outerpedia</a> (curated gear-reco, © 2026 Sevih, MIT) · {t.ui.footGameVersion} {m.gameVersion || '?'} · {t.ui.footSnapshot} {when}
        {m.commit && <> · <span className="mono">{String(m.commit).slice(0, 7)}</span></>} · {t.ui.footCounts(m.counts.characters, m.counts.withBuilds, m.counts.builds)}
      </span>
      <span>
        {window.OGC_PWA ? t.ui.footUpdatePwa : <>{t.ui.footUpdateSingle} <span className="mono">task build:single</span> {t.ui.footUpdateSingleWhere}</>}
        {' '}{t.ui.footRights}
      </span>
      <details className="lic">
        <summary>{t.ui.licenses}</summary>
        {MIT_HOLDERS.map((h) => <p key={h.what}><a href={h.url} target="_blank" rel="noopener">{t.ui.licenseWhat[h.what]}</a><br />{h.who}</p>)}
        {MIT_TEXT.split('\n\n').map((para) => <p key={para.slice(0, 20)} className="mit">{para.replace(/\n/g, ' ')}</p>)}
      </details>
      {install.canInstall && <span><button type="button" className="btn" onClick={install.onInstall}>{t.ui.installApp}</button></span>}
      {install.ios && <span>{t.ui.iosFooter}</span>}
      <LangSwitch lang={lang} onLang={onLang} />
    </footer>
  );
}
