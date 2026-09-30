// Пул экипировки (GEARPOOL, этап C1 — только логика, интерфейса и хранилища нет): вещи у персонажа, а билды
// собираются из них сами. Решения владельца — GEARPOOL.md.
//   - Вариант билда (logic/variants) собирается из пула лучшей раскладкой: по слоту — одна вещь. Связка сетов —
//     цель: части с бонусом, который статом не выразить (Penetration, Immunity, …), держатся всегда; сет-стат
//     (Attack, Speed, …) собирается вещь за вещью, а последнюю вещь его бонус выигрывает только ценностью — сет можно
//     сломать, если итог выгоднее (бонус в сегментах — logic/setBonus).
//   - «Собираешь» — варианты, для которых вещи держат вердикт: отмеченные «Собираю», цель примерки, начатые (Р14, Р18,
//     П3: хоть одна вещь связки при любом T или рекомендованное оружие / аксессуар из списка встаёт в сборку; временное
//     не начинает) и «По статам», пока он живой.
//     «Не собираю» исключает всегда. «Начат» — по тому, что можно собрать из пула (достижимая сборка, Р1), а карточка
//     показывает выбранную раскладку.
//   - «По статам» — отдельный билд у каждого персонажа с билдами (находка 28, Р11–Р13): все вещи пула по цепочке. Он
//     «живой» (собираешь, держит штамп), пока ни один настоящий билд не начат; потом его строка тихая —
//     «Надеть» в него только при явном выборе (поиск по имени, примерка). Вещи его сборки пул держит всегда (usedIn).
//   - Исход вещи с формы для персонажа (outcomeFor): что станет с каждым собираемым вариантом, если её добавить.
import { isArmor } from '../data';
import type { ArmorSlot, Char, Combo, GearKind, SetPiece, SlotId } from '../data/types';
import { t4Only } from './builds';
import type { Ctx } from './context';
import { EMPTY_GEAR, gc, holdersOf, newPiece, pieceInput, samePiece, today, type GearStore, type Mark, type Piece } from './gear';
import { bonusRows, bonusSegments, bonusValue, bonusWeights, convertible, type BonusRow } from './setBonus';
import type { SubWeight } from './score';
import type { ItemInput } from './verdict';
import { comboSig, variantsOf, type Variant } from './variants';
import { against, fit, itemValue, MARGIN, pieceValue, wearable, type Fit, type Pair } from './vs';

export type { Mark };

// то, что пул берёт из хранилища (GearStore v2): вещи, пулы персонажей, отметки «Собираю / Не собираю»
// (ключ — вариант или билд целиком); seq — счётчик id: по нему номер вещи, которую добавит «Надеть» (planFor)
export interface PoolStore {
  pieces: Readonly<Record<string, Piece>>;
  pools: Readonly<Record<string, readonly string[]>>;
  marks?: Readonly<Record<string, Mark>>;
  seq?: number;
}

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
const GEAR: GearKind[] = ['weapon', 'accessory'];
const NEWEST = 1e9; // вещь с формы — всегда новее записанных: при равенстве она ничего не вытесняет
const EPS = 1e-9;
const LOST_MIN = 0.01; // вытесненное дешевле — «ничего не стоило»: выигрыш делится на него, как в сравнении пары (vs)

// «По статам»: вариант без связки с цепочкой, которая у большинства билдов персонажа (при равенстве — первого)
export const STATS = '#stats';
export const isStats = (v: Variant): boolean => v.key.endsWith('/' + STATS);
const statMemo = new WeakMap<Char, Variant>();
export function statVariant(c: Char): Variant | null {
  if (!c.builds.length) return null;
  const hit = statMemo.get(c);
  if (hit) return hit;
  const count = new Map<string, number>();
  for (const b of c.builds) count.set(JSON.stringify(b.subs), (count.get(JSON.stringify(b.subs)) ?? 0) + 1);
  const top = Math.max(...count.values());
  const parent = c.builds.find((b) => count.get(JSON.stringify(b.subs)) === top)!;
  const key = `${c.id}/${STATS}`;
  const v: Variant = { key, name: STATS, parent, parentKey: key, b: { ...parent, name: STATS, sets: [[]] }, sig: null };
  statMemo.set(c, v);
  return v;
}

// --------------------------------------------------------------------------- сборка

// вещь в сборке: записанная (piece) или с формы (piece null, id null)
export interface Entry {
  id: string | null;
  piece: Piece | null;
  input: ItemInput;
  slot: SlotId;
  setId: string | null;
  bt: number | null;
  num: number;   // старшинство: номер записи; у вещи с формы — NEWEST
  v: number;     // ценность для варианта (logic/vs value)
  fit: Fit;
}

export type Role = 'set' | 'surplus' | 'filler' | 'rec' | 'stopgap';

export interface Assembly {
  v: Variant;
  slots: Partial<Record<SlotId, Entry>>;
  roles: Partial<Record<SlotId, Role>>;
  hard: number;         // части связки, которые статом не выразить: Σ min(шт, n)
  live: number;         // …из них дают бонус (Penetration ×2 — только на T4): вещь не с T4 бонус-эффект не отключит
  soft: number;         // части-статы: Σ min(шт, n − 1) — собираются вещь за вещью, последняя — ценностью
  total: number;        // Σ ценности вещей + Σ ценности бонусов (и случайных сетов)
  filled: number;
  older: number;        // Σ старшинства: при равенстве остаётся то, что было
  progress: number;     // Σ min(шт, n) — сколько вещей работает на связку
  need: number;         // Σ n
  complete: SetPiece[]; // собранные части связки (по числу вещей)
  missing: (SetPiece & { have: number })[];
  bonuses: BonusRow[];  // все активные бонусы (и сетов не из связки)
}

