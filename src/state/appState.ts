// Состояние страницы и все переходы — чистый reducer, без React и DOM.
import { GRADES, SLOTS, isArmor, type Index } from '../data';
import type { Grade, SlotId } from '../data/types';
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
  | { type: 'next' }
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
      return s.slot === a.slot ? s : { ...s, ...EMPTY_ITEM, slot: a.slot };
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
      // другой стат в той же строке: позиция сохраняется, жёлтые — снова 1
      if (!(a.from in s.subs) || a.to in s.subs || a.to === s.main) return s;
      return { ...s, subs: Object.fromEntries(Object.entries(s.subs).map(([k, v]) => (k === a.from ? [a.to, 1] : [k, v]))) };
    }
    case 'roll':
      return a.key in s.subs ? { ...s, subs: { ...s.subs, [a.key]: a.n } } : s;
    case 'clearSubs':
      return { ...s, subs: {} };
    case 'next':
      return { ...s, ...EMPTY_ITEM };
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
      fodder: bool(p.fodder, false),
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
