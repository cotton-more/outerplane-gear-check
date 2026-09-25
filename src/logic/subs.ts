import type { Grade } from '../data/types';

// Сабстаты предмета: ключ → сколько жёлтых сегментов. Порядок ключей — порядок, в котором их отметили.
export type Subs = Record<string, number>;

// У Legendary четыре сабстата, у Epic — три. Единственное место, где это записано.
export const maxSubs = (grade: Grade): number => (grade === 'unique' ? 4 : 3);
