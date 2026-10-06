// Пул экипировки (GEARPOOL, этап C1 — только логика, интерфейса и хранилища нет): вещи у персонажа, а билды
// собираются из них сами. Решения владельца — GEARPOOL.md.
//   - Вариант билда (game/build/variants) собирается из пула лучшей раскладкой: по слоту — одна вещь. Связка сетов —
//     цель: части с бонусом, который статом не выразить (Penetration, Immunity, …), держатся всегда; сет-стат
//     (Attack, Speed, …) собирается вещь за вещью, а последнюю вещь его бонус выигрывает только ценностью — сет можно
//     сломать, если итог выгоднее (бонус в сегментах — game/set/setBonus).
//   - «Собираешь» — варианты, для которых вещи держат вердикт: отмеченные «Собираю», начатые (Р14, Р18,
//     П3: хоть одна вещь связки при любом T или рекомендованное оружие / аксессуар из списка встаёт в сборку; временное
//     не начинает) и «По статам», пока он живой.
//     «Не собираю» исключает всегда. «Начат» — по тому, что можно собрать из пула (достижимая сборка, Р1), а карточка
//     показывает выбранную раскладку.
//   - «По статам» — отдельный билд у каждого персонажа с билдами (находка 28, Р11–Р13): все вещи пула по цепочке. Он
//     «живой» (собираешь, держит штамп), пока ни один настоящий билд не начат; потом его строка тихая —
//     «Надеть» в него только при явном выборе (поиск по имени, режим героя).
//   - Что держит пул (held) — шире «собираешь»: лучшие раскладки всех настоящих вариантов (собирается он или нет,
//     «Не собираю» тоже — В2) и надетое героя; «По статам» вещи не держит («Надето», В4). «Надеть» убирает то, что это
//     «Надеть» вытеснило из них, в любом слоте (В1), — надетое никогда.
//   - Исход вещи с формы для персонажа (outcomeFor): что станет с каждым собираемым вариантом, если её добавить.
// Разделы: base — общее, stats — «По статам», assemble — сборка, play — «собираешь», view — вид пула,
// outcome — исход вещи с формы, ops — операции с пулом.
export type { Mark } from '@/features/gear/model/gear';
export { LOST_MIN } from './base';
export type { PoolStore } from './base';
export { STATS, isStats, statsUseful, statVariant } from './stats';
export { entriesFor, assemble, assembleFixed, assembleReach } from './assemble';
export type { Entry, Role, Assembly } from './assemble';
export { heroOpts, markOfVariant, started, hasStatBuild, play, heldBy, usedIn } from './play';
export type { PlayOpts, Play } from './play';
export { poolView } from './view';
export type { CharPool, PoolView } from './view';
export { OUTCOME_ORDER, rowKey, lostBonusValue, outcomeFor, holds, holdsKind, shownKind, puts } from './outcome';
export type { OutcomeKind, Outcome, CharOutcome, OutcomeOpts } from './outcome';
export { replaceOf, planPut, planFor, putOn, stashOn, undoPut, wearFromPool, undoWear, wearAll, undoWearAll, removeFrom, undoRemove, removeUndo, setMark } from './ops';
export type { WearResult, PutResult, PutPlan, WearAllResult } from './ops';
