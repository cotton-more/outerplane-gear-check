// «Прокачка»: что вкладывать в предмет после вердикта — Enhance, Reforge, Breakthrough, Transistone.
// Факты из игры (гайд outerpedia по снаряжению, таблицы breakLimits/enhance): Enhance +10 растит только main stat;
// Reforge у 6★ — 6 попыток, у Epic первая добавляет 4-й сабстат; Breakthrough T0→T4 даёт +5% к main stat
// за ступень и усиливает эффект — пассивку оружия и бонус сета; материал — такая же вещь (тот же грейд, эффект
// и слот; у брони — тот же сет) или Glunite. Transistone по гайду тратят только на Irregular и красную броню.
import { isArmor, SLOT } from '../data';
import type { GearKind } from '../data/types';
import { buildsOf, combosWith } from './builds';
import type { Ctx } from './context';
import { MAX_SUBS } from './subs';
import type { ItemInput, Verdict } from './verdict';

export function upgradePlan(ctx: Ctx, s: ItemInput, res: Verdict): string[] {
  const { idx, t } = ctx;
  const P = t.plan;
  const epic = s.grade === 'rare';
  const armor = isArmor(s.slot);
  const set = armor && s.setId ? idx.SET[s.setId] : undefined;
  const item = !armor && s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  const piece = SLOT[s.slot].game ?? '';
  // Reforge у Epic: первый добавляет 4-й сабстат. Есть 4-й — одна попытка из 6 уже потрачена (сколько ещё — не знаем)
  const has4th = Object.keys(s.subs).length >= MAX_SUBS;
  const stage = !epic ? null : has4th ? 'started' : 'adds';
  // кубик (logic/gamble): какой 4-й от первого Reforge вытянет вещь — строка «сыграть одним Reforge»
  // какие статы и кому — в блоке «Один Reforge на удачу» над «Прокачкой»; здесь — только что вложить
  const g = res.gamble;

  switch (res.v) {
    case 'keep': {
      // оружию и аксессуару со слабыми сабстатами сначала реролл (Precise Craft, Transistone), иначе сегменты уйдут в мусор
      const reforge = !res.roll ? P.reforgeUnknown
        : res.roll === 'high' ? P.reforgeFirst(stage)
        : res.roll === 'low' && !armor ? P.reforgeAfterReroll
        : P.reforgeLater(stage);
      const out = [P.enhance, reforge];
      if (set) out.push(epic ? P.btArmorEpic(piece, set.short) : P.btArmorLegend(piece, set.short));
      else if (item) out.push(P.btGear(item.name));
      if (epic) out.push(P.noTransistone(has4th));
      return out;
    }
    case 'temp': {
      if (g) return [P.enhance, P.gamble('temp')];
      // оружие и аксессуар на замену с высоким роллом: Reforge можно — нужную Legendary (пассивка, main и сабстаты
      // сразу) можно ждать долго; Breakthrough — нет. Ролл так и говорит: «высокий, стоит вкладываться в Reforge»
      if (!armor && res.roll === 'high') return [P.enhance, P.reforgeTemp(stage), P.noBreakTemp];
      return [P.enhance, P.tempNoInvest];
    }
    case 'fodder':
      if (set) return [P.fodderArmor(piece, set.short)];
      return item ? [P.fodderGear(item.name)] : [];
    case 'junk': {
      const out = g ? [P.gamble('junk')] : [];
      // Epic-броня сета, который носят твои персонажи: пригодится как ступень Breakthrough такой же Epic-вещи
      if (set && epic && buildsOf(idx, (b) => combosWith(b, set.id).length).some((x) => ctx.inScope(x.c))) out.push(P.junkEpicArmor(piece, set.short));
      return out;
    }
    case 'maybe':
      return g ? [P.gamble('maybe')] : [];
    default:
      return [];
  }
}
