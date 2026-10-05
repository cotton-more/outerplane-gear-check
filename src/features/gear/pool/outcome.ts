// Пул экипировки, исход вещи с формы — что станет с каждым собираемым вариантом, если её добавить. Обзор и решения — index.ts.
import { isArmor } from '@/game/data';
import type { ArmorSlot, Char, SetPiece } from '@/game/data/types';
import { t4Only } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import { bonusRows, bonusSegments, bonusValue, type BonusRow } from '@/game/set/setBonus';
import type { ItemInput } from '@/game/item/item';
import type { Variant } from '@/game/build/variants';
import { against, MARGIN, wearable, type Pair } from '@/features/gear/model/vs';
import { ARMOR, NEWEST, EPS, LOST_MIN } from './base';
import { isStats } from './stats';
import { vc, entriesFor, combo, armorScore, assemble, type Entry, type Assembly, type VCache } from './assemble';
import { play } from './play';
import type { PoolView } from './view';

export type OutcomeKind = 'completes' | 'closer' | 'fill' | 'up' | 'eq' | 'breaks' | 'capped' | 'stats' | 'down';
export const OUTCOME_ORDER: OutcomeKind[] = ['completes', 'closer', 'up', 'fill', 'capped', 'breaks', 'eq', 'down', 'stats'];

export interface Outcome {
  v: Variant;
  kind: OutcomeKind;
  used: boolean;              // вещь встала в сборку (A1)
  delta: number | null;       // выигрыш итога к ценности вытесненного; без вещи в сборке — к вещи в её слоте
  pair: Pair | null;          // против вещи в её слоте (как в сравнении с надетым): места цепочки, материал, пассивка;
                              // П7 — против вещи пула её сета и слота не хуже (rivalOf)
  worn: Entry | null;         // что сейчас в её слоте; П7 — та вещь пула
  displaced: Entry[];         // что уходит из сборки
  broken: string | null;      // сет, который распадётся: в «ломает» — поэтому не встала; в «лучше» — распадётся, но выгодно
  // «ломает»: ещё одна вещь этого сета в эти слоты — встанет; mark — не новая вещь, а Breakthrough T4 у вещей сета
  // из пула не на T4 (slots — где они, одна или две, по порядку слотов; Р20, Pen mix — Р2).
  // Совет даётся, только если после него у новой «Надеть» (П2). make — у отмечаемых известен Breakthrough 0–3:
  // «сделать», не «отметить» (П5, Р20 (б)). pieces — что отметить, по slots; which — по slots: вещь, которую назвать
  // сабстатами, — в её слоте есть другая, которой совет может касаться, и с ней «Надеть» нет (П6); null — не нужно
  fix: { set: string; slots: ArmorSlot[]; t4: boolean; mark: boolean; make: boolean; pieces: Piece[]; which: (Piece | null)[] } | null;
  t4: { set: string; n: number } | null; // часть её сета в связке — с бонусом только на T4
  part: SetPiece | null;      // часть связки варианта, в которую идёт её сет (null — сет не из связки, оружие)
  surplus: boolean;           // «пустой слот» сверх собранной части её сета
  lostEmpty: boolean;         // встала, а вытесненное (вещи и бонусы) ничего не стоило: процент бессмыслен, как wornEmpty
  brokenSegs: number | null;  // сегменты бонуса распавшегося сета (сет-стат), для строки «−N сегмента»
  gainedBonus: BonusRow[];
  lostBonus: BonusRow[];
  before: Assembly;
  after: Assembly;            // с ней (A1) или с ней насильно (Af)
  entering: boolean;          // вариант не собирается, а с ней начнёт
  quiet: boolean;             // строка «По статам», который не живой (Р12): штамп не держит, в понижении не участвует;
                              // есть только при явном выборе (outcomeFor explicit)
}

export interface CharOutcome {
  c: Char;
  rows: Outcome[];
  starts: Variant[];  // с ней начнут собираться
  useful: boolean;    // надеть можно (puts): исход держит и она в нём встаёт или начнёт новый билд; при явном выборе —
                      // и тихая строка «По статам», где она встаёт с исходом «пустой слот» или «лучше» (Р11)
}

