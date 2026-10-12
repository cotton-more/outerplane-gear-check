// The hero's level for white stats: Lv 120 or Lv 100. Today one setting for every hero (`lv120`); one helper, so a level
// per hero (.x/0205-hero-level) changes only this function
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';

export const lv120Of = (ctx: Pick<Ctx, 'settings'>, _c: Pick<Char, 'id'>): boolean => ctx.settings.lv120;