// кэш на варианте: веса цепочки для бонусов, переводимость частей, бонусы по (сет, шт, шт на T4)
interface SetInfo { value: number; top: number } // ценность бонусов сета и самая большая активная строка (2, 4; 0 — нет)
interface VCache { W: Map<string, SubWeight>; conv: Map<string, boolean>; bonus: Map<string, SetInfo> }
const vcache = new WeakMap<Ctx, WeakMap<Variant, VCache>>();
function vc(ctx: Ctx, c: Char, v: Variant): VCache {
  let m = vcache.get(ctx);
  if (!m) vcache.set(ctx, (m = new WeakMap()));
  let x = m.get(v);
  if (!x) m.set(v, (x = { W: bonusWeights(ctx, c, v.b), conv: new Map(), bonus: new Map() }));
  return x;
}
const isConv = (ctx: Ctx, c: Char, x: VCache, set: string) => {
  let r = x.conv.get(set);
  if (r === undefined) x.conv.set(set, (r = convertible(ctx, c, set)));
  return r;
};
// бонусы одного сета при n вещах, из них n4 на T4
function setInfo(ctx: Ctx, c: Char, x: VCache, set: string, n: number, n4: number): SetInfo {
  const k = `${set}:${n}:${n4}`;
  let r = x.bonus.get(k);
  if (r === undefined) {
    const rows = bonusRows(ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
    r = { value: rows.reduce((s, row) => s + bonusValue(ctx, c, x.W, row), 0), top: Math.max(0, ...rows.map((row) => row.n)) };
    x.bonus.set(k, r);
  }
  return r;
}

// ценность записанной вещи для варианта — один раз на (ctx, вещь, вариант): updatePiece даёт новый объект
const pvMemo = new WeakMap<Ctx, WeakMap<Piece, Map<string, number>>>();
function storedValue(ctx: Ctx, c: Char, v: Variant, p: Piece): number {
  let m = pvMemo.get(ctx);
  if (!m) pvMemo.set(ctx, (m = new WeakMap()));
  let byV = m.get(p);
  if (!byV) m.set(p, (byV = new Map()));
  let r = byV.get(v.key);
  if (r === undefined) byV.set(v.key, (r = pieceValue(ctx, c, v.b, p)));
  return r;
}

// номер записи из id («p12» → 12); не число или не конечное («p1e400») — 0, как у seqOf хранилища (gearStore)
const numOf = (id: string) => { const n = Number(id.replace(/^\D+/, '')); return Number.isFinite(n) ? n : 0; };
// Вещь не для класса персонажа (vs wearable) — не вещь его сборки: её нет среди кандидатов ни одного варианта
export function entriesFor(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x?: ItemInput | null): Entry[] {
  const out: Entry[] = pieces.filter((p) => wearable(ctx, c, p)).map((p) => ({
    id: p.id, piece: p, input: pieceInput(p), slot: p.slot, setId: p.setId, bt: p.bt, num: numOf(p.id),
    v: storedValue(ctx, c, v, p), fit: fit(ctx, c, v.b, pieceInput(p)),
  }));
  if (x && wearable(ctx, c, x)) out.push({ id: null, piece: null, input: x, slot: x.slot, setId: x.setId, bt: null, num: NEWEST, v: itemValue(ctx, c, v.b, x), fit: fit(ctx, c, v.b, x) });
  return out;
}

const RANK: Record<Fit, number> = { rec: 2, stopgap: 1, no: 0 };
const combo = (v: Variant): Combo => v.b.sets[0] ?? [];

interface Score { hard: number; live: number; soft: number; total: number; filled: number; older: number; progress: number }
// лучше ли a, чем z: hard, live, soft, total, заполненные слоты, старшинство
const better = (a: Score, z: Score) =>
  a.hard !== z.hard ? a.hard > z.hard
    : a.live !== z.live ? a.live > z.live
    : a.soft !== z.soft ? a.soft > z.soft
      : Math.abs(a.total - z.total) > EPS ? a.total > z.total
        : a.filled !== z.filled ? a.filled > z.filled : a.older < z.older;
// достижимая сборка (Р1): больше вещей на связку (Σ min(шт, n)), потом как better
const nearer = (a: Score, z: Score) => (a.progress !== z.progress ? a.progress > z.progress : better(a, z));

// броня: hard, soft и бонусы по сетам четырёх слотов
function armorScore(ctx: Ctx, c: Char, v: Variant, x: VCache, arm: readonly (Entry | null)[]): Score {
  const n = new Map<string, number>(), n4 = new Map<string, number>();
  let total = 0, filled = 0, older = 0;
  for (const e of arm) {
    if (!e) continue;
    total += e.v; filled++; older += e.num;
    if (e.setId) { n.set(e.setId, (n.get(e.setId) ?? 0) + 1); if (e.bt === 4) n4.set(e.setId, (n4.get(e.setId) ?? 0) + 1); }
  }
  const top = new Map<string, number>();
  for (const [set, k] of n) {
    if (k < 2) continue;
    const info = setInfo(ctx, c, x, set, k, n4.get(set) ?? 0);
    total += info.value;
    top.set(set, info.top);
  }
  let hard = 0, live = 0, soft = 0, progress = 0;
  for (const p of combo(v)) {
    const k = n.get(p.set) ?? 0;
    progress += Math.min(k, p.n);
    if (isConv(ctx, c, x, p.set)) soft += Math.min(k, p.n - 1);
    else { hard += Math.min(k, p.n); if ((top.get(p.set) ?? 0) >= p.n) live++; }
  }
  return { hard, live, soft, total, filled, older, progress };
}

// Лучшая раскладка варианта v из вещей entries. force — эта вещь обязательно в своём слоте (что будет, если надеть).
// Точная: перебор по слотам брони. Отсечение безопасно — в слоте из вещей одного сета с одним «T4 или нет» остаётся
// лучшая по ценности (при равенстве старшая): такие вещи одинаково влияют на связку и бонусы (prune: false — для теста)
export function assemble(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { force?: Entry; prune?: boolean } = {}): Assembly {
  return search(ctx, c, v, entries, opts, false).asm;
}

// Выбранная раскладка и достижимая (Р1): та, где на связку работает больше всего вещей пула — последняя вещь сета-стата
// тоже в счёт, даже если выбранная ради статов её не взяла (Speed ×4 у Caren отдаёт слот Immunity-вещи). По ней —
// «начат» (play, Р14), её вещи пул держит (usedIn). Прогресс не больше, чем у выбранной, — это она же
export function assembleReach(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { prune?: boolean } = {}): { asm: Assembly; reach: Assembly } {
  const r = search(ctx, c, v, entries, opts, true);
  return { asm: r.asm, reach: r.reach ?? r.asm };
}

function search(ctx: Ctx, c: Char, v: Variant, entries: readonly Entry[], opts: { force?: Entry; prune?: boolean }, withReach: boolean): { asm: Assembly; reach: Assembly | null } {
  const { force, prune = true } = opts;
  const x = vc(ctx, c, v);
  const stats = isStats(v);
  const slots: Partial<Record<SlotId, Entry>> = {};
  // оружие и аксессуар: сетов нет — каждый слот сам по себе: рекомендованная > временная > прочее, ценность, старшинство
  let gTotal = 0, gFilled = 0, gOlder = 0;
  for (const slot of GEAR) {
    // вещь с формы не по билду — только в «По статам» и только с полезными ему статами (Р13, допущение (а))
    const cands = force?.slot === slot ? [force] : entries.filter((e) => e.slot === slot && (e.piece || e.fit !== 'no' || (stats && e.v > EPS)));
    let best: Entry | null = null;
    for (const e of cands) {
      if (!best || RANK[e.fit] > RANK[best.fit] || (RANK[e.fit] === RANK[best.fit] && (e.v > best.v + EPS || (Math.abs(e.v - best.v) <= EPS && e.num < best.num)))) best = e;
    }
    if (best) { slots[slot] = best; gTotal += best.v; gFilled++; gOlder += best.num; }
  }
  // броня: кандидаты по слоту (+ пусто)
  const cand = ARMOR.map((slot): (Entry | null)[] => {
    if (force?.slot === slot) return [force];
    const all = entries.filter((e) => e.slot === slot);
    if (!prune) return [null, ...all];
    const best = new Map<string, Entry>();
    for (const e of all) {
      const k = `${e.setId}:${e.bt === 4}`;
      const b = best.get(k);
      if (!b || e.v > b.v + EPS || (Math.abs(e.v - b.v) <= EPS && e.num < b.num)) best.set(k, e);
    }
    return [null, ...best.values()];
  });
  type Top = { arm: (Entry | null)[]; s: Score };
  let top: Top | null = null, near: Top | null = null;
  const cur: (Entry | null)[] = [null, null, null, null];
  const walk = (i: number) => {
    if (i === ARMOR.length) {
      const s = armorScore(ctx, c, v, x, cur);
      if (!top || better(s, top.s)) top = { arm: [...cur], s };
      if (withReach && (!near || nearer(s, near.s))) near = { arm: [...cur], s };
      return;
    }
    for (const e of cand[i]) { cur[i] = e; walk(i + 1); }
  };
  walk(0);
  const out = (t: Top) => {
    const all = { ...slots };
    t.arm.forEach((e, i) => { if (e) all[ARMOR[i]] = e; });
    return report(ctx, v, all, { ...t.s, total: t.s.total + gTotal, filled: t.s.filled + gFilled, older: t.s.older + gOlder });
  };
  const best = top as unknown as Top, reach = near as Top | null;
  const asm = out(best);
  return { asm, reach: reach && reach.s.progress > best.s.progress ? out(reach) : null };
}

function report(ctx: Ctx, v: Variant, slots: Partial<Record<SlotId, Entry>>, s: Score): Assembly {
  const roles: Partial<Record<SlotId, Role>> = {};
  const counted = new Map<string, number>();
  const parts = combo(v);
  for (const slot of [...GEAR, ...ARMOR] as SlotId[]) {
    const e = slots[slot];
    if (!e) continue;
    if (!isArmor(slot)) { roles[slot] = e.fit === 'no' ? 'filler' : e.fit; continue; }
    const part = parts.find((p) => p.set === e.setId);
    if (!part) { roles[slot] = 'filler'; continue; }
    const k = counted.get(part.set) ?? 0;
    roles[slot] = k < part.n ? 'set' : 'surplus';
    counted.set(part.set, k + 1);
  }
  const armor = ARMOR.map((slot) => slots[slot]).filter((e): e is Entry => !!e);
  const cnt = (set: string) => armor.filter((e) => e.setId === set).length;
  return {
    v, slots, roles, ...s,
    progress: parts.reduce((n, p) => n + Math.min(cnt(p.set), p.n), 0),
    need: parts.reduce((n, p) => n + p.n, 0),
    complete: parts.filter((p) => cnt(p.set) >= p.n),
    missing: parts.filter((p) => cnt(p.set) < p.n).map((p) => ({ ...p, have: cnt(p.set) })),
    bonuses: bonusRows(ctx.idx.SET, armor),
  };
}

// --------------------------------------------------------------------------- «собираешь»

export interface PlayOpts {
  marks?: Readonly<Record<string, Mark>>;
  tryOn?: string | null; // ключ варианта примерки: он собирается, даже пустой
}

// отметка варианта: на нём самом, на билде целиком; у билда, где связка одна, — и та, что стояла на этой связке,
// когда их было несколько (данные обновились — отметка не пропадает)
const markOf = (marks: PlayOpts['marks'], v: Variant): Mark | undefined =>
  marks?.[v.key] ?? marks?.[v.parentKey] ?? (v.sig === null && v.b.sets.length === 1 ? marks?.[`${v.parentKey}#${comboSig(v.b.sets[0])}`] : undefined);
export const markOfVariant = markOf;

// Оружие или аксессуар начинает билд (Р18, П3) — только из его списка: рекомендованный (fit «rec»). Временный (Epic с
// main из списка в «Развитии») в сборке стоит (раньше прочих), но билд не начинает. Одно правило на started и hasStatBuild
const gearStarts = (f: Fit): boolean => f === 'rec';

// Билд начат (Р14, Р18, П3): в достижимой сборке варианта стоит хоть одна вещь его связки (при любом T) или оружие /
// аксессуар из его списков (gearStarts), как вещь его сета
export const started = (reach: Pick<Assembly, 'progress' | 'slots'>): boolean =>
  reach.progress > 0 || GEAR.some((slot) => { const e = reach.slots[slot]; return !!e && gearStarts(e.fit); });

// «По статам» живой, когда у персонажа есть билды, пул не пуст и ни один настоящий билд не начат (Р12 — то же «начат»,
// что started, Р14, Р18 и П3): ни одна вещь брони в пуле не из сетов его связок и ни одно оружие или аксессуар не из
// списков его билдов (gearStarts; временное — не в счёт). Вещь брони из сета связки всегда встаёт в достижимую сборку
// своего варианта (она собирает больше всего вещей на связку), рекомендованное оружие — в свой слот (оно идёт раньше
// временного и прочих), и только они. «Не собираю» тут не важен: отмеченный так билд всё равно начат. Отдельной
// функцией — без сборок (сверка — test/pool.test.ts)
type FitOf = Parameters<typeof fit>[3];
export function hasStatBuild(ctx: Ctx, c: Char, pieces: readonly FitOf[]): boolean {
  if (!c.builds.length || !pieces.length) return false;
  const vs = variantsOf(ctx.idx, c);
  const sets = new Set(vs.flatMap((v) => combo(v).map((p) => p.set)));
  return !pieces.some((p) => (isArmor(p.slot) ? !!p.setId && sets.has(p.setId) : vs.some((v) => gearStarts(fit(ctx, c, v.b, p)))));
}

export interface Play {
  variants: Variant[];                 // все варианты персонажа и «По статам» (первым), если у него есть билды
  stat: Variant | null;                // «По статам»; null — у персонажа нет билдов
  statLive: boolean;                   // «По статам» живой (hasStatBuild): собирается сам и держит штамп
  asm: Map<string, Assembly>;          // сборка каждого варианта — её показывает карточка
  reach: Map<string, Assembly>;        // достижимая сборка (assembleReach): по ней «собираешь»; не отличается — тот же объект
  inPlay: Variant[];
  own: Variant[];                      // собираемые без примерки: цель примерки собирается, только пока она идёт
}

export function play(ctx: Ctx, c: Char, pieces: readonly Piece[], opts: PlayOpts = {}, x?: ItemInput | null): Play {
  // «По статам» собирается всегда: его вещи пул держит и тогда, когда он не живой (usedIn)
  const stat = statVariant(c);
  const statLive = !!stat && hasStatBuild(ctx, c, x ? [...pieces, x] : pieces);
  const variants = [...(stat ? [stat] : []), ...variantsOf(ctx.idx, c)];
  const asm = new Map<string, Assembly>(), reach = new Map<string, Assembly>();
  for (const v of variants) {
    const r = assembleReach(ctx, c, v, entriesFor(ctx, c, v, pieces, x));
    asm.set(v.key, r.asm);
    reach.set(v.key, r.reach);
  }
  // Р14, Р18, П3: билд начат (started) — хоть одна вещь его связки (при любом T) или рекомендованное оружие / аксессуар
  // из его списков встаёт в его достижимую сборку (Р1), — значит собирается. По достижимой: иначе билд, чей сет-стат
  // раскладка сломала ради статов, выпадал бы, и это зависело бы от порядка «Надеть». Запасного правила нет: ни один не
  // начат — собирается только «По статам» (и отмеченные «Собираю»). «Не собираю» исключает всегда (цель примерки —
  // отдельно, inPlay)
  const self = (v: Variant) => {
    if (isStats(v)) return statLive;
    const m = markOf(opts.marks, v);
    return m !== 'skip' && (m === 'want' || started(reach.get(v.key)!));
  };
  return { variants, stat, statLive, asm, reach, inPlay: variants.filter((v) => v.key === opts.tryOn || self(v)), own: variants.filter(self) };
}

// сборки варианта, чьи вещи пул держит: выбранная и достижимая (если другая)
export const heldBy = (p: Pick<Play, 'asm' | 'reach'>, v: Variant): Assembly[] => {
  const a = p.asm.get(v.key)!, r = p.reach.get(v.key) ?? a;
  return r === a ? [a] : [a, r];
};

// Записи, которые держит пул (keeps): стоят в выбранной или достижимой сборке хоть одного собираемого варианта или в
// сборке «По статам» — живой он или нет (находка 28: Effectiveness-броня сильнее Speed-брони по статам не «ненужная» и
// «Надеть» Speed-брони её не уберёт). Пустой пул — сборка «По статам» пуста. Одно место на «ненужные» (poolView), на
// то, что уберёт «Надеть» (planPut, подпись «Заменить»), и на «где стоит» (poolVs whereUsed)
export const usedIn = (p: Play): Set<string> => {
  const vs = p.stat && !p.inPlay.includes(p.stat) ? [...p.inPlay, p.stat] : p.inPlay;
  return new Set(vs.flatMap((v) => heldBy(p, v).flatMap((a) => Object.values(a.slots).map((e) => e?.id))).filter((id): id is string => !!id));
};

// --------------------------------------------------------------------------- вид пула

export interface CharPool extends Play {
  c: Char;
  pieces: Piece[];
  unused: Piece[]; // вещи, которых нет ни в одной сборке, что держит пул (usedIn): в пуле им быть незачем (решение владельца)
}

export interface PoolView {
  st: PoolStore;
  opts: PlayOpts;
  of: (charId: string) => CharPool | null;
}

// один раз на хранилище: персонажи считаются по запросу и запоминаются
export function poolView(ctx: Ctx, st: PoolStore, tryOn?: string | null): PoolView {
  const opts: PlayOpts = { marks: st.marks, tryOn };
  const memo = new Map<string, CharPool | null>();
  const of = (id: string): CharPool | null => {
    if (memo.has(id)) return memo.get(id)!;
    const c = ctx.idx.CHAR[id];
    const pieces = (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const r = c ? { c, pieces, ...play(ctx, c, pieces, opts), unused: [] as Piece[] } : null;
    if (r) {
      const used = usedIn(r);
      r.unused = pieces.filter((p) => !used.has(p.id));
    }
    memo.set(id, r);
    return r;
  };
  return { st, opts, of };
}

// --------------------------------------------------------------------------- исход вещи с формы

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
  // из пула (slots — где они, одна или две, по порядку слотов): Breakthrough не указан (Р20) или Pen mix без T4 (Р2).
  // Совет даётся, только если после него у новой «Надеть» (П2). make — у отмечаемых известен Breakthrough 0–3:
  // «сделать», не «отметить» (П5). pieces — что отметить, по slots; which — по slots: вещь, которую назвать
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
  worn: Piece | null; // такая же вещь уже в пуле персонажа — «уже есть»
  rows: Outcome[];
  starts: Variant[];  // с ней начнут собираться
  useful: boolean;    // надеть можно (puts): исход держит и она в нём встаёт или начнёт новый билд; при явном выборе —
                      // и тихая строка «По статам», где она встаёт с исходом «пустой слот» или «лучше» (Р11)
}

const rowKey = (r: BonusRow) => `${r.set}:${r.n}:${r.tier}`;
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

// «ломает»: куда ещё одна вещь распавшегося сета вернула бы его (и нужна ли она на T4). «Найди ещё … на T4» — только
// в слоты, где после этого у новой «Надеть» (П2): найденная — та же вещь, что в проверке раскладки (сета, на T4, без
// сабстатов: «Надеть» даёт даже пустая найденная — заслуга самой новой), — в пул, и исход новой по нему. Своя вещь
// слота, сделанная T4, не в счёт: текст — «найдёшь ещё»
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
      if (!t4) return true;
      const found: Piece = { id: '#fix', slot, grade: 'unique', setId: set, itemKey: null, main: null, yellow: {}, lit: {}, bt: 4, at: '' };
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
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      if (a.slot !== b.slot && fits([a, b])) return fix([a, b]);
    }
  }
  return null;
}

