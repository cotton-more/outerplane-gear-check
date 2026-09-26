// Состояние страницы и все переходы — чистый reducer, без React и DOM.
import { GRADES, SLOTS, isArmor, type Index } from '../data';
import type { GearKind, Grade, SlotId } from '../data/types';
import { epicMains, legendMains } from '../logic/builds';
import type { Settings, Stage } from '../logic/context';
import type { CharFilter } from '../logic/lists';
import { maxSubs, type Subs } from '../logic/subs';
import type { ItemInput } from '../logic/verdict';

export type Tab = 'eval' | 'chars';

export interface AppState extends CharFilter {
  tab: Tab;
  // предмет на панели оценки
  slot: SlotId;
  grade: Grade;
  setId: string | null;
  itemKey: string | null;
  main: string | null;
  unlisted: boolean;                // Legendary оружие/аксессуар, которого нет в списке: оценка по main stat
  subs: Subs;
  expand: Record<string, boolean>;  // раскрытые секции вердикта
  // настройки оценки
  settings: Settings;
  settingsOpen: boolean;
  // вкладка «Персонажи»
  charId: string | null;
}

export type Action =
  | { type: 'tab'; tab: Tab }
  | { type: 'slot'; slot: SlotId }
  | { type: 'grade'; grade: Grade }
  | { type: 'set'; setId: string | null }
  | { type: 'item'; itemKey: string | null }
  | { type: 'unlisted' }
  | { type: 'main'; main: string }
  | { type: 'sub'; key: string }
  | { type: 'replaceSub'; from: string; to: string }
  | { type: 'roll'; key: string; n: number }
  | { type: 'clearSubs' }
  | { type: 'reset' }
  | { type: 'load'; item: ItemInput }
  | { type: 'expand'; key: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'settingsOpen'; open: boolean }
  | { type: 'openChar'; id: string; reveal: 'keep' | 'filters' | 'filters+all' }
  | { type: 'selectChar'; id: string | null }
  | { type: 'charFilter'; patch: Partial<CharFilter> };

const EMPTY_ITEM = { setId: null, itemKey: null, main: null, unlisted: false, subs: {}, expand: {} };

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'slot':
      // сет один на всю броню: между шлемом, бронёй, перчатками и ботинками он остаётся (в игре инвентарь фильтруется по сету)
      return s.slot === a.slot ? s : { ...s, ...EMPTY_ITEM, setId: isArmor(a.slot) ? s.setId : null, slot: a.slot };
    case 'grade': {
      if (s.grade === a.grade) return { ...s, expand: {} };
      // у Epic сабстатов три: при смене грейда лишний (последний отмеченный) отбрасываем
      const keys = Object.keys(s.subs);
      const subs = keys.length > maxSubs(a.grade) ? Object.fromEntries(keys.slice(0, maxSubs(a.grade)).map((k) => [k, s.subs[k]])) : s.subs;
      const item = isArmor(s.slot) ? {} : { itemKey: null, main: null, unlisted: false };
      return { ...s, ...item, subs, grade: a.grade, expand: {} };
    }
    case 'set':
      return a.setId ? { ...s, setId: a.setId, expand: {} } : { ...s, setId: null };
    case 'item':
      return a.itemKey ? { ...s, itemKey: a.itemKey, main: null, unlisted: false, expand: {} } : { ...s, itemKey: null, main: null, unlisted: false };
    case 'unlisted':
      return { ...s, itemKey: null, main: null, unlisted: true, expand: {} };
    case 'main': {
      const main = s.main === a.main ? null : a.main;
      const subs = { ...s.subs };
      if (main) delete subs[main]; // main stat не бывает сабстатом того же предмета
      return { ...s, main, subs, expand: {} };
    }
    case 'sub': {
      // выбранный стат сразу получает 1 жёлтый сегмент; повторное нажатие снимает выбор
      const subs = { ...s.subs };
      if (a.key in subs) delete subs[a.key];
      else if (Object.keys(subs).length < maxSubs(s.grade)) subs[a.key] = 1;
      else return s;
      return { ...s, subs };
    }
    case 'replaceSub': {
      // другой стат в той же строке: позиция и жёлтые сегменты сохраняются — обычно ошибка только в названии стата
      if (!(a.from in s.subs) || a.to in s.subs || a.to === s.main) return s;
      return { ...s, subs: Object.fromEntries(Object.entries(s.subs).map(([k, v]) => [k === a.from ? a.to : k, v])) };
    }
    case 'roll':
      return a.key in s.subs ? { ...s, subs: { ...s.subs, [a.key]: a.n } } : s;
    case 'clearSubs':
      return { ...s, subs: {} };
    case 'reset':
      // следующий предмет: слот, грейд и сет брони остаются — подряд обычно идут дропы одного забега,
      // а если сет другой, выбрать его стоит столько же, сколько с пустого поля
      return { ...s, ...EMPTY_ITEM, setId: isArmor(s.slot) ? s.setId : null };
    case 'load':
      return { ...s, ...EMPTY_ITEM, ...a.item, tab: 'eval' };
    case 'expand':
      return { ...s, expand: { ...s.expand, [a.key]: true } };
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.patch } };
    case 'settingsOpen':
      return { ...s, settingsOpen: a.open };
    case 'openChar': {
      // персонаж из вердикта: если фильтры списка его прячут — сбрасываем их
      const next: AppState = { ...s, tab: 'chars', charId: a.id };
      if (a.reveal === 'keep') return next;
      return { ...next, cel: '', ccl: '', cq: '', cOwned: false, ...(a.reveal === 'filters+all' ? { cAll: true } : {}) };
    }
    case 'selectChar':
      return { ...s, charId: a.id };
    case 'charFilter':
      return { ...s, ...a.patch };
  }
}

