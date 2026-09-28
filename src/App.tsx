import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { CharDetail } from './components/chars/CharDetail';
import { CharList } from './components/chars/CharList';
import { EvalPanel } from './components/eval/EvalPanel';
import { CodeInput } from './components/eval/ItemCode';
import { Help, Welcome, type InstallInfo } from './components/Guide';
import { VBar, Verdict, VerdictSheet } from './components/eval/Verdict';
import { EquipSheet } from './components/eval/EquipSheet';
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
import { buildKey, equipOn, gearedChars, moveTo, pieceInput, samePiece, twinElsewhere, undoEquip, undoMove, usedIn, type GearStore, type Piece, type Twin } from './logic/gear';
import { charMatches } from './logic/lists';
import { dropSubs } from './logic/subs';
import type { Build, Char, SlotId } from './data/types';
import type { ItemInput } from './logic/verdict';
import { compareAll, compareFor } from './logic/vs';
import { tryOnPreset, tryOnTarget, tryOnTitle } from './logic/tryon';
import { materialFor, withMaterial } from './logic/material';
import { fitsData, itemInput, reducer, type Action, type AppState, type Tab } from './state/appState';
import { storage } from './state/storage';
import { useAppState } from './state/useAppState';
import { useGear } from './state/useGear';
import { useRoster } from './state/useRoster';
import { useTryOn } from './state/useTryOn';
import { TIPS } from './tour/registry';
import { TipLayer } from './tour/TipLayer';
import { TipsHelp } from './tour/TipsHelp';
import { newsOf } from './tour/tips';
import { TourLayer } from './tour/TourLayer';
import type { Tip, TourCtx } from './tour/types';
import { hasItem, useTour } from './tour/useTour';