// Р20: у вещей распавшегося сета в пуле Breakthrough не указан (bt: null) — совет «отметь T4», если с отметкой у новой
// «Надеть» (П2); он впереди «найди ещё». Известный Breakthrough ниже T4 (0–3) не отмечаем — это прокачка, не отметка
function markUnknown(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, set: string): Outcome['fix'] {
  const open = pieces.filter((p) => p.setId === set && isArmor(p.slot) && p.slot !== x.slot && p.bt === null);
  return open.length ? markSome(ctx, c, v, pieces, x, set, open) : null;
}

// «ломает» из-за части-эффекта ×2, чей бонус только на T4 (Pen mix у Luna, Р2): четыре Pen без двух на T4 — раскладка
// Pen ×4 (бонус на T0 есть, у Pen ×2 без T4 — нет), и вещь другой части не встаёт. Только сет-эффект (сет-стат ×4 ради
// статов и так ломается) и только когда ни markUnknown, ни прежний совет (fixFor) ничего не дали: здесь отмечаются и
// вещи с известным Breakthrough ниже T4 (Pen на T0 — отметить = сделать Breakthrough, шаг 4; текст — «сделать», П5)
function markFor(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, before: Assembly, set: string): Outcome['fix'] {
  const part = combo(v).find((p) => p.set === set);
  if (!part || part.n !== 2 || !t4Only(ctx.idx.SET[set], part.n) || isConv(ctx, c, vc(ctx, c, v), set)) return null;
  const inBefore = ARMOR.map((slot) => before.slots[slot]).filter((e) => e?.setId === set);
  if (inBefore.length !== 4 || inBefore.filter((e) => e!.bt === 4).length >= 2) return null;
  const open = pieces.filter((p) => p.setId === set && isArmor(p.slot) && p.slot !== x.slot && p.bt !== 4);
  return markSome(ctx, c, v, pieces, x, set, open);
}

