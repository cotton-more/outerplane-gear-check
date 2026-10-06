// Пул экипировки: вещи у персонажа. Что пул держит и почему — «статы + сеты» (features/gear/pool/info по профилю
// game/build/profile; решения — .x/0085-stat-set-model/FORMULA.md). Старый движок («собираешь», варианты, исход вещи)
// удалён на этапе 7.
// Разделы: base — общее, info — что держится, view — вид пула, ops — операции с пулом.
export type { Mark } from '@/features/gear/model/gear';
export type { PoolStore } from './base';
export { poolView } from './view';
export type { CharPool, PoolView } from './view';
export { replaceOf, planPut, planFor, putOn, stashOn, undoPut, wearFromPool, undoWear, wearAll, undoWearAll, removeFrom, undoRemove, removeUndo } from './ops';
export type { WearResult, PutResult, PutPlan, WearAllResult } from './ops';
