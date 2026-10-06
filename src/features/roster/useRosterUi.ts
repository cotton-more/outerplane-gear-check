// Ростер на странице: звезда и пакетные правки (с окнами «Убрать X из ростера?» и перехода Core Fusion), импорт кода
// экипировки и «Вернуть» сообщений экипировки. Правила — features/gear/model/fusion и gear/store; здесь — когда
// спросить, что записать и что сказать.
import { useEffect, useState } from 'react';
import type { Index } from '@/game/data';
import { heroName } from '@/game/hero/HeroName';
import { comboText } from '@/game/build/builds';
import { pinCombo } from '@/game/build/profile';
import type { Texts } from '@/i18n';
import { dropChar, gearedChars, setPin, undoDrop, undoPin, type GearStore } from '@/features/gear/model/gear';
import { gateOf, normalizeStored, switchFusion, type FusionFix } from '@/features/gear/model/fusion';
import { loadGear, unfuseChar } from '@/features/gear/store/gearStore';
import { readStored, takeLoadNote } from '@/features/gear/store/stored';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { storage } from '@/shared/storage';
import type { Tab } from '@/shared/tab';
import type { RosterApi } from './useRoster';
import { readPasted } from './backup';

// переход Core Fusion перед действием (звезда, «Надеть», «Оценить вещь для»): хранилище после него, его строка и «Вернуть»
export interface Switched { st: GearStore; note: string; undo: (st: GearStore) => GearStore; after?: () => void }

