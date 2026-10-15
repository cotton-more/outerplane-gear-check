// Страница: состояние, экипировка и ростер — и фичи поверх них. Логика фич — в их хуках (features/…, screens/…),
// здесь — что от чего зависит, открытые шторки и разметка.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CharDetail } from '@/screens/chars/CharDetail';
import { ShareCard } from '@/screens/share/ShareCard';
import { TeamScreen } from '@/screens/team/TeamScreen';
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
import { heroCodeIn } from '@/features/gear/store/heroCode';
import { readGearCode } from '@/features/gear/store/gearStore';
import { decodeBackup } from '@/features/roster/backup';
import { FindPiece } from '@/screens/find/FindPiece';
import { ParkedList } from '@/screens/parked/ParkedList';
import { fitsData } from '@/features/eval/form/formState';
import { GEAR_MSG_MS, type GearMsg } from '@/features/gear/ui/gearMsg';
import { replacedX } from '@/features/gear/model/fusion';
import { parkedCount, type GearStore } from '@/features/gear/model/gear';
import { gearBadges } from '@/features/gear/model/poolVs';
import { poolView } from '@/features/gear/pool';
import { useGear, type GearApi } from '@/features/gear/store/useGear';
import { takeModelNote } from '@/features/gear/store/stored';
import type { TryOn } from '@/features/tryon/tryon';
import { useHeroMode } from '@/features/tryon/useHeroMode';
import { useIngame } from '@/features/ingame/useIngame';
import { countOf, sectionsOf, type Line } from '@/features/ingame/ingame';
import { IngameBody, IngameList } from '@/features/ingame/ui/IngameList';
import { TradeSheet } from '@/features/trade/ui/TradeSheet';
import { useBatchMode } from '@/features/batch/useBatchMode';
import { BatchStrip } from '@/features/batch/ui/BatchStrip';
import { BatchMarks } from '@/features/batch/ui/BatchMarks';
import { BatchPanel, batchTitle } from '@/features/batch/ui/BatchPanel';
import { AskSheet } from '@/shared/ui/AskSheet';
import { makeCtx, NO_LV, NO_STARS } from '@/game/context';
import { useIndex } from '@/game/data/IndexContext';
import { heroName } from '@/game/hero/HeroName';
import { GameIconsContext } from '@/game/icons/Img';
import type { ItemInput } from '@/game/item/item';
import { dropSubs } from '@/game/item/subs';
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
import { openCharAction, reducer, type Action } from './appState';
import { isArmor } from '@/game/data';
import { countToDress } from '@/features/roster/charFilter';
import { LangSwitch } from './shell/Switches';
import { Help, Welcome, type InstallInfo } from './shell/Guide';
import { Header } from './shell/Header';
import { More } from './shell/More';
import { OnboardingStrips } from './shell/OnboardingStrips';
import { useAppState } from './useAppState';
import { heroFromHash, slugFromHash, useHashRoute } from './useHashRoute';
import { useHotkeys } from './useHotkeys';
import { useOnboarding, type Demo } from './useOnboarding';
import { usePwa } from './usePwa';