// П7: вещь пула её сета и её слота, с которой новая не встанет ни при каких отметках, — лучшая по ценности, не
// дешевле новой. Замена новой на неё в любой раскладке счёт не ухудшает: сет и слот те же, ценность не меньше,
// старшинство выше (при равенстве остаётся старшая, NEWEST), а T4 у неё (или отметка T4) бонус сета только добавляет
// (bonusRows: строки T4 вместо T0 или сверху; бонус T4 в данных не меньше T0). У новой bt всегда null — не T4
function rivalOf(es: readonly Entry[], X: Entry): Entry | null {
  let best: Entry | null = null;
  for (const e of es) {
    if (!e.piece || e.slot !== X.slot || e.setId !== X.setId || e.v < X.v - EPS) continue;
    if (!best || e.v > best.v + EPS || (Math.abs(e.v - best.v) <= EPS && e.num < best.num)) best = e;
  }
  return best;
}

// with — сборка с ней, если уже есть (play с вещью считает все варианты)
function outcomeOf(ctx: Ctx, c: Char, v: Variant, pieces: readonly Piece[], x: ItemInput, before: Assembly, entering: boolean, with_?: Assembly): Outcome | null {
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
  const after = with_ ?? assemble(ctx, c, v, es);
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
    const lostValue = displaced.reduce((s, e) => s + e.v, 0) + bd.lostBonus.reduce((s, r) => s + bonusValue(ctx, c, x1.W, r), 0);
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
    // в примерке это «не по билду». Встала на место другой с выигрышем — это «лучше». У «По статам» связки нет — там
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
    const fix = markUnknown(ctx, c, v, pieces, x, broken) ?? fixFor(ctx, c, v, pieces, x, forced, before, broken) ?? markFor(ctx, c, v, pieces, x, before, broken);
    return { ...rest, kind: 'breaks', broken, fix, brokenSegs: segsOf(bd.lostBonus, broken) };
  }
  if (bd.lostBonus.some((r) => r.tier === 'T4')) return { ...rest, kind: betterBySegs ? 'capped' : byDelta(d), broken: null };
  return { ...rest, kind: byDelta(d), broken: null };
}

