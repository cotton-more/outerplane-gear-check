import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { evaluate } from './logic/evaluate';
import { dropChar, gearedChars, undoDrop, type GearStore, type Piece } from './logic/gear';
import { loadGear, unfuseChar } from './logic/gearStore';
import { gateOf, normalizeStored, replacedX, storeFor, switchFusion, type FusionFix } from './logic/fusion';
import { holds, isStats, poolView, putOn, undoPut, type PoolView, type PutResult } from './logic/pool';
import { charsVs, charVs, gearBadges, nextToWear, sectionChars, whereUsed, type CharVs } from './logic/poolVs';
import { charMatches } from './logic/lists';
import { dropSubs } from './logic/subs';
import type { Build, Char, GearKind, SlotId } from './data/types';
import { buildOfKey } from './logic/variants';
import type { ItemInput } from './logic/verdict';
import { heroNote, heroOutcome, heroTarget, heroTitle, noReplace, tryOnPreset, type TryOn } from './logic/tryon';
import { betterThanWorn, materialFor, wearLead, withMaterial } from './logic/material';
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
  // тур «Экипировка» — на примере (src/tour/gear.ts): своя экипировка и свой режим героя в памяти, записи игрока не трогаются.
  // Другие туры — на пустой экипировке: запись ничего не делает (она легла бы из пустого стора поверх вещей игрока)
  const [demo, setDemo] = useState<{ store: GearStore; tryOn: TryOn | null } | null>(null);
  const gear: GearApi = useMemo(() => (demo
    ? { store: demo.store, set: (st: GearStore) => setDemo((d) => d && { ...d, store: st }), newer: false }
    : touring ? { ...realGear, set: () => {} } : realGear), [demo, realGear, touring]);
  // Core Fusion (logic/fusion): есть CF — X неактивен (X → CF): не кандидат вердикта, не в «Кому надеть?» и не герой режима «для героя»
  const off = useMemo(() => replacedX(idx, roster, gear.store.pools), [idx, roster, gear.store.pools]);
  const ctx = useMemo(() => makeCtx(idx, s.settings, roster, t, off), [idx, s.settings, roster, t, off]);
  // вердикт зависит только от предмета и настроек — не пересчитываем его на каждый ввод в поиске
  const input = itemInput(s);
  const key = JSON.stringify(input);
  const raw = useMemo(() => evaluate(ctx, input), [ctx, key]); // eslint-disable-line react-hooks/exhaustive-deps
  // экипировка по пулу (logic/pool): вид — один раз на хранилище. Режим «для героя» (logic/tryon): строка карточки,
  // «Сейчас на персонажах» и «Надеть» — только про героя, по всем его билдам; штамп общий. Цель не собирается
  // принудительно — вид тот же. На время обучения режима нет (кроме примера тура «Экипировка»)
  const view = useMemo(() => poolView(ctx, gear.store), [ctx, gear.store]);
  const realTry = useTryOn(idx, !touring);
  const tryOn = demo ? { value: demo.tryOn, set: (v: TryOn | null) => setDemo((d) => d && { ...d, tryOn: v }) } : realTry;
  // X при Core Fusion X — не герой режима (logic/fusion). Вариант предустановки здесь не нужен — он только для формы
  const hero = useMemo(() => {
    const h = demo ? heroTarget(idx, demo.tryOn) : touring ? null : heroTarget(idx, realTry.value);
    return h && off.has(h.c.id) ? null : h;
  }, [idx, demo, realTry.value, touring, off]);
  // «Примерить замену»: запись, которую «Надеть» заменит в любом случае (logic/pool planPut); её уже нет в пуле или она
  // другого слота — как без неё
  const replace = hero ? tryOn.value?.replace ?? null : null;
  // replace — на одну введённую вещь (вопрос 1 (б) ревью eval-only): снимают «Следующий», load другой вещи (код,
  // «Вернуть» формы), смена слота на форме (ниже) и «Надеть»; режим героя остаётся. tryOn.set пишет и ogc.tryon — иначе
  // после перезапуска замена вернулась бы. Режима героя нет (обучение, X при Core Fusion) — не трогаем
  const dropReplace = () => { if (replace && tryOn.value) tryOn.set(noReplace(tryOn.value)); };
  // слот на форме сменили (цифры, сетка слотов, load) — это уже не та вещь: снимаем, и на прежнем слоте замены нет.
  // Грейд, сет, сабстаты — ввод той же вещи, не снимают
  const repSlot = replace ? gear.store.pieces[replace]?.slot : undefined;
  useEffect(() => { if (repSlot && repSlot !== s.slot) dropReplace(); }, [repSlot, s.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  // режим героя сейчас — для «Вернуть» после «Заменить» (его колбэк создан раньше)
  const tryNow = useRef(tryOn.value);
  useEffect(() => { tryNow.current = tryOn.value; });
  // П9: «Надеть» на героя, у которого будет окно перехода Core Fusion (Core Fusion X при X с вещами), делает putOn после
  // «Да» — на хранилище, где вещи X уже у него (logic/fusion storeFor): его строка и кнопка — по этому виду пула. Окна не
  // будет или вещи не переходят — общий вид. В обучении окон нет (fusionGate)
  const viewOf = useMemo(() => {
    const memo = new Map<string, PoolView>();
    return (id: string): PoolView => {
      if (touring) return view;
      let v = memo.get(id);
      if (!v) {
        const st = storeFor(idx, roster, gear.store, id);
        v = st === gear.store ? view : poolView(ctx, st);
        memo.set(id, v);
      }
      return v;
    };
  }, [idx, ctx, roster, gear.store, view, touring]);
  // вид пула героя (режим героя на Core Fusion X, а X появился после его начала, — тоже через окно)
  const tview = hero ? viewOf(hero.c.id) : view;
  // у кого есть вещи: персонаж → лучший «N/6» (плитки, меню, фильтр «с экипировкой»)
  const geared = useMemo(() => gearBadges(view), [view]);
  // строка героя: явный выбор — все его билды и «По статам» (Р11), без only (заметка шага 2: исход по одному варианту
  // прятал «Надеть»); с replace — кнопка «Заменить» есть всегда; wear — «Надеть на X» есть всегда («Надето»: ввод
  // надетого в игре, и у вещи без пользы)
  const heroVs = useMemo(() => (hero ? charVs(ctx, tview, hero.c.id, input, undefined, { explicit: true, replace, wear: true }) : null), [ctx, tview, hero, key, replace]); // eslint-disable-line react-hooks/exhaustive-deps
  // материал: вещь лучше той, для которой она материал, или в режиме героя она встаёт в его билд — «надень»
  const mat = useMemo(() => {
    const needs = materialFor(view, input);
    const up = needs.length ? betterThanWorn(ctx, view, input, needs) : [];
    const o = heroVs?.best?.used ? heroVs.best : null;
    const aim = hero && o && (o.kind === 'fill' || o.kind === 'up' || o.kind === 'closer' || o.kind === 'completes')
      ? `${hero.c.name} · ${isStats(o.v) ? t.ui.byStats : o.v.parent.name}` : null;
    return { needs, wear: { up, target: aim, t4: input.bt === 4 } };
  }, [ctx, view, heroVs, hero, key, t]); // eslint-disable-line react-hooks/exhaustive-deps
  // штамп по вещам персонажей (logic/worn): такая же у кого-то — «Оставить»; всем, кому подходит, она ничего не даёт —
  // «Разобрать». Вещь — материал и лучше такой же у кого-то — не понижаем (совет «надень»)
  const worn = useMemo(() => withWorn(ctx, view, input, raw, { hold: mat.wear.up.length > 0 }), [ctx, view, raw, mat]); // eslint-disable-line react-hooks/exhaustive-deps
  const verdict = useMemo(() => withMaterial(idx, t, worn, mat.needs, mat.wear), [idx, t, worn, mat]);
  // «Сейчас на персонажах»: кандидаты вердикта, у кого есть вещи, и свои без вещей — им вещь начнёт билд (понизили —
  // прежнего вердикта: они и объясняют, почему «Разобрать»); в режиме героя — одна строка героя
  const vsList = useMemo((): CharVs[] => {
    if (verdict.v === 'idle') return [];
    if (hero) return heroVs ? [heroVs] : [];
    const chars = sectionChars(worn.worn === 'lower' ? raw : verdict).filter((c) => gear.store.pools[c.id]?.length || roster.has(c.id));
    // «Оставляй — лучше надетой такой же» (logic/material): её владельцы — тоже, даже не кандидаты вердикта (сырой —
    // «Разобрать», секций нет): совет «надень её» — с кнопкой
    const wearers = mat.wear.up.map((n) => idx.CHAR[n.key.slice(0, n.key.indexOf('/'))]).filter((c) => c && !chars.includes(c));
    // герой из заголовка «Оставляй — лучше надетой … X» — первой карточкой, его строка остаётся даже тихой «По статам»:
    // кнопка под ней — про него; прочие — как были
    const lead = wearLead(worn, mat.wear);
    const list = charsVs(ctx, viewOf, input, [...new Set(wearers), ...chars], {}, lead);
    const i = lead ? list.findIndex((x) => x.c.id === lead) : -1;
    return i > 0 ? [list[i], ...list.filter((_, j) => j !== i)] : list;
  }, [ctx, viewOf, raw, worn, verdict, hero, heroVs, gear.store, roster, mat, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  // режим героя: строка про героя (logic/tryon heroNote) — не носит, не нужна («Attack нет в билдах Caren»), «По статам»
  // с «Надеть», ничего не даст (и тогда, когда есть только кнопка «Заменить» из «Примерить замену»)
  const offNote = !hero || verdict.v === 'idle' ? null : heroNote(t, ctx, hero.c, input, heroVs);
  // штамп общий, а заголовок после « — » в режиме героя — и про других, и про него
  const shown = useMemo(() => (hero
    ? { ...verdict, title: heroTitle(t, idx, verdict, hero.c, heroOutcome(ctx, tview, input, heroVs), isArmor(s.slot)) }
    : verdict), [t, idx, ctx, tview, verdict, hero, heroVs]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const held = prev.filter((id) => !ids.includes(id) && real.pools[id]?.length);
    const next = [...ids, ...held];
    if (touring) {
      const r = normalizeStored(idx, next, real);
      if (r.st === real) rosterApi.replace(r.roster);
      return;
    }
    const r = normalizeStored(idx, next, st);
    rosterApi.replace(r.roster);
    if (r.st !== st) gear.set(r.st);
    // «Очистить», «Заменить» кодом: кого оставили из-за вещей — строкой (к сообщению Core Fusion, если оно есть)
    const kept = held.filter((id) => r.roster.includes(id)).map(charName).join(', ');
    const keptNote = kept ? t.ui.rosterKeptGear(kept) : '';
    if (!r.fixes.length) {
      if (keptNote) setGearUndo({ text: keptNote, note: '', tab: 'chars' });
      return;
    }
    // вещи на ходу только переходят (у CF пусто — иначе X уже был бы неактивен); убраны — «Вернуть» всё хранилище
    const undo = r.st === st ? undefined : r.fixes.some((f) => f.kind === 'removed') ? () => st
      : (x: GearStore) => r.fixes.reduceRight((y, f) => (f.kind === 'moved' ? unfuseChar(y, f.base, f.fusion, { moved: f.ids, had: [] }) : y), x);
    setGearUndo({ text: fixesNote(r.fixes), note: keptNote, tab: 'chars', undo, after: rosterBack(prev, r.roster) });
  };
  // окна перехода (в): звезда, «Надеть», «Оценить вещь для» CF, когда есть X (или на X, когда есть CF). then — действие после «Да»
  // на хранилище после перехода; нет конфликта — false, действие идёт сразу. В обучении окон нет — как пакетное
  type Switched = { st: GearStore; note: string; undo: (st: GearStore) => GearStore; after?: () => void };
  const [fusionAsk, setFusionAsk] = useState<{ to: string; from: string; n: number; then?: (sw: Switched) => void } | null>(null);
  const fusionGate = (id: string, then?: (sw: Switched) => void) => {
    const from = gateOf(idx, roster, gear.store.pools, id);
    if (touring || !from) return false;
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
    // тост — только о герое: у кого ещё остались те же записи, не говорим (они здесь просто не используются)
    setGearUndo({
      text: t.ui.rosterRemoved(charName(a.id)), note: '', tab: 'chars',
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
    dropReplace();
    setUndo(Object.keys(cur.subs).length || cur.itemKey || cur.unlisted ? cur : null); // main и сет «Следующий» не трогает
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onUndo = () => { if (undo) { dispatch({ type: 'load', item: undo }); dropReplace(); } setUndo(null); };
  // надеть вещь с формы на персонажа (logic/pool putOn); персонаж попадает в ростер; сообщение — куда она встала и что
  // стало с вытесненной, с «Вернуть». Всегда новая запись — и при такой же у него или у другого: в Оценку вводят новую
  // вещь из инвентаря, пулы независимы (В9; окна «Это шлем Rin?» нет)
  const buildName = (key: string) => buildOfKey(key, t.ui.byStatsQ); // во фразе: «Идёт в …», «(в …)»
  // где запись стоит у персонажа: имена билдов (родителей вариантов) его собираемых сборок
  const usedFor = (st: GearStore, charId: string, id: string) =>
    [...new Set(whereUsed(poolView(ctx, st), charId, id).map((v) => buildName(v.key)))];
  // «Надеть на CF», когда есть X, — сначала окно перехода (в). Строка и кнопка CF посчитаны по этому же хранилищу
  // (viewOf, П9)
  const doEquip = (c: Char) => {
    setEquipOpen(false);
    if (!fusionGate(c.id, (sw) => equipOn(c, sw))) equipOn(c, null);
  };
  const switchToast = (sw: Switched, tab: Tab) => setGearUndo({ text: sw.note, note: '', tab, undo: sw.undo, after: sw.after });
  // sw — переход Core Fusion перед этим «Надеть»: его строка — в сообщение, его «Вернуть» — вместе с этим. В режиме
  // героя из «Примерить замену» запись replace уходит в любом случае (logic/pool planPut)
  const equipOn = (c: Char, sw: Switched | null) => {
    const rep = hero?.c.id === c.id ? replace : null;
    const r = putOn(ctx, sw?.st ?? gear.store, c.id, input, { replace: rep });
    // после «Надеть» форма — как после «Следующий» (решение владельца, refute-10 п. 6): иначе та же вещь на форме
    // сравнивается со своей записью («на уровне», штамп ниже) и «Надеть» на другого клал бы её вторым героям. Шторку
    // вердикта закрыть, как «Следующий»; режим героя остаётся. «Вернуть» — и пул, и вещь на форму (с «T4»)
    // в обучении — ни ростера, ни сообщения: его «Вернуть» после тура отменило бы что-то в записях игрока
    const joined = joinRoster(c.id);
    const st = r.st;
    gear.set(st);
    const was = input;
    setVerdictOpen(false);
    // ввод надетого (режим героя, слот формы не был надет): форма — на следующем ненадетом слоте героя («Дальше: …»)
    const go = hero?.c.id === c.id ? wearNext : null;
    dispatch(go ? { type: 'reset', slot: go } : { type: 'reset' });
    dropReplace(); // записи уже нет, форма пуста — замена сделана
    setUndo(null);
    if (layout.narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
    if (touring) return;
    const used = usedFor(st, c.id, r.id);
    // «· T4» — нажата «T4» на форме (В4): с каким Breakthrough вещь легла в пул
    const t4 = input.bt === 4 ? t.ui.withT4 : '';
    // В1: «Заменено» — только про вещи её слота; вытесненные из всех билдов в других слотах — строкой prunedNote (без
    // перечня, вопрос 6).
    // Убраны 2+ вещи её слота — назвать каждую: «Заменено: ботинки Caren — убраны прежние: Speed и Immunity.»
    // Р4: была надетая её слота (её держат билды — осталась в пуле) — тоже «Заменено», как на кнопке (poolVs replaces)
    const mine = r.removed.filter((p) => p.slot === r.piece.slot), pruned = r.removed.filter((p) => p.slot !== r.piece.slot);
    const wasOn = !!r.wasWorn && r.was.includes(r.wasWorn);
    const text = mine.length > 1 ? t.ui.replacedMany(c.name, r.piece.slot, [...new Set(mine.map(pieceLabel))], t4)
      : mine.length || wasOn ? t.ui.replaced(c.name, r.piece.slot, t4) : [t.ui.equipped(c.name, r.piece.slot, t4), used.length ? t.ui.countsIn(used.join(', ')) : ''].filter(Boolean).join(' ');
    const notes: string[] = [];
    // «Начал собирать …» — билды, которые эта вещь начала (Р19: по вещам, не по отметке)
    if (r.began.length) notes.push(t.ui.startedFilling([...new Set(r.began.map(buildName))].join(', ')));
    notes.push(...removedNotes(r, mine, rep));
    // вопрос 6: убранные в других слотах не перечисляем — одна строка «Лишнее убрано…»
    if (pruned.length) notes.push(t.ui.prunedNote);
    if (sw) notes.push(sw.note);
    setGearUndo({
      text, note: notes.join(' '), tab: 'eval',
      undo: (x) => (sw ? sw.undo(undoPut(x, c.id, r)) : undoPut(x, c.id, r)),
      after: both(both(joined, sw?.after), () => { dispatch({ type: 'load', item: was }); backReplace(c.id, rep); }),
    });
  };
  // что стало с убранными вещами её слота (mine; другие слоты — строкой prunedNote): та же линия — материал новой.
  // Кому отдать снятую — не предлагаем никогда (Р15): игрок снимет её в игре и оценит сам. Запись из «Примерить
  // замену» (rep) — та же вещь в игре, введённая заново (Reforge, Transistone): не материал. Новая на T4 — материал ей не
  // нужен (как в вердикте, logic/material titleWearT4). Убраны 2+ — в строках имя сета или предмета вместо «Старые»
  // (заголовок replacedMany их уже перечислил)
  const removedNotes = (r: PutResult, mine: readonly Piece[], rep: string | null) => {
    if (r.piece.bt === 4) return [];
    const many = mine.length > 1;
    return mine.filter((old) => old.id !== rep && (isArmor(old.slot) ? old.setId === r.piece.setId && old.grade === r.piece.grade : !!old.itemKey && old.itemKey === r.piece.itemKey))
      .map((old) => t.ui.oldMaterial(old.slot, many ? pieceLabel(old) : undefined));
  };
  // «Вернуть» после «Заменить» из «Примерить замену» откатывает и снятие replace: запись снова в пуле, та же вещь на
  // форме — та же кнопка «Заменить». Режим за эти секунды сменили (другой герой, своя замена, ✕) — не трогаем
  const backReplace = (charId: string, rep: string | null) => {
    const cur = tryNow.current;
    if (rep && cur?.charId === charId && !cur.replace) tryOn.set({ ...cur, replace: rep });
  };
  // «Убрать у Caren» в карточке персонажа: сообщение с «Вернуть» — на «Персонажах»
  const onGearToast = (text: string, note: string, undo: (st: GearStore) => GearStore) => setGearUndo({ text, note, tab: 'chars', undo });
  // правка в карточке вещи снимает висящее «Вернуть» любого прежнего действия (В3: одно на все): откаты возвращают
  // запись по id, а её за эти секунды поправили или скопировали (gear updateIn, REFUTE-5). Общую запись скопировали
  // (новый id у этого героя), а это запись replace его режима — replace идёт за копией (иначе «Заменить» пропадёт)
  const onPieceEdit = (charId: string, was: string, now: string) => {
    setGearUndo(null);
    const v = tryOn.value;
    if (now !== was && v?.charId === charId && v.replace === was) tryOn.set({ ...v, replace: now });
  };
  // режим «для героя» из карточки персонажа (В10): «Оценить вещь для Caren» — только режим; «Собрать билд»,
  // «Примерить» (пустой слот), «Слабее всех» — ещё слот и сет на форму (build/combo — предустановка); «Примерить
  // замену» (replacing) — ещё запись from: «Надеть» заменит её в любом случае. Персонаж — в ростер (как у «Надеть»),
  // грейд прежний. Вещь, которую вводили, уходит в «Вернуть»; та же вещь на форме (слот и сет те же) остаётся.
  // Режим героя на CF, когда есть X (или на X, когда есть CF), — сначала окно перехода (в). slotOnly — «Ввести» на вкладке
  // «Надето»: билд и связка героя — в режим, а на форме только слот (сет, предмет, main и сабстаты пустые, грейд прежний)
  const startTryOn = (c: Char, b?: Build, slot?: SlotId, from?: Piece, combo?: string | null, replacing = false, slotOnly = false) => {
    const go = (st: GearStore) => tryOnGo(c, st, b, slot, from, combo, replacing, slotOnly);
    if (!fusionGate(c.id, (sw) => { go(sw.st); switchToast(sw, 'eval'); })) go(gear.store);
  };
  const tryOnGo = (c: Char, st: GearStore, b?: Build, slot?: SlotId, from?: Piece, combo?: string | null, replacing = false, slotOnly = false) => {
    const next: TryOn = {
      charId: c.id, ...(b ? { build: b.name } : {}), ...(b && combo ? { combo } : {}), ...(replacing && from ? { replace: from.id } : {}),
    };
    tryOn.set(next);
    joinRoster(c.id);
    setVerdictOpen(false);
    const sv = st === gear.store ? view : poolView(ctx, st);
    const h = slot ? heroTarget(idx, next, sv) : null;
    const p = slot && h ? (slotOnly ? { slot, setId: null } : tryOnPreset(sv, h, slot, from)) : null;
    if (p && (slotOnly || s.slot !== p.slot || (isArmor(p.slot) && s.setId !== p.setId))) {
      const cur = itemInput(s);
      // на форме уже пустая заготовка (второй «Примерить» подряд) — прежнее «Вернуть» остаётся
      setUndo((u) => (touring ? null : hasItem(cur) ? cur : u));
      dispatch({ type: 'load', item: { slot: p.slot, grade: s.grade, setId: p.setId, itemKey: null, main: !slotOnly && s.slot === p.slot ? s.main : null, unlisted: false, subs: {} } });
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
    pieceOpen, tryOn: !!hero, gearSeq: gear.store.seq,
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
  // шаги тура «Экипировка». Карточка вещи — снова Caren, если её карточку закрыли. «Оценка для Caren» — на форму вещь
  // примера (вводить ничего не нужно) и режим героя примера, если шаги 1–2 прошли «Дальше»: иначе шаги 3–5 говорили бы о том,
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
  // карточке держит и вещь в нём встаёт, или она начнёт билд: poolVs useful; в режиме героя из «Примерить замену» —
  // «Заменить» всегда); вторая — «или — Rin · Speed ▸», если такой исход есть и у другого (в режиме героя других нет)
  const cardVs = vsList[0];
  const cardEquip = canEquip && !!cardVs?.useful;
  // «Дальше: {слот}» — ввод надетого: режим героя, «Надеть» есть, слот формы у героя не надет и есть ещё ненадетые
  const wearNext = hero && canEquip && heroVs?.useful ? nextToWear(tview, hero.c.id, s.slot) : null;
  const nextNote = wearNext ? t.ui.nextWear(t.ui.slotNames[wearNext]) : null;
  const cardOther = cardEquip && !hero ? vsList.slice(1).find((x) => x.useful && x.best && holds(x.best)) ?? null : null;
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
              hero={hero} heroNote={offNote} onTryOnEnd={() => tryOn.set(null)} vs={vsList[0] ?? null} onEquip={cardEquip ? (v) => doEquip(v.c) : undefined}
              other={cardOther} onEquipOther={cardOther ? (v) => doEquip(v.c) : undefined}
              onReset={onReset} nextNote={nextNote} onHelp={() => setHelpOpen(true)} onCode={() => setCodeOpen(true)} onTour={openTours} news={news.length > 0} onOpenVerdict={() => setVerdictOpen(true)} />
            {!layout.narrow && <Verdict r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={tview} offNote={offNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={!canEquip || hero ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} />}
          </section>
          <section id="view-chars" className="view chars" role="tabpanel" aria-labelledby="tab-chars" hidden={s.tab !== 'chars'}>
            <CharList s={s} dispatch={dispatch} rosterApi={rosterUi} gear={gear} geared={geared} off={off} onGearImport={onGearImport} touring={!!tour.run} />
            <CharDetail key={(s.charId ?? '') + (demo ? ':demo' : '')} charId={s.charId} ctx={ctx} view={view} rosterApi={rosterUi} gear={gear} active={s.tab === 'chars'} onOpenChar={openChar}
              onGearToast={onGearToast} onPieceEdit={onPieceEdit}
              sheetOpen={!!s.charId && layout.sheet && s.tab === 'chars'} onClose={() => dispatch({ type: 'selectChar', id: null })} onTryOn={canEquip ? startTryOn : undefined}
              onRateFor={canEquip ? (c) => startTryOn(c) : undefined}
              onPieceOpen={setPieceOpen} />
          </section>
        </main>
        <Footer install={install} lang={lang} onLang={changeLang} gameIcons={gameIcons} onIcons={changeIcons} onAppUpdate={appUpdate} />
        <VBar r={shown} news={news.length > 0} quiet={!!tour.run} show={layout.narrow} compact={layout.tiny} stampless={cardShown} hint={hint} nextNote={nextNote} tab={s.tab} rosterSize={roster.size}
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
        {removeAsk && !tour.run && (
          <RosterRemoveAsk name={charName(removeAsk.id)} n={removeAsk.n} onYes={doRemove} onClose={() => setRemoveAsk(null)} />
        )}
        {fusionAsk && (
          <FusionAsk base={charName(idx.CHAR[fusionAsk.to]?.fusionOf ?? fusionAsk.to)} toFusion={!!idx.CHAR[fusionAsk.to]?.fusionOf} n={fusionAsk.n}
            onYes={doSwitch} onClose={() => setFusionAsk(null)} />
        )}
        {equipOpen && !tour.run && <EquipSheet ctx={ctx} viewOf={viewOf} item={input} onEquip={doEquip} onClose={() => setEquipOpen(false)} />}
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
            <CodeInput fits={(item) => fitsData(s, item, ctx.idx)} onLoad={(item) => { dispatch({ type: 'load', item }); dropReplace(); setCodeOpen(false); }} />
          </Sheet>
        )}
        {helpOpen && <Sheet title={t.ui.help} onClose={() => { setHelpOpen(false); setHelpNews([]); }}><LangSwitch lang={lang} onLang={changeLang} /><Help install={install} onTour={openTours} tips={<TipsHelp tour={tour} news={helpNews} />} /></Sheet>}
        {verdictOpen && layout.narrow && s.tab === 'eval' && (
          <VerdictSheet r={shown} s={s} dispatch={dispatch} onOpenChar={openChar} vs={vsList} view={tview} offNote={offNote} onEquip={!canEquip ? undefined : (v) => doEquip(v.c)} onEquipPick={!canEquip || hero ? undefined : () => { setVerdictOpen(false); setEquipOpen(true); }} onClose={() => setVerdictOpen(false)} />
        )}
      </div>
    </GameIconsContext.Provider>
    </LangContext.Provider>
  );
}
