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
  inScope: (c: Char) => boolean;
  outScope: (c: Char) => boolean; // «не в ростере» при «только мои»: кандидат, но не свой
  t: Texts;                     // фразы вердикта на выбранном языке
}

export function makeCtx(idx: Index, settings: Settings, roster: ReadonlySet<string>, t: Texts = ru, off: ReadonlyMap<string, string> = new Map()): Ctx {
  const scoped = settings.rosterOnly && roster.size > 0;
  return {
    idx, settings, roster, scoped, off, t,
    inScope: (c) => !off.has(c.id) && (!scoped || roster.has(c.id)),
    outScope: (c) => !off.has(c.id) && scoped && !roster.has(c.id),
  };
}