export const rowKey = (r: BonusRow) => `${r.set}:${r.n}:${r.tier}`;
const hs = (a: Pick<Assembly, 'hard' | 'live' | 'soft'>, z: Pick<Assembly, 'hard' | 'live' | 'soft'>) =>
  a.hard !== z.hard ? a.hard - z.hard : a.live !== z.live ? a.live - z.live : a.soft - z.soft;
const byDelta = (d: number | null): OutcomeKind => ((d ?? 0) <= -MARGIN ? 'down' : 'eq');

// сет, чья часть убыла (сначала части связки, потом случайные сеты)
function brokenSet(v: Variant, a: Assembly, z: Assembly): string | null {
  const cnt = (s: Assembly, set: string) => ARMOR.filter((slot) => s.slots[slot]?.setId === set).length;
  for (const p of combo(v)) if (Math.min(cnt(z, p.set), p.n) < Math.min(cnt(a, p.set), p.n)) return p.set;
  for (const r of a.bonuses) if (cnt(z, r.set) < cnt(a, r.set)) return r.set;
  return null;
}

// П2: совет ведёт к «Надеть» — на пуле после совета (отмеченные на T4, найденная вещь) исход новой держит штамп и она
// в нём встаёт (puts; у тихой строки «По статам» «Надеть» — то же: holdsKind и used)
function putsOn(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput): boolean {
  const after = assemble(ctx, c, v, entriesFor(ctx, c, v, pieces, x));
  if (after.slots[x.slot]?.id !== null) return false;
  const o = outcomeOf(ctx, c, v, pieces, x, assemble(ctx, c, v, entriesFor(ctx, c, v, pieces)), false, after);
  return !!o && o.used && holdsKind(o);
}

// «ломает»: куда ещё одна вещь распавшегося сета вернула бы его (и нужна ли она на T4). «Найди ещё …» (и «… на T4») —
// только в слоты, где после этого у новой «Надеть» (П2; без T4 — решение владельца 2026-10-01): найденная — та же вещь,
// что в проверке раскладки (сета, без сабстатов: «Надеть» даёт даже пустая найденная — заслуга самой новой; Breakthrough
// — T4 или не указан, то есть не T4), — в пул, и исход новой по нему. Нет слотов без T4 — пробуем на T4. Своя
// вещь слота, сделанная T4, не в счёт: текст — «найдёшь ещё»
function fixFor(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, forced: Assembly, was: Assembly, set: string): Outcome['fix'] {
  const xSlot = x.slot;
  for (const t4 of [false, true]) {
    const slots = ARMOR.filter((slot) => {
      if (slot === xSlot) return false;
      const ghost: Entry = { id: '#fix', piece: null, input: { slot, grade: 'unique', setId: set, itemKey: null, main: null, subs: {} }, slot, setId: set, bt: t4 ? 4 : null, num: NEWEST, v: 0, fit: 'rec' };
      const arm = ARMOR.map((s) => (s === slot ? ghost : forced.slots[s] ?? null));
      const s = armorScore(ctx, c, v, vc(ctx, c, v), arm);
      const rows = bonusRows(ctx.idx.SET, arm.filter((e): e is Entry => !!e)).map(rowKey);
      if (!(hs(s, was) >= 0 && was.bonuses.filter((r) => r.set === set).every((r) => rows.includes(rowKey(r))))) return false;
      const found: Piece = { id: '#fix', slot, grade: 'unique', setId: set, itemKey: null, main: null, yellow: {}, lit: {}, bt: t4 ? 4 : null, at: '' };
      return putsOn(ctx, c, v, [...pieces, found], x);
    });
    if (slots.length) return { set, slots, t4, mark: false, make: false, pieces: [], which: [] };
  }
  return null;
}

