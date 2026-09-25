import { useCallback, useMemo, useState } from 'react';
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
import { makeCtx } from './logic/context';
import { evaluate } from './logic/evaluate';
import { charMatches } from './logic/lists';
import { persons } from './logic/text';
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
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster), [idx, s.settings, roster]);
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const verdict = useMemo(() => evaluate(ctx, input), [ctx, ...Object.values(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pwa = usePwa();
  const [fitHidden, setFitHidden] = useState(() => storage.get('fitnoteHidden', false));
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // карточка «Как пользоваться» — новичку, пока он не отметил своих персонажей и не закрыл её
  const [welcomeHidden, setWelcomeHidden] = useState(() => storage.get('welcomeHidden', false));
  const install: InstallInfo = { canInstall: pwa.canInstall, onInstall: pwa.install, ios: pwa.iosInstall };

  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id)), [idx, s, roster, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar);
  useHotkeys(s, dispatch, layout);

  const onReset = () => {
    setVerdictOpen(false);
    dispatch({ type: 'reset' });
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });

  return (
    <div className="app">
      <Header tab={s.tab} onTab={onTab} rosterSize={roster.size} />
      {pwa.updateReady && <div id="updnote"><Notice text="Вышли новые данные outerpedia — обнови, чтобы видеть свежие билды." action="Обновить" onAction={pwa.applyUpdate} /></div>}
      {layout.desktopModeOnPhone && !fitHidden && (
        <div id="fitnote">
          <Notice text="Браузер открыл страницу в режиме «Версия для ПК» — я подстроил масштаб. Если что-то выглядит странно, выключи этот режим: меню ⋮ → «Версия для ПК»."
            action="Понятно" onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
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
      <Footer install={install} />
      <VBar r={verdict} show={layout.narrow} compact={layout.tiny} tab={s.tab} rosterSize={roster.size} onTab={onTab} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
      {helpOpen && <Sheet title="Справка" onClose={() => setHelpOpen(false)}><Help install={install} /></Sheet>}
      {verdictOpen && layout.narrow && s.tab === 'eval' && (
        <VerdictSheet r={verdict} s={s} dispatch={dispatch} onOpenChar={openChar} onClose={() => setVerdictOpen(false)} />
      )}
    </div>
  );
}

function Footer({ install }: { install: InstallInfo }) {
  const m = useIndex().D.meta;
  const when = (m.commitDate || m.generatedAt || '').slice(0, 10);
  return (
    <footer className="foot" id="foot">
      <span>
        Данные: <a href="https://github.com/Sevih/outerpedia" target="_blank" rel="noopener">outerpedia</a> (curated gear-reco, © 2026 Sevih, MIT) · версия игры {m.gameVersion || '?'} · снимок от {when}
        {m.commit && <> · <span className="mono">{String(m.commit).slice(0, 7)}</span></>} · {persons(m.counts.characters)}, с билдами {m.counts.withBuilds}, билдов {m.counts.builds}.
      </span>
      <span>
        {window.OGC_PWA ? 'Когда выйдут новые данные, при открытии появится плашка «Обновить».' : <>Обновить данные: <span className="mono">task build:single</span> в папке проекта.</>}
        {' '}Игровые данные и изображения принадлежат Major9 / VA Games, билды — авторам outerpedia. Неофициальный фанатский инструмент: не связан ни с издателем, ни с outerpedia.
      </span>
      <details className="lic">
        <summary>Лицензии (MIT)</summary>
        {MIT_HOLDERS.map((h) => <p key={h.what}><a href={h.url} target="_blank" rel="noopener">{h.what}</a><br />{h.who}</p>)}
        {MIT_TEXT.split('\n\n').map((para) => <p key={para.slice(0, 20)} className="mit">{para.replace(/\n/g, ' ')}</p>)}
      </details>
      {install.canInstall && <span><button type="button" className="btn" onClick={install.onInstall}>Установить как приложение</button></span>}
      {install.ios && <span>На iPhone и iPad: в Safari «Поделиться» → «На экран „Домой“» — будет работать как приложение и без сети.</span>}
    </footer>
  );
}
