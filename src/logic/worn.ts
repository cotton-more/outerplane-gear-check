// Штамп по тому, что надето (logic/gear, этап B3). Само сравнение с надетым — logic/vs.
//   Вещь уже в билде, а её вердикт «Разобрать», «Фоддер» или «Спорно» — «Оставить»: в игре она может лежать
//   в инвентаре (как в пресете экипировки), и разбор выбил бы её из собранного билда.
//   «Оставить» или «Временно», а всем, кому вещь подходит по вердикту, уже надето не хуже (на уровне или ▼), —
//   «Разобрать», у Legendary «Оставить» — «Фоддер» (у брони — если копишь фоддер): вещь неплохая, но никого не
//   улучшит. Нужна она и тем, кого нет в ростере, — строка, кому.
// Понижаем осторожно: разбор не вернуть (решения владельца).
//   - Только когда введены все сабстаты.
//   - Персонаж без записей — как раздетый: вещь ему пригодится.
//   - Считаются только начатые билды (хоть одна вещь). Персонажа, которого собираешь в Speed, вещь для High Crit
//     не держит; нужен второй билд — начни его собирать, и его пустые слоты вещь удержат.
//   - Пустой слот, надетая не по билду и сама эта вещь на ком-то — не понижаем. Билд примерки — начатый, даже пустой.
//   - Вещь — материал и лучше такой же надетой у кого-то — не понижаем: её надевают (logic/material).
//   - 2+2 сломается, а по сегментам новая лучше — не понижаем: может, стоит переставить сеты. Так же — «на уровне»
//     только из-за T4 у надетой и оружие с другой рекомендованной пассивкой.
// «Спорно» (хороша для тех, кого нет в ростере) не понижаем. Материал Breakthrough поднимет «Разобрать» обратно
// до «Фоддер» со строкой, для чего (logic/material). Кубик не обещает 4-е, после которых вещь понизило бы надетое.
import { isArmor } from '../data';
import { uniqChars } from './builds';
import type { Ctx } from './context';
import { evaluate } from './evaluate';
import { pieceInput, samePiece, usedIn, type GearStore } from './gear';
import { upgradePlan } from './plan';
import { dropSubs } from './subs';
import { namesLine } from './text';
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

// сравнение не в пользу новой: надета вещь по билду, и новая не лучше — на уровне, ▼; 2+2 — и по сегментам не лучше.
//   - «На уровне» из-за ограничения T4 (Speed ×2 у надетой на T4, logic/vs) — не «не лучше»: по сегментам новая
//     лучше и после своего Breakthrough обгонит надетую. Такое «на уровне» — единственное с разницей от MARGIN.
//   - Оружие или аксессуар с другой пассивкой, обе рекомендованные, — сабстаты не решают, какая лучше (решает билд).
function notBetter(ctx: Ctx, vs: Vs): boolean {
  if (!vs.worn || !fits(ctx, vs.b, pieceInput(vs.worn))) return false;
  if (vs.passive && !vs.why) return false;
  return vs.kind === 'down' || ((vs.kind === 'eq' || vs.kind === 'breaks') && (vs.delta ?? 0) < MARGIN);
}

// сравнения, по которым штамп понижается, или null. Кандидаты — первая открытая секция вердикта (кому вещь подходит).
// Вещь введена не вся — не понижаем: без остальных сабстатов её ценность занижена, а на телефоне «Разобрать» встаёт
// карточкой на место сетки, и досчитать было бы нечем (до B3 раннее «Разобрать» было окончательным)
function lowerBy(ctx: Ctx, gear: GearStore, item: ItemInput, res: Verdict, tryOn?: string | null): Vs[] | null {
  if (res.v !== 'keep' && res.v !== 'temp') return null;
  if (Object.keys(item.subs).length < dropSubs(item.grade)) return null;
  // билд примерки — начатый, даже пустой: его собирают прямо сейчас, пустой слот в нём держит штамп
  const st = tryOn && !gear.builds[tryOn] ? { ...gear, builds: { ...gear.builds, [tryOn]: { slots: {}, at: '' } } } : gear;
  const top = bestRow(res);
  const sec = top && res.sections.find((x) => x.rows[0] === top.row);
  if (!sec || uniqChars(sec.rows).some((c) => !inUse(st, c).length)) return null;
  // начатые билды кандидатов, куда вещь подходит; ни одного — её никто не собирает, понижать не по чему
  const vs = compareAll(ctx, st, item, res);
  return vs.length && vs.every((x) => notBetter(ctx, x)) ? vs : null;
}

