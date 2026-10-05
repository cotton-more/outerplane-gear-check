// Выбранный билд героя («Надето», В2, В11, Р17): у героя с пулом — ключ варианта в GearStore.aim. Игрок выбирает явно
// (setAim: шторка; confirmAims: «Всё верно» в «Билдах героев»). Пока не выбрал — билд отмечается сам по правилу (pickAim)
// и показывается выбранным, но в хранилище НЕ пишется: ни при загрузке, ни при «Надеть» (Р17). aimOf — что показать:
// сохранённый ключ, если он ещё среди вариантов героя (или «По статам»), иначе правило на лету.
//
// Правило (В11): «Не собираю» — никогда; один билд — он; «Собираю» — этот (несколько — между ними по пп. 3–4); больше
// включённых бонусов сетов связки, потом больше вещей сетов связки (по выбранной раскладке варианта из вещей героя);
// ничья — первый в списке. Нет билдов вовсе или все «Не собираю» — «По статам».
import type { SetPiece } from '@/game/data/types';
import { syncWorn, type GearStore } from '@/features/gear/model/gear';
import { buildKey } from '@/game/build/variants';
import type { Ctx } from '@/game/context';
import { isStats, markOfVariant, poolView, STATS, type Assembly, type CharPool } from '@/features/gear/pool';
import type { Variant } from '@/game/build/variants';

// почему выбран этот билд (для строки «причины», шаг 7): only — единственный (или единственный не «Не собираю»);
// want — единственный «Собираю»; on — включён бонус части part (у остальных — нет); more — больше вещей сета set;
// first — поровну, первый в списке; stats — «По статам» (билдов нет или все «Не собираю»)
export interface AimWhy { kind: 'only' | 'want' | 'on' | 'more' | 'first' | 'stats'; part?: SetPiece; set?: string }
export interface Aim { key: string; why: AimWhy }
// why = null — ключ сохранён игроком, правило не работало
export interface AimShown { key: string; why: AimWhy | null }

export const statsKey = (charId: string): string => buildKey(charId, STATS);

const combo = (v: Variant) => v.b.sets[0] ?? [];
const have = (a: Assembly, set: string) => Object.values(a.slots).filter((e) => e?.setId === set).length;
// бонус части связки включён: есть активная строка бонуса её сета не меньше n (Penetration ×2 на T0 строки нет — не включён)
const enabled = (a: Assembly, p: SetPiece) => a.bonuses.some((r) => r.set === p.set && r.n >= p.n);
const enabledParts = (a: Assembly) => combo(a.v).filter((p) => enabled(a, p));

// лучше ли a, чем z: больше частей с включённым бонусом, потом больше вещей связки (Σ min(шт, n))
const margin = (a: Assembly, z: Assembly) =>
  enabledParts(a).length - enabledParts(z).length || a.progress - z.progress;

export function pickAim(c: { id: string }, cp: Pick<CharPool, 'variants' | 'asm' | 'opts'>): Aim {
  const stats = (): Aim => ({ key: statsKey(c.id), why: { kind: 'stats' } });
  const real = cp.variants.filter((v) => !isStats(v));
  if (!real.length) return stats();
  const alive = real.filter((v) => markOfVariant(cp.opts.marks, v) !== 'skip');
  if (!alive.length) return stats();
  if (real.length === 1) return { key: alive[0].key, why: { kind: 'only' } };
  const wants = alive.filter((v) => markOfVariant(cp.opts.marks, v) === 'want');
  if (wants.length === 1) return { key: wants[0].key, why: { kind: 'want' } };
  const pool = wants.length ? wants : alive;
  // одинаковые для игры варианты (dupOf) — один: первый
  const cands = pool.filter((v) => !(v.dupOf && pool.some((x) => x.key === v.dupOf)));
  const asm = (v: Variant) => cp.asm.get(v.key)!;
  // sort стабилен: при ничьей — прежний порядок (первый в списке)
  const ranked = [...cands].sort((a, z) => margin(asm(z), asm(a)));
  const [win, next] = ranked;
  if (!next) return { key: win.key, why: { kind: 'only' } };
  const a = asm(win), z = asm(next);
  const bonus = enabledParts(a).length - enabledParts(z).length;
  if (bonus > 0) {
    const part = enabledParts(a).find((p) => !enabled(z, p)) ?? enabledParts(a)[0];
    return { key: win.key, why: { kind: 'on', part } };
  }
  if (a.progress > z.progress) {
    const set = combo(win).find((p) => Math.min(have(a, p.set), p.n) > Math.min(have(z, p.set), p.n))?.set ?? combo(win)[0]?.set;
    return { key: win.key, why: { kind: 'more', ...(set ? { set } : {}) } };
  }
  return { key: win.key, why: { kind: 'first' } };
}

