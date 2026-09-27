import { useCallback, useEffect, useMemo, useState } from 'react';
import { CharDetail } from './components/chars/CharDetail';
import { CharList } from './components/chars/CharList';
import { EvalPanel } from './components/eval/EvalPanel';
import { CodeInput } from './components/eval/ItemCode';
import { Help, Welcome, type InstallInfo } from './components/Guide';
import { VBar, Verdict, VerdictSheet } from './components/eval/Verdict';
import { Footer, LangSwitch } from './components/Footer';
import { Header } from './components/Header';
import { GameIconsContext } from './components/Img';
import { useIndex } from './components/IndexContext';
import { Menu } from './components/Menu';
import { Notice } from './components/Notice';
import { Sheet } from './components/Sheet';
import { slugFromHash, useHashRoute } from './hooks/useHashRoute';
import { useHotkeys } from './hooks/useHotkeys';
import { fineHover, useLayout } from './hooks/useLayout';
import { usePwa } from './hooks/usePwa';
import { isArmor, type Index } from './data';
import { LangContext, TEXTS, savedLang, type Lang } from './i18n';
import { makeCtx } from './logic/context';
import { evaluate } from './logic/evaluate';
import { charMatches } from './logic/lists';
import { dropSubs } from './logic/subs';
import type { ItemInput } from './logic/verdict';
import { fitsData, itemInput, reducer, type Action, type AppState, type Tab } from './state/appState';
import { storage } from './state/storage';
import { useAppState } from './state/useAppState';
import { useRoster } from './state/useRoster';
import { TourLayer } from './tour/TourLayer';
import type { TourCtx } from './tour/types';
import { useTour } from './tour/useTour';

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
  // пока идёт обучение, страница не сохраняется: вещь игрока отложена и вернётся в конце (src/tour/useTour.ts)
  const [touring, setTouring] = useState(false);
  const [s, dispatch] = useAppState(idx, (init) => {
    const c = idx.CHAR_BY_SLUG[slugFromHash()];
    return c ? reducer(init, openCharAction(idx, init, roster, c.id)) : init;
  }, !touring);
  const [lang, setLang] = useState<Lang>(savedLang);
  const t = TEXTS[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const changeLang = (l: Lang) => { storage.set('lang', l); setLang(l); };
  // значки из игры вместо своих — только для сравнения, пока свои не утверждены
  const [gameIcons, setGameIcons] = useState(() => storage.get('gameIcons', false));
  const changeIcons = (game: boolean) => { storage.set('gameIcons', game); setGameIcons(game); };
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t), [idx, s.settings, roster, t]);
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const verdict = useMemo(() => evaluate(ctx, input), [ctx, ...Object.values(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pwa = usePwa();
  const [fitHidden, setFitHidden] = useState(() => storage.get('fitnoteHidden', false));
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
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
  const hideWelcome = () => { storage.set('welcomeHidden', true); setWelcomeHidden(true); };

  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id)), [idx, s, roster, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar);

  const onReset = () => {
    const cur = itemInput(s);
    setVerdictOpen(false);
    dispatch({ type: 'reset' });
    setUndo(Object.keys(cur.subs).length || cur.itemKey || cur.unlisted ? cur : null); // main и сет «Следующий» не трогает
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onUndo = () => { if (undo) dispatch({ type: 'load', item: undo }); setUndo(null); };
  useHotkeys(s, dispatch, layout, onReset);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  const cardShown = layout.narrow && s.tab === 'eval' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint(s.grade === 'unique', s.settings.fodder) : null;

  const tourCtx: TourCtx = { s, nSubs, verdict, narrow: layout.narrow, verdictOpen: verdictOpen && layout.narrow, keys: fineHover() };
  const tour = useTour({
    c: tourCtx, dispatch, was: { roster: roster.size, welcomeHidden },
    onRunning: useCallback((on: boolean) => { setTouring(on); setUndo(null); }, []), onDone: hideWelcome,
  });
  const startTour = () => { setHelpOpen(false); setVerdictOpen(false); tour.start(); };
  const welcomeShown = s.tab === 'eval' && !welcomeHidden && roster.size === 0 && !tour.run;
  // «Появилось обучение» — один раз: давнему игроку и новичку, который отметил персонажей раньше, чем прошёл тур
  const inviteShown = tour.available && !tour.run && !tour.store.invited && tour.store.first !== 'done' && !welcomeShown
    && s.tab === 'eval' && !undo;

  return (
    <LangContext.Provider value={t}>
    <GameIconsContext.Provider value={gameIcons}>
      <div className="app">
        <Header tab={s.tab} onTab={onTab} rosterSize={roster.size} />
        {pwa.updateReady && <div id="updnote"><Notice text={t.ui.updateNotice} action={t.ui.updateAction} onAction={pwa.applyUpdate} /></div>}
        {layout.desktopModeOnPhone && !fitHidden && (
          <div id="fitnote">
            <Notice text={t.ui.desktopModeNotice}
              action={t.ui.gotIt} onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
          </div>
        )}
        {welcomeShown && <Welcome install={install} onTour={startTour} onRoster={() => onTab('chars')} onClose={hideWelcome} />}
        <main>
          <section id="view-eval" className="view eval" role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            <EvalPanel s={s} dispatch={dispatch} ctx={ctx} verdict={verdict} cardShown={cardShown} hint={layout.narrow ? null : hint}
              onReset={onReset} onHelp={() => setHelpOpen(true)} onCode={() => setCodeOpen(true)} onTour={startTour} onOpenVerdict={() => setVerdictOpen(true)} />
            {!layout.narrow && <Verdict r={verdict} s={s} dispatch={dispatch} onOpenChar={openChar} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={rosterApi} />
            <CharDetail key={s.charId ?? ''} charId={s.charId} ctx={ctx} rosterApi={rosterApi}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} />
        <VBar r={verdict} show={layout.narrow} compact={layout.tiny} stampless={cardShown} hint={hint} tab={s.tab} rosterSize={roster.size}
          onTab={onTab} onMenu={() => setMenuOpen(true)} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
        {inviteShown && (
          <div className="tour-strip tour-invite" role="status">
            <span>{t.tour.invite}</span>
            <button type="button" className="btn" onClick={() => { tour.dismissInvite(); startTour(); }}>{t.tour.welcomeCta}</button>
            <button type="button" className="tour-x" aria-label={t.ui.close} onClick={tour.dismissInvite}>✕</button>
          </div>
        )}
        <TourLayer tour={tour} c={tourCtx} rosterEmpty={roster.size === 0} onTab={onTab} onRoster={() => onTab('chars')} />
        {undo && s.tab === 'eval' && !tour.run && (
          <div className="toast" role="status"><span>{t.ui.undoText}</span><button type="button" onClick={onUndo}>{t.ui.undoAction}</button></div>
        )}
        {menuOpen && (
          <Menu s={s} dispatch={dispatch} rosterSize={roster.size} onClose={() => setMenuOpen(false)} onChars={() => onTab('chars')}
            onCode={() => setCodeOpen(true)} onHelp={() => setHelpOpen(true)} onTour={startTour}
            footer={<Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} />} />
        )}
        {codeOpen && (
          <Sheet title={t.ui.codeSheet} onClose={() => setCodeOpen(false)}>
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); setCodeOpen(false); }} />
          </Sheet>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => setHelpOpen(false)}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={startTour} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={verdict} s={s} dispatch={dispatch} onOpenChar={openChar} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
