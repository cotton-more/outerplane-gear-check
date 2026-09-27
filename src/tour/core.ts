// Главный тур «Первая вещь»: пять шагов по форме, написаны вручную, чтобы шли одной историей.
// Каждый шаг засчитывается по изменению на странице (нажатие или горячая клавиша — всё равно), а «Дальше» есть всегда.
// Тексты — ru.ts и en.ts, раздел tour.steps; подсказки отдельных функций — в *.tour.ts модулей (registry.ts).
import { isArmor } from '../data';
import { dropSubs } from '../logic/subs';
import type { Pin } from './anchors';
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

// На примере шаг засчитывается только при выборе из примера: иначе вердикт и тексты дальше были бы не про ту вещь.
// Нажать другое можно — полоса подскажет, что поправить (off), а рамки покажут, что осталось нажать (pin).
const demoItem = ({ s }: TourCtx) => s.slot === DEMO.slot && s.grade === DEMO.grade;
const demoSet = (c: TourCtx) => demoItem(c) && c.set === DEMO.set;
const demoSubs = (c: TourCtx) => demoSet(c) && c.nSubs === DEMO.subs.length && DEMO.subs.every((k) => k in c.s.subs);
const extraSub = (c: TourCtx) => Object.keys(c.s.subs).some((k) => !(DEMO.subs as readonly string[]).includes(k));

export const CORE: Step[] = [
  { id: 'slot', rev: 1, at: () => ['slot', 'grade'],
    pin: ({ s }) => [...(s.slot !== DEMO.slot ? ['slot:' + DEMO.slot] : []), ...(s.grade !== DEMO.grade ? ['grade:' + DEMO.grade] : [])] as Pin[],
    // на примере — когда выбраны именно броня и Epic: после одного «Armor» грейд ещё может быть L
    done: (c, start, demo) => (c.s.slot !== start.s.slot || c.s.grade !== start.s.grade)
      && (!demo || (c.s.slot === DEMO.slot && c.s.grade === DEMO.grade)) },
  { id: 'pick', rev: 1, at: () => ['pick'], done: (c, _, demo) => (demo ? demoSet(c) : picked(c)),
    pin: (c) => (demoItem(c) ? ['pick:*', `sets:${DEMO.set}`] : ['slot:' + DEMO.slot, 'grade:' + DEMO.grade]) as Pin[],
    off: (c) => (!demoItem(c) ? 'item' : c.set && c.set !== DEMO.set ? 'set' : null) },
  { id: 'grid', rev: 1, at: () => ['grid'], done: (c, _, demo) => (demo ? demoSubs(c) : verdictReady(c)),
    // лишний стат: рамки на его строке и, в окне замены, на недостающем стате примера (на телефоне с тремя
    // сабстатами вместо сетки уже карточка вердикта — убрать повторным нажатием в сетке не выйдет)
    pin: (c) => {
      if (!demoSet(c)) return [];
      const missing = DEMO.subs.filter((k) => !(k in c.s.subs));
      const extra = Object.keys(c.s.subs).filter((k) => !(DEMO.subs as readonly string[]).includes(k));
      return extra.length
        ? [...extra.map((k): Pin => `rows:${k}`), ...missing.map((k): Pin => `subpick:${k}`)]
        : missing.map((k): Pin => `grid:${k}`);
    },
    off: (c) => (!demoItem(c) ? 'item' : !demoSet(c) ? 'set' : extraSub(c) ? 'subs' : null) },
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
