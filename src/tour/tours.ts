// Все туры обучения. rev тура — записывается в seen как 'tour.<id>', когда тур пройден до конца.
// Главный тур по-прежнему отмечается и полем first (store.ts): от него зависят карточка новичка и «Появилось обучение».
import { CORE } from './core';
import { GEAR } from './gear';
import type { TourDef, TourId } from './types';

export const TOURS: Record<TourId, TourDef> = {
  core: { id: 'core', rev: 1, steps: CORE },
  gear: { id: 'gear', rev: 1, steps: GEAR, demoOnly: true },
};

export const tourSeenId = (id: TourId) => `tour.${id}`;
