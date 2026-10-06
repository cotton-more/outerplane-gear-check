// «Кому надеть?» (rev 2, GEARPOOL): те, кому вещь встанет в билд; не по билду — поиск по имени, «По статам» (находка 28);
// rev 3 — «Надето»: «Надеть» записывает вещь как надетую; rev 4 — .x/0085 этап 9: кому вещь даст больше очков, а не «встанет в билд»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'equipAll', rev: 4, at: 'equipall' },
);