// сохранённый ключ, если он ещё годится: среди вариантов героя или «По статам»; иначе null
export function savedAim(c: { id: string }, st: Pick<GearStore, 'aim'>, cp: Pick<CharPool, 'variants'>): string | null {
  const key = st.aim?.[c.id];
  if (typeof key !== 'string') return null;
  return key === statsKey(c.id) || cp.variants.some((v) => v.key === key) ? key : null;
}

export function aimOf(c: { id: string }, st: Pick<GearStore, 'aim'>, cp: Pick<CharPool, 'variants' | 'asm' | 'opts'>): AimShown {
  const key = savedAim(c, st, cp);
  return key !== null ? { key, why: null } : pickAim(c, cp);
}

// Что записали (данные для «Вернуть» — точечно, только aim этих героев; снимок хранилища затёр бы выбор, сделанный за эти
// секунды): was — что стояло до (null — ничего), now — что записано. Только то, что поменялось
export interface AimResult { st: GearStore; was: Record<string, string | null>; now: Record<string, string> }

function writeAims(st: GearStore, now: Readonly<Record<string, string>>): AimResult {
  const was: Record<string, string | null> = {}, wrote: Record<string, string> = {};
  let aim = st.aim;
  for (const [id, key] of Object.entries(now)) {
    if (!st.pools[id]?.length || st.aim?.[id] === key) continue;
    was[id] = st.aim?.[id] ?? null;
    wrote[id] = key;
    aim = { ...aim, [id]: key };
  }
  return { st: aim === st.aim ? st : syncWorn({ ...st, aim }), was, now: wrote };
}

// выбор игрока (шторка): билд героя — этот. Героя без пула нет — ничего не пишем
export const setAim = (st: GearStore, charId: string, key: string): AimResult => writeAims(st, { [charId]: key });

// «Всё верно»: каждому из ids — тот билд, что ему показан (aimOf): у кого уже выбран сам — не трогаем, у остальных
// записывается правило (pickAim). Героя без пула или без данных — пропускаем
export function confirmAims(ctx: Ctx, st: GearStore, ids: readonly string[]): AimResult {
  const view = poolView(ctx, st);
  const now: Record<string, string> = {};
  for (const id of ids) {
    const cp = view.of(id);
    if (cp) now[id] = aimOf(cp.c, st, cp).key;
  }
  return writeAims(st, now);
}

// «Вернуть»: только то, что записано этим действием и всё ещё стоит; другой выбор за эти секунды не трогаем
export function undoAims(st: GearStore, r: Pick<AimResult, 'was' | 'now'>): GearStore {
  let aim = st.aim;
  for (const [id, key] of Object.entries(r.now)) {
    if (aim?.[id] !== key || !st.pools[id]?.length) continue;
    const was = r.was[id];
    if (was === null || was === undefined) { const { [id]: _, ...rest } = aim; aim = rest; } else aim = { ...aim, [id]: was };
  }
  if (aim === st.aim) return st;
  const next: GearStore = { ...st, aim };
  if (!aim || !Object.keys(aim).length) delete next.aim;
  return next;
}

// герои с пулом и билдами, у которых нет сохранённого выбора (или он не годится): им билд отмечен правилом (сообщение «Выбрал
// билды…», шаг 7). Порядок — как пулы в хранилище
export function unconfirmed(ctx: Ctx, st: GearStore): string[] {
  const view = poolView(ctx, st);
  return Object.keys(st.pools).filter((id) => {
    const cp = st.pools[id].length ? view.of(id) : null;
    // у героя без билдов выбирать не из чего — не считаем; все билды «Не собираю» — выбрана «По статам», это выбор
    return !!cp && cp.variants.length > 0 && savedAim(cp.c, st, cp) === null;
  });
}