export function App() {
  const idx = useIndex();
  const layout = useLayout();
  const rosterApi = useRoster(idx);
  const { roster } = rosterApi;
  // карточка показа героя по ссылке (screens/share, DEVELOPMENT.md "Storage and URLs"): код из адреса читается до того, как useHashRoute
  // его перепишет; пока она открыта, обучение и «Что нового» молчат (3.5)
  const [shownCode, setShown] = useState<string | null>(heroFromHash);
  // #slug в адресе при загрузке важнее сохранённой вкладки
  // пока идёт обучение, страница не сохраняется: вещь игрока отложена и вернётся в конце (src/tour/useTour.ts)
  const [touring, setTouring] = useState(false);
  const [s, dispatch] = useAppState(idx, (init) => {
    const c = idx.CHAR_BY_SLUG[slugFromHash()];
    return c ? reducer(init, openCharAction(idx, init, roster, c.id)) : init;
  }, !touring);
  // пока ростер пуст, режим списка «Все» — и первая звёздочка его не меняет: список не схлопывается под рукой (SPEC 6)
  useEffect(() => { if (roster.size === 0 && s.cMode !== 'all') dispatch({ type: 'charFilter', patch: { cMode: 'all' } }); }, [roster.size, s.cMode, dispatch]);
  const [lang, setLang] = useState<Lang>(savedLang);
  const t = TEXTS[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const changeLang = (l: Lang) => { storage.set('lang', l); setLang(l); };
  // значки из игры или свои (Ещё → Настройки); кто выбрал сам, остаётся при своём, без выбора — из игры
  const [gameIcons, setGameIcons] = useState(() => storage.get('gameIcons', true));
  const changeIcons = (game: boolean) => { storage.set('gameIcons', game); setGameIcons(game); };
  // экипировка: что надето в билдах; сравнение с ней — список героев (HeroList) под вердиктом.
  // Вердикт по ростеру — «статы + сеты» (features/gear/verdict): «Надень», «Оставь», материал Breakthrough, запас
  const realGear = useGear(idx, !touring);
  // тур «Экипировка» — на примере (src/tour/gear.ts): своя экипировка и свой режим героя в памяти, записи игрока не трогаются.
  // Другие туры — на пустой экипировке: запись ничего не делает (она легла бы из пустого стора поверх вещей игрока)
  const [demo, setDemo] = useState<Demo>(null);
  const gear: GearApi = useMemo(() => (demo
    ? { store: demo.store, set: (st: GearStore) => setDemo((d) => d && { ...d, store: st }), newer: false }
    : touring ? { ...realGear, set: () => {} } : realGear), [demo, realGear, touring]);
  const demoTry = demo ? { value: demo.tryOn, set: (v: TryOn | null) => setDemo((d) => d && { ...d, tryOn: v }) } : null;
  // Core Fusion (features/gear/model/fusion): есть CF — X неактивен (X → CF): не кандидат вердикта, не в списке героев и не герой режима «для героя»
  const off = useMemo(() => replacedX(idx, roster, gear.store.pools), [idx, roster, gear.store.pools]);
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t, off, gear.store.stars ?? NO_STARS, gear.store.lv ?? NO_LV),
    [idx, s.settings, roster, t, off, gear.store.stars, gear.store.lv]);
  // экипировка по пулу (features/gear/pool): вид — один раз на хранилище
  const view = useMemo(() => poolView(ctx, gear.store), [ctx, gear.store]);
  // у кого есть вещи: персонаж → сколько отмечено надетым (плитки, «Доодеть» в списке и в «Ещё»)
  const geared = useMemo(() => gearBadges(view), [view]);
  // сколько своих доодеть: число у «Доодеть» в списке и в «Ещё»
  const todressN = useMemo(() => countToDress(idx.D.chars, roster, geared, off), [idx, roster, geared, off]);

  // открытые шторки и окна
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [ingameOpen, setIngameOpen] = useState(false);
  // «Обмен вещами» (features/trade): шторка; hero — открыта с карточки «К обмену ▸» (сразу план героя), иначе — из списка
  // или «Ещё» → «Обмен для команды», сразу в режиме «Команда»
  const [trade, setTrade] = useState<{ hero: string | null } | null>(null);
  const [pieceOpen, setPieceOpen] = useState(false); // карточка вещи в блоке билда (для тура «Экипировка»)
  const [fitHidden, setFitHidden] = useState(() => storage.get('fitnoteHidden', false));
  // перенос на новую модель (stat-sets PLAN Д11): игроку прежней модели — одно сообщение за всё время (флаг пишется сразу)
  const [modelNote, setModelNote] = useState<{ marks: boolean } | null>(null);
  useEffect(() => { const n = takeModelNote(idx); if (n) setModelNote(n); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // сообщения с «Вернуть»: экипировки (features/gear/ui/gearMsg) и формы — «Следующий» убрал предмет по ошибке
  const [msg, say] = useTimed<GearMsg>(GEAR_MSG_MS);
  const [formUndo, setFormUndo] = useTimed<ItemInput>(6000);
  // «Партия» (features/batch, MODEL.md §8): a filter of pieces in a row, no verdict on the way, one plan; not during a tour
  // and not without a roster scope (the plan is about the player's heroes) — the saved batch waits for it
  const batch = useBatchMode({ idx, t, ctx, gear, dispatch, persist: !touring, narrow: layout.narrow, say });
  const batchOn = batch.on && !touring && ctx.scoped;

  // обновление: новые данные — плашка сверху; только приложение — «Готова новая версия» в «Ещё» (app/usePwa), and it
  // switches on by itself when a reload loses nothing (owner, 2026-10-15): never in a tour; in the background — any time
  // (the tab, settings and the half-entered piece are saved); on screen — no substat on the form, no sheet or dialog, no
  // message with «Вернуть», not typing
  const pwa = usePwa(idx.D.meta.commit, (hidden) => !touring && (hidden || (!Object.keys(s.subs).length && !msg && !formUndo
    && !document.querySelector('[role="dialog"]') && !document.activeElement?.matches('input, textarea, select'))));
  const appUpdate = pwa.update === 'app' ? pwa.applyUpdate : undefined;
  const install: InstallInfo = { canInstall: pwa.canInstall, onInstall: pwa.install, ios: pwa.iosInstall };
  const charName = (id: string) => heroName(idx, id);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });
  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id, geared, off)), [idx, s, roster, geared, off, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar, setShown);

  const ros = useRosterUi({
    idx, t, rosterApi, gear, touring, off, tab: s.tab, msg, say,
    onAsk: () => { setVerdictOpen(false); },
  });
  const heroMode = useHeroMode({
    idx, gear, form: s, demoTry, touring, off, narrow: layout.narrow,
    fusionGate: ros.fusionGate, switchToast: ros.switchToast, joinRoster: ros.joinRoster,
    load: (item) => dispatch({ type: 'load', item }), toEval: () => onTab('eval'), closeVerdict: () => setVerdictOpen(false), setFormUndo,
  });
  const { hero, replace, dropReplace } = heroMode;
  const vm = useVerdictModel({
    idx, t, ctx, s, store: gear.store, roster, view, hero: batchOn ? null : hero, replace, touring, narrow: layout.narrow, onEval: s.tab === 'eval',
    batch: batchOn,
  });
  const { input, shown, tview, offNote, cardShown, hint, sameLine, onTwin } = vm;
  const onb = useOnboarding({
    idx, s, dispatch, roster, layout, nSubs: vm.nSubs, shown, material: vm.res?.kind === 'material',
    worn: vm.res?.kind === 'junk' && vm.res.heroes.some((h) => h.bar),
    hero: !!hero, gearSeq: gear.store.seq, verdictOpen, pieceOpen, helpOpen, formUndo, paused: !!shownCode, setDemo, setTouring,
    onTourRunning: () => { setFormUndo(null); say(null); },
    closeSheets: () => { setHelpOpen(false); setVerdictOpen(false); },
  });
  const { tour, news } = onb;
  // надеть нельзя во время обучения и когда экипировку сохранила более новая версия страницы (useGear.newer)
  const canEquip = (!tour.run || !!demo) && !gear.newer;
  // «Надеть в игре» (features/ingame): promises of «Надеть», against the player's own store (never the tour's)
  const ingame = useIngame(idx, realGear.store, !touring && !realGear.newer);
  // the list under the form / in the phone sheet: what is still owed in the game. A tap = done: the line goes, «Вернуть» for 8 s
  const igSections = useMemo(() => sectionsOf(ingame.value, realGear.store), [ingame.value, realGear.store]);
  const igN = tour.run ? 0 : countOf(ingame.value, realGear.store);
  const [tickMsg, setTickMsg] = useTimed<{ line: Line; at: number }>(8000);
  const onTick = (id: string) => { const r = ingame.tick(id); if (r) setTickMsg(r); };
  const flow = useFormFlow({
    idx, t, ctx, s, dispatch, gear, input, hero, via: heroMode.via, ingame, heroVs: vm.heroVs, replace, tview, list: vm.list, same: vm.same, canEquip, touring, narrow: layout.narrow,
    dropReplace, backReplace: heroMode.backReplace, formUndo, setFormUndo,
    closeVerdict: () => setVerdictOpen(false),
    fusionGate: ros.fusionGate, joinRoster: ros.joinRoster, say,
  });
  const { doEquip, doStash, nextNote } = flow;
  // the batch mode: «Следующий» (and Esc) add the piece to the batch — «В партию · #8» / «Сохранить #3»
  // only a complete piece goes in: all its substats entered (the plain-threshold verdict may decide earlier)
  const complete = vm.nSubs >= dropSubs(s.grade) && vm.raw.v !== 'idle';
  const onReset = batchOn
    ? () => { if (batch.view !== 'plan' && batch.view !== 'walk') batch.add(input, complete); }
    : flow.onReset;
  const batchNext = batchOn ? (batch.editing ? t.batch.save(batch.editing) : t.batch.add(batch.batch.items.length + 1, batch.ask?.slot ? null : s.slot)) : undefined;
  // the plan and the walk take the screen (owner 2026-10-09): no form — nothing is entered any more; on a phone the sheet
  // is full height, on a wide screen the batch column takes the form's place
  const batchResult = batchOn && (batch.view === 'plan' || batch.view === 'walk');
  // «E» and «🔒» next to «В партию»: the form's footer (wide), the bottom bar (phone)
  const batchMarks = batchOn && !batchResult
    ? <BatchMarks cands={() => batch.wornCands(s.slot)} what={batch.what || t.ui.slotNames[s.slot]}
        onWorn={(c, from) => batch.addWorn(c, s.slot, from)} onLock={() => batch.addLock(input, complete)} />
    : undefined;
  const onBatch = canEquip && ctx.scoped && !hero && !batchOn && !tour.run ? batch.start : undefined;
  // a batch of one kind (owner 2026-10-08): the form can't switch to another slot or set — a new batch for those;
  // the batch's own actions (reset, load for a fix) go straight to dispatch
  const lock = batchOn ? batch.lock : null;
  const formDispatch = useCallback((a: Action) => {
    if (lock && a.type === 'slot' && !lock.slots.includes(a.slot)) return;
    if (lock?.set && a.type === 'set' && a.setId !== lock.set) return;
    if (lock?.grade && a.type === 'grade' && a.grade !== lock.grade) return;
    // a slot or grade picked for the next batch piece (even the same one) — the ask is answered
    if (batchOn && (a.type === 'slot' || a.type === 'grade')) batch.answer(a.type);
    dispatch(a);
  }, [lock, dispatch, batchOn, batch.answer]); // eslint-disable-line react-hooks/exhaustive-deps
  useHotkeys(s, formDispatch, layout, onReset);
  // the batch's set goes onto the form by itself: the set field is fixed then (features/batch)
  useEffect(() => {
    if (lock?.set && isArmor(s.slot) && s.setId !== lock.set) dispatch({ type: 'set', setId: lock.set });
  }, [lock?.set, s.slot, s.setId]); // eslint-disable-line react-hooks/exhaustive-deps
  // …and the batch's grade (the first piece's)
  useEffect(() => {
    if (lock?.grade && s.grade !== lock.grade) dispatch({ type: 'grade', grade: lock.grade });
  }, [lock?.grade, s.grade]); // eslint-disable-line react-hooks/exhaustive-deps
  const rosterList = useMemo(() => rosterApi.list(), [roster]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Припаркованные · N» in «Ещё» (HISTORY.md 0204): the last «Убрать» closes the sheet
  const parkedN = useMemo(() => parkedCount(gear.store), [gear.store]);
  useEffect(() => { if (parkedOpen && !parkedN) setParkedOpen(false); }, [parkedOpen, parkedN]); // «Вернуть» doesn't reopen it
  useEffect(() => { if (ingameOpen && (!igN || !layout.narrow)) setIngameOpen(false); }, [ingameOpen, igN, layout.narrow]); // the last tick closes the sheet; «Вернуть» doesn't reopen it
  const parkedShown = parkedOpen && canEquip && !tour.run;
  // «Убрать у Caren» в карточке персонажа: сообщение с «Вернуть» — на «Персонажах»
  const onGearToast = (text: string, note: string, undo: (st: GearStore) => GearStore) => say({ text, note, tab: 'chars', undo });
  // правка в карточке вещи снимает висящее «Вернуть» любого прежнего действия (В3: одно на все): откаты возвращают
  // запись по id, а её за эти секунды поправили или скопировали (gear updateIn, REFUTE-5); replace режима героя — за копией
  const onPieceEdit = (charId: string, was: string, now: string) => { say(null); heroMode.followEdit(charId, was, now); };
  // the verdict's hero list: «Надеть» / «Отложить» on a row; name search — not in hero mode and not while the piece looks like
  // one already set aside (guard): it would add a second record
  const listProps = {
    ctx, viewOf: vm.viewOf, list: vm.list, heroVs: vm.heroVs, canSearch: !hero && !vm.same,
    onEquip: !canEquip ? undefined : doEquip, onStash: !canEquip ? undefined : doStash,
  };
  // сообщения с «Вернуть»: экипировки — на вкладке, где сделано; формы — на «Оценке», если нет первого
  const gearToast = !!msg && msg.tab === s.tab && !tour.run;
  const tickToast = !!tickMsg && s.tab === 'eval' && !tour.run && !gearToast;
  const formToast = !!formUndo && s.tab === 'eval' && !tour.run && !gearToast && !tickToast;
  // the batch's short notes («В этой партии — Attack-броня…», «Введены не все сабстаты…») — a toast: a line in the page
  // made the form jump (owner 2026-10-08)
  const batchToast = batchOn && !!batch.note && s.tab === 'eval' && !gearToast && !formToast;
  const toastAt = useToastPlace((gearToast || formToast || batchToast || tickToast) && !layout.narrow, s.tab === 'eval' ? 'eval-in' : 'char-list');
  // телефон: сообщение экипировки лежит и поверх шторки вердикта — внизу шторки место, чтобы строку под ним прокрутить
  useEffect(() => {
    document.body.classList.toggle('toast-on', (gearToast || tickToast) && layout.narrow);
    return () => document.body.classList.remove('toast-on');
  }, [gearToast, tickToast, layout.narrow]);

  return (
    <LangContext.Provider value={t}>
    <GameIconsContext.Provider value={gameIcons}>
      <div className="app">
        <Header tab={s.tab} onTab={onTab} rosterSize={roster.size} news={news.length > 0} onMore={() => setMoreOpen(true)} />
        {pwa.update === 'data' && <div id="updnote"><Notice text={t.ui.updateNotice} action={t.ui.updateAction} onAction={pwa.applyUpdate} /></div>}
        {layout.desktopModeOnPhone && !fitHidden && (
          <div id="fitnote">
            <Notice text={t.ui.desktopModeNotice}
              action={t.ui.gotIt} onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
          </div>
        )}
        {modelNote && <div id="modelnote"><Notice text={modelNote.marks ? `${t.ui.modelNote} ${t.ui.modelNoteMarks}` : t.ui.modelNote} action={t.ui.gotIt} onAction={() => setModelNote(null)} /></div>}
        {onb.welcomeShown && <Welcome install={install} onTour={layout.tall ? () => onb.startTour('core') : undefined} onRoster={() => onTab('chars')} onClose={onb.hideWelcome} />}
        <main>
          <section id="view-eval" className={batchResult && !layout.narrow ? 'view eval batch-result' : 'view eval'} role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            {!(batchResult && !layout.narrow) && <EvalPanel s={s} dispatch={formDispatch} ctx={ctx} verdict={shown} cardShown={cardShown} hint={layout.narrow ? null : hint}
              hero={hero} heroNote={offNote} onTryOnEnd={() => heroMode.tryOn.set(null)} vs={flow.cardVs} onEquip={flow.cardEquip ? (v) => doEquip(v.c) : undefined}
              below={layout.narrow ? undefined : <IngameList ctx={ctx} sections={igSections} n={igN} onTick={onTick} />}
              next={flow.cardNext} onStash={flow.cardStash ? (v) => doStash(v.c) : undefined}
              onReset={onReset} nextNote={nextNote} onOpenVerdict={() => setVerdictOpen(true)} sameLine={sameLine} onTwin={onTwin}
              strip={batchOn ? <BatchStrip n={batch.batch.items.length} onList={() => batch.show('list')} onEnd={batch.end} /> : null}
              marks={layout.narrow ? undefined : batchMarks}
              nextLabel={batchNext} onBatch={layout.narrow ? undefined : onBatch} lock={lock} ask={batchOn ? batch.ask : null} />}
            {!layout.narrow && (batchOn
              ? <aside key={batch.view ?? 'list'} className="panel verdict eval-out batch-col" id="verdict"><h3 className="batch-h">{batchTitle(t, batch)}</h3><BatchPanel ctx={ctx} m={batch} /></aside>
              : <Verdict r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} {...listProps} offNote={offNote} nextNote={nextNote} onTwin={onTwin} />)}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={ros.rosterUi} geared={geared} off={off} todressN={todressN}
              onTrade={canEquip ? () => setTrade({ hero: null }) : undefined} />
            <CharDetail key={(s.charId ?? '') + (demo ? ':demo' : '')} charId={s.charId} ctx={ctx} view={view} rosterApi={ros.rosterUi} gear={gear} active={s.tab === 'chars'} onOpenChar={openChar}
              onGearToast={onGearToast} onPieceEdit={onPieceEdit}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} canWear={canEquip} onTryOn={canEquip && !batchOn ? heroMode.start : undefined}
              onRateFor={canEquip && !batchOn ? (c) => heroMode.start(c) : undefined}
              onPieceOpen={setPieceOpen} onTrade={canEquip ? (c) => setTrade({ hero: c.id }) : undefined}
              canShare={!tour.run && !gear.newer} />
          </section>
          <section id="view-team" className="view team-view" role="tabpanel" aria-labelledby="tab-team" hidden={s.tab !== 'team'}>
            <TeamScreen roster={rosterList} off={off} stars={gear.store.stars ?? NO_STARS} ctx={ctx} gear={gear} onChars={() => onTab('chars')}
              canTrade={canEquip && !tour.run} onHeroTrade={(id) => setTrade({ hero: id })}
              onApplied={(text, undo) => say({ text, note: '', tab: 'team', undo: (x) => undo(x) ?? x })} />
          </section>
        </main>
        <VBar ingameN={igN} r={shown} news={news.length > 0} quiet={!!tour.run} show={layout.narrow} stampless={cardShown} tab={s.tab} rosterSize={roster.size}
          hint={batchOn ? (batch.batch.items.length ? t.batch.strip(batch.batch.items.length).replace(/ /g, '\u00A0') : t.batch.empty) : hint}
          resetLabel={batchNext} marks={batchMarks} onTab={onTab} onMenu={() => setMoreOpen(true)} onReset={onReset}
          onOpen={batchOn ? () => batch.show('list') : () => setVerdictOpen(true)} />
        <OnboardingStrips onb={onb} />
        <TipLayer tour={tour} c={onb.tourCtx} enabled={onb.tipsOn} forced={shownCode ? null : onb.forcedTip} onForced={onb.onForced} />
        <TourLayer tour={tour} c={onb.tourCtx} rosterEmpty={roster.size === 0} tours={onb.tours} onTab={onTab} onRoster={() => onTab('chars')} />
        {msg && gearToast && (
          <Toast className="gear-toast" style={toastAt} text={msg.text} note={msg.note} action={t.ui.undoAction}
            onAction={msg.undo || msg.after ? ros.undoMsg : undefined} />
        )}
        {ros.removeAsk && !tour.run && (
          <RosterRemoveAsk name={charName(ros.removeAsk.id)} n={ros.removeAsk.n} onYes={ros.doRemove} onClose={ros.closeRemoveAsk} />
        )}
        {ros.fusionAsk && (
          <FusionAsk base={charName(idx.CHAR[ros.fusionAsk.to]?.fusionOf ?? ros.fusionAsk.to)} toFusion={!!idx.CHAR[ros.fusionAsk.to]?.fusionOf} n={ros.fusionAsk.n}
            onYes={ros.doSwitch} onClose={ros.closeFusionAsk} />
        )}
        {tickToast && tickMsg && (
          <Toast className="gear-toast" style={toastAt} text={t.ingame.done(t.ui.slotNom[tickMsg.line.slot], heroName(idx, tickMsg.line.hero))} action={t.ui.undoAction}
            onAction={() => { ingame.untick(tickMsg.line, tickMsg.at); setTickMsg(null); }} />
        )}
        {formToast && <Toast style={toastAt} text={t.ui.undoText} action={t.ui.undoAction} onAction={flow.onUndo} />}
        {batchToast && <Toast className="batch-toast" style={toastAt} text={batch.note!} action="" />}
        {moreOpen && (
          <More s={s} dispatch={dispatch} rosterSize={roster.size} todressN={todressN} ingameN={igN} onIngame={igN && !tour.run ? () => setIngameOpen(true) : undefined} parkedN={parkedN} news={news.length > 0} narrow={layout.narrow} touring={!!tour.run}
            rosterApi={ros.rosterUi} gear={gear} onBackup={ros.onBackup}
            lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} install={install} onAppUpdate={appUpdate}
            onClose={() => setMoreOpen(false)} onChars={() => onTab('chars')} onTeam={() => onTab('team')}
            // список ровно тех, кого считает N: режим «Доодеть», прочие фильтры (стихия, класс, поиск) — сбросить, карточку героя закрыть
            onTodress={() => {
              dispatch({ type: 'charFilter', patch: { cMode: 'todress', cq: '', cel: '', ccl: '' } });
              dispatch({ type: 'selectChar', id: null });
              onTab('chars');
            }}
            onCode={() => setCodeOpen(true)} onFind={tour.run ? undefined : () => setFindOpen(true)}
            onParked={canEquip && !tour.run ? () => setParkedOpen(true) : undefined} onHelp={() => setHelpOpen(true)} onTour={onb.openTours}
            onBatch={onBatch ? () => { onTab('eval'); onBatch(); } : undefined} />
        )}
        {batchOn && layout.narrow && batch.view && s.tab === 'eval' && (
          <Sheet title={batchTitle(t, batch)} onClose={() => batch.show(null)} className={batchResult ? 'vdrawer batch-sheet batch-full' : 'vdrawer batch-sheet'}><BatchPanel ctx={ctx} m={batch} /></Sheet>
        )}
        {batchOn && batch.asking && (
          <AskSheet title={t.batch.end} text={t.batch.endAsk(batch.batch.items.length)} yes={t.batch.endYes} kind="batch-ask" onYes={batch.endNow} onClose={batch.cancelEnd} />
        )}
        {trade && canEquip && (
          <TradeSheet ctx={ctx} gear={gear} roster={rosterList} off={off} start={trade.hero} onClose={() => setTrade(null)}
            onApplied={(text, undo, after) => say({ text, note: '', tab: s.tab, undo: (x) => undo(x) ?? x, after })} />
        )}
        {codeOpen && (
          <Sheet title={t.ui.codeSheet} onClose={() => setCodeOpen(false)}>
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); dropReplace(); setCodeOpen(false); }}
              other={(text) => {
                // код героя или ссылка показа — карточка показа, форма не трогается; резервная копия — на «Персонажи»
                const hero = heroCodeIn(text);
                if (hero) { setCodeOpen(false); setShown(hero); return true; }
                return decodeBackup(text) !== null || readGearCode(text) !== null ? t.ui.codeBackup : null;
              }} />
          </Sheet>
        )}
        {findOpen && (
          <Sheet title={t.ui.findPiece} onClose={() => setFindOpen(false)}>
            <FindPiece ctx={ctx} store={gear.store} fits={(item) => fitsData(s, item, ctx.idx)} onOpenChar={(id) => { setFindOpen(false); openChar(id); }} />
          </Sheet>
        )}
        {ingameOpen && layout.narrow && igN > 0 && (
          <Sheet title={t.ingame.title(igN)} onClose={() => setIngameOpen(false)} className="vdrawer batch-sheet batch-full ig-sheet">
            <IngameBody ctx={ctx} sections={igSections} onTick={onTick} />
          </Sheet>
        )}
        {parkedShown && (
          <Sheet title={t.ui.parkedTitle} onClose={() => setParkedOpen(false)}>
            <ParkedList ctx={ctx} gear={gear} order={rosterList} onRemoved={(text, undo) => say({ text, note: '', tab: s.tab, undo })} />
          </Sheet>
        )}
        {shownCode && <ShareCard code={shownCode} ctx={ctx} onClose={() => setShown(null)} />}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => { setHelpOpen(false); onb.clearHelpNews(); }}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={onb.openTours} tips={<TipsHelp tour={tour} news={onb.helpNews} />} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} {...listProps} offNote={offNote} nextNote={nextNote} onTwin={onTwin} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
