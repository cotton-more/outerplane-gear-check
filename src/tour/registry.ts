// Реестр подсказок: собирает все src/components/**/*.tour.ts сам, без ручной регистрации.
// Работает во всех форматах сборки: vite-plugin-singlefile встраивает eager-модули в тот же скрипт.
import type { Tip } from './types';

const mods = import.meta.glob<Tip[]>('../components/**/*.tour.ts', { eager: true, import: 'default' });

export const TIPS: Tip[] = Object.values(mods).flat();
// сколько подсказок в каждом файле: пустой *.tour.ts обучением не считается (test/tour.test.ts)
export const TIP_COUNTS: Record<string, number> = Object.fromEntries(Object.entries(mods).map(([f, tips]) => [f.replace(/^\.\.\/components\//, ''), tips.length]));