// Исход вещи с формы для персонажа: для каждого собираемого варианта и тех, что с ней начнут собираться.
// explicit — персонажа выбрал пользователь (поиск по имени в «Кому надеть?», примерка): тогда и строка «По статам»,
// когда он не собирается (не живой, Р12), — тихая (quiet): до и после — его сборки без вещи и с ней. Без explicit
// тихих строк нет: они нужны только явному выбору (и так дешевле)
export interface OutcomeOpts { explicit?: boolean }

// Кэш исходов (находка 27): на одно нажатие один персонаж считается несколько раз — понижение (worn), «Сейчас на
// персонажах» (poolVs), материал (betterThanWorn), быстрый и полный вердикт. Живёт вместе с видом пула: новое хранилище,
// отметки или примерка — новый вид (poolView), кэш с ним. Ключ — (ctx, персонаж, explicit, JSON входа): вход — объект
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
  const twin = pieces.find((p) => samePiece(x, p)) ?? null;
  if (twin) return { c, worn: twin, rows: [], starts: [], useful: false };
  const withX = play(ctx, c, pieces, view.opts, x);
  const was = new Set(cp.inPlay.map((v) => v.key));
  const starts = withX.inPlay.filter((v) => !was.has(v.key) && !isStats(v));
  const quiet = opts.explicit && cp.stat && !was.has(cp.stat.key) ? cp.stat : null;
  const rows: Outcome[] = [];
  for (const v of [...cp.inPlay, ...starts, ...(quiet ? [quiet] : [])]) {
    const before = cp.asm.get(v.key) ?? assemble(ctx, c, v, entriesFor(ctx, c, v, pieces));
    const o = outcomeOf(ctx, c, v, pieces, x, before, v !== quiet && !was.has(v.key), withX.asm.get(v.key));
    if (o) rows.push(v === quiet ? { ...o, quiet: true } : o);
  }
  rows.sort((a, z) => OUTCOME_ORDER.indexOf(a.kind) - OUTCOME_ORDER.indexOf(z.kind) || (z.delta ?? 0) - (a.delta ?? 0));
  const useful = rows.some((r) => (puts(r) && !r.entering) || (r.quiet && r.used && holdsKind(r))) || starts.length > 0;
  return { c, worn: null, rows, starts, useful };
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

