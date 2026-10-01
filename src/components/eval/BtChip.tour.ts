// «T4» рядом с сетом брони: бонус сета считается по Breakthrough. Новость для давних игроков — раньше форма T4 не знала
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'bt', rev: 1, at: 'bt', news: true, when: (c) => c.s.tab === 'eval' },
);
