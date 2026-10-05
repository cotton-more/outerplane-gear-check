// «T4» рядом с сетом брони или предметом Legendary оружия и аксессуара: бонус сета и материал Breakthrough считаются по
// нему. Новость для давних игроков — раньше форма T4 не знала. Подсказка одна на все вещи; у оружия и аксессуара «T4»
// появилась до выпуска (вопрос 7 ревью eval-only) — rev тот же
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'bt', rev: 1, at: 'bt', news: true, when: (c) => c.s.tab === 'eval' },
);
