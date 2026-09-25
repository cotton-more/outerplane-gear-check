// Всё, от чего зависит оценка, кроме самого предмета: датасет, настройки и ростер.
import type { Index } from '../data';
import type { Char } from '../data/types';

export type Stage = 'grow' | 'end';

export interface Settings {
  rosterOnly: boolean;
  fodder: boolean;   // коплю Legendary броню для Breakthrough
  stage: Stage;      // «Развитие» держит временные замены, «Эндгейм» — нет
  lv120: boolean;
  quirks: boolean;
}

export interface Ctx {
  idx: Index;
  settings: Settings;
  roster: ReadonlySet<string>;
  scoped: boolean;              // «только мои персонажи» включено и ростер не пуст
  inScope: (c: Char) => boolean;
}

export function makeCtx(idx: Index, settings: Settings, roster: ReadonlySet<string>): Ctx {
  const scoped = settings.rosterOnly && roster.size > 0;
  return { idx, settings, roster, scoped, inScope: (c) => !scoped || roster.has(c.id) };
}