// Исход для показа (чип, «Ещё», «+N», «Кому надеть?», примерка): «соберёт» — только когда полной станет вся связка
// (таблица GEARPOOL). Полной стала лишь часть (вторая Immunity у Caren в Def/Immu, где Def нет) — «сет n из m», как
// «ближе»; строка «Соберёт половину» остаётся. Штамп, «держит» и порядок исходов — по kind: здесь только слова
export const shownKind = (o: Outcome): OutcomeKind => (o.kind === 'completes' && o.after.progress < o.after.need ? 'closer' : o.kind);

// Р4 и решение 3: у исхода есть «Надеть» / «Заменить» — он держит штамп и вещь в нём встаёт в сборку (ещё — если вещь
// начнёт новый билд: CharOutcome.useful, poolVs)
export const puts = (o: Outcome): boolean => holds(o) && o.used;

// --------------------------------------------------------------------------- операции с пулом

// что сделало «Надеть»: added — вещь добавлена (false — такая же уже есть); removed, marks и began — как в planPut
// (removed — вещи её слота, которых с ней нет ни в одной сборке, что держит пул: «Заменить»; marks — только цель
// примерки); prev — что стояло в этих отметках до «Надеть» (null — ничего; «Не собираю» у цели примерки): «Вернуть»
// кладёт их обратно; shared — у кого ещё эта запись
export interface PutResult {
  st: GearStore; id: string; piece: Piece; added: boolean; removed: Piece[]; marks: string[]; began: string[]; prev: Record<string, Mark | null>; shared: string[];
}

