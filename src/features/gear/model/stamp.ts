// Штамп по вещам персонажей (пул, GEARPOOL; сравнение — features/gear/pool).
//   В Оценку вводят новую вещь из инвентаря, надетое в игре не оценивают (решение владельца 2026-10-01): «дома» нет —
//   такая же вещь, как запись, — новый дроп или снятая с героя (убрать её из пула — дело игрока) и сравнивается как есть.
//   «Оставить» или «Временно», а всем, кому вещь подходит по вердикту, она ничего не даёт (исходы «на уровне»,
//   «хуже»), — «Разобрать», у Legendary «Оставить» — «Фоддер» (у брони — если копишь фоддер): вещь неплохая, но никого
//   не улучшит. Нужна она и тем, кого нет в ростере, — строка, кому.
// Понижаем осторожно: разбор не вернуть (решения владельца).
//   - Вещи сравниваются как есть (Н3, features/gear/model/vs value): Reforge впереди не закладываем ни у новой, ни у вещей героя —
//     Reforge делают в игре, а сегменты записи правят в приложении.
//   - Только когда введены все сабстаты.
//   - Персонаж без вещей — как раздетый: вещь ему пригодится.
//   - Вещь кому-то из них начнёт билд — не понижаем (П1): у него «Надеть — начнёт …», штамп с кнопкой не спорит.
//   - Считаются собираемые варианты («Собираю», начатые — Р14, «По статам», пока он живой).
//   - Держат: соберёт, ближе к сборке, пустой слот, лучше, «ломает сет» и «на уровне из-за T4», когда по сегментам
//     лучше; другая рекомендованная пассивка; у оружия и аксессуара — «прочее» в слоте.
//   - «Только статы» (вещь не из связки, лучше по статам) не решает ни в какую сторону: не держит и не понижает —
//     как B3, который вещь не из связки не сравнивал (находка 7). Тихая строка «По статам» (он не живой, Р12) — тоже.
//   - Вещь — материал и лучше такой же у кого-то — не понижаем: её надевают (features/gear/model/material).
// «Спорно» (хороша для тех, кого нет в ростере) не понижаем. Материал Breakthrough поднимет «Разобрать» обратно
// до «Фоддер» со строкой, для чего (features/gear/model/material).
import { isArmor } from '@/game/data';
import { uniqChars } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import { upgradePlan } from '@/features/eval/verdict/upgrade';
import { holds, outcomeFor, type Outcome, type PoolView } from '@/features/gear/pool';
import { dropSubs } from '@/game/item/subs';
import { namesLine } from '@/game/text';
import { bestRow, type ItemInput, type Verdict } from '@/features/eval/verdict/verdict';

// исходы, по которым штамп понижается, или null. Кандидаты — первая открытая секция вердикта (кому вещь подходит).
// Вещь введена не вся — не понижаем: без остальных сабстатов её ценность занижена
function lowerBy(ctx: Ctx, view: PoolView, item: ItemInput, res: Verdict): Outcome[] | null {
  if (res.v !== 'keep' && res.v !== 'temp') return null;
  if (Object.keys(item.subs).length < dropSubs(item.grade)) return null;
  const top = bestRow(res);
  const sec = top && res.sections.find((x) => x.rows[0] === top.row);
  if (!sec) return null;
  const rows: Outcome[] = [];
  for (const c of uniqChars(sec.rows)) {
    const o = outcomeFor(ctx, view, c.id, item);
    if (!o || !view.of(c.id)!.pieces.length) return null; // без вещей — как раздетый: пригодится
    // начнёт ему билд — не понижаем (П1, вместо design-final D.4 «начнёт держит, лишь если соберёт»): иначе рядом со
    // штампом «Фоддер — уже не хуже» — «Надеть — начнёт …» (poolVs, Р4), а разбор не вернуть. Дальше строк «вход» нет
    if (o.starts.length) return null;
    // «Только статы» — мимо решения (находка 7): иначе вещь лучше по статам получила бы штамп хуже, чем слабая, не
    // давшая ни одного исхода. Тихая «По статам» — тоже мимо (Р12; без явного выбора её и нет)
    rows.push(...o.rows.filter((r) => r.kind !== 'stats' && !r.quiet));
  }
  return rows.length && !rows.some(holds) ? rows : null;
}

// hold — не понижать: вещь — материал Breakthrough для такой же у кого-то и лучше неё (features/gear/model/material, betterThanWorn) —
// совет «надень её, старую — ей в Breakthrough», а не «никого не улучшит».
export interface WornOpts { hold?: boolean }

export function withWorn(ctx: Ctx, view: PoolView, item: ItemInput, res: Verdict, opts: WornOpts = {}): Verdict {
  if (res.v === 'idle' || !Object.keys(view.st.pools).length) return res;
  const W = ctx.t.worn;
  if (opts.hold) return res;
  const rows = lowerBy(ctx, view, item, res);
  if (!rows) return res;
  // «Фоддер» — материал для такой же вещи: у брони, если копишь фоддер, и у предмета из списков билдов. Legendary-оружие
  // «на замену» (его пассивки в билдах ростера нет) — «Разобрать», как evalGear поступает со слабой заменой
  const armor = isArmor(item.slot);
  const v = res.v === 'keep' && item.grade === 'unique' && (!armor || ctx.settings.fodder) ? 'fodder' : 'junk';
  // Вещь нужна и тем, кого нет в ростере, — сказать, как у «Спорно» (решение владельца: штамп тот же, но не молча).
  // Из прежних строк — первая: кому и чем вещь хороша («сама по себе неплохая»)
  const who = [...new Map(rows.map((r) => [r.v.key.slice(0, r.v.key.indexOf('/')), ctx.idx.CHAR[r.v.key.slice(0, r.v.key.indexOf('/'))]])).values()].filter(Boolean);
  const others = res.othersKeep ?? [];
  const names = namesLine(others, ctx.t.more, 4);
  const also = others.length && (armor || res.v === 'keep') ? [armor ? ctx.t.armor.maybeOthers(names) : ctx.t.gear.othersMain(names)] : [];
  const low: Verdict = {
    ...res, v, worn: 'lower', wornBy: rows.map((r) => r.v.key),
    title: W.title(v, who.map((c) => c.name), rows.some((r) => r.kind !== 'down')),
    lines: [W.line, W.stale, ...also, ...res.lines.slice(0, 1)],
  };
  return { ...low, plan: upgradePlan(ctx, item, low) };
}