// Отметка T4 у вещей сета из пула (не в её слоте): самый короткий набор — одна вещь, потом две в разных слотах, — с
// которым у новой «Надеть» (П2). Проверяется исходом на пуле с отмеченными (bt: 4)
function markSome(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, set: string, open: readonly Piece[]): Outcome['fix'] {
  const fits = (marks: readonly Piece[]) => putsOn(ctx, c, v, pieces.map((p) => (marks.includes(p) ? { ...p, bt: 4 as const } : p)), x);
  // П6: сабстаты — когда в слоте есть другая вещь, которой совет может касаться («отметить» — сета без Breakthrough;
  // «сделать» — сета не на T4), и с ней вместо названной «Надеть» нет. Помогает любая — скобок не надо
  const fix = (marks: Piece[]): Outcome['fix'] => {
    const ms = marks.sort((a, z) => ARMOR.indexOf(a.slot as ArmorSlot) - ARMOR.indexOf(z.slot as ArmorSlot));
    const make = ms.some((p) => p.bt !== null);
    const named = (p: Piece) => pieces.some((q) => q !== p && q.setId === set && q.slot === p.slot && (make ? q.bt !== 4 : q.bt === null)
      && !fits(ms.map((m) => (m === p ? q : m))));
    return { set, slots: ms.map((p) => p.slot as ArmorSlot), t4: true, mark: true, make, pieces: ms, which: ms.map((p) => (named(p) ? p : null)) };
  };
  const one = open.find((a) => fits([a]));
  if (one) return fix([one]);
  // вопрос 5 (б), владелец 2026-10-01: пара одного вида — обе без Breakthrough («отметь»), потом обе 0–3 («сделай»);
  // смешанная («сделай» и у вещи без Breakthrough) — только если пары одного вида нет
  const kind = (a: Piece, b: Piece) => ((a.bt === null) === (b.bt === null) ? (a.bt === null ? 0 : 1) : 2);
  const pairs: [Piece, Piece][] = [];
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) if (open[i].slot !== open[j].slot) pairs.push([open[i], open[j]]);
  }
  for (const k of [0, 1, 2]) {
    const ab = pairs.find(([a, b]) => kind(a, b) === k && fits([a, b]));
    if (ab) return fix([...ab]);
  }
  return null;
}

// Р20: Breakthrough T4 у вещей распавшегося сета в пуле, которые не на T4 (не в её слоте), — если с ним у новой
// «Надеть» (П2); совет впереди «найди ещё». Не указан (bt: null, старая запись) — «отметь T4»; известен ниже T4 (0–3) —
// «сделать» (Р20 (б), как Pen mix — П5): что в пуле, то и в игре, это совет прокачки, а не «проверь, не забыл ли». При
// равной длине совета первыми — вещи без Breakthrough: «отметь» дешевле, чем «сделай»; пара — одного вида, смешанная
// — только если другой нет (вопрос 5 (б), markSome). Pen mix без двух T4 (Р2) — тот же совет: четыре Pen держат
// Pen ×4 на T0, и вещь другой части встаёт, только когда две Pen на T4. До Р20 (б) его давал отдельный markFor (после
// «найди ещё»; в переборе опровергателя — 565 советов из 1812 «ломает»); его набор вещей (сета, не на T4) входит в набор
// здесь, а успех markSome от порядка не зависит — он удалён, советы те же по длине
function markT4(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, set: string): Outcome['fix'] {
  const open = pieces.filter((p) => p.setId === set && isArmor(p.slot) && p.slot !== x.slot && p.bt !== 4);
  const unknownFirst = [...open.filter((p) => p.bt === null), ...open.filter((p) => p.bt !== null)];
  return open.length ? markSome(ctx, c, v, pieces, x, set, unknownFirst) : null;
}

// П7: вещь пула её сета и её слота, с которой новая не встанет ни при каких отметках, — лучшая по ценности, не
// дешевле новой. Замена новой на неё в любой раскладке счёт не ухудшает: сет и слот те же, ценность не меньше,
// старшинство выше (при равенстве остаётся старшая, NEWEST), а T4 у неё (или отметка T4) бонус сета только добавляет
// (bonusRows: строки T4 вместо T0 или сверху; бонус T4 в данных не меньше T0). Новая на T4 (с формы, ItemInput.bt) —
// соперник тоже только на T4: вещь не на T4 вместо неё бонус T4 сета теряет
function rivalOf(es: readonly Entry[], X: Entry): Entry | null {
  let best: Entry | null = null;
  for (const e of es) {
    if (!e.piece || e.slot !== X.slot || e.setId !== X.setId || e.v < X.v - EPS || (X.bt === 4 && e.bt !== 4)) continue;
    if (!best || e.v > best.v + EPS || (Math.abs(e.v - best.v) <= EPS && e.num < best.num)) best = e;
  }
  return best;
}

