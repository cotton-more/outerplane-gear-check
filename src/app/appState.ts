// Состояние страницы и все переходы — чистый reducer, без React и DOM.
import { GRADES, SLOTS, isArmor, type Index } from '@/game/data';
import type { GearKind, Grade, SlotId } from '@/game/data/types';
import { epicMains, legendMains } from '@/game/build/builds';
import { itemMains } from '@/game/item/mains';
import type { Settings, Stage } from '@/game/context';
import type { CharFilter } from '@/features/eval/form/lists';
import { MAX_LIT, hasBt } from '@/features/gear/model/gear';
import { MAX_SUBS, levelCap, levelSum, withinCap, type Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';

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
  subs: Subs;                       // уровень сабстата — сколько сегментов горит в игре, 1–6
  t4: boolean;                      // Breakthrough T4; не нажата — ниже T4 (T0–T3). Есть у брони и Legendary оружия и аксессуара (gear hasBt), у Epic оружия и аксессуара — всегда false
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
  | { type: 'item'; itemKey: string | null; mains?: string[] } // mains — какие main бывают у этого предмета
  | { type: 'unlisted' }
  | { type: 'main'; main: string; blocks?: string | null } // blocks — какой сабстат этот main запрещает (game/item/mains blocksOf)
  | { type: 'sub'; key: string }
  | { type: 'replaceSub'; from: string; to: string }
  | { type: 'roll'; key: string; n: number }
  | { type: 't4' }
  | { type: 'clearSubs' }
  | { type: 'reset'; slot?: SlotId } // slot — «Дальше: {слот}» после «Надеть» при вводе надетого
  | { type: 'load'; item: ItemInput }
  | { type: 'expand'; key: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'settingsOpen'; open: boolean }
  | { type: 'openChar'; id: string; reveal: 'keep' | 'filters' | 'filters+all' }
  | { type: 'selectChar'; id: string | null }
  | { type: 'charFilter'; patch: Partial<CharFilter> };

// «T4» — у каждой вещи своя: сбрасывается вместе с предметом (слот, «Следующий», load), а ещё при смене грейда и того,
// что делает вещь «такой же» для Breakthrough (features/gear/model/material): сета брони, предмета оружия и аксессуара
const EMPTY_ITEM = { setId: null, itemKey: null, main: null, unlisted: false, subs: {}, t4: false, expand: {} };

// правка сабстатов, которая поднимает сумму уровней выше предела (subs levelCap), не срабатывает
const withSubs = (s: AppState, subs: Subs): AppState => (withinCap(s.grade, s.subs, subs) ? { ...s, subs } : s);

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tab':
      return { ...s, tab: a.tab };
    case 'slot':
      // сет один на всю броню: между шлемом, бронёй, перчатками и ботинками он остаётся (в игре инвентарь фильтруется по сету)
      return s.slot === a.slot ? s : { ...s, ...EMPTY_ITEM, setId: isArmor(a.slot) ? s.setId : null, slot: a.slot };
    case 'grade': {
      if (s.grade === a.grade) return { ...s, expand: {} };
      // сабстаты остаются: четыре бывает и у Epic — четвёртый добавляет первый Reforge. Main тоже: у оружия
      // и аксессуаров те же main на обоих грейдах, а на форме он отмечен рядом с грейдом или в сетке
      // Сумма выше предела нового грейда (Legendary → Epic) остаётся: предел запрещает только рост
      const item = isArmor(s.slot) ? {} : { itemKey: null, unlisted: false };
      return { ...s, ...item, grade: a.grade, t4: false, expand: {} };
    }
    case 'set': {
      const t4 = s.t4 && a.setId === s.setId; // другой сет — другая вещь
      return a.setId ? { ...s, setId: a.setId, t4, expand: {} } : { ...s, setId: null, t4 };
    }
    case 'item': {
      // main, отмеченный до предмета, остаётся, если такой у предмета бывает. Другой предмет — другая вещь: «T4» снимается,
      // как при смене сета брони (main — нет: такая же для Breakthrough — тот же предмет при любом main)
      const main = s.main && a.mains?.includes(s.main) ? s.main : null;
      const t4 = s.t4 && !!a.itemKey && a.itemKey === s.itemKey;
      return a.itemKey ? { ...s, itemKey: a.itemKey, main, unlisted: false, t4, expand: {} } : { ...s, itemKey: null, main: null, unlisted: false, t4 };
    }
    case 'unlisted':
      // main «нет в списке» — любой из слота; был предмет из списка — это другая вещь
      return { ...s, itemKey: null, unlisted: true, t4: s.t4 && s.unlisted, expand: {} };
    case 'main': {
      const main = s.main === a.main ? null : a.main;
      const subs = { ...s.subs };
      // сабстатом не бывает строка main того же стата и вида; flat EFF в main сабстат EFF% не убирает
      const drop = a.blocks === undefined ? main : a.blocks;
      if (main && drop) delete subs[drop];
      return { ...s, main, subs, expand: {} };
    }
    case 'sub': {
      // выбранный стат сразу получает 1 сегмент (если сумма не уйдёт выше предела); повторное нажатие снимает выбор
      const subs = { ...s.subs };
      if (a.key in subs) delete subs[a.key];
      else if (Object.keys(subs).length < MAX_SUBS) subs[a.key] = 1;
      else return s;
      return withSubs(s, subs);
    }
    case 'replaceSub': {
      // другой стат в той же строке: позиция и уровень сохраняются — обычно ошибка только в названии стата.
      // Стат из другой строки переезжает сюда, а его строка освобождается: так вводят вещь поверх прошлой — у новой
      // первым идёт RES%, а у прошлой он стоял третьим. Обмен строками оставил бы там старый стат, который легко
      // не заметить. Запрещённые main сабстаты окно замены не предлагает
      if (!(a.from in s.subs) || a.from === a.to) return s;
      const subs = Object.entries(s.subs).filter(([k]) => k !== a.to).map(([k, v]) => [k === a.from ? a.to : k, v]);
      return { ...s, subs: Object.fromEntries(subs) };
    }
    case 'roll':
      // уровень 1–6: сколько сегментов горит в игре (жёлтые и оранжевые вместе)
      if (!(a.key in s.subs) || !Number.isInteger(a.n) || a.n < 1 || a.n > MAX_LIT) return s;
      return withSubs(s, { ...s.subs, [a.key]: a.n });
    case 't4':
      return hasBt(s.slot, s.grade) ? { ...s, t4: !s.t4 } : s;
    case 'clearSubs':
      return { ...s, subs: {} };
    case 'reset':
      // следующий предмет: слот, грейд, сет брони и main оружия или аксессуара остаются — это как фильтр инвентаря:
      // подряд идут дропы одного забега или вещи, отфильтрованные в игре по main. Если сет или main другой, сменить
      // его стоит почти столько же, сколько выбрать с пустого поля. Предмет по названию и сабстаты — у каждой вещи свои.
      // С другим слотом (ввод надетого: следующий ненадетый слот героя) — та же вещь другого слота не ждёт: остаётся
      // только грейд, сет, main и прочее пустые (форму не предзаполняем)
      if (a.slot && a.slot !== s.slot) return { ...s, ...EMPTY_ITEM, slot: a.slot };
      return { ...s, ...EMPTY_ITEM, setId: isArmor(s.slot) ? s.setId : null, main: s.main };
    case 'load': {
      // Breakthrough входа — в «T4» (где он есть, hasBt); само поле bt в состояние не попадает
      const { bt, ...item } = a.item;
      return { ...s, ...EMPTY_ITEM, ...item, t4: hasBt(item.slot, item.grade) && bt === 4, tab: 'eval' };
    }
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
      return { ...next, cel: '', ccl: '', cq: '', cOwned: false, cGear: false, ...(a.reveal === 'filters+all' ? { cAll: true } : {}) };
    }
    case 'selectChar':
      return { ...s, charId: a.id };
    case 'charFilter':
      return { ...s, ...a.patch };
  }
}