export const itemInput = (s: AppState): ItemInput => ({ slot: s.slot, grade: s.grade, setId: s.setId, itemKey: s.itemKey, main: s.main, unlisted: s.unlisted, subs: s.subs });

// --- сохранение: тот же ключ 'ogc.state' и тот же набор полей, что у прежней страницы

export interface Persisted {
  tab: Tab; slot: SlotId; grade: Grade;
  rosterOnly: boolean; fodder: boolean; stage: Stage; lv120: boolean; quirks: boolean; settingsOpen: boolean;
  charId: string | null; cel: string; ccl: string; cOwned: boolean; cAll: boolean;
}

export const toPersisted = (s: AppState): Persisted => ({
  tab: s.tab, slot: s.slot, grade: s.grade, rosterOnly: s.settings.rosterOnly, fodder: s.settings.fodder,
  stage: s.settings.stage, lv120: s.settings.lv120, quirks: s.settings.quirks, settingsOpen: s.settingsOpen,
  charId: s.charId, cel: s.cel, ccl: s.ccl, cOwned: s.cOwned, cAll: s.cAll,
});

const oneOf = <T,>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

// сохранённое состояние → стартовое; всё незнакомое или битое заменяется значением по умолчанию
export function fromPersisted(saved: Partial<Record<keyof Persisted, unknown>> | null, idx: Index): AppState {
  const p = saved && typeof saved === 'object' ? saved : {};
  const charId = typeof p.charId === 'string' && idx.CHAR[p.charId] ? p.charId : null;
  return {
    tab: oneOf(p.tab, ['eval', 'chars'] as const, 'eval'),
    slot: oneOf(p.slot, SLOTS.map((x) => x.id), 'gloves'),
    grade: oneOf(p.grade, GRADES, 'unique'),
    ...EMPTY_ITEM,
    settings: {
      rosterOnly: bool(p.rosterOnly, true),
      fodder: bool(p.fodder, true), // красную броню со слабыми сабстатами — в фоддер, а не в разбор (гайд outerpedia)
      stage: oneOf(p.stage, ['grow', 'end'] as const, 'grow'),
      lv120: bool(p.lv120, false),
      quirks: bool(p.quirks, true),
    },
    settingsOpen: bool(p.settingsOpen, false),
    charId,
    cq: '',
    cel: oneOf(p.cel, ['', ...Object.keys(idx.D.elements)], ''),
    ccl: oneOf(p.ccl, ['', ...Object.keys(idx.D.classes)], ''),
    cOwned: bool(p.cOwned, false),
    cAll: bool(p.cAll, false),
  };
}

// --- недовведённый предмет: отдельный ключ 'ogc.item'. Android выгружает PWA из памяти, пока ты в игре, —
// после перезапуска продолжаешь с того же места; «Сброс» очищает.

export type PersistedItem = Pick<AppState, 'setId' | 'itemKey' | 'main' | 'unlisted' | 'subs'>;

export const toPersistedItem = (s: AppState): PersistedItem =>
  ({ setId: s.setId, itemKey: s.itemKey, main: s.main, unlisted: s.unlisted, subs: s.subs });

// сохранённый предмет → состояние; всё, что не сходится с текущими данными, слотом и грейдом, отбрасывается
export function restoreItem(s: AppState, saved: unknown, idx: Index): AppState {
  if (!saved || typeof saved !== 'object') return s;
  const r = saved as Record<string, unknown>;
  const armor = isArmor(s.slot);
  const legend = !armor && s.grade === 'unique';
  const kind = s.slot as GearKind;
  const setId = armor && typeof r.setId === 'string' && idx.SET[r.setId] ? r.setId : null;
  const itemKey = legend && typeof r.itemKey === 'string' && idx.ITEM[kind][r.itemKey] ? r.itemKey : null;
  const unlisted = legend && !itemKey && r.unlisted === true;
  const item = itemKey ? idx.ITEM[kind][itemKey] : null;
  const mains = armor ? [] : item ? [...item.mains, ...item.extraMains] : unlisted ? legendMains(idx, kind) : legend ? [] : epicMains(idx, kind);
  const main = typeof r.main === 'string' && mains.includes(r.main) ? r.main : null;
  const subs: Subs = {};
  if (r.subs && typeof r.subs === 'object') {
    for (const [k, v] of Object.entries(r.subs as Record<string, unknown>)) {
      if (Object.keys(subs).length >= maxSubs(s.grade)) break;
      if (idx.SUB[k] && k !== main && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4) subs[k] = v as number;
    }
  }
  return { ...s, setId, itemKey, main, unlisted, subs };
}

// предмет из кода гильдии подходит к текущим данным: restoreItem ничего не отбросил.
// Иначе код от более новых данных (или старых) — такого сета, предмета или main здесь нет.
export function fitsData(s: AppState, item: ItemInput, idx: Index): boolean {
  const r = restoreItem({ ...s, slot: item.slot, grade: item.grade }, item, idx);
  return r.setId === item.setId && r.itemKey === item.itemKey && r.main === item.main && r.unlisted === item.unlisted
    && JSON.stringify(r.subs) === JSON.stringify(item.subs);
}
