// Страница: состояние, экипировка и ростер — и фичи поверх них. Логика фич — в их хуках (features/…, screens/…),
// здесь — что от чего зависит, открытые шторки и разметка.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CharDetail } from '@/screens/chars/CharDetail';
import { EvalPanel } from '@/screens/eval/EvalPanel';
import { Verdict, VerdictSheet } from '@/screens/eval/VerdictPanel';
import { VBar } from '@/screens/eval/VBar';
import { useFormFlow } from '@/screens/eval/useFormFlow';
import { useVerdictModel } from '@/screens/eval/useVerdictModel';
import { CharList } from '@/features/roster/CharList';
import { FusionAsk } from '@/features/roster/FusionAsk';
import { RosterRemoveAsk } from '@/features/roster/RosterRemoveAsk';
import { useRoster } from '@/features/roster/useRoster';
import { useRosterUi } from '@/features/roster/useRosterUi';
import { CodeInput } from '@/features/eval/code/ItemCode';
import { fitsData } from '@/features/eval/form/formState';
import { EquipSheet } from '@/features/gear/ui/EquipSheet';
import { GEAR_MSG_MS, type GearMsg } from '@/features/gear/ui/gearMsg';
import { replacedX } from '@/features/gear/model/fusion';
import type { GearStore } from '@/features/gear/model/gear';
import { gearBadges } from '@/features/gear/model/poolVs';
import { poolView } from '@/features/gear/pool';
import { useGear, type GearApi } from '@/features/gear/store/useGear';
import { AimsSheet } from '@/features/worn/AimsSheet';
import { useAims } from '@/features/worn/useAims';
import type { TryOn } from '@/features/tryon/tryon';
import { useHeroMode } from '@/features/tryon/useHeroMode';
import { TradeSheet } from '@/features/trade/ui/TradeSheet';
import { makeCtx } from '@/game/context';
import { useIndex } from '@/game/data/IndexContext';
import { heroName } from '@/game/hero/heroName';
import { GameIconsContext } from '@/game/icons/Img';
import type { ItemInput } from '@/game/item/item';
import { LangContext, TEXTS, savedLang, type Lang } from '@/i18n';
import { useLayout } from '@/shared/layout/useLayout';
import { useToastPlace } from '@/shared/layout/useToastPlace';
import { storage } from '@/shared/storage';
import type { Tab } from '@/shared/tab';
import { Notice } from '@/shared/ui/Notice';
import { Sheet } from '@/shared/ui/Sheet';
import { Toast } from '@/shared/ui/Toast';
import { useTimed } from '@/shared/useTimed';
import { TipLayer } from '@/tour/TipLayer';
import { TipsHelp } from '@/tour/TipsHelp';
import { TourLayer } from '@/tour/TourLayer';
import { openCharAction, reducer } from './appState';
import { Footer, LangSwitch } from './shell/Footer';
import { Help, Welcome, type InstallInfo } from './shell/Guide';
import { Header } from './shell/Header';
import { Menu } from './shell/Menu';
import { OnboardingStrips } from './shell/OnboardingStrips';
import { useAppState } from './useAppState';
import { slugFromHash, useHashRoute } from './useHashRoute';
import { useHotkeys } from './useHotkeys';
import { useOnboarding, type Demo } from './useOnboarding';
import { usePwa } from './usePwa';

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
  // экипировка: что надето в билдах; сравнение с ней — раздел «Сейчас на персонажах» в подробностях вердикта.
  // Вещь — материал Breakthrough для надетой не на T4: «Разобрать» поднимается до «Фоддер» (features/gear/model/material)
  const realGear = useGear(idx, !touring);
  // тур «Экипировка» — на примере (src/tour/gear.ts): своя экипировка и свой режим героя в памяти, записи игрока не трогаются.
  // Другие туры — на пустой экипировке: запись ничего не делает (она легла бы из пустого стора поверх вещей игрока)
  const [demo, setDemo] = useState<Demo>(null);
  const gear: GearApi = useMemo(() => (demo
    ? { store: demo.store, set: (st: GearStore) => setDemo((d) => d && { ...d, store: st }), newer: false }
    : touring ? { ...realGear, set: () => {} } : realGear), [demo, realGear, touring]);
  const demoTry = demo ? { value: demo.tryOn, set: (v: TryOn | null) => setDemo((d) => d && { ...d, tryOn: v }) } : null;
  // Core Fusion (features/gear/model/fusion): есть CF — X неактивен (X → CF): не кандидат вердикта, не в «Кому надеть?» и не герой режима «для героя»
  const off = useMemo(() => replacedX(idx, roster, gear.store.pools), [idx, roster, gear.store.pools]);
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t, off), [idx, s.settings, roster, t, off]);
  // экипировка по пулу (features/gear/pool): вид — один раз на хранилище
  const view = useMemo(() => poolView(ctx, gear.store), [ctx, gear.store]);
  // у кого есть вещи: персонаж → сколько отмечено надетым (плитки, меню, фильтр «с экипировкой»)
  const geared = useMemo(() => gearBadges(view), [view]);

  // открытые шторки и окна
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [equipOpen, setEquipOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  // «Обмен вещами» (features/trade): шторка; hero — открыта с карточки «К обмену ▸» (сразу план героя)
  const [trade, setTrade] = useState<{ hero: string | null } | null>(null);
  const [pieceOpen, setPieceOpen] = useState(false); // карточка вещи в блоке билда (для тура «Экипировка»)
  const [fitHidden, setFitHidden] = useState(() => storage.get('fitnoteHidden', false));
  // сообщения с «Вернуть»: экипировки (features/gear/ui/gearMsg) и формы — «Следующий» убрал предмет по ошибке
  const [msg, say] = useTimed<GearMsg>(GEAR_MSG_MS);
  const [formUndo, setFormUndo] = useTimed<ItemInput>(6000);

  // обновление: новые данные — плашка сверху; только приложение — строка в подвале (app/usePwa)
  const pwa = usePwa(idx.D.meta.commit);
  const appUpdate = pwa.update === 'app' ? pwa.applyUpdate : undefined;
  const install: InstallInfo = { canInstall: pwa.canInstall, onInstall: pwa.install, ios: pwa.iosInstall };
  const charName = (id: string) => heroName(idx, id);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });
  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id, geared)), [idx, s, roster, geared, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar);

  const ros = useRosterUi({
    idx, t, rosterApi, gear, touring, off, tab: s.tab, msg, say,
    onAsk: () => { setVerdictOpen(false); setEquipOpen(false); },
  });
  const heroMode = useHeroMode({
    idx, ctx, view, gear, form: s, demoTry, touring, off, narrow: layout.narrow,
    fusionGate: ros.fusionGate, switchToast: ros.switchToast, joinRoster: ros.joinRoster,
    load: (item) => dispatch({ type: 'load', item }), toEval: () => onTab('eval'), closeVerdict: () => setVerdictOpen(false), setFormUndo,
  });
  const { hero, replace, dropReplace } = heroMode;
  const vm = useVerdictModel({
    idx, t, ctx, s, store: gear.store, roster, view, hero, replace, touring, narrow: layout.narrow, onEval: s.tab === 'eval',
  });
  const { input, shown, vsList, tview, offNote, cardShown, hint } = vm;
  const onb = useOnboarding({
    idx, s, dispatch, roster, layout, nSubs: vm.nSubs, shown, verdict: vm.verdict, stampKind: vm.worn.v, material: vm.mat.wear,
    hero: !!hero, gearSeq: gear.store.seq, verdictOpen, pieceOpen, helpOpen, formUndo, setDemo, setTouring,
    onTourRunning: () => { setFormUndo(null); say(null); },
    closeSheets: () => { setHelpOpen(false); setVerdictOpen(false); },
  });
  const { tour, news } = onb;
  // надеть нельзя во время обучения и когда экипировку сохранила более новая версия страницы (useGear.newer)
  const canEquip = (!tour.run || !!demo) && !gear.newer;
  const flow = useFormFlow({
    idx, t, ctx, s, dispatch, gear, input, hero, heroVs: vm.heroVs, replace, tview, vsList, canEquip, touring, narrow: layout.narrow,
    dropReplace, backReplace: heroMode.backReplace, formUndo, setFormUndo,
    closeVerdict: () => setVerdictOpen(false), closeEquip: () => setEquipOpen(false),
    fusionGate: ros.fusionGate, joinRoster: ros.joinRoster, say,
  });
  const { onReset, doEquip, nextNote } = flow;
  useHotkeys(s, dispatch, layout, onReset);
  const aims = useAims({ idx, t, ctx, gear, view, touring, demo: !!demo, charId: s.charId, tab: s.tab, say, openChar });
  const rosterList = useMemo(() => rosterApi.list(), [roster]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Убрать у Caren» в карточке персонажа: сообщение с «Вернуть» — на «Персонажах»
  const onGearToast = (text: string, note: string, undo: (st: GearStore) => GearStore) => say({ text, note, tab: 'chars', undo });
  // правка в карточке вещи снимает висящее «Вернуть» любого прежнего действия (В3: одно на все): откаты возвращают
  // запись по id, а её за эти секунды поправили или скопировали (gear updateIn, REFUTE-5); replace режима героя — за копией
  const onPieceEdit = (charId: string, was: string, now: string) => { say(null); heroMode.followEdit(charId, was, now); };
  const onEquipPick = !canEquip || hero ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); };
  // сообщения с «Вернуть»: экипировки — на вкладке, где сделано; формы — на «Оценке», если нет первого
  const gearToast = !!msg && msg.tab === s.tab && !tour.run;
  const formToast = !!formUndo && s.tab === 'eval' && !tour.run && !gearToast;
  const toastAt = useToastPlace((gearToast || formToast) && !layout.narrow, s.tab === 'eval' ? 'eval-in' : 'char-list');
  // телефон: сообщение экипировки лежит и поверх шторки вердикта — внизу шторки место, чтобы строку под ним прокрутить
  useEffect(() => {
    document.body.classList.toggle('toast-on', gearToast && layout.narrow);
    return () => document.body.classList.remove('toast-on');
  }, [gearToast, layout.narrow]);

  return (
    <LangContext.Provider value={t}>
    <GameIconsContext.Provider value={gameIcons}>
      <div className="app">
        <Header tab={s.tab} onTab={onTab} rosterSize={roster.size} />
        {pwa.update === 'data' && <div id="updnote"><Notice text={t.ui.updateNotice} action={t.ui.updateAction} onAction={pwa.applyUpdate} /></div>}
        {aims.aimsPending.length > 0 && (
          <div id="aimsnote">
            <Notice text={t.ui.aimsNotice(aims.aimsPending.length)} action={t.ui.aimsCheck} onAction={aims.openAims} onClose={aims.hideAims} />
          </div>
        )}
        {layout.desktopModeOnPhone && !fitHidden && (
          <div id="fitnote">
            <Notice text={t.ui.desktopModeNotice}
              action={t.ui.gotIt} onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
          </div>
        )}
        {onb.welcomeShown && <Welcome install={install} onTour={layout.tall ? () => onb.startTour('core') : undefined} onRoster={() => onTab('chars')} onClose={onb.hideWelcome} />}
        <main>
          <section id="view-eval" className="view eval" role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            <EvalPanel s={s} dispatch={dispatch} ctx={ctx} verdict={shown} cardShown={cardShown} hint={layout.narrow ? null : hint}
              hero={hero} heroNote={offNote} onTryOnEnd={() => heroMode.tryOn.set(null)} vs={vsList[0] ?? null} onEquip={flow.cardEquip ? (v) => doEquip(v.c) : undefined}
              other={flow.cardOther} onEquipOther={flow.cardOther ? (v) => doEquip(v.c) : undefined}
              onReset={onReset} nextNote={nextNote} onHelp={() => setHelpOpen(true)} onCode={() => setCodeOpen(true)} onTour={onb.openTours} news={news.length > 0} onOpenVerdict={() => setVerdictOpen(true)} />
            {!layout.narrow && <Verdict r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={tview} offNote={offNote} nextNote={nextNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={onEquipPick} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={ros.rosterUi} gear={gear} geared={geared} off={off} onGearImport={ros.onGearImport} touring={!!tour.run}
              onTrade={canEquip ? () => setTrade({ hero: null }) : undefined} />
            <CharDetail key={(s.charId ?? '') + (demo ? ':demo' : '')} charId={s.charId} ctx={ctx} view={view} rosterApi={ros.rosterUi} gear={gear} active={s.tab === 'chars'} onOpenChar={openChar}
              onGearToast={onGearToast} onPieceEdit={onPieceEdit}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} onTryOn={canEquip ? heroMode.start : undefined}
              onRateFor={canEquip ? (c) => heroMode.start(c) : undefined}
              onPieceOpen={setPieceOpen} onTrade={canEquip ? (c) => setTrade({ hero: c.id }) : undefined}
              redress={aims.redressKey} onRedress={aims.onRedress} onChooseAim={aims.chooseAim} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} onAppUpdate={appUpdate} />
        <VBar r={shown} news={news.length > 0} quiet={!!tour.run} show={layout.narrow} compact={layout.tiny} stampless={cardShown} hint={hint} tab={s.tab} rosterSize={roster.size}
          onTab={onTab} onMenu={() => setMenuOpen(true)} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
        <OnboardingStrips onb={onb} />
        <TipLayer tour={tour} c={onb.tourCtx} enabled={onb.tipsOn} forced={onb.forcedTip} onForced={onb.onForced} />
        <TourLayer tour={tour} c={onb.tourCtx} rosterEmpty={roster.size === 0} tours={onb.tours} onTab={onTab} onRoster={() => onTab('chars')} />
        {msg && gearToast && (
          <Toast className="gear-toast" style={toastAt} text={msg.text} note={msg.note} action={t.ui.undoAction}
            onAction={msg.undo || msg.after ? ros.undoMsg : undefined} />
        )}
        {aims.aimsOpen && aims.aimsPending.length > 0 && !tour.run && (
          <AimsSheet ctx={ctx} view={view} st={gear.store} ids={aims.aimsPending} onClose={aims.closeAims} onConfirm={aims.confirmAll} onChoose={aims.chooseAim} />
        )}
        {ros.removeAsk && !tour.run && (
          <RosterRemoveAsk name={charName(ros.removeAsk.id)} n={ros.removeAsk.n} onYes={ros.doRemove} onClose={ros.closeRemoveAsk} />
        )}
        {ros.fusionAsk && (
          <FusionAsk base={charName(idx.CHAR[ros.fusionAsk.to]?.fusionOf ?? ros.fusionAsk.to)} toFusion={!!idx.CHAR[ros.fusionAsk.to]?.fusionOf} n={ros.fusionAsk.n}
            onYes={ros.doSwitch} onClose={ros.closeFusionAsk} />
        )}
        {equipOpen && !tour.run && <EquipSheet ctx={ctx} viewOf={vm.viewOf} item={input} onEquip={doEquip} onClose={() => setEquipOpen(false)} />}
        {formToast && <Toast style={toastAt} text={t.ui.undoText} action={t.ui.undoAction} onAction={flow.onUndo} />}
        {menuOpen && (
          <Menu s={s} dispatch={dispatch} rosterSize={roster.size} news={news.length > 0} onClose={() => setMenuOpen(false)} onChars={() => onTab('chars')}
            gearN={[...geared.keys()].filter((id) => idx.CHAR[id]?.builds.length).length}
            // список ровно тех, кого считает N: прочие фильтры списка (сохранённые «только мои», стихия, класс) — сбросить
            onGear={() => {
              dispatch({ type: 'charFilter', patch: { cGear: true, cq: '', cel: '', ccl: '', cOwned: false } });
              dispatch({ type: 'selectChar', id: null });
              onTab('chars');
            }}
            onCode={() => setCodeOpen(true)} onHelp={() => setHelpOpen(true)} onTour={onb.openTours} onTrade={canEquip ? () => setTrade({ hero: null }) : undefined}
            footer={<Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} onAppUpdate={appUpdate} />} />
        )}
        {trade && canEquip && (
          <TradeSheet ctx={ctx} view={view} gear={gear} roster={rosterList} off={off} start={trade.hero} onClose={() => setTrade(null)}
            onApplied={(text, undo) => say({ text, note: '', tab: s.tab, undo: (x) => undo(x) ?? x })} />
        )}
        {codeOpen && (
          <Sheet title={t.ui.codeSheet} onClose={() => setCodeOpen(false)}>
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); dropReplace(); setCodeOpen(false); }} />
          </Sheet>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => { setHelpOpen(false); onb.clearHelpNews(); }}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={onb.openTours} tips={<TipsHelp tour={tour} news={onb.helpNews} />} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={tview} offNote={offNote} nextNote={nextNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={onEquipPick} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
