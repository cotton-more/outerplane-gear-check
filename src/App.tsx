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
import { useToastPlace } from './hooks/useToastPlace';
import { isArmor, type Index } from './data';
import { LangContext, TEXTS, savedLang, type Lang } from './i18n';
import { makeCtx } from './logic/context';
import { evaluate, withPendingDice } from './logic/evaluate';
import { dropChar, gearedChars, holdersOf, samePiece, undoDrop, type GearStore, type Piece } from './logic/gear';
import { loadGear, unfuseChar } from './logic/gearStore';
import { normalizeStored, replacedX, switchFusion, type FusionFix } from './logic/fusion';
import { holds, isStats, poolView, putOn, undoPut, type PutResult } from './logic/pool';
import { charsVs, charVs, gearBadges, sectionChars, whereUsed, type CharVs } from './logic/poolVs';
import { charMatches } from './logic/lists';
import { dropSubs } from './logic/subs';
import type { Build, Char, GearKind, SlotId } from './data/types';
import { buildOfKey } from './logic/variants';
import type { ItemInput } from './logic/verdict';
import { offLine, targetName, tryOnPreset, tryOnTarget, tryOnTitle, tryRowOf, type TryOn } from './logic/tryon';
import { betterThanWorn, materialFor, withMaterial } from './logic/material';
import { withWorn } from './logic/worn';
import { fitsData, itemInput, reducer, type Action, type AppState, type Tab } from './state/appState';
import { storage } from './state/storage';
import { useAppState } from './state/useAppState';
import { useGear, type GearApi } from './state/useGear';
import { useRoster, type RosterApi } from './state/useRoster';
import { holdStoredWrites, readStored, takeLoadNote } from './state/stored';
import { FusionAsk } from './components/chars/FusionAsk';
import { RosterRemoveAsk } from './components/chars/RosterRemoveAsk';
import { useTryOn } from './state/useTryOn';
import { TIPS } from './tour/registry';
import { TipLayer } from './tour/TipLayer';
import { TipsHelp } from './tour/TipsHelp';
import { newsOf } from './tour/tips';
import { TourLayer } from './tour/TourLayer';
import type { StepId, Tip, TourCtx, TourId } from './tour/types';
import { gearDemo } from './tour/gear';
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
  // экипировка: что надето в билдах; сравнение с ней — раздел «Сейчас на персонажах» в подробностях вердикта.
  // Вещь — материал Breakthrough для надетой не на T4: «Разобрать» поднимается до «Фоддер» (logic/material)
  const realGear = useGear(idx, !touring);
  // тур «Экипировка» — на примере (src/tour/gear.ts): своя экипировка и своя примерка в памяти, записи игрока не трогаются.
  // Другие туры — на пустой экипировке: запись ничего не делает (она легла бы из пустого стора поверх вещей игрока)
  const [demo, setDemo] = useState<{ store: GearStore; tryOn: TryOn | null } | null>(null);
  const gear: GearApi = useMemo(() => (demo
    ? { store: demo.store, set: (st: GearStore) => setDemo((d) => d && { ...d, store: st }), newer: false }
    : touring ? { ...realGear, set: () => {} } : realGear), [demo, realGear, touring]);
  // Core Fusion (logic/fusion): есть CF — X неактивен (X → CF): не кандидат вердикта, не в «Кому надеть?» и примерке
  const off = useMemo(() => replacedX(idx, roster, gear.store.pools), [idx, roster, gear.store.pools]);
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t, off), [idx, s.settings, roster, t, off]);
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const key = JSON.stringify(input);
  const quick = useMemo(() => evaluate(ctx, input, { gamble: false }), [ctx, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // кубик Reforge — до 10 пробных оценок (на телефоне заметно): вердикт встаёт сразу, кубик досчитывается следом
  const later = useDeferredValue(key);
  const full = useMemo(() => evaluate(ctx, JSON.parse(later) as ItemInput), [ctx, later]);
  // кубик ещё считается: у той же вещи с другим сегментом — прежний кубик, а не строка без него (logic/evaluate)
  const raw = useMemo(() => (later === key ? full : withPendingDice(ctx, input, quick, JSON.parse(later) as ItemInput, full)), [ctx, key, later, full, quick]); // eslint-disable-line react-hooks/exhaustive-deps
  // экипировка по пулу (logic/pool): вид — один раз на хранилище; примерка (logic/tryon) — сравнение только с одним
  // вариантом, «Надеть» — этому персонажу; на время обучения её нет
  const baseView = useMemo(() => poolView(ctx, gear.store), [ctx, gear.store]);
  const realTry = useTryOn(idx, !touring);
  const tryOn = demo ? { value: demo.tryOn, set: (v: TryOn | null) => setDemo((d) => d && { ...d, tryOn: v }) } : realTry;
  // X при Core Fusion X не примеряем (logic/fusion)
  const target = useMemo(() => {
    const tg = demo ? tryOnTarget(idx, demo.tryOn, baseView) : touring ? null : tryOnTarget(idx, realTry.value, baseView);
    return tg && off.has(tg.c.id) ? null : tg;
  }, [idx, demo, realTry.value, touring, baseView, off]);
  // вариант примерки собирается, даже пустой
  const view = useMemo(() => (target ? poolView(ctx, gear.store, target.v.key) : baseView), [ctx, gear.store, target, baseView]);
  // у кого есть вещи: персонаж → лучший «N/6» (плитки, меню, фильтр «с экипировкой»)
  const geared = useMemo(() => gearBadges(view), [view]);
  // примерка — явный выбор персонажа: и «По статам», когда он не собирается (Р11)
  const targetVs = useMemo(() => (target ? charVs(ctx, view, target.c.id, input, target.v.key, { explicit: true }) : null), [ctx, view, target, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // запасная строка примерки настоящего билда: вещь не по нему (строки нет или «только статы»), а по статам подходит —
  // «Надеть» положит её в «По статам» (Р11): карточка, строка и кнопка — про «По статам»
  const statVs = useMemo(() => {
    if (!target || isStats(target.v) || (targetVs && targetVs.best?.kind !== 'stats')) return null;
    const stat = view.of(target.c.id)?.stat;
    const x = stat ? charVs(ctx, view, target.c.id, input, stat.key, { explicit: true }) : null;
    return x?.useful ? x : null;
  }, [ctx, view, target, targetVs, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // материал: вещь лучше той, для которой она материал, или в примерке она встаёт в вариант цели — «надень»
  const mat = useMemo(() => {
    const needs = materialFor(view, input);
    const up = needs.length ? betterThanWorn(ctx, view, input, needs) : [];
    const k = targetVs?.best?.used ? targetVs.best.kind : null;
    const aim = target && (k === 'fill' || k === 'up' || k === 'closer' || k === 'completes') ? `${target.c.name} · ${targetName(t, target)}` : null;
    return { needs, wear: { up, target: aim } };
  }, [ctx, view, targetVs, target, key, t]); // eslint-disable-line react-hooks/exhaustive-deps
  // штамп по вещам персонажей (logic/worn): такая же у кого-то — «Оставить»; всем, кому подходит, она ничего не даёт —
  // «Разобрать». Вещь — материал и лучше такой же у кого-то — не понижаем (совет «надень»)
  const worn = useMemo(() => withWorn(ctx, view, input, raw, { hold: mat.wear.up.length > 0 }), [ctx, view, raw, mat]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdict = useMemo(() => withMaterial(idx, t, worn, mat.needs, mat.wear), [idx, t, worn, mat]);
  // «Сейчас на персонажах»: кандидаты вердикта, у кого есть вещи, и свои без вещей — им вещь начнёт билд (понизили —
  // прежнего вердикта: они и объясняют, почему «Разобрать»); в примерке — только цель (или её «По статам»)
  const vsList = useMemo((): CharVs[] => {
    if (verdict.v === 'idle') return [];
    if (target) return statVs ? [statVs] : targetVs ? [targetVs] : [];
    const chars = sectionChars(worn.worn === 'lower' ? raw : verdict).filter((c) => gear.store.pools[c.id]?.length || roster.has(c.id));
    return charsVs(ctx, view, input, chars);
  }, [ctx, view, raw, worn, verdict, target, targetVs, statVs, gear.store, roster]); // eslint-disable-line react-hooks/exhaustive-deps
  // примерка, а вещь варианту не подходит: строка «Не по билду Speed: Attack в его связках нет» (надеть нельзя); по
  // статам подходит — ещё «…«Надеть» положит её в «По статам»». Цель «По статам», а полезных статов нет — так и сказать
  const offNote = !target || verdict.v === 'idle' ? null
    : isStats(target.v) ? (targetVs ? null : t.tryon.noStats(target.c.name))
      : statVs ? [isArmor(s.slot) ? offLine(t, idx, target, s.setId ?? null) : '', t.tryon.offStats(target.c.name)].filter(Boolean).join(' ')
        : !targetVs && isArmor(s.slot) ? offLine(t, idx, target, s.setId ?? null) : null;
  // штамп общий, а заголовок после « — » в примерке — и про других, и про неё
  const shown = useMemo(() => (target
    ? { ...verdict, title: tryOnTitle(t, verdict, target, tryRowOf(idx, targetVs?.best ?? null, !!targetVs?.worn), isArmor(s.slot)) }
    : verdict), [t, idx, verdict, target, targetVs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [equipOpen, setEquipOpen] = useState(false);
  // сообщение после «Надеть» и импорта кода. «Вернуть» после «Надеть» — обратная операция только этого действия: другие
  // правки за эти 8 секунд остаются; после импорта — всё, как было до импорта (Р8). Видно на той вкладке, где сделано:
  // на «Персонажах» оно легло бы на карточку вещи
  // Сообщение о ростере (Core Fusion) — тем же механизмом: undo нет, «Вернуть» — только after; нечего вернуть — без кнопки
  const [gearUndo, setGearUndo] = useState<{
    text: string; note: string; tab: Tab; undo?: (st: GearStore) => GearStore; after?: () => void;
  } | null>(null);
  useEffect(() => {
    if (!gearUndo) return;
    const id = setTimeout(() => setGearUndo(null), 8000);
    return () => clearTimeout(id);
  }, [gearUndo]);
  // обновление: новые данные — плашка сверху; только приложение — строка в подвале (hooks/usePwa)
  const pwa = usePwa(idx.D.meta.commit);
  const appUpdate = pwa.update === 'app' ? pwa.applyUpdate : undefined;
  const charName = (id: string) => idx.CHAR[id]?.name ?? id;
  // вещь по имени для тоста «Заменить»: сет у брони, предмет у оружия и аксессуара (Epic без предмета — main)
  const pieceLabel = (p: Piece) => (p.setId ? idx.SET[p.setId]?.short ?? p.setId
    : (p.itemKey ? idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? p.main ?? '');
  // Core Fusion (logic/fusion). Нормализация (загрузка, импорт, пакетные добавления) — одно сообщение со списком
  const fixesNote = (fixes: FusionFix[]) => fixes.map((f) => t.ui.fusionFixed(charName(f.base), f.kind)).join(' ');
  // после загрузки: нормализация что-то поменяла (state/stored — уже записано, Р17) — сказать один раз: кого добавили
  // в ростер (у них есть вещи, Р16) и что стало с X при Core Fusion X
  useEffect(() => {
    const n = takeLoadNote(idx);
    if (!n) return;
    const names = n.added.map(charName).join(', ');
    const fx = fixesNote(n.fixes);
    setGearUndo({ text: names ? t.ui.gearRosterAdded(names) : fx, note: names ? fx : '', tab: s.tab });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // «Вернуть» ростера после перехода, пакетного добавления и импорта — ростер, каким был (тот же порядок)
  const rosterBack = (prev: string[], next: string[]) => (prev.join() === next.join() ? undefined : () => rosterApi.replace(prev));
  // настоящая экипировка игрока: в обучении на странице пусто или пример (useGear persist, tour/gear), а решать, у кого
  // есть вещи, надо по его записям — в обучении они не меняются
  const realStore = () => (touring ? readStored(idx).st : gear.store);
  // пакетное (б): «Отметить показанных», код ростера, «Очистить ростер» — без окон, есть оба — остаётся Core Fusion,
  // одно сообщение. X, который уже неактивен, «Отметить показанных» не добавляет. Пакетное не убирает из ростера тех, у
  // кого есть вещи (Р16: вещи — только у героев ростера; убрать с вещами — звездой, через окно): они остаются на своих
  // местах.
  // В обучении экипировка не пишется (на странице — тура): нормализуем по настоящим вещам игрока, и если правка ростера
  // тронула бы их (переход Core Fusion переносит или убирает вещи) — её нет вовсе, без окна и без записи; иначе пишется
  // только ростер. Так ростер в туре не расходится с вещами игрока (вещи — только у героев ростера)
  const rosterBatch = (ids: string[]) => {
    const prev = rosterApi.list(), st = gear.store, real = realStore();
    const next = [...ids, ...prev.filter((id) => !ids.includes(id) && real.pools[id]?.length)];
    if (touring) {
      const r = normalizeStored(idx, next, real);
      if (r.st === real) rosterApi.replace(r.roster);
      return;
    }
    const r = normalizeStored(idx, next, st);
    rosterApi.replace(r.roster);
    if (r.st !== st) gear.set(r.st);
    if (!r.fixes.length) return;
    // вещи на ходу только переходят (у CF пусто — иначе X уже был бы неактивен); убраны — «Вернуть» всё хранилище
    const undo = r.st === st ? undefined : r.fixes.some((f) => f.kind === 'removed') ? () => st
      : (x: GearStore) => r.fixes.reduceRight((y, f) => (f.kind === 'moved' ? unfuseChar(y, f.base, f.fusion, { moved: f.ids, had: [] }) : y), x);
    setGearUndo({ text: fixesNote(r.fixes), note: '', tab: 'chars', undo, after: rosterBack(prev, r.roster) });
  };
  // окна перехода (в): звезда, «Надеть», примерка на CF, когда есть X (или на X, когда есть CF). then — действие после «Да»
  // на хранилище после перехода; нет конфликта — false, действие идёт сразу. В обучении окон нет — как пакетное
  type Switched = { st: GearStore; note: string; undo: (st: GearStore) => GearStore; after?: () => void };
  const [fusionAsk, setFusionAsk] = useState<{ to: string; from: string; n: number; then?: (sw: Switched) => void } | null>(null);
  const counterpart = (id: string) => idx.CHAR[id]?.fusionOf ?? idx.FUSED[id];
  const fusionGate = (id: string, then?: (sw: Switched) => void) => {
    const from = counterpart(id);
    if (touring || !from || !(roster.has(from) || gear.store.pools[from]?.length)) return false;
    setVerdictOpen(false);
    setEquipOpen(false);
    setFusionAsk({ to: id, from, n: gear.store.pools[from]?.length ?? 0, then });
    return true;
  };
  const doSwitch = () => {
    const a = fusionAsk;
    setFusionAsk(null);
    const prev = rosterApi.list();
    const sw = a && switchFusion(idx, prev, gear.store, a.to);
    if (!a || !sw) return;
    gear.set(sw.st);
    rosterApi.replace(sw.roster);
    const note = [t.ui.fusionReplaces(charName(sw.to), charName(sw.from)), sw.moved.length ? t.ui.fusionGear(charName(sw.from), charName(sw.to)) : ''].filter(Boolean).join(' ');
    const done: Switched = { st: sw.st, note, undo: (x) => unfuseChar(x, sw.from, sw.to, sw), after: rosterBack(prev, sw.roster) };
    if (a.then) a.then(done);
    else setGearUndo({ text: note, note: '', tab: s.tab, undo: done.undo, after: done.after });
  };
  // «Вернуть» сообщения экипировки. Р16: вещи — только у героев ростера; «Вернуть» вернул вещи тому, кого за эти секунды
  // успели убрать из ростера (без вещей — звезда без окна), — он снова в ростере
  const onGearUndo = () => {
    const u = gearUndo;
    setGearUndo(null);
    if (!u) return;
    const st = u.undo ? u.undo(gear.store) : gear.store;
    if (u.undo) gear.set(st);
    u.after?.();
    if (touring) return;
    const cur = rosterApi.list();
    const missing = [...gearedChars(st).keys()].filter((id) => idx.CHAR[id] && !cur.includes(id));
    if (missing.length) rosterApi.add(missing);
  };
  const both = (f?: () => void, g?: () => void) => (f || g ? () => { f?.(); g?.(); } : undefined);
  // в ростер тем, кого одели или примерили (конфликта Core Fusion уже нет — fusionGate); «Вернуть» — убрать
  const joinRoster = (id: string) => {
    const added = touring ? [] : rosterApi.add([id]);
    return added.length ? () => rosterApi.remove(added) : undefined;
  };
  // звезда с героя, у которого есть вещи (Р16), — окно «Убрать X из ростера?»; «Да» — герой из ростера, его вещи — из
  // его пула (общие записи остаются у других), «Вернуть» — вещи, отметки и место в ростере. В обучении окна нет и вещи
  // не убираются: звезда такого героя не снимается (на странице — экипировка тура, записи игрока не трогаем)
  const [removeAsk, setRemoveAsk] = useState<{ id: string; n: number } | null>(null);
  const unstar = (id: string) => {
    const n = realStore().pools[id]?.length ?? 0;
    if (!n) rosterApi.toggle(id);
    else if (!touring) setRemoveAsk({ id, n });
  };
  const doRemove = () => {
    const a = removeAsk;
    setRemoveAsk(null);
    if (!a || !rosterApi.list().includes(a.id)) return;
    const st = gear.store, prev = rosterApi.list();
    const r = dropChar(st, a.id);
    gear.set(r.st);
    const wrote = storage.raw('gear');
    rosterApi.remove([a.id]);
    // «Вернуть»: хранилище с тех пор не менялось (и перечитанное из него — тот же объект по смыслу) — прежний объект
    // целиком, байт в байт; иначе — только это действие
    const back = () => {
      const cur = rosterApi.list();
      if (cur.includes(a.id)) return;
      const after = prev.slice(prev.indexOf(a.id) + 1).find((id) => cur.includes(id));
      const at = after ? cur.indexOf(after) : cur.length;
      rosterApi.replace([...cur.slice(0, at), a.id, ...cur.slice(at)]);
    };
    const others = [...new Set(r.dropped.ids.flatMap((pid) => holdersOf(r.st, pid)))].map(charName);
    setGearUndo({
      text: t.ui.removedFrom(charName(a.id)), note: others.length ? t.ui.stillWith(others.join(', ')) : '', tab: 'chars',
      undo: (x) => (x === r.st || (wrote !== null && storage.raw('gear') === wrote) ? st : undoDrop(x, r.dropped)), after: back,
    });
  };
  // список и карточка персонажа: звезда — с окнами перехода и снятия; «Отметить показанных», код ростера, «Очистить» —
  // пакетные
  const rosterUi: RosterApi = {
    ...rosterApi,
    toggle: (id) => {
      const cur = rosterApi.list();
      if (cur.includes(id)) unstar(id);
      else if (!fusionGate(id)) rosterBatch([...cur, id]);
    },
    add: (ids) => {
      const cur = rosterApi.list();
      const next = [...cur, ...ids.filter((id) => !cur.includes(id) && !off.has(id))];
      rosterBatch(next);
      return next.filter((id) => !cur.includes(id));
    },
    replace: (ids) => rosterBatch(ids),
    clear: () => rosterBatch([]),
  };
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
  // надеть вещь с формы на персонажа (logic/pool putOn); персонаж попадает в ростер; сообщение — куда она встала и что
  // стало с вытесненной, с «Вернуть». Такая же вещь уже у другого персонажа — сначала «Это шлем Rin?»: та же запись
  // («Она же — и у Caren») или своя. У самого персонажа такая уже есть — ничего (кнопка «Уже есть» не нажимается)
  const [twinAsk, setTwinAsk] = useState<{ c: Char; piece: Piece; owner: string; sw: Switched | null } | null>(null);
  const buildName = (key: string) => buildOfKey(key, t.ui.byStats);
  // где запись стоит у персонажа: имена билдов (родителей вариантов) его собираемых сборок
  const usedFor = (st: GearStore, charId: string, id: string) =>
    [...new Set(whereUsed(poolView(ctx, st, target?.c.id === charId ? target.v.key : null), charId, id).map((v) => buildName(v.key)))];
  // «Надеть на CF», когда есть X, — сначала окно перехода (в); вещи X уже у CF, когда дойдёт до «Это шлем Rin?»
  const doEquip = (c: Char) => {
    setEquipOpen(false);
    if (!fusionGate(c.id, (sw) => equipCheck(c, sw))) equipCheck(c, null);
  };
  const switchToast = (sw: Switched, tab: Tab) => setGearUndo({ text: sw.note, note: '', tab, undo: sw.undo, after: sw.after });
  const equipCheck = (c: Char, sw: Switched | null) => {
    const st = sw?.st ?? gear.store;
    const has = (id: string) => (st.pools[id] ?? []).map((pid) => st.pieces[pid]).find((p) => p && samePiece(input, p));
    if (has(c.id)) { if (sw) switchToast(sw, 'eval'); return; }
    const owner = Object.keys(st.pools).find((id) => id !== c.id && idx.CHAR[id] && has(id));
    // «Это шлем Rin?» — своё окно: шторку вердикта закрыть, как перед «Кому надеть?» (две шторки — один Esc на обе)
    if (owner && !touring) { setVerdictOpen(false); setTwinAsk({ c, piece: has(owner)!, owner, sw }); } else equipOn(c, null, sw, st);
  };
  // sw — переход Core Fusion перед этим «Надеть»: его строка — в сообщение, его «Вернуть» — вместе с этим
  const equipOn = (c: Char, record: Piece | null, sw: Switched | null = null, st0: GearStore = gear.store) => {
    setTwinAsk(null);
    const r = putOn(ctx, st0, c.id, input, { record: record ?? undefined, tryOn: target?.c.id === c.id ? target.v.key : null });
    if (!r.added) { if (sw) switchToast(sw, 'eval'); return; }
    // в обучении — ни ростера, ни сообщения: его «Вернуть» после тура отменило бы что-то в записях игрока.
    // «Заменить» в шторке вердикта — шторку закрыть: следующий шаг тура — ✕ на полосе примерки под ней
    const joined = joinRoster(c.id);
    const st = r.st;
    gear.set(st);
    if (touring) setVerdictOpen(false);
    setUndo(null);
    if (touring) return;
    const used = usedFor(st, c.id, r.id);
    // убраны 2+ вещи её слота — назвать каждую: «Заменено: ботинки Caren — убраны прежние: Speed и Immunity.»
    const text = r.removed.length > 1 ? t.ui.replacedMany(c.name, r.piece.slot, [...new Set(r.removed.map(pieceLabel))])
      : r.removed.length ? t.ui.replaced(c.name, r.piece.slot) : [t.ui.equipped(c.name, r.piece.slot), used.length ? t.ui.countsIn(used.join(', ')) : ''].filter(Boolean).join(' ');
    const notes: string[] = [];
    if (r.marks.length) notes.push(t.ui.startedFilling([...new Set(r.marks.map(buildName))].join(', ')));
    if (r.shared.length) notes.push(t.ui.sameAs(r.shared.map(charName).join(', ')));
    notes.push(...removedNotes(st, c, r));
    if (sw) notes.push(sw.note);
    setGearUndo({
      text, note: notes.join(' '), tab: 'eval',
      undo: (x) => (sw ? sw.undo(undoPut(x, c.id, r)) : undoPut(x, c.id, r)), after: both(joined, sw?.after),
    });
  };
  // что стало с убранными из пула (Р7: только вещи слота новой) — каждая своей строкой: осталась у другого или материал
  // новой. Кому отдать снятую — не предлагаем никогда (Р15): игрок снимет её в игре и оценит сам. st — после «Надеть»
  // убраны 2+ — в строках имя сета или предмета вместо «Старые» (заголовок replacedMany их уже перечислил)
  const removedNotes = (st: GearStore, c: Char, r: PutResult) => {
    const notes: string[] = [];
    const many = r.removed.length > 1;
    for (const old of r.removed) {
      const still = holdersOf(st, old.id).filter((id) => id !== c.id);
      const same = old.slot === r.piece.slot && (isArmor(old.slot) ? old.setId === r.piece.setId && old.grade === r.piece.grade : !!old.itemKey && old.itemKey === r.piece.itemKey);
      if (still.length) notes.push(t.ui.oldStill(old.slot, charName(still[0]), usedFor(st, still[0], old.id).join(', ') || t.ui.byStats, many ? pieceLabel(old) : undefined));
      else if (same) notes.push(t.ui.oldMaterial(old.slot));
    }
    return notes;
  };
  // «Убрать у Caren» и «Разобрал — убрать у всех» в карточке персонажа: сообщение с «Вернуть» — на «Персонажах»
  const onGearToast = (text: string, note: string, undo: (st: GearStore) => GearStore) => setGearUndo({ text, note, tab: 'chars', undo });
  // примерка из карточки персонажа: персонаж — в ростер (как у «Надеть»), на форму — слот и сет, грейд прежний.
  // Вещь, которую вводили, уходит в «Вернуть»; та же вещь на форме (слот и сет те же) остаётся
  // Примерка CF, когда есть X (или X, когда есть CF), — сначала окно перехода (в)
  const startTryOn = (c: Char, b: Build, slot?: SlotId, from?: Piece, combo?: string | null) => {
    if (!fusionGate(c.id, (sw) => { tryOnGo(c, b, sw.st, slot, from, combo); switchToast(sw, 'eval'); })) tryOnGo(c, b, gear.store, slot, from, combo);
  };
  const tryOnGo = (c: Char, b: Build, st: GearStore, slot?: SlotId, from?: Piece, combo?: string | null) => {
    const next = { charId: c.id, build: b.name, ...(combo ? { combo } : {}) };
    tryOn.set(next);
    joinRoster(c.id);
    setVerdictOpen(false);
    const tg = tryOnTarget(idx, next, st === gear.store ? baseView : poolView(ctx, st));
    const p = slot && tg ? tryOnPreset(poolView(ctx, st, tg.v.key), tg, slot, from) : null;
    if (p && (s.slot !== p.slot || (isArmor(p.slot) && s.setId !== p.setId))) {
      const cur = itemInput(s);
      // на форме уже пустая заготовка (второй «Примерить» подряд) — прежнее «Вернуть» остаётся
      setUndo((u) => (touring ? null : hasItem(cur) ? cur : u));
      dispatch({ type: 'load', item: { slot: p.slot, grade: s.grade, setId: p.setId, itemKey: null, main: s.slot === p.slot ? s.main : null, unlisted: false, subs: {} } });
    } else dispatch({ type: 'tab', tab: 'eval' });
    if (layout.narrow) requestAnimationFrame(() => document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }));
  };
  // импорт кода экипировки заменил все записи: все, у кого есть вещи, — в ростер, затем Core Fusion (logic/fusion
  // normalizeStored). «Вернуть» — всё хранилище, как было до него; ростер — каким был. Вещей нет — false
  const onGearImport = (prev: GearStore, raw: unknown): boolean => {
    const before = rosterApi.list();
    const r = loadGear(raw, idx, before);
    const n = Object.keys(r.st.pieces).length;
    if (!n) return false;
    const next = r.roster;
    gear.set(r.st);
    rosterApi.replace(next);
    const names = next.filter((id) => !before.includes(id) && idx.CHAR[id]).map(charName).join(', ');
    const text = t.ui.gearApplied(n);
    setGearUndo({ text: names ? `${text} ${t.ui.gearRosterAdded(names)}` : text, note: fixesNote(r.fixes), tab: 'chars', undo: () => prev, after: rosterBack(before, next) });
    return true;
  };
  useHotkeys(s, dispatch, layout, onReset);
  const onTab = (tab: Tab) => dispatch({ type: 'tab', tab });
  // телефон: готовый вердикт встаёт карточкой на место сетки (все сабстаты или уже ясно, что в разбор)
  const nSubs = Object.keys(s.subs).length;
  // Без вердикта (не выбран сет, main или предмет) карточка не встаёт: на её месте остаётся сетка, а то, чего не хватает,
  // выделено на форме (EvalPanel need); вопрос — на плашке внизу
  const cardShown = layout.narrow && s.tab === 'eval' && verdict.v !== 'idle' && (nSubs >= dropSubs(s.grade) || verdict.v === 'junk');
  // сет выбран, сабстатов нет: подсказка «ярких 0–1 — в разбор» (на телефоне — на плашке, иначе под сеткой)
  const hint = isArmor(s.slot) && s.setId && !nSubs && verdict.v !== 'junk' ? t.ui.triageHint(s.grade === 'unique', s.settings.fodder) : null;

  const [pieceOpen, setPieceOpen] = useState(false); // карточка вещи в блоке билда (для тура «Экипировка»)
  const tourCtx: TourCtx = {
    s, roster: roster.size, set: (s.setId && idx.SET[s.setId]?.short) || null, nSubs, verdict: shown, narrow: layout.narrow,
    verdictOpen: verdictOpen && layout.narrow, keys: fineHover(),
    pieceOpen, tryOn: !!target, gearSeq: gear.store.seq,
    // подсказка «Фоддер, а не разбор: эта пойдёт ей на Breakthrough» — не когда совет «надень её»
    // («Фоддер» от понижения B3 — не материал: он из withWorn, а не из withMaterial)
    material: shown.v === 'fodder' && worn.v !== 'fodder' && !mat.wear.up.length && !mat.wear.target,
    // подсказка «все уже носят не хуже»: её текст — про «Разобрать»
    worn: verdict.worn === 'lower' && shown.v === 'junk',
  };
  // тур «Экипировка» — только если персонаж примера есть в данных
  const tours = useMemo<TourId[]>(() => (gearDemo(idx) ? ['core', 'gear'] : ['core']), [idx]);
  const onTourRun = useCallback((id: TourId | null) => {
    const d = id === 'gear' ? gearDemo(idx) : null;
    setDemo(d ? { store: d.store, tryOn: null } : null);
    if (d) dispatch({ type: 'openChar', id: d.c.id, reveal: 'keep' });
  }, [idx, dispatch]);
  // шаги тура «Экипировка». Карточка вещи — снова Caren, если её карточку закрыли. «Примерка» — на форму вещь примера
  // (вводить ничего не нужно) и примерка примера, если шаги 1–2 прошли «Дальше»: иначе шаги 3–5 говорили бы о том,
  // чего на экране нет
  const onTourStep = useCallback((id: TourId, step: StepId) => {
    const d = id === 'gear' ? gearDemo(idx) : null;
    if (!d) return;
    if (step === 'gPiece') dispatch({ type: 'openChar', id: d.c.id, reveal: 'keep' });
    if (step !== 'gCard') return;
    setDemo((x) => x && (x.tryOn ? x : { ...x, tryOn: { charId: d.c.id, build: d.b.name } }));
    dispatch({ type: 'load', item: d.item });
  }, [idx, dispatch]);
  const tour = useTour({
    c: tourCtx, dispatch, was: { roster: roster.size, welcomeHidden }, tours, onTour: onTourRun, onStep: onTourStep,
    // «Вернуть» экипировки тоже: после тура оно вернуло бы экипировку тура (пример или пусто) поверх записей игрока
    // в обучении и запись нормализации при чтении хранилища (Р17) не срабатывает — ничего не пишем
    onRunning: useCallback((on: boolean) => { holdStoredWrites(on); setTouring(on); setUndo(null); setGearUndo(null); }, []), onDone: hideWelcome,
  });
  useEffect(() => () => holdStoredWrites(false), []); // страницу закрыли посреди обучения
  // надеть нельзя во время обучения и когда экипировку сохранила более новая версия страницы (useGear.newer)
  const canEquip = (!tour.run || !!demo) && !gear.newer;
  // кнопка под карточкой — только для полезной вещи (решение владельца: хлам к персонажу не попадает; Р4 — исход на
  // карточке держит и вещь в нём встаёт, или она начнёт билд: poolVs useful); вторая — «или — Rin · Speed ▸», если
  // такой исход есть и у другого
  const cardVs = vsList[0];
  const cardEquip = canEquip && !!cardVs?.useful;
  const cardOther = cardEquip && !target ? vsList.slice(1).find((x) => x.useful && x.best && holds(x.best)) ?? null : null;
  // id не задан — «Какое обучение?» (туров несколько); новичку из карточки и из «Появилось обучение» — главный
  const startTour = (id?: TourId) => { setHelpOpen(false); setHelpNews([]); setVerdictOpen(false); tour.start(id); };
  const openTours = () => startTour();
  const welcomeShown = s.tab === 'eval' && !welcomeHidden && roster.size === 0 && !tour.run;
  // сообщения с «Вернуть»: экипировки — на вкладке, где сделано; формы — на «Оценке», если нет первого
  const gearToast = !!gearUndo && gearUndo.tab === s.tab && !tour.run;
  const formToast = !!undo && s.tab === 'eval' && !tour.run && !gearToast;
  const toastAt = useToastPlace((gearToast || formToast) && !layout.narrow, s.tab === 'eval' ? 'eval-in' : 'char-list');
  // телефон: сообщение экипировки лежит и поверх шторки вердикта — внизу шторки место, чтобы строку под ним прокрутить
  useEffect(() => {
    document.body.classList.toggle('toast-on', gearToast && layout.narrow);
    return () => document.body.classList.remove('toast-on');
  }, [gearToast, layout.narrow]);
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
  // «Показать»: у новости с туром — тур («Экипировка»), иначе — сама подсказка
  const showNews = () => {
    tour.knowTips(news);
    if (news[0].tour) startTour(news[0].tour); else setForcedTip(news[0]);
  };
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
        {pwa.update === 'data' && <div id="updnote"><Notice text={t.ui.updateNotice} action={t.ui.updateAction} onAction={pwa.applyUpdate} /></div>}
        {layout.desktopModeOnPhone && !fitHidden && (
          <div id="fitnote">
            <Notice text={t.ui.desktopModeNotice}
              action={t.ui.gotIt} onAction={() => { storage.set('fitnoteHidden', true); setFitHidden(true); }} />
          </div>
        )}
        {welcomeShown && <Welcome install={install} onTour={layout.tall ? () => startTour('core') : undefined} onRoster={() => onTab('chars')} onClose={hideWelcome} />}
        <main>
          <section id="view-eval" className="view eval" role="tabpanel" aria-labelledby="tab-eval" hidden={s.tab !== 'eval'}>
            <EvalPanel s={s} dispatch={dispatch} ctx={ctx} verdict={shown} cardShown={cardShown} hint={layout.narrow ? null : hint}
              tryOn={target} onTryOnEnd={() => tryOn.set(null)} vs={vsList[0] ?? null} onEquip={cardEquip ? (v) => doEquip(v.c) : undefined}
              other={cardOther} onEquipOther={cardOther ? (v) => doEquip(v.c) : undefined}
              onReset={onReset} onHelp={() => setHelpOpen(true)} onCode={() => setCodeOpen(true)} onTour={openTours} news={news.length > 0} onOpenVerdict={() => setVerdictOpen(true)} />
            {!layout.narrow && <Verdict r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={view} offNote={offNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={!canEquip || target ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={rosterUi} gear={gear} geared={geared} off={off} onGearImport={onGearImport} touring={!!tour.run} />
            <CharDetail key={(s.charId ?? '') + (demo ? ':demo' : '')} charId={s.charId} ctx={ctx} view={view} rosterApi={rosterUi} gear={gear} active={s.tab === 'chars'} onOpenChar={openChar}
              onGearToast={onGearToast}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} onTryOn={canEquip ? startTryOn : undefined}
              onPieceOpen={setPieceOpen} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} onAppUpdate={appUpdate} />
        <VBar r={shown} news={news.length > 0} quiet={!!tour.run} show={layout.narrow} compact={layout.tiny} stampless={cardShown} hint={hint} tab={s.tab} rosterSize={roster.size}
          onTab={onTab} onMenu={() => setMenuOpen(true)} onReset={onReset} onOpen={() => setVerdictOpen(true)} />
        {inviteShown && (
          <div className="tour-strip tour-invite" role="status">
            <span>{t.tour.invite}</span>
            <button type="button" className="btn" onClick={() => { setInviteOpen(false); startTour('core'); }}>{t.tour.welcomeCta}</button>
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
        <TourLayer tour={tour} c={tourCtx} rosterEmpty={roster.size === 0} tours={tours} onTab={onTab} onRoster={() => onTab('chars')} />
        {gearUndo && gearToast && (
          <div className="toast gear-toast" role="status" style={toastAt}>
            <span>{gearUndo.text}{gearUndo.note && <small>{gearUndo.note}</small>}</span>
            {(gearUndo.undo || gearUndo.after) && (
              <button type="button" onClick={onGearUndo}>{t.ui.undoAction}</button>
            )}
          </div>
        )}
        {twinAsk && !tour.run && (
          <Sheet title={t.ui.twinTitle(twinAsk.piece.slot, charName(twinAsk.owner))} onClose={() => { if (twinAsk.sw) switchToast(twinAsk.sw, 'eval'); setTwinAsk(null); }}>
            <div className="twin">
              <p>{t.ui.twinNote(charName(twinAsk.owner), usedFor(gear.store, twinAsk.owner, twinAsk.piece.id).join(', ') || t.ui.byStats)}</p>
              <div className="piece-act twin-act">
                <button type="button" className="btn primary" onClick={() => equipOn(twinAsk.c, twinAsk.piece, twinAsk.sw)}>
                  {t.ui.twinShare(twinAsk.c.name)}<small>{t.ui.twinShareNote}</small>
                </button>
                <button type="button" className="btn" onClick={() => equipOn(twinAsk.c, null, twinAsk.sw)}>
                  {t.ui.twinOther}<small>{t.ui.twinOtherNote(twinAsk.c.name)}</small>
                </button>
              </div>
              <p className="muted small">{t.ui.twinFoot}</p>
            </div>
          </Sheet>
        )}
        {removeAsk && !tour.run && (
          <RosterRemoveAsk name={charName(removeAsk.id)} n={removeAsk.n} onYes={doRemove} onClose={() => setRemoveAsk(null)} />
        )}
        {fusionAsk && (
          <FusionAsk base={charName(idx.CHAR[fusionAsk.to]?.fusionOf ?? fusionAsk.to)} toFusion={!!idx.CHAR[fusionAsk.to]?.fusionOf} n={fusionAsk.n}
            onYes={doSwitch} onClose={() => setFusionAsk(null)} />
        )}
        {equipOpen && !tour.run && <EquipSheet ctx={ctx} view={view} item={input} onEquip={doEquip} onClose={() => setEquipOpen(false)} />}
        {formToast && (
          <div className="toast" role="status" style={toastAt}><span>{t.ui.undoText}</span><button type="button" onClick={onUndo}>{t.ui.undoAction}</button></div>
        )}
        {menuOpen && (
          <Menu s={s} dispatch={dispatch} rosterSize={roster.size} news={news.length > 0} onClose={() => setMenuOpen(false)} onChars={() => onTab('chars')}
            gearN={[...geared.keys()].filter((id) => idx.CHAR[id]?.builds.length).length}
            // список ровно тех, кого считает N: прочие фильтры списка (сохранённые «только мои», стихия, класс) — сбросить
            onGear={() => {
              dispatch({ type: 'charFilter', patch: { cGear: true, cq: '', cel: '', ccl: '', cOwned: false } });
              dispatch({ type: 'selectChar', id: null });
              onTab('chars');
            }}
            onCode={() => setCodeOpen(true)} onHelp={() => setHelpOpen(true)} onTour={openTours}
            footer={<Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} onAppUpdate={appUpdate} />} />
        )}
        {codeOpen && (
          <Sheet title={t.ui.codeSheet} onClose={() => setCodeOpen(false)}>
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); setCodeOpen(false); }} />
          </Sheet>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => { setHelpOpen(false); setHelpNews([]); }}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={openTours} tips={<TipsHelp tour={tour} news={helpNews} />} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={view} offNote={offNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={!canEquip || target ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