// Ценность бонусов, что пропали при «Надеть», — чистая убыль по сетам: ценность бонусов сета до минус после, если она
// убыла. Строки сета меняются, не пропадая целиком: Speed ×4 → ×3 при двух T4 — 4P T0 → 2P T4, потеря лишь разница;
// T4 новой — 4P T0 → 2P T4 + 4P T4 той же ценности, потери нет. Полные строки в знаменателе завышали цену замены (вещь
// «на уровне», где она «лучше», — ложное понижение). Вид исхода с T4 и на T0 может разойтись, когда раскладки разные
// (с T4 «на уровне» по паре или при двух вытесненных) — так и есть: штамп и «Надеть» от T4 не хуже (перебор шага 2)
export function lostBonusValue(ctx: Ctx, c: Char, W: VCache['W'], lostBonus: readonly BonusRow[], gainedBonus: readonly BonusRow[]): number {
  const by = new Map<string, number>();
  for (const r of lostBonus) by.set(r.set, (by.get(r.set) ?? 0) + bonusValue(ctx, c, W, r));
  for (const r of gainedBonus) by.set(r.set, (by.get(r.set) ?? 0) - bonusValue(ctx, c, W, r));
  return [...by.values()].reduce((s, d) => s + Math.max(0, d), 0);
}

// with_ — сборка с ней (play с вещью считает все варианты, «По статам» тоже)
function outcomeOf(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, before: Assembly, entering: boolean, with_: Assembly): Outcome | null {
  const es = entriesFor(ctx, c, v, pieces, x);
  const X = es[es.length - 1];
  const worn = before.slots[x.slot] ?? null;
  const pair = worn?.piece ? against(ctx, c, v.b, x, worn.piece, X.fit) : null;
  const part = combo(v).find((p) => p.set === x.setId);
  const t4 = part && t4Only(ctx.idx.SET[part.set], part.n) ? { set: part.set, n: part.n } : null;
  const offSet = isArmor(x.slot) ? !part : X.fit === 'no';
  const stats = isStats(v);
  // «По статам»: хлам — вещь без единого полезного ему сабстата (Р13), такая к нему не попадает и при явном выборе
  if (stats && X.v <= EPS) return null;
  // оружие не по билду — не кандидат (как в сравнении с надетым); в «По статам» — кандидат (допущение (а))
  if (!isArmor(x.slot) && X.fit === 'no' && !stats) return null;
  const after = with_;
  const base = { v, pair, worn, t4, part: part ?? null, before, entering, quiet: false, fix: null, surplus: false, lostEmpty: false, brokenSegs: null as number | null };
  const segsOf = (rows: BonusRow[], set: string | null) => {
    const r = rows.filter((x) => x.set === set).map((x) => bonusSegments(ctx, c, x.bon));
    return r.length && r.every((x) => x !== null) ? r.reduce((n, x) => n + x!, 0) : null;
  };
  const bonusDiff = (z: Assembly) => {
    const a = new Set(before.bonuses.map(rowKey)), b = new Set(z.bonuses.map(rowKey));
    return { gainedBonus: z.bonuses.filter((r) => !a.has(rowKey(r))), lostBonus: before.bonuses.filter((r) => !b.has(rowKey(r))) };
  };
  if (after.slots[x.slot]?.id === null) {
    const kept = new Set(Object.values(after.slots).map((e) => e?.id));
    const displaced = Object.values(before.slots).filter((e): e is Entry => !!e && !kept.has(e.id));
    const bd = bonusDiff(after);
    const x1 = vc(ctx, c, v);
    // знаменатель — ценность вытесненного: вещи и чистая убыль бонусов по сетам
    const lostValue = displaced.reduce((s, e) => s + e.v, 0) + lostBonusValue(ctx, c, x1.W, bd.lostBonus, bd.gainedBonus);
    const lost = displaced.length > 0 || bd.lostBonus.length > 0;
    const delta = lost ? (after.total - before.total) / Math.max(lostValue, LOST_MIN) : null;
    const lostEmpty = lost && lostValue < LOST_MIN && after.total - before.total > EPS;
    const done = new Set(before.complete.map((p) => p.set));
    const broken = before.complete.find((p) => !after.complete.some((q) => q.set === p.set))?.set ?? null;
    let kind: OutcomeKind;
    if (after.complete.some((p) => !done.has(p.set))) kind = 'completes';
    else if (hs(after, before) > 0) kind = 'closer';
    else if (!worn && !displaced.length) kind = 'fill';
    else if (pair?.why === 'rec') kind = 'up';
    else kind = (delta ?? 0) >= MARGIN ? 'up' : byDelta(delta);
    // броня не из связки, которая просто займёт пустой слот, — не исход: хлам к персонажу не попадает (решение 3),
    // в режиме героя это «не по билду». Встала на место другой с выигрышем — это «лучше». У «По статам» связки нет — там
    // хлам только вещь без полезных статов (Р13, выше)
    if (offSet && kind === 'fill' && !stats) return null;
    const surplus = kind === 'fill' && !!part && before.complete.some((p) => p.set === part.set);
    return { ...base, ...bd, kind, used: true, delta, displaced, broken, after, surplus, lostEmpty, brokenSegs: segsOf(bd.lostBonus, broken) };
  }
  // не встала: лучше ли она по сегментам вещи в своём слоте
  const d = pair?.delta ?? null;
  const betterBySegs = d !== null && d >= MARGIN;
  if (offSet) return betterBySegs ? { ...base, ...bonusDiff(before), kind: 'stats', used: false, delta: d, displaced: [], broken: null, after: before } : null;
  if (!isArmor(x.slot)) return { ...base, ...bonusDiff(before), kind: pair ? (pair.why === 'stopgap' ? 'down' : byDelta(d)) : 'eq', used: false, delta: d, displaced: [], broken: null, after: before };
  const forced = assemble(ctx, c, v, es, { force: X });
  const bd = bonusDiff(forced);
  const broken = brokenSet(v, before, forced);
  const kept = new Set(Object.values(forced.slots).map((e) => e?.id));
  const displaced = Object.values(before.slots).filter((e): e is Entry => !!e && !kept.has(e.id));
  const rest = { ...base, ...bd, used: false, delta: d, displaced, after: forced };
  if (broken) {
    if (!betterBySegs) return { ...rest, kind: byDelta(d), broken };
    // П7: в пуле уже есть вещь её сета в её слоте не хуже — исход по ней («на уровне» / «хуже»), не «ломает»: совет
    // ложный, штамп держать незачем
    const rival = rivalOf(es, X);
    if (rival) {
      const p = against(ctx, c, v.b, x, rival.piece!, X.fit);
      return { ...rest, kind: byDelta(p.delta), pair: p, worn: rival, delta: p.delta, broken };
    }
    const fix = markT4(ctx, c, v, pieces, x, broken) ?? fixFor(ctx, c, v, pieces, x, forced, before, broken);
    return { ...rest, kind: 'breaks', broken, fix, brokenSegs: segsOf(bd.lostBonus, broken) };
  }
  if (bd.lostBonus.some((r) => r.tier === 'T4')) return { ...rest, kind: betterBySegs ? 'capped' : byDelta(d), broken: null };
  return { ...rest, kind: byDelta(d), broken: null };
}