// открыть персонажа; если фильтры списка его прячут — сбросить их (у персонажа без билдов — ещё и «показать без билдов»)
function openCharAction(idx: Index, s: AppState, roster: ReadonlySet<string>, id: string, geared?: ReadonlyMap<string, number>): Action {
  const c = idx.CHAR[id];
  const reveal = !c || charMatches(c, s, roster, geared) ? 'keep' : c.builds.length ? 'filters' : 'filters+all';
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
  const key = JSON.stringify(input);
  const quick = useMemo(() => evaluate(ctx, input, { gamble: false }), [ctx, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // кубик Reforge — до 10 пробных оценок (на телефоне заметно): вердикт встаёт сразу, кубик досчитывается следом
  const later = useDeferredValue(key);
  const full = useMemo(() => evaluate(ctx, JSON.parse(later) as ItemInput), [ctx, later]);
  // экипировка: что надето в билдах; сравнение с ней — раздел «Сейчас на персонажах» в подробностях вердикта.
  // Вещь — материал Breakthrough для надетой не на T4: «Разобрать» поднимается до «Фоддер» (logic/material)
  const gear = useGear(idx, !touring);
  const geared = useMemo(() => gearedChars(gear.store), [gear.store]);
  const raw = later === key ? full : quick;
  const verdict = useMemo(() => withMaterial(idx, t, raw, materialFor(gear.store, input)), [idx, t, raw, gear.store]); // eslint-disable-line react-hooks/exhaustive-deps
  // примерка (logic/tryon): сравнение только с одним билдом, «Надеть» — сразу в него; на время обучения её нет
  const tryOn = useTryOn(idx, !touring);
  const target = useMemo(() => (touring ? null : tryOnTarget(idx, tryOn.value)), [idx, tryOn.value, touring]);
  const vsList = useMemo(() => (target
    ? (verdict.v === 'idle' ? [] : [compareFor(ctx, gear.store, target.c, target.b, input)])
    : compareAll(ctx, gear.store, input, verdict)), [ctx, gear.store, verdict, target]); // eslint-disable-line react-hooks/exhaustive-deps
  // штамп общий, а заголовок после « — » в примерке — и про других, и про неё
  const shown = useMemo(() => (target && vsList[0] ? { ...verdict, title: tryOnTitle(t, verdict, vsList[0]) } : verdict), [t, verdict, target, vsList]);
  const [equipOpen, setEquipOpen] = useState(false);
  // сообщение после «Надеть» и импорта кода. «Вернуть» — обратная операция только этого действия: другие правки за
  // эти 8 секунд остаются. Видно на той вкладке, где сделано: на «Персонажах» оно легло бы на карточку вещи
  const [gearUndo, setGearUndo] = useState<{ text: string; note: string; tab: Tab; undo: (st: GearStore) => GearStore; after?: () => void } | null>(null);
  useEffect(() => {
    if (!gearUndo) return;
    const id = setTimeout(() => setGearUndo(null), 8000);
    return () => clearTimeout(id);
  }, [gearUndo]);
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

  const openChar = useCallback((id: string) => dispatch(openCharAction(idx, s, roster, id, geared)), [idx, s, roster, geared, dispatch]);
  useHashRoute(idx, s.tab, s.charId, openChar);

  const onReset = () => {
    const cur = itemInput(s);
    setVerdictOpen(false);
    dispatch({ type: 'reset' });
    setUndo(Object.keys(cur.subs).length || cur.itemKey || cur.unlisted ? cur : null); // main и сет «Следующий» не трогает
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onUndo = () => { if (undo) dispatch({ type: 'load', item: undo }); setUndo(null); };
  // надеть вещь с формы в билд; персонаж попадает в ростер; сообщение — что стало со старой вещью, с «Отменить».
  // Такая же вещь уже на другом персонаже — сначала спросить «это шлем Rin?»: перенести её или надеть новую
  const [twinAsk, setTwinAsk] = useState<{ c: Char; b: Build; twin: Twin } | null>(null);
  const doEquip = (c: Char, b: Build) => {
    const key = buildKey(c.id, b.name);
    const prev = gear.store;
    // та же вещь уже в этом слоте — ничего не менять: свежая копия потеряла бы отмеченные Reforge и Breakthrough
    const onNow = prev.pieces[prev.builds[key]?.slots[input.slot] ?? ''];
    setEquipOpen(false);
    if (onNow && samePiece(input, onNow)) return;
    const twin = twinElsewhere(prev, c.id, input);
    if (twin) setTwinAsk({ c, b, twin }); else putOn(c, b, null);
  };
  // чей билд: ключ «персонаж/билд» → имя персонажа; «Rin · Speed»
  const ownerOf = (k: string) => { const id = k.slice(0, k.indexOf('/')); return idx.CHAR[id]?.name ?? id; };
  const whoOf = (k: string) => `${ownerOf(k)} · ${k.slice(k.indexOf('/') + 1)}`;
  const putOn = (c: Char, b: Build, twin: Twin | null) => {
    setTwinAsk(null);
    const key = buildKey(c.id, b.name);
    const prev = gear.store;
    const r = twin ? { ...moveTo(prev, twin, key), shared: null } : equipOn(prev, c.id, key, input);
    gear.set(r.store);
    const added = !roster.has(c.id);
    if (added) rosterApi.add([c.id]);
    setUndo(null);
    const slot = t.ui.slotNom[input.slot]; // «Надето: Caren · Speed · броня» — именительный, не «броню»
    const nameOf = (k: string) => c.builds.find((x) => buildKey(c.id, x.name) === k)?.name ?? k.slice(c.id.length + 1);
    let note = r.shared ? t.ui.sameAs(nameOf(r.shared)) : '';
    if (r.old) {
      const same = isArmor(r.old.slot) ? r.old.setId === r.piece.setId && r.old.grade === r.piece.grade : !!r.old.itemKey && r.old.itemKey === r.piece.itemKey;
      const still = usedIn(r.store, r.old.id).map(nameOf);
      note = [note, still.length ? t.ui.oldStill(still.join(', '))
        : same ? t.ui.oldMaterial : t.ui.oldVerdict(t.ui.verdictLabel[evaluate(ctx, pieceInput(r.old), { gamble: false }).v])].filter(Boolean).join(' ');
    }
    const item = input.slot;
    const from = twin ? ownerOf(twin.keys[0]) : '';
    setGearUndo({
      text: twin ? t.ui.moved(from, c.name, b.name, slot) : r.old ? t.ui.replaced(c.name, b.name, slot) : t.ui.equipped(c.name, b.name, slot), note, tab: 'eval',
      undo: (st) => (twin ? undoMove(st, key, twin, r.old) : undoEquip(st, key, item, r.piece, r.old)), after: added ? () => rosterApi.remove([c.id]) : undefined,
    });
  };
  // примерка из карточки персонажа: персонаж — в ростер (как у «Надеть»), на форму — слот и сет, грейд прежний.
  // Вещь, которую вводили, уходит в «Вернуть»; та же вещь на форме (слот и сет те же) остаётся
  const startTryOn = (c: Char, b: Build, slot?: SlotId, from?: Piece) => {
    tryOn.set({ charId: c.id, build: b.name });
    if (!roster.has(c.id)) rosterApi.add([c.id]);
    setVerdictOpen(false);
    const p = slot ? tryOnPreset(gear.store, buildKey(c.id, b.name), b, slot, from) : null;
    if (p && (s.slot !== p.slot || (isArmor(p.slot) && s.setId !== p.setId))) {
      const cur = itemInput(s);
      setUndo(hasItem(cur) ? cur : null);
      dispatch({ type: 'load', item: { slot: p.slot, grade: s.grade, setId: p.setId, itemKey: null, main: s.slot === p.slot ? s.main : null, unlisted: false, subs: {} } });
    } else dispatch({ type: 'tab', tab: 'eval' });
    if (layout.narrow) requestAnimationFrame(() => document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }));
  };
  // импорт кода экипировки заменил все записи: «Вернуть» — всё, как было до него
  const onGearImport = (prev: GearStore, text: string) => setGearUndo({ text, note: '', tab: 'chars', undo: () => prev });
  useHotkeys(s, dispatch, layout, onReset);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  // Без вердикта (не выбран сет, main или предмет) карточка не встаёт: на её месте остаётся сетка, а то, чего не хватает,
  // выделено на форме (EvalPanel need); вопрос — на плашке внизу
  const cardShown = layout.narrow && s.tab === 'eval' && verdict.v !== 'idle' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint(s.grade === 'unique', s.settings.fodder) : null;

  const tourCtx: TourCtx = { s, roster: roster.size, set: (s.setId && idx.SET[s.setId]?.short) || null, nSubs, verdict: shown, narrow: layout.narrow, verdictOpen: verdictOpen && layout.narrow, keys: fineHover() };
  const tour = useTour({
    c: tourCtx, dispatch, was: { roster: roster.size, welcomeHidden },
    onRunning: useCallback((on: boolean) => { setTouring(on); setUndo(null); }, []), onDone: hideWelcome,
  });
  // надеть нельзя во время обучения и когда экипировку сохранила более новая версия страницы (useGear.newer)
  const canEquip = !tour.run && !gear.newer;
  // кнопка под карточкой: в примерке — всегда (кроме «уже надета»), без неё — пустой слот или новая лучше
  const cardVs = vsList[0];
  const cardEquip = canEquip && !!cardVs && (target ? cardVs.kind !== 'worn' : cardVs.kind === 'fill' || cardVs.kind === 'up');
  const startTour = () => { setHelpOpen(false); setHelpNews([]); setVerdictOpen(false); tour.start(); };
  const welcomeShown = s.tab === 'eval' && !welcomeHidden && roster.size === 0 && !tour.run;
  // Обучение само предлагаем только в окне повыше (layout.tall): в полоске разделённого экрана места мало — подождём,
  // пока приложение откроют крупнее. Кнопка «Обучение» в меню и Справке работает всегда.
  // «Появилось обучение» — один раз: давнему игроку и новичку, который отметил персонажей раньше, чем прошёл тур
  // (закрыл карточку «Понятно» — от тура уже отказался). Показали — отмечено; до закрытия полоса видна в этом запуске
  const inviteDue = tour.available && !tour.store.invited
    && (tour.store.first === 'skipped' || (tour.store.first === 'new' && !welcomeHidden));
  const [inviteOpen, setInviteOpen] = useState(false);
  const inviteShown = (inviteOpen || inviteDue) && layout.tall && !tour.run && !welcomeShown && s.tab === 'eval' && !undo;
  useEffect(() => {
    if (inviteShown && !inviteOpen) { setInviteOpen(true); tour.markInvited(); }
  }, [inviteShown]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Что нового» после обновления: полоса сама, «Позже» — до следующего запуска; точка на ☰ и «Справке», пока не просмотрено
  const news = useMemo(() => newsOf(TIPS, tour.store), [tour.store]);
  const [newsLater, setNewsLater] = useState(false);
  const [forcedTip, setForcedTip] = useState<Tip | null>(null);
  const newsShown = layout.tall && tour.available && news.length > 0 && !newsLater && !tour.run && !welcomeShown && !inviteShown
    && s.tab === 'eval' && !undo;
  const showNews = () => { tour.knowTips(news); setForcedTip(news[0]); };
  // открыл Справку — новое просмотрено; пометка «новое» в ней остаётся, пока Справка открыта
  const [helpNews, setHelpNews] = useState<Tip[]>([]);
  useEffect(() => {
    if (!helpOpen || !news.length) return;
    setHelpNews(news);
    tour.knowTips(news);
  }, [helpOpen, news]); // eslint-disable-line react-hooks/exhaustive-deps
  const tipsOn = layout.tall && tour.available && !tour.run && !welcomeShown && !inviteShown && !newsShown && !undo;
  const onForced = useCallback(() => setForcedTip(null), []);

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
        {welcomeShown && <Welcome install={install} onTour={layout.tall ? startTour : undefined} onRoster={() => onTab('chars')} onClose={hideWelcome} />}
        <main>
          <section id="view-eval" className="view eval" role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            <EvalPanel s={s} dispatch={dispatch} ctx={ctx} verdict={shown} cardShown={cardShown} hint={layout.narrow ? null : hint}
              tryOn={target} onTryOnEnd={() => tryOn.set(null)} vs={vsList[0] ?? null} onEquip={cardEquip ? (v) => doEquip(v.c, v.b) : undefined}
              onReset={onReset} onHelp={() => setHelpOpen(true)} onCode={() => setCodeOpen(true)} onTour={startTour} news={news.length > 0} onOpenVerdict={() => setVerdictOpen(true)} />
            {!layout.narrow && <Verdict r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} onEquip={!canEquip ? undefined : (v) => doEquip(v.c, v.b)} onEquipPick={!canEquip || target ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={rosterApi} gear={gear} geared={geared} onGearImport={onGearImport} />
            <CharDetail key={s.charId ?? ''} charId={s.charId} ctx={ctx} rosterApi={rosterApi} gear={gear} active={s.tab === 'chars'}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} onTryOn={canEquip ? startTryOn : undefined} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} />
        <VBar r={shown} news={news.length > 0} quiet={!!tour.run} show={layout.narrow} compact={layout.tiny} stampless={cardShown} hint={hint} tab={s.tab} rosterSize={roster.size}
          onTab={onTab} onMenu={() => setMenuOpen(true)} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
        {inviteShown && (
          <div className="tour-strip tour-invite" role="status">
            <span>{t.tour.invite}</span>
            <button type="button" className="btn" onClick={() => { setInviteOpen(false); startTour(); }}>{t.tour.welcomeCta}</button>
            <button type="button" className="tour-x" aria-label={t.ui.close} onClick={() => setInviteOpen(false)}>✕</button>
          </div>
        )}
        {newsShown && (
          <div className="tour-strip tour-invite" role="status">
            <span>{t.tour.newsStrip(t.tour.news[news[0].id as keyof typeof t.tour.news] ?? t.tour.tips[news[0].id], news.length - 1)}</span>
            <button type="button" className="btn" onClick={showNews}>{t.tour.newsShow}</button>
            <button type="button" className="btn" onClick={() => setNewsLater(true)}>{t.tour.newsLater}</button>
          </div>
        )}
        <TipLayer tour={tour} c={tourCtx} enabled={tipsOn} forced={forcedTip} onForced={onForced} />
        <TourLayer tour={tour} c={tourCtx} rosterEmpty={roster.size === 0} onTab={onTab} onRoster={() => onTab('chars')} />
        {gearUndo && gearUndo.tab === s.tab && !tour.run && (
          <div className="toast gear-toast" role="status">
            <span>{gearUndo.text}{gearUndo.note && <small>{gearUndo.note}</small>}</span>
            <button type="button" onClick={() => { gear.set(gearUndo.undo(gear.store)); gearUndo.after?.(); setGearUndo(null); }}>{t.ui.undoAction}</button>
          </div>
        )}
        {twinAsk && !tour.run && (
          <Sheet title={t.ui.twinTitle(t.ui.slotNom[twinAsk.twin.piece.slot], ownerOf(twinAsk.twin.keys[0]))} onClose={() => setTwinAsk(null)}>
            <div className="twin">
              <p>{t.ui.twinNote(twinAsk.twin.keys.map(whoOf).join(', '))}</p>
              <p className="muted small">{t.ui.twinMoveNote}</p>
              <div className="piece-act">
                <button type="button" className="btn primary" onClick={() => putOn(twinAsk.c, twinAsk.b, twinAsk.twin)}>{t.ui.twinMove}</button>
                <button type="button" className="btn" onClick={() => putOn(twinAsk.c, twinAsk.b, null)}>{t.ui.twinOther}</button>
              </div>
            </div>
          </Sheet>
        )}
        {equipOpen && !tour.run && <EquipSheet ctx={ctx} store={gear.store} item={input} onEquip={doEquip} onClose={() => setEquipOpen(false)} />}
        {undo && s.tab === 'eval' && !tour.run && !gearUndo && (
          <div className="toast" role="status"><span>{t.ui.undoText}</span><button type="button" onClick={onUndo}>{t.ui.undoAction}</button></div>
        )}
        {menuOpen && (
          <Menu s={s} dispatch={dispatch} rosterSize={roster.size} news={news.length > 0} onClose={() => setMenuOpen(false)} onChars={() => onTab('chars')}
            gearN={[...geared.keys()].filter((id) => idx.CHAR[id]).length}
            onGear={() => { dispatch({ type: 'charFilter', patch: { cGear: true } }); dispatch({ type: 'selectChar', id: null }); onTab('chars'); }}
            onCode={() => setCodeOpen(true)} onHelp={() => setHelpOpen(true)} onTour={startTour}
            footer={<Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} />} />
        )}
        {codeOpen && (
          <Sheet title={t.ui.codeSheet} onClose={() => setCodeOpen(false)}>
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); setCodeOpen(false); }} />
          </Sheet>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => { setHelpOpen(false); setHelpNews([]); }}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={startTour} tips={<TipsHelp tour={tour} news={helpNews} />} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} onEquip={!canEquip ? undefined : (v) => doEquip(v.c, v.b)} onEquipPick={!canEquip || target ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
