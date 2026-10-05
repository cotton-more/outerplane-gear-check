// «Прокачка»: что вкладывать в предмет после вердикта — Enhance, Breakthrough, Transistone.
// Факты из игры (гайд outerpedia по снаряжению, таблицы breakLimits/enhance): Enhance +10 растит только main stat;
// Breakthrough T0→T4 даёт +5% к main stat за ступень и усиливает эффект — пассивку оружия и бонус сета; материал —
// такая же вещь (тот же грейд, эффект и слот; у брони — тот же сет) или Glunite. Transistone по гайду тратят только
// на Irregular и красную броню. Когда и сколько Reforge — решение игрока: как он ляжет, не угадать, после него вещь
// вводят заново (решение владельца 2026-10-01).
import { isArmor, SLOT } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import { buildsOf, combosWith } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import type { ItemInput, Verdict } from './verdict';

export function upgradePlan(ctx: Ctx, s: ItemInput, res: Verdict): string[] {
  const { idx, t } = ctx;
  const P = t.plan;
  const epic = s.grade === 'rare';
  const armor = isArmor(s.slot);
  const set = armor && s.setId ? idx.SET[s.setId] : undefined;
  const item = !armor && s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  const piece = SLOT[s.slot].game ?? '';

  switch (res.v) {
    case 'keep': {
      const out = [P.enhance];
      if (set) out.push(epic ? P.btArmorEpic(piece, set.short) : P.btArmorLegend(piece, set.short));
      else if (item) out.push(P.btGear(item.name));
      if (epic) out.push(P.noTransistone);
      return out;
    }
    case 'temp':
      return [P.enhance, P.tempNoInvest];
    case 'fodder':
      if (set) return [P.fodderArmor(piece, set.short)];
      return item ? [P.fodderGear(item.name)] : [];
    case 'junk':
      // Epic-броня сета, который носят твои персонажи: пригодится как ступень Breakthrough такой же Epic-вещи
      if (set && epic && buildsOf(idx, (b) => combosWith(b, set.id).length).some((x) => ctx.inScope(x.c))) return [P.junkEpicArmor(piece, set.short)];
      return [];
    default:
      return [];
  }
}