// Исход вещи с формы для персонажа: для каждого собираемого варианта и тех, что с ней начнут собираться.
// explicit — персонажа выбрал пользователь (поиск по имени в «Кому надеть?», режим героя): тогда и строка «По статам»,
// когда он не собирается (не живой, Р12), — тихая (quiet): до и после — его сборки без вещи и с ней. Без explicit
// тихих строк нет: они нужны только явному выбору (и так дешевле)
export interface OutcomeOpts { explicit?: boolean }

// Кэш исходов (находка 27): на одно нажатие один персонаж считается несколько раз — понижение (worn), «Сейчас на
// персонажах» (poolVs), материал (betterThanWorn), быстрый и полный вердикт. Живёт вместе с видом пула: новое хранилище,
// отметки — новый вид (poolView), кэш с ним. Ключ — (ctx, персонаж, explicit, JSON входа): вход — объект
// формы, его могут собрать заново или поменять на месте, поэтому по содержимому, не по ссылке (другой порядок полей —
// только промах). Результат общий: вызывающие его не меняют (фильтруют и сортируют копии). Последние OUTCOME_MEMO
// ключей: ввод на форме без «Надеть» не копит исходы
const OUTCOME_MEMO = 256;
const outcomeMemo = new WeakMap<PoolView, WeakMap<Ctx, Map<string, CharOutcome | null>>>();
export function outcomeFor(ctx: Ctx, view: PoolView, charId: string, x: ItemInput, opts: OutcomeOpts = {}): CharOutcome | null {
  let byCtx = outcomeMemo.get(view);
  if (!byCtx) outcomeMemo.set(view, (byCtx = new WeakMap()));
  let memo = byCtx.get(ctx);
  if (!memo) byCtx.set(ctx, (memo = new Map()));
  const key = `${charId}\u0000${opts.explicit ? 1 : 0}\u0000${JSON.stringify(x)}`;
  if (memo.has(key)) {
    const hit = memo.get(key)!;
    memo.delete(key);
    memo.set(key, hit); // свежий — в конец очереди
    return hit;
  }
  const r = computeOutcome(ctx, view, charId, x, opts);
  memo.set(key, r);
  if (memo.size > OUTCOME_MEMO) memo.delete(memo.keys().next().value!);
  return r;
}