const poolPieces = (st: GearStore, charId: string) => (st.pools[charId] ?? []).map((id) => st.pieces[id]).filter((p): p is Piece => !!p);

// Что сделает «Надеть» piece на персонажа — без записи (им же считать подпись «Заменить» / «Надеть»).
// removed (Р7) — только вещи того слота, куда встала новая: стояли в сборке, что держит пул (usedIn — и «По статам»),
// а с ней — ни в одной. Не встала никуда — ничего не убираем. Вещи других слотов, ставшие ненужными, остаются в пуле:
// на карточке «больше не нужна» и «Убрать у X» (решение 3 — молча ничего не удаляем).
// marks (Р19): «Надеть» отметок не ставит — «Собираю» переключает только игрок. Исключение — примерка: цель собирается,
// только пока примерка идёт; вещь стоит в её сборке, а без примерки её не держит ни одна сборка (не начала цель —
// «прочая» на месте другой; цель — «Не собираю») — цель становится «Собираю», иначе после примерки вещь «больше не
// нужна». began — тост «Начал собирать …»: варианты, которые собираются и без примерки и с ней начаты, а до неё — нет
// (начало по вещам, Р14, Р18), и отмеченная цель примерки. pre — play(mine, po), если уже посчитан (вид пула)
export interface PutPlan { removed: Piece[]; marks: string[]; began: string[] }
export function planPut(ctx: Ctx, c: Char, mine: readonly Piece[], piece: Piece, po: PlayOpts = {}, pre?: Play): PutPlan {
  const before = pre ?? play(ctx, c, mine, po), after = play(ctx, c, [...mine, piece], po);
  const was = usedIn(before), now = usedIn(after);
  const removed = now.has(piece.id) ? mine.filter((p) => p.slot === piece.slot && was.has(p.id) && !now.has(p.id)) : [];
  const target = po.tryOn ? after.variants.find((v) => v.key === po.tryOn && !isStats(v)) : undefined;
  const marks = target && !after.own.includes(target)
    && heldBy(after, target).some((a) => Object.values(a.slots).some((e) => e?.id === piece.id))
    && !usedIn({ ...after, inPlay: after.own }).has(piece.id) ? [target.key] : [];
  const began = after.own.filter((v) => !isStats(v) && started(after.reach.get(v.key)!) && !started(before.reach.get(v.key)!)).map((v) => v.key);
  return { removed, marks, began: [...new Set([...began, ...marks])] };
}

// Что сделает «Надеть» вещи с формы на персонажа — по виду пула, без записи: от этого подпись «Заменить» / «Надеть»
// (poolVs). Та же новая запись, что создаст putOn (номер — следующий за seq), те же отметки и примерка
const seqOf = (st: PoolStore) => st.seq ?? Math.max(0, ...Object.keys(st.pieces).map(numOf));
export function planFor(ctx: Ctx, view: PoolView, charId: string, x: ItemInput): PutPlan | null {
  const cp = view.of(charId);
  if (!cp) return null;
  const { piece } = newPiece({ ...EMPTY_GEAR, seq: seqOf(view.st) }, x, '');
  return planPut(ctx, cp.c, cp.pieces, piece, view.opts, cp);
}

