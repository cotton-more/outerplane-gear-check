// Штамп по тому, что надето (logic/gear, этап B3). Само сравнение с надетым — logic/vs.
//   Вещь уже в билде, а её вердикт «Разобрать», «Фоддер» или «Спорно» — «Оставить»: в игре она может лежать
//   в инвентаре (как в пресете экипировки), и разбор выбил бы её из собранного билда.
//   «Оставить» или «Временно», а всем, кому вещь подходит по вердикту, уже надето не хуже (на уровне или ▼), —
//   «Разобрать», у Legendary — «Фоддер» (у брони — если копишь фоддер): вещь неплохая, но никого не улучшит.
// Понижаем осторожно: разбор не вернуть (решения владельца).
//   - Персонаж без записей — как раздетый: вещь ему пригодится.
//   - Считаются только начатые билды (хоть одна вещь). Персонажа, которого собираешь в Speed, вещь для High Crit
//     не держит; нужен второй билд — начни его собирать, и его пустые слоты вещь удержат.
//   - Пустой слот, надетая не по билду и сама эта вещь на ком-то — не понижаем.
//   - 2+2 сломается, а по сегментам новая лучше — не понижаем: может, стоит переставить сеты.
// «Спорно» (хороша для тех, кого нет в ростере) не понижаем. Материал Breakthrough поднимет «Разобрать» обратно
// до «Фоддер» со строкой, для чего (logic/material).
import { isArmor } from '../data';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import { pieceInput, samePiece, usedIn, type GearStore } from './gear';
import { upgradePlan } from './plan';
import { bestRow, type ItemInput, type Verdict } from './verdict';
import { compareAll, fits, inUse, MARGIN, type Vs } from './vs';

// билды («персонаж/билд»), где записана эта самая вещь; персонажей, которых нет в данных, пропускаем
export function homeOf(ctx: Ctx, st: GearStore, item: ItemInput): string[] {
  const out: string[] = [];
  for (const p of Object.values(st.pieces)) {
    if (!samePiece(item, p)) continue;
    for (const k of usedIn(st, p.id)) if (ctx.idx.CHAR[k.slice(0, k.indexOf('/'))]) out.push(k);
  }
  return out;
}

// сравнение не в пользу новой: надета вещь по билду, и новая не лучше — на уровне, ▼; 2+2 — и по сегментам не лучше
function notBetter(ctx: Ctx, vs: Vs): boolean {
  if (!vs.worn || !fits(ctx, vs.b, pieceInput(vs.worn))) return false;
  return vs.kind === 'eq' || vs.kind === 'down' || (vs.kind === 'breaks' && (vs.delta ?? 0) < MARGIN);
}

// сравнения, по которым штамп понижается, или null. Кандидаты — первая открытая секция вердикта (кому вещь подходит)
function lowerBy(ctx: Ctx, st: GearStore, item: ItemInput, res: Verdict): Vs[] | null {
  if (res.v !== 'keep' && res.v !== 'temp') return null;
  const top = bestRow(res);
  const sec = top && res.sections.find((x) => x.rows[0] === top.row);
  if (!sec || uniqChars(sec.rows).some((c) => !inUse(st, c).length)) return null;
  // начатые билды кандидатов, куда вещь подходит; ни одного — её никто не собирает, понижать не по чему
  const vs = compareAll(ctx, st, item, res);
  return vs.length && vs.every((x) => notBetter(ctx, x)) ? vs : null;
}

const whoOf = (ctx: Ctx, key: string) => {
  const id = key.slice(0, key.indexOf('/'));
  return `${ctx.idx.CHAR[id]?.name ?? id} · ${key.slice(id.length + 1)}`;
};

export function withWorn(ctx: Ctx, st: GearStore, item: ItemInput, res: Verdict): Verdict {
  if (res.v === 'idle' || !Object.keys(st.builds).length) return res;
  const W = ctx.t.worn;
  const home = homeOf(ctx, st, item);
  if (home.length) {
    if (res.v !== 'junk' && res.v !== 'fodder' && res.v !== 'maybe') return res;
    const who = whoOf(ctx, home[0]) + (home.length > 1 ? ctx.t.more(home.length - 1) : '');
    // кубик и «Прокачка» были про вещь «в разбор» — у вещи из билда их нет
    return { ...res, v: 'keep', worn: 'home', badge: '', gamble: null, title: W.keptTitle(who), lines: [W.kept(who)], plan: [] };
  }
  const vs = lowerBy(ctx, st, item, res);
  if (!vs) return res;
  const v = item.grade === 'unique' && (!isArmor(item.slot) || ctx.settings.fodder) ? 'fodder' : 'junk';
  // кубик обещал бы «Оставить», которое снова понизится; ролл и «стоит Reforge» — не для вещи в разбор.
  // Из прежних строк — первая: кому и чем вещь хороша («сама по себе неплохая»)
  const who = uniqChars(vs);
  const low: Verdict = {
    ...res, v, worn: 'lower', wornBy: vs.map((x) => x.key), badge: '', roll: undefined, gamble: null,
    title: W.title(v, who.map((c) => c.name), vs.some((x) => x.kind !== 'down')),
    lines: [W.line, W.stale, ...res.lines.slice(0, 1)],
  };
  return { ...low, plan: upgradePlan(ctx, item, low) };
}