function computeOutcome(ctx: Ctx, view: PoolView, charId: string, x: ItemInput, opts: OutcomeOpts): CharOutcome | null {
  const cp = view.of(charId);
  if (!cp) return null;
  const { c, pieces } = cp;
  // не для его класса (vs wearable) — ему ни к чему: ни строки, ни «По статам» при явном выборе, ни «начнёт»
  if (!wearable(ctx, c, x)) return null;
  const withX = play(ctx, c, pieces, cp.opts, x);
  const was = new Set(cp.inPlay.map((v) => v.key));
  const starts = withX.inPlay.filter((v) => !was.has(v.key) && !isStats(v));
  const quiet = opts.explicit && cp.stat && !was.has(cp.stat.key) ? cp.stat : null;
  const rows: Outcome[] = [];
  for (const v of [...cp.inPlay, ...starts, ...(quiet ? [quiet] : [])]) {
    // play собирает все варианты и «По статам» — сборки есть у всех строк (inPlay, starts, тихая)
    const o = outcomeOf(ctx, c, v, pieces, x, cp.asm.get(v.key)!, v !== quiet && !was.has(v.key), withX.asm.get(v.key)!);
    if (o) rows.push(v === quiet ? { ...o, quiet: true } : o);
  }
  rows.sort((a, z) => OUTCOME_ORDER.indexOf(a.kind) - OUTCOME_ORDER.indexOf(z.kind) || (z.delta ?? 0) - (a.delta ?? 0));
  const useful = rows.some((r) => (puts(r) && !r.entering) || (r.quiet && r.used && holdsKind(r))) || starts.length > 0;
  return { c, rows, starts, useful };
}

// Держит ли исход штамп (преемник worn.ts, C2): вещь кому-то нужна. «Ломает» и «на уровне из-за T4» — только когда
// она лучше по сегментам (иначе их не бывает). Другая рекомендованная пассивка — держит: сабстаты не решают.
// В слоте оружия или аксессуара «прочее» (не по билду) — держит, как в B3; у брони нет: вещь не из связки в сборке —
// обычное дело (случайный сет, «По статам»). Никогда: «только статы», «на уровне», «хуже» и тихая строка (Р12)
export const holds = (o: Outcome): boolean => !o.quiet && holdsKind(o);
// то же по одному исходу, без «тихая»: у тихой строки «По статам» при явном выборе — есть ли «Надеть» (Р11)
export function holdsKind(o: Outcome): boolean {
  if (o.kind === 'completes' || o.kind === 'closer' || o.kind === 'fill' || o.kind === 'up' || o.kind === 'breaks' || o.kind === 'capped') return true;
  if (o.kind === 'stats') return false;
  if (o.pair?.passive && !o.pair.why) return true;
  return !!o.worn && !isArmor(o.worn.slot) && o.worn.fit === 'no';
}

// Исход для показа (чип, «Ещё», «+N», «Кому надеть?», режим героя): «соберёт» — только когда полной станет вся связка
// (таблица GEARPOOL). Полной стала лишь часть (вторая Immunity у Caren в Def/Immu, где Def нет) — «сет n из m», как
// «ближе»; строка «Соберёт половину» остаётся. Штамп, «держит» и порядок исходов — по kind: здесь только слова
export const shownKind = (o: Outcome): OutcomeKind => (o.kind === 'completes' && o.after.progress < o.after.need ? 'closer' : o.kind);

// Р4 и решение 3: у исхода есть «Надеть» / «Заменить» — он держит штамп и вещь в нём встаёт в сборку (ещё — если вещь
// начнёт новый билд: CharOutcome.useful, poolVs)
export const puts = (o: Outcome): boolean => holds(o) && o.used;
