// Штамп по вещам персонажей (пул, GEARPOOL; сравнение — logic/pool).
//   Такая же вещь уже в пуле кого-то из данных, а её вердикт «Разобрать», «Фоддер» или «Спорно» — «Оставить»: в игре
//   она лежит в инвентаре, и разбор выбил бы её у персонажа.
//   «Оставить» или «Временно», а всем, кому вещь подходит по вердикту, она ничего не даёт (исходы «на уровне»,
//   «хуже»), — «Разобрать», у Legendary «Оставить» — «Фоддер» (у брони — если копишь фоддер): вещь неплохая, но никого
//   не улучшит. Нужна она и тем, кого нет в ростере, — строка, кому.
// Понижаем осторожно: разбор не вернуть (решения владельца).
//   - Только когда введены все сабстаты.
//   - Персонаж без вещей — как раздетый: вещь ему пригодится.
//   - Считаются собираемые варианты («Собираю», примерка, начатые — Р14, «По статам», пока он живой) и
//     те, что вещь начнёт и сразу соберёт.
//   - Держат: соберёт, ближе к сборке, пустой слот, лучше, «ломает сет» и «на уровне из-за T4», когда по сегментам
//     лучше; другая рекомендованная пассивка; у оружия и аксессуара — «прочее» в слоте.
//   - «Только статы» (вещь не из связки, лучше по статам) не решает ни в какую сторону: не держит и не понижает —
//     как B3, который вещь не из связки не сравнивал (находка 7). Тихая строка «По статам» (он не живой, Р12) — тоже.
//   - Вещь — материал и лучше такой же у кого-то — не понижаем: её надевают (logic/material).
// «Спорно» (хороша для тех, кого нет в ростере) не понижаем. Материал Breakthrough поднимет «Разобрать» обратно
// до «Фоддер» со строкой, для чего (logic/material). Кубик не обещает 4-е, после которых вещь понизило бы.
import { isArmor } from '../data';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import { evaluate } from './evaluate';
import { samePiece } from './gear';
import { upgradePlan } from './plan';
import { holds, outcomeFor, type Outcome, type PoolView } from './pool';
import { dropSubs } from './subs';
import { namesLine } from './text';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import { buildOfKey } from './variants';

// у кого из персонажей данных в пуле такая же вещь
export function homeOf(ctx: Ctx, view: PoolView, item: ItemInput): string[] {
  return Object.keys(view.st.pools).filter((id) => ctx.idx.CHAR[id] && view.st.pools[id].some((pid) => {
    const p = view.st.pieces[pid];
    return p && samePiece(item, p);
  }));
}

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
    // варианты, которые вещь только начнёт, держат, лишь если она их соберёт (design-final D.4): собранного в Pen
    // Speed-шлем не держит — начни Speed, и его пустые слоты вещь удержат. «Только статы» — мимо решения (находка 7):
    // иначе вещь лучше по статам получила бы штамп хуже, чем слабая, не давшая ни одного исхода. Тихая «По статам» —
    // тоже мимо (Р12; без явного выбора её и нет)
    rows.push(...o.rows.filter((r) => r.kind !== 'stats' && !r.quiet && (!r.entering || r.kind === 'completes')));
  }
  return rows.length && !rows.some(holds) ? rows : null;
}

// Кубик (logic/gamble) считает удачные 4-е без пула. Удачный 4-й, после которого вещь понизило бы, — не удача:
// «Оставить» снова станет «Разобрать», а Reforge потрачен. Такие из кубика убираем; не осталось — кубика нет
function withDice(ctx: Ctx, view: PoolView, item: ItemInput, res: Verdict): Verdict {
  const g = res.gamble;
  if (!g) return res;
  const lowered = (key: string, n: number) => {
    const lucky = { ...item, subs: { ...item.subs, [key]: n } };
    return !!lowerBy(ctx, view, lucky, evaluate(ctx, lucky, { gamble: false }));
  };
  const hits = g.hits.filter((h) => !lowered(h.key, 1));
  const near = g.near.filter((x) => !lowered(x.key, 2));
  if (hits.length === g.hits.length && near.length === g.near.length) return res;
  const out: Verdict = { ...res, gamble: hits.length ? { ...g, hits, near, target: hits[0].v } : null };
  return { ...out, plan: upgradePlan(ctx, item, out) };
}

// «Caren · Speed»: персонаж и билд (родитель варианта)
export const whoOfKey = (ctx: Ctx, key: string): string => {
  const id = key.slice(0, key.indexOf('/'));
  return `${ctx.idx.CHAR[id]?.name ?? id} · ${buildOfKey(key, ctx.t.ui.byStats)}`;
};

// hold — не понижать: вещь — материал Breakthrough для такой же у кого-то и лучше неё (logic/material, betterThanWorn) —
// совет «надень её, старую — ей в Breakthrough», а не «никого не улучшит». Примерка — уже в view (poolView tryOn)
export interface WornOpts { hold?: boolean }

export function withWorn(ctx: Ctx, view: PoolView, item: ItemInput, res: Verdict, opts: WornOpts = {}): Verdict {
  if (res.v === 'idle' || !Object.keys(view.st.pools).length) return res;
  const W = ctx.t.worn;
  const home = homeOf(ctx, view, item);
  if (home.length) {
    if (res.v !== 'junk' && res.v !== 'fodder' && res.v !== 'maybe') return res;
    const who = ctx.idx.CHAR[home[0]].name + (home.length > 1 ? ctx.t.more(home.length - 1) : '');
    // кубик и «Прокачка» были про вещь «в разбор» — у вещи персонажа их нет
    return { ...res, v: 'keep', worn: 'home', badge: '', gamble: null, title: W.keptTitle(who), lines: [W.kept(who)], plan: [] };
  }
  if (opts.hold) return res;
  const rows = lowerBy(ctx, view, item, res);
  if (!rows) return withDice(ctx, view, item, res);
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
    ...res, v, worn: 'lower', wornBy: rows.map((r) => r.v.key), badge: '', roll: undefined, gamble: null,
    title: W.title(v, who.map((c) => c.name), rows.some((r) => r.kind !== 'down')),
    lines: [W.line, W.stale, ...also, ...res.lines.slice(0, 1)],
  };
  return { ...low, plan: upgradePlan(ctx, item, low) };
}
