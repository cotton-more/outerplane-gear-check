// Состояние страницы: вкладка, форма оценки (features/eval/form/formState), список персонажей (features/roster/charFilter)
// и все переходы — чистый reducer, без React и DOM. Сохраняется в 'ogc.state' (useAppState).
import { GRADES, SLOTS, type Index } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import type { Stage } from '@/game/context';
import { charMatches, effectiveMode, type CharFilter, type ListAction } from '@/features/roster/charFilter';
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
  // reveal: список его и так показывает — фильтры не трогаем; прячет герой с билдами — сбросить стихию, класс, поиск, режим «Все»;
  // прячет герой без билдов — то же, но в поиске его имя (name): в «Все» без поиска такого героя нет (SPEC 7)
  | { type: 'openChar'; id: string; reveal: 'keep' | 'filters' | 'filters+name'; name?: string };

// открыть персонажа; если фильтры списка его прячут — сбросить их, чтобы плитка была видна
export function openCharAction(
  idx: Index, s: AppState, roster: ReadonlySet<string>, id: string, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>,
): Action {
  const c = idx.CHAR[id];
  if (!c || charMatches(c, { ...s, cMode: effectiveMode(s.cMode, roster.size) }, roster, geared, off)) return { type: 'openChar', id, reveal: 'keep' };
  return c.builds.length ? { type: 'openChar', id, reveal: 'filters' } : { type: 'openChar', id, reveal: 'filters+name', name: c.name };
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'load':
      // вещь на форму (код гильдии, «Вернуть», обучение) — и сразу к оценке
      return { ...formReducer(s, a), tab: 'eval' };
    case 'openChar': {
      // персонаж из вердикта, «Сейчас на персонажах», адреса #slug: карточка открывается всегда
      const next: AppState = { ...s, tab: 'chars', charId: a.id };
      if (a.reveal === 'keep') return next;
      return { ...next, cel: '', ccl: '', cq: a.reveal === 'filters+name' ? a.name ?? '' : '', cMode: 'all' };
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
  // cOwned — «Мои» (и «Доодеть», который после перезапуска «Мои»): имя прежнее, чтобы прежняя версия страницы читала его как «только мои»
  charId: string | null; cel: string; ccl: string; cOwned: boolean;
}

export const toPersisted = (s: AppState): Persisted => ({
  tab: s.tab, slot: s.slot, grade: s.grade, rosterOnly: s.settings.rosterOnly, fodder: s.settings.fodder,
  stage: s.settings.stage, lv120: s.settings.lv120, quirks: s.settings.quirks, settingsOpen: s.settingsOpen,
  charId: s.charId, cel: s.cel, ccl: s.ccl, cOwned: s.cMode !== 'all',
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
    cMode: bool(p.cOwned, false) ? 'mine' : 'all', // прежнее «показать и без билдов» (cAll) не читаем: такой галочки больше нет
  };
}