export function useRosterUi({ idx, t, rosterApi, gear, touring, off, tab, msg, say, onAsk }: {
  idx: Index; t: Texts; rosterApi: RosterApi; gear: GearApi;
  touring: boolean;              // идёт обучение: на странице экипировка тура, записи игрока не трогаем
  off: ReadonlyMap<string, string>; // X → его Core Fusion, который его заменил (features/gear/model/fusion replacedX)
  tab: Tab;                      // вкладка сейчас — там и сообщение
  msg: GearMsg | null; say: (m: GearMsg | null) => void;
  onAsk: () => void;             // перед окном перехода: закрыть шторки вердикта и «Кому надеть?»
}) {
  const charName = (id: string) => heroName(idx, id);
  // Core Fusion (features/gear/model/fusion). Нормализация (загрузка, импорт, пакетные добавления) — одно сообщение со списком
  const fixesNote = (fixes: FusionFix[]) => fixes.map((f) => t.ui.fusionFixed(charName(f.base), f.kind)).join(' ');
  // после загрузки: нормализация что-то поменяла (features/gear/store/stored — уже записано, Р17) — сказать один раз: кого добавили
  // в ростер (у них есть вещи, Р16), что стало с X при Core Fusion X и чьё закрепление снято
  useEffect(() => {
    const n = takeLoadNote(idx);
    if (!n) return;
    const names = n.added.map(charName).join(', ');
    // закрепления, чей набор пропал из outerpedia (stored fixPins)
    const pins = n.pins.map(([id, key]) => t.card.pinGone(charName(id), comboText(idx, pinCombo(key)))).join(' ');
    const [text, ...rest] = [names ? t.ui.gearRosterAdded(names) : '', fixesNote(n.fixes), pins].filter(Boolean);
    say({ text, note: rest.join(' '), tab });
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
  // intro — код ростера в поле копии: сообщение есть всегда, с «Вернуть» прежнего ростера (SPEC 2.4)
  const rosterBatch = (ids: string[], intro?: string) => {
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
    if (!r.fixes.length && intro === undefined) {
      if (keptNote) say({ text: keptNote, note: '', tab });
      return;
    }
    // вещи на ходу только переходят (у CF пусто — иначе X уже был бы неактивен); убраны — «Вернуть» всё хранилище
    const undo = r.st === st ? undefined : r.fixes.some((f) => f.kind === 'removed') ? () => st
      : (x: GearStore) => r.fixes.reduceRight((y, f) => (f.kind === 'moved' ? unfuseChar(y, f.base, f.fusion, { moved: f.ids, had: [] }) : y), x);
    if (intro !== undefined) {
      say({ text: intro, note: [fixesNote(r.fixes), keptNote].filter(Boolean).join(' '), tab, undo, after: () => rosterApi.replace(prev) });
      return;
    }
    say({ text: fixesNote(r.fixes), note: keptNote, tab, undo, after: rosterBack(prev, r.roster) });
  };
  // окна перехода (в): звезда, «Надеть», «Оценить вещь для» CF, когда есть X (или на X, когда есть CF). then — действие после «Да»
  // на хранилище после перехода; нет конфликта — false, действие идёт сразу. В обучении окон нет — как пакетное
  const [fusionAsk, setFusionAsk] = useState<{ to: string; from: string; n: number; then?: (sw: Switched) => void } | null>(null);
  const fusionGate = (id: string, then?: (sw: Switched) => void) => {
    const from = gateOf(idx, rosterApi.roster, gear.store.pools, id);
    if (touring || !from) return false;
    onAsk();
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
    else say({ text: note, note: '', tab, undo: done.undo, after: done.after });
  };
  // сообщение о переходе перед действием на вкладке tab, с его «Вернуть»
  const switchToast = (sw: Switched, at: Tab) => say({ text: sw.note, note: '', tab: at, undo: sw.undo, after: sw.after });
  // «Вернуть» сообщения экипировки. Р16: вещи — только у героев ростера; «Вернуть» вернул вещи тому, кого за эти секунды
  // успели убрать из ростера (без вещей — звезда без окна), — он снова в ростере
  const undoMsg = () => {
    const u = msg;
    say(null);
    if (!u) return;
    const st = u.undo ? u.undo(gear.store) : gear.store;
    if (u.undo) gear.set(st);
    u.after?.();
    if (touring) return;
    const cur = rosterApi.list();
    const missing = [...gearedChars(st).keys()].filter((id) => idx.CHAR[id] && !cur.includes(id));
    if (missing.length) rosterApi.add(missing);
  };
  // в ростер тем, кого одели или примерили (конфликта Core Fusion уже нет — fusionGate); «Вернуть» — убрать
  const joinRoster = (id: string) => {
    const added = touring ? [] : rosterApi.add([id]);
    return added.length ? () => rosterApi.remove(added) : undefined;
  };
  // звезда с героя, у которого есть вещи (Р16), — окно «Убрать X из ростера?»; «Да» — герой из ростера, его вещи — из
  // его пула (общие записи остаются у других), «Вернуть» — вещи, отметки и место в ростере. В обучении окна нет и вещи
  // не убираются: звезда такого героя не снимается (на странице — экипировка тура, записи игрока не трогаем)
  const [removeAsk, setRemoveAsk] = useState<{ id: string; n: number } | null>(null);
  // «Вернуть» звезды: герой — снова в ростере на прежнем месте (за тем, за кем стоял), если его туда ещё не вернули
  const putBack = (prev: readonly string[], id: string) => () => {
    const cur = rosterApi.list();
    if (cur.includes(id)) return;
    const after = prev.slice(prev.indexOf(id) + 1).find((x) => cur.includes(x));
    const at = after ? cur.indexOf(after) : cur.length;
    rosterApi.replace([...cur.slice(0, at), id, ...cur.slice(at)]);
  };
  const unstar = (id: string) => {
    const n = realStore().pools[id]?.length ?? 0;
    if (n) { if (!touring) setRemoveAsk({ id, n }); return; }
    const key = touring ? undefined : gear.store.pin?.[id];
    if (!key) { rosterApi.toggle(id); return; }
    // В4 ревью этапа 10: у героя без вещей было закрепление — снимается вместе со звездой (иначе невидимое, но действует);
    // «Вернуть» — и звезду на прежнее место, и закрепление
    const prev = rosterApi.list();
    const r = setPin(gear.store, id, null);
    gear.set(r.st);
    rosterApi.remove([id]);
    say({ text: t.card.unpinned(charName(id), comboText(idx, pinCombo(key))), note: '', tab: 'chars', undo: (x) => undoPin(x, id, r), after: putBack(prev, id) });
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
    // тост — только о герое: у кого ещё остались те же записи, не говорим (они здесь просто не используются)
    say({
      text: t.ui.rosterRemoved(charName(a.id)), note: '', tab: 'chars',
      undo: (x) => (x === r.st || (wrote !== null && storage.raw('gear') === wrote) ? st : undoDrop(x, r.dropped)), after: putBack(prev, a.id),
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
      const next = [...cur, ...ids.filter((id) => !cur.includes(id) && !(off.has(id) && !idx.CHAR[id]?.fusionOf))];
      rosterBatch(next);
      return next.filter((id) => !cur.includes(id));
    },
    replace: (ids) => rosterBatch(ids),
  };
  // импорт кода экипировки (из «Ещё», с любой вкладки — сообщение на той, где игрок сейчас) заменил все записи: все, у кого есть вещи, — в ростер, затем Core Fusion (features/gear/model/fusion
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
    say({ text: names ? `${text} ${t.ui.gearRosterAdded(names)}` : text, note: fixesNote(r.fixes), tab, undo: () => prev, after: rosterBack(before, next) });
    return true;
  };
  // поле «Резервная копия» (SPEC 2.4): что вышло — строкой под полем ('' — ушло сообщением с «Вернуть»). Новый код
  // заменяет ростер и вещи целиком, затем правила запуска (все с вещами — в ростере, Core Fusion); «Вернуть» — прежние
  // хранилище и ростер в точности
  const onBackup = (text: string): string => {
    const p = readPasted(idx, text);
    switch (p.kind) {
      case 'backup': {
        const before = rosterApi.list(), prev = gear.store;
        const r = loadGear(p.backup.raw, idx, p.backup.roster);
        gear.set(r.st);
        rosterApi.replace(r.roster);
        say({
          text: t.ui.backupApplied(Object.keys(r.st.pieces).length, r.roster.length), note: fixesNote(r.fixes), tab,
          undo: () => prev, after: () => rosterApi.replace(before),
        });
        return '';
      }
      case 'gear': return onGearImport(gear.store, p.raw) ? '' : t.ui.backupBad;
      case 'roster': {
        const missed = p.missed.length ? p.missed.slice(0, 5).join(', ') + (p.missed.length > 5 ? '…' : '') : '';
        rosterBatch(p.found, t.ui.rosterApplied(true, p.found.length, missed));
        return '';
      }
      case 'newer': return t.ui.gearNewerCode;
      case 'broken': return t.ui.backupBroken;
      case 'hero': return t.ui.backupHero;
      case 'noHeroes': return t.ui.backupNoHeroes;
      default: return t.ui.backupBad;
    }
  };
  return {
    rosterUi, joinRoster, fusionGate, switchToast, undoMsg, onGearImport, onBackup,
    fusionAsk, doSwitch, closeFusionAsk: () => setFusionAsk(null),
    removeAsk, doRemove, closeRemoveAsk: () => setRemoveAsk(null),
  };
}
