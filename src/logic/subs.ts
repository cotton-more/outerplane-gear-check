import type { Grade } from '../data/types';

// Сабстаты предмета: ключ → сколько сегментов горит (уровень). Порядок ключей — порядок, в котором их отметили.
export type Subs = Record<string, number>;

// Сколько сабстатов у предмета из дропа: у Legendary четыре, у Epic — три. С этим числом ввод «закончен».
export const dropSubs = (grade: Grade): number => (grade === 'unique' ? 4 : 3);

// Больше четырёх не бывает ни у кого: Epic получает четвёртый от первого Reforge — его тоже можно ввести.
export const MAX_SUBS = 4;

// Сегментов у сабстата без Reforge: у свежей вещи — до четырёх (жёлтые); выше — только от Reforge
export const DROP_LEVEL = 4;

// Вещь прокачана Reforge (В-А4): уровень сабстата выше четырёх или Epic с четырьмя сабстатами (4-й у Epic бывает
// только от Reforge). Советы Reforge (кубик, «Стоит Reforge», «Прокачка») — только у непрокачанной
export const upgraded = (item: { grade: Grade; subs: Subs }): boolean =>
  Object.values(item.subs).some((n) => n > DROP_LEVEL) || (item.grade === 'rare' && Object.keys(item.subs).length >= MAX_SUBS);

// Предел суммы уровней (В-А5): у Legendary 22 (после всех Reforge 18, с Singularity 21, с Rico Lv4 22), у Epic 17
// (на один Reforge меньше Legendary, FAQ outerpedia). Ввод не даёт сумме вырасти выше: опечатка 6/6/6/6 «как есть»
// обогнала бы любую вещь слота. Старые записи бывают и выше (жёлтые до 4 у каждого плюс оранжевые) — уменьшать
// можно всегда
export const levelCap = (grade: Grade): number => (grade === 'unique' ? 22 : 17);
export const levelSum = (subs: Subs): number => Object.values(subs).reduce((n, v) => n + v, 0);
// правка сабстатов не срабатывает (false), если сумма уровней растёт и уходит выше предела; уменьшение — всегда
export const withinCap = (grade: Grade, from: Subs, to: Subs): boolean => {
  const sum = levelSum(to);
  return sum <= levelCap(grade) || sum <= levelSum(from);
};