// Кубик (logic/gamble) считает удачные 4-е без надетого. Удачный 4-й, после которого надетое вещь понизило бы, — не
// удача: «Оставить» снова станет «Разобрать», а Reforge потрачен. Такие из кубика убираем; не осталось — кубика нет
function withDice(ctx: Ctx, st: GearStore, item: ItemInput, res: Verdict, tryOn?: string | null): Verdict {
  const g = res.gamble;
  if (!g) return res;
  const lowered = (key: string, n: number) => {
    const lucky = { ...item, subs: { ...item.subs, [key]: n } };
    return !!lowerBy(ctx, st, lucky, evaluate(ctx, lucky, { gamble: false }), tryOn);
  };
  const hits = g.hits.filter((h) => !lowered(h.key, 1));
  const near = g.near.filter((x) => !lowered(x.key, 2));
  if (hits.length === g.hits.length && near.length === g.near.length) return res;
  const out: Verdict = { ...res, gamble: hits.length ? { ...g, hits, near, target: hits[0].v } : null };
  return { ...out, plan: upgradePlan(ctx, item, out) };
}

const whoOf = (ctx: Ctx, key: string) => {
  const id = key.slice(0, key.indexOf('/'));
  return `${ctx.idx.CHAR[id]?.name ?? id} · ${key.slice(id.length + 1)}`;
};

// tryOn — билд примерки («персонаж/билд»): он считается начатым, даже пустой (решение владельца).
// hold — не понижать: вещь — материал Breakthrough для такой же надетой у кого-то и лучше неё (logic/material,
//   betterThanWorn) — совет «надень её, старую — ей в Breakthrough», а не «никого не улучшит»
export interface WornOpts { tryOn?: string | null; hold?: boolean }

export function withWorn(ctx: Ctx, st: GearStore, item: ItemInput, res: Verdict, opts: WornOpts = {}): Verdict {
  if (res.v === 'idle' || !Object.keys(st.builds).length) return res;
  const W = ctx.t.worn;
  const home = homeOf(ctx, st, item);
  if (home.length) {
    if (res.v !== 'junk' && res.v !== 'fodder' && res.v !== 'maybe') return res;
    const who = whoOf(ctx, home[0]) + (home.length > 1 ? ctx.t.more(home.length - 1) : '');
    // кубик и «Прокачка» были про вещь «в разбор» — у вещи из билда их нет
    return { ...res, v: 'keep', worn: 'home', badge: '', gamble: null, title: W.keptTitle(who), lines: [W.kept(who)], plan: [] };
  }
  if (opts.hold) return res;
  const vs = lowerBy(ctx, st, item, res, opts.tryOn);
  if (!vs) return withDice(ctx, st, item, res, opts.tryOn);
  // «Фоддер» — материал для такой же вещи: у брони, если копишь фоддер, и у предмета из списков билдов. Legendary-оружие
  // «на замену» (его пассивки в билдах ростера нет) — «Разобрать», как evalGear поступает со слабой заменой
  const armor = isArmor(item.slot);
  const v = res.v === 'keep' && item.grade === 'unique' && (!armor || ctx.settings.fodder) ? 'fodder' : 'junk';
  // кубик обещал бы «Оставить», которое снова понизится; ролл и «стоит Reforge» — не для вещи в разбор.
  // Вещь нужна и тем, кого нет в ростере, — сказать, как у «Спорно» (решение владельца: штамп тот же, но не молча).
  // У «Временно» оружия evalGear уже поставил эту строку первой — она останется ниже.
  // Из прежних строк — первая: кому и чем вещь хороша («сама по себе неплохая»)
  const who = uniqChars(vs);
  const others = res.othersKeep ?? [];
  const names = namesLine(others, ctx.t.more, 4);
  const also = others.length && (armor || res.v === 'keep') ? [armor ? ctx.t.armor.maybeOthers(names) : ctx.t.gear.othersMain(names)] : [];
  const low: Verdict = {
    ...res, v, worn: 'lower', wornBy: vs.map((x) => x.key), badge: '', roll: undefined, gamble: null,
    title: W.title(v, who.map((c) => c.name), vs.some((x) => x.kind !== 'down')),
    lines: [W.line, W.stale, ...also, ...res.lines.slice(0, 1)],
  };
  return { ...low, plan: upgradePlan(ctx, item, low) };
}
