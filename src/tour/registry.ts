// Реестр подсказок: собирает все src/components/**/*.tour.ts сам, без ручной регистрации.
// Работает во всех форматах сборки: vite-plugin-singlefile встраивает eager-модули в тот же скрипт.
import type { Tip } from './types';

const mods = import.meta.glob<Tip[]>('../components/**/*.tour.ts', { eager: true, import: 'default' });

export const TIPS: Tip[] = Object.values(mods).flat();
export const TIP_FILES = Object.keys(mods);
