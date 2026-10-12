// Всё, от чего зависит оценка, кроме самого предмета: датасет, настройки, ростер и язык текстов.
import type { Index } from '@/game/data';
import type { Char } from '@/game/data/types';
import { ru, type Texts } from '@/i18n/ru';

export type Stage = 'grow' | 'end';

export interface Settings {
  rosterOnly: boolean;
  stage: Stage;      // «Развитие» держит временные замены, «Эндгейм» — нет
  lv120: boolean;
  quirks: boolean;
}

export interface Ctx {
  idx: Index;
  settings: Settings;
  roster: ReadonlySet<string>;
  scoped: boolean;              // «только мои персонажи» включено и ростер не пуст
  // X, которого заменил его Core Fusion (features/gear/model/fusion, X → CF): не кандидат вердикта — ни среди своих, ни среди других
  off: ReadonlyMap<string, string>;
  // hero → in-game ★ from the store (`gear.ts stars`): facts about the hero, like the quirks setting; N — a wish — stays in
  // the profile. No entry — not set: no crit from stars is counted
  stars: Readonly<Record<string, number>>;
  // hero → the level marked on the card (100 or 120, `gear.ts lv`, .x/0205); no entry — the `lv120` setting (the default)
  lv: Readonly<Record<string, number>>;
  inScope: (c: Char) => boolean;
  outScope: (c: Char) => boolean; // «не в ростере» при «только мои»: кандидат, но не свой
  t: Texts;                     // фразы вердикта на выбранном языке
}

export const NO_STARS: Readonly<Record<string, number>> = Object.freeze({});
export const NO_LV: Readonly<Record<string, number>> = Object.freeze({});

export function makeCtx(idx: Index, settings: Settings, roster: ReadonlySet<string>, t: Texts = ru, off: ReadonlyMap<string, string> = new Map(),
  stars: Readonly<Record<string, number>> = NO_STARS, lv: Readonly<Record<string, number>> = NO_LV): Ctx {
  const scoped = settings.rosterOnly && roster.size > 0;
  return {
    idx, settings, roster, scoped, off, stars, lv, t,
    inScope: (c) => !off.has(c.id) && (!scoped || roster.has(c.id)),
    outScope: (c) => !off.has(c.id) && scoped && !roster.has(c.id),
  };
}
