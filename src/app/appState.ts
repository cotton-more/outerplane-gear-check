// Состояние страницы: вкладка, форма оценки (features/eval/form/formState), список персонажей (features/roster/charFilter)
// и все переходы — чистый reducer, без React и DOM. Сохраняется в 'ogc.state' (useAppState).
import { GRADES, SLOTS, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import type { Stage } from '@/game/context';
import { charMatches, type CharFilter, type ListAction } from '@/features/roster/charFilter';
import { EMPTY_ITEM, formReducer, type FormAction, type FormState } from '@/features/eval/form/formState';
import type { Tab } from '@/shared/tab';


export interface AppState extends FormState, CharFilter {
  tab: Tab;
  // вкладка «Персонажи»
  charId: string | null;
}

export type Action =
  | { type: 'tab'; tab: Tab }
  | FormAction
  | ListAction
  | { type: 'openChar'; id: string; reveal: 'keep' | 'filters' | 'filters+all' };

// открыть персонажа; если фильтры списка его прячут — сбросить их (у персонажа без билдов — ещё и «показать без билдов»)
export function openCharAction(idx: Index, s: AppState, roster: ReadonlySet<string>, id: string, geared?: ReadonlyMap<string, number>): Action {
  const c = idx.CHAR[id];
  const reveal = !c || charMatches(c, s, roster, geared) ? 'keep' : c.builds.length ? 'filters' : 'filters+all';
  return { type: 'openChar', id, reveal };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'load':
      // вещь на форму (код гильдии, «Вернуть», обучение) — и сразу к оценке
      return { ...formReducer(s, a), tab: 'eval' };
    case 'openChar': {
      // персонаж из вердикта: если фильтры списка его прячут — сбрасываем их
      const next: AppState = { ...s, tab: 'chars', charId: a.id };
      if (a.reveal === 'keep') return next;
      return { ...next, cel: '', ccl: '', cq: '', cOwned: false, cGear: false, ...(a.reveal === 'filters+all' ? { cAll: true } : {}) };
    }
    case 'selectChar':
      return { ...s, charId: a.id };
    case 'charFilter':
      return { ...s, ...a.patch };
    default:
      return formReducer(s, a);
  }
}

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
    cGear: false,
  };
}
