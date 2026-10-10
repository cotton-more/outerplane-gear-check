// Реестр подсказок: собирает все src/**/*.tour.ts сам, без ручной регистрации.
// Работает во всех форматах сборки: vite-plugin-singlefile встраивает eager-модули в тот же скрипт.
import type { Tip } from './types';

const mods = import.meta.glob<Tip[]>('../**/*.tour.ts', { eager: true, import: 'default' });
const fileOf = (path: string) => path.replace(/^\.\.\//, ''); // путь от src/

// Порядок подсказок — порядок показа: «Что нового» начинается с первой новой, по ходу — первая подходящая, в Справке —
// список по порядку. Сначала «Ещё» (там теперь настройки), затем вкладками: «Персонажи», «Оценка», «Обмен». Новый *.tour.ts — допиши сюда, в своё место
// (test/tour/tour.test.ts напомнит); файл не из списка встанет в конец.
export const TIP_ORDER = [
  'app/shell/More', 'screens/chars/CharDetail', 'features/worn/PinSheet', 'features/roster/CharList',
  'features/roster/FusionAsk', 'features/worn/WornGear', 'features/gear/ui/PoolList', 'screens/chars/PieceSheet', 'features/worn/ShareButton',
  'features/eval/form/BtChip', 'features/eval/verdict/Chain', 'features/gear/ui/EquipSheet', 'features/eval/code/ItemCode',
  'features/eval/form/StatGrid', 'features/eval/form/SubPicker', 'features/eval/form/SubRows', 'features/tryon/TryOnStrip',
  'screens/eval/VerdictPanel', 'features/gear/ui/VsSection',
  'features/trade/ui/TradeSheet',
  'features/batch/ui/BatchButton',
].map((f) => f + '.tour.ts');
const rank = (f: string) => { const i = TIP_ORDER.indexOf(f); return i < 0 ? TIP_ORDER.length : i; };
const files = Object.keys(mods).map(fileOf).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

export const TIPS: Tip[] = files.flatMap((f) => mods['../' + f]);
// сколько подсказок в каждом файле: пустой *.tour.ts обучением не считается (test/tour/tour.test.ts)
export const TIP_COUNTS: Record<string, number> = Object.fromEntries(files.map((f) => [f, mods['../' + f].length]));