// Надеть вещь на персонажа: record — та же запись, что у другого («Она же — и у Rin»), иначе новая.
// Такая же уже в его пуле — ничего не меняется (свежая копия потеряла бы Reforge и Breakthrough)
export function putOn(ctx: Ctx, st: GearStore, charId: string, x: ItemInput, opts: { record?: Piece; tryOn?: string | null; at?: string } = {}): PutResult {
  const c = ctx.idx.CHAR[charId];
  const mine = poolPieces(st, charId);
  const twin = mine.find((p) => samePiece(x, p) || p.id === opts.record?.id);
  if (twin) return { st, id: twin.id, piece: twin, added: false, removed: [], marks: [], began: [], prev: {}, shared: holdersOf(st, twin.id).filter((h) => h !== charId) };
  const made = opts.record
    ? { st: st.pieces[opts.record.id] ? st : { ...st, pieces: { ...st.pieces, [opts.record.id]: opts.record } }, piece: st.pieces[opts.record.id] ?? opts.record }
    : newPiece(st, x, opts.at ?? today());
  const { piece } = made;
  const { removed, marks, began } = c ? planPut(ctx, c, mine, piece, { marks: st.marks, tryOn: opts.tryOn }) : { removed: [], marks: [], began: [] };
  const gone = new Set(removed.map((p) => p.id));
  const pool = [...(st.pools[charId] ?? []).filter((id) => !gone.has(id)), piece.id];
  const next = gc({
    ...made.st, pools: { ...made.st.pools, [charId]: pool },
    ...(marks.length ? { marks: { ...made.st.marks, ...Object.fromEntries(marks.map((k) => [k, 'want' as Mark])) } } : {}),
  });
  const prev = Object.fromEntries(marks.map((k) => [k, st.marks?.[k] ?? null]));
  return { st: next, id: piece.id, piece, added: true, removed, marks, began, prev, shared: holdersOf(next, piece.id).filter((h) => h !== charId) };
}

// «Это шлем Rin?» (мелочь 2): «Она же — и у …» кладёт запись другого героя, а строка и кнопка посчитаны по вещи с формы
// (её Reforge и Breakthrough другие). Предлагаем запись, только если «Надеть» с ней сделает то же, что обещала подпись:
// запись встаёт (не «больше не нужна» — ни в примерке, ни после неё) и убирает те же вещи её слота, что вещь с формы
export function shareFits(ctx: Ctx, st: GearStore, charId: string, x: ItemInput, record: Piece, tryOn: string | null = null): boolean {
  const own = putOn(ctx, st, charId, x, { tryOn });
  const rec = putOn(ctx, st, charId, x, { record, tryOn });
  if (!rec.added) return false;
  const ids = (ps: readonly Piece[]) => ps.map((p) => p.id).sort().join();
  if (ids(rec.removed) !== ids(own.removed)) return false;
  const unused = (tr: string | null) => !!poolView(ctx, rec.st, tr).of(charId)?.unused.some((p) => p.id === rec.id);
  return !unused(tryOn) && !(tryOn && unused(null));
}

// «Вернуть» после «Надеть»: вещь — из пула, убранные — обратно (записи, даже если gc их стёр), отметки — как были до
// него (prev: «Не собираю» — снова «Не собираю», не было — снять); отметку, которую успели поменять, не трогаем.
// Её там уже нет (успели убрать) — ничего не трогаем
export function undoPut(st: GearStore, charId: string, r: PutResult): GearStore {
  if (!r.added || !st.pools[charId]?.includes(r.id)) return st;
  const pieces = { ...st.pieces };
  for (const p of r.removed) pieces[p.id] ??= p;
  const pool = [...st.pools[charId].filter((id) => id !== r.id), ...r.removed.map((p) => p.id).filter((id) => !st.pools[charId].includes(id))];
  const marks = { ...st.marks };
  for (const k of r.marks) {
    if (marks[k] !== 'want') continue;
    const was = r.prev[k] ?? null;
    if (was) marks[k] = was; else delete marks[k];
  }
  return gc({ ...st, pieces, pools: { ...st.pools, [charId]: pool }, marks });
}

// «Убрать у Caren»: только из её пула; у других запись остаётся. undo — «Вернуть»
export function removeFrom(st: GearStore, charId: string, id: string): GearStore {
  if (!st.pools[charId]?.includes(id)) return st;
  return gc({ ...st, pools: { ...st.pools, [charId]: st.pools[charId].filter((x) => x !== id) } });
}
// «Разобрал — убрать у всех»
export const removeEverywhere = (st: GearStore, id: string): GearStore =>
  gc({ ...st, pools: Object.fromEntries(Object.entries(st.pools).map(([c, ids]) => [c, ids.filter((x) => x !== id)])) });
// «Вернуть» после «Убрать»: запись и её место в пулах этих персонажей — обратно (кто уже снова её держит — не трогаем)
export function undoRemove(st: GearStore, piece: Piece, holders: readonly string[]): GearStore {
  const pools = { ...st.pools };
  for (const c of holders) if (!pools[c]?.includes(piece.id)) pools[c] = [...(pools[c] ?? []), piece.id];
  return { ...st, pieces: { ...st.pieces, [piece.id]: st.pieces[piece.id] ?? piece }, pools };
}

// «Собираю / Не собираю»: null — снять отметку (вариант собирается сам или нет — по правилам)
export function setMark(st: GearStore, key: string, mark: Mark | null): GearStore {
  const { [key]: _, ...rest } = st.marks ?? {};
  const marks = mark ? { ...rest, [key]: mark } : rest;
  return { ...st, marks };
}
