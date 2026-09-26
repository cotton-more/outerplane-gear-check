// «Прокачка»: что вкладывать в предмет после вердикта — Enhance, Reforge, Breakthrough, Transistone.
// Факты из игры (гайд outerpedia по снаряжению, таблицы breakLimits/enhance): Enhance +10 растит только main stat;
// Reforge у 6★ — 6 попыток, у Epic первая добавляет 4-й сабстат; Breakthrough T0→T4 даёт +5% к main stat
// за ступень и усиливает эффект — пассивку оружия и бонус сета; материал — такая же вещь (тот же грейд, эффект
// и слот; у брони — тот же сет) или Glunite. Transistone по гайду тратят только на Irregular и красную броню.
import { isArmor, SLOT } from '../data';
import type { GearKind } from '../data/types';
import { buildsOf, combosWith } from './builds';
import type { Ctx } from './context';
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
      // оружию и аксессуару со слабыми сабстатами сначала реролл (Precise Craft, Transistone), иначе сегменты уйдут в мусор
      const reforge = !res.roll ? P.reforgeUnknown
        : res.roll === 'high' ? P.reforgeFirst(epic)
        : res.roll === 'low' && !armor ? P.reforgeAfterReroll
        : P.reforgeLater(epic);
      const out = [P.enhance, reforge];
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
    case 'junk': {
      // Epic-броня сета, который носят твои персонажи: пригодится как ступень Breakthrough такой же Epic-вещи
      if (!set || !epic) return [];
      const worn = buildsOf(idx, (b) => combosWith(b, set.id).length).some((x) => ctx.inScope(x.c));
      return worn ? [P.junkEpicArmor(piece, set.short)] : [];
    }
    default:
      return [];
  }
}
