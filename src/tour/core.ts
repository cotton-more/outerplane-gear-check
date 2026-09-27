// Главный тур «Первая вещь»: пять шагов по форме, написаны вручную, чтобы шли одной историей.
// Каждый шаг засчитывается по изменению на странице (нажатие или горячая клавиша — всё равно), а «Дальше» есть всегда.
// Тексты — ru.ts и en.ts, раздел tour.steps; подсказки отдельных функций — в *.tour.ts модулей (registry.ts).
import { isArmor } from '../data';
import { dropSubs } from '../logic/subs';
import type { Step, StepText, TourCtx } from './types';

// на примере: Epic броня Speed Set и три сабстата — у Epic их три
export const DEMO = { slot: 'armor', grade: 'rare', set: 'Speed', subs: ['SPD', 'CHC', 'CHD'] } as const;

const picked = ({ s }: TourCtx) => {
  if (isArmor(s.slot)) return !!s.setId;
  const found = !!s.itemKey || s.unlisted;
  if (s.slot === 'weapon') return !!s.main && (s.grade === 'rare' || found);
  return s.grade === 'rare' ? !!s.main : found;
};

export const verdictReady = (c: TourCtx) => c.nSubs >= dropSubs(c.s.grade) || c.verdict.v === 'junk';

export const CORE: Step[] = [
  { id: 'slot', rev: 1, at: () => ['slot', 'grade'],
    // на примере — когда выбраны именно броня и Epic: после одного «Armor» грейд ещё может быть L
    done: (c, start, demo) => (c.s.slot !== start.s.slot || c.s.grade !== start.s.grade)
      && (!demo || (c.s.slot === DEMO.slot && c.s.grade === DEMO.grade)) },
  { id: 'pick', rev: 1, at: () => ['pick'], done: picked },
  { id: 'grid', rev: 1, at: () => ['grid'], done: verdictReady },
  { id: 'verdict', rev: 1, at: () => ['verdict'], done: (c) => c.narrow && c.verdictOpen },
  { id: 'next', rev: 1, at: () => ['next'], done: (c, start) => start.nSubs > 0 && c.nSubs === 0 },
];

export const stepText = (c: TourCtx, demo: boolean): StepText => ({
  demo,
  keys: c.keys,
  kind: isArmor(c.s.slot) ? 'armor' : c.s.slot === 'weapon' ? 'weapon' : 'accessory',
  legend: c.s.grade === 'unique',
  narrow: c.narrow,
  n: c.nSubs,
  of: dropSubs(c.s.grade),
});