// вещь с формы — с Breakthrough: «T4» → 4, иначе ниже T4 (0, В4); у Epic оружия и аксессуара Breakthrough нет (hasBt)
export const itemInput = (s: AppState): ItemInput => ({
  slot: s.slot, grade: s.grade, setId: s.setId, itemKey: s.itemKey, main: s.main, unlisted: s.unlisted, subs: s.subs,
  ...(hasBt(s.slot, s.grade) ? { bt: s.t4 ? 4 : 0 } : {}),
});

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

// --- недовведённый предмет: отдельный ключ 'ogc.item'. Android выгружает PWA из памяти, пока ты в игре, —
// после перезапуска продолжаешь с того же места; «Сброс» очищает.

// t4 — только нажатая и где он есть (hasBt): старая вкладка его не знает и просто не прочтёт
export type PersistedItem = Pick<AppState, 'setId' | 'itemKey' | 'main' | 'unlisted' | 'subs'> & { t4?: true };

export const toPersistedItem = (s: AppState): PersistedItem =>
  ({ setId: s.setId, itemKey: s.itemKey, main: s.main, unlisted: s.unlisted, subs: s.subs, ...(hasBt(s.slot, s.grade) && s.t4 ? { t4: true as const } : {}) });

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
  const { blocked } = itemMains(idx, { slot: s.slot, grade: s.grade, setId, itemKey, main }); // сабстатов, которых из-за main не бывает, не берём
  const subs: Subs = {};
  if (r.subs && typeof r.subs === 'object') {
    for (const [k, v] of Object.entries(r.subs as Record<string, unknown>)) {
      if (Object.keys(subs).length >= MAX_SUBS) break;
      if (idx.SUB[k] && !blocked.has(k) && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_LIT) subs[k] = v as number;
    }
  }
  // Сумма выше предела — запись битая: сабстаты отбрасываем целиком, а не обрезаем (обрезанная — уже другая вещь, и её
  // вердикт мог бы отправить настоящую в разбор); сет, предмет и main остаются. Предел — наибольший из грейдов: ввод
  // набирает до 22 у Legendary, а смена грейда сумму не режет — такая Epic после перезапуска должна вернуться как была
  const fits = levelSum(subs) <= Math.max(...GRADES.map(levelCap));
  return { ...s, setId, itemKey, main, unlisted, subs: fits ? subs : {}, t4: hasBt(s.slot, s.grade) && r.t4 === true };
}

// предмет из кода гильдии подходит к текущим данным: restoreItem ничего не отбросил.
// Иначе код от более новых данных (или старых) — такого сета, предмета или main здесь нет.
export function fitsData(s: AppState, item: ItemInput, idx: Index): boolean {
  const r = restoreItem({ ...s, slot: item.slot, grade: item.grade }, item, idx);
  return r.setId === item.setId && r.itemKey === item.itemKey && r.main === item.main && r.unlisted === item.unlisted
    && JSON.stringify(r.subs) === JSON.stringify(item.subs);
}
