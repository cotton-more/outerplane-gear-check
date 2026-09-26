import type { Grade } from '../data/types';

// Сабстаты предмета: ключ → сколько жёлтых сегментов. Порядок ключей — порядок, в котором их отметили.
export type Subs = Record<string, number>;

// Сколько сабстатов у предмета из дропа: у Legendary четыре, у Epic — три. С этим числом ввод «закончен».
export const dropSubs = (grade: Grade): number => (grade === 'unique' ? 4 : 3);

// Больше четырёх не бывает ни у кого: Epic получает четвёртый от первого Reforge — его тоже можно ввести.
export const MAX_SUBS = 4;
