// Пул экипировки, «собираешь» — какие варианты собираются и что держит пул. Обзор и решения — index.ts.
import { isArmor } from '@/game/data';
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Mark, Piece, Worn } from '@/features/gear/model/gear';
import type { ItemInput } from '@/game/item/item';
import { comboSig, variantsOf, type Variant } from '@/game/build/variants';
import { fit, type Fit } from '@/features/gear/model/vs';
import { GEAR, type PoolStore } from './base';
import { isStats, statVariant } from './stats';
import { entriesFor, combo, assembleReach, type Assembly } from './assemble';

// marks — отметки (общие); worn — надетое ЭТОГО героя (слот → id записи): пул держит его всегда (heldOf). Надетое — по
// герою, поэтому у вида пула опции свои у каждого героя (heroOpts)
export interface PlayOpts {
  marks?: Readonly<Record<string, Mark>>;
  worn?: Readonly<Worn>;
}
// опции героя из хранилища: отметки и его надетое
export const heroOpts = (st: Pick<PoolStore, 'marks' | 'worn'>, charId: string): PlayOpts =>
  ({ marks: st.marks, ...(st.worn?.[charId] ? { worn: st.worn[charId] } : {}) });

// отметка варианта: на нём самом, на билде целиком; у билда, где связка одна, — и та, что стояла на этой связке,
// когда их было несколько (данные обновились — отметка не пропадает)
const markOf = (marks: PlayOpts['marks'], v: Variant): Mark | undefined =>
  marks?.[v.key] ?? marks?.[v.parentKey] ?? (v.sig === null && v.b.sets.length === 1 ? marks?.[`${v.parentKey}#${comboSig(v.b.sets[0])}`] : undefined);
export const markOfVariant = markOf; // BuildGear: почему «Собираю» — с тем же запасным ключом прежней связки

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
// функцией — без сборок (сверка — test/gear/pool.test.ts)
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
  held: Set<string>;                   // записи, которые держит пул (heldOf: билды и надетое): usedIn, «ненужные», чистка «Надеть»
}

export function play(ctx: Ctx, c: Char, pieces: readonly Piece[], opts: PlayOpts = {}, x?: ItemInput | null): Play {
  // «По статам» собирается всегда (карточка, тихая строка при явном выборе); вещей он не держит (В4, heldOf)
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
  // начат — собирается только «По статам» (и отмеченные «Собираю»). «Не собираю» исключает всегда
  const self = (v: Variant) => {
    if (isStats(v)) return statLive;
    const m = markOf(opts.marks, v);
    return m !== 'skip' && (m === 'want' || started(reach.get(v.key)!));
  };
  return { variants, stat, statLive, asm, reach, inPlay: variants.filter(self), held: heldOf({ variants, asm, reach }, pieces, opts.worn) };
}

// сборки варианта, чьи вещи пул держит: выбранная и достижимая (если другая)
export const heldBy = (p: Pick<Play, 'asm' | 'reach'>, v: Variant): Assembly[] => {
  const a = p.asm.get(v.key)!, r = p.reach.get(v.key) ?? a;
  return r === a ? [a] : [a, r];
};

// Что держит пул (решение владельца 2026-10-01, «что держит пул» — (а); «Надето», В4): лучшую раскладку — выбранную и
// достижимую — КАЖДОГО настоящего варианта героя, есть в пуле вещи его сета или нет (шлем DEF% 4 / HP% 3 — лучший для
// Def/Immu у героя без Defense- и Immunity-вещей), с «Не собираю» тоже (В2: отметка — только про штамп и исходы), и
// надетое героя (надетое ⊂ пул: в игре оно на нём). «По статам» не держит ничего (В4): в пуле — минимум вещей под билды
// героя, а надетое держится само. Отметки не влияют: play собирает все варианты всегда. Надетое — только записи этого
// пула (pieces): в planPut пул бывает без записи, которая ещё надета
function heldOf(p: Pick<Play, 'variants' | 'asm' | 'reach'>, pieces: readonly Piece[], worn?: Readonly<Worn>): Set<string> {
  const ids = (as: readonly Assembly[]) => as.flatMap((a) => Object.values(a.slots).map((e) => e?.id));
  const mine = new Set(pieces.map((x) => x.id));
  return new Set([
    ...p.variants.filter((v) => !isStats(v)).flatMap((v) => ids(heldBy(p, v))),
    ...Object.values(worn ?? {}).filter((id) => !!id && mine.has(id)),
  ].filter((id): id is string => !!id));
}

// Записи, которые держит пул (Play.held). Одно место на «ненужные» (poolView) и на то, что уберёт «Надеть» (planPut,
// подпись «Заменить»); «где стоит» (poolVs whereUsed) — сначала собираемые варианты, остальные — если больше нигде.
// Пустой пул — пусто
export const usedIn = (p: Pick<Play, 'held'>): Set<string> => p.held;
