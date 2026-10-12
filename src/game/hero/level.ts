// The hero's level for white stats: Lv 120 or Lv 100 (.x/0205-hero-level, owner 2026-10-12): the level marked on the
// hero's card (`Ctx.lv`, 100 or 120), else the `lv120` setting — «Уровень по умолчанию». The one reader: flat vs %
// (game/build/score), set rows of SPD (game/set/setBonus), white EFF (game/stat/eff)
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';

export const lv120Of = (ctx: Pick<Ctx, 'settings' | 'lv'>, c: Pick<Char, 'id'>): boolean => {
  const v = ctx.lv?.[c.id];
  return v === 120 || v === 100 ? v === 120 : ctx.settings.lv120;
};
