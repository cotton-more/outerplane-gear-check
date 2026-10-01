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
