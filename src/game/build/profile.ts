// Профиль героя для «статов + сетов» (.x/0085 FORMULA §0, §2 п. 3): цепочка «По статам», меню частей сетов из всех его
// билдов и U — очки самой ценной строки T4 на 2 вещи среди статовых сетов. Половина сета из меню стоит U.
import type { Build, Char, Combo, SetBonus } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { bonusSegments, convertible } from '@/game/set/setBonus';
import type { SubWeight } from './score';
import { pointWeights, weightOfPlace } from './points';
import { buildKey, comboSig } from './variants';

export interface Profile {
  ctx: Ctx;
  c: Char;
  chain: Build;                         // «По статам»: самая частая цепочка билдов (defaultChain)
  W0: Map<string, SubWeight>;           // веса цепочки без main — для строк бонусов сетов
  U: number;
  uBy: { set: string; pts: number }[];  // строки 2P T4 статовых сетов, по убыванию
  parts: ReadonlySet<string>;           // части меню: partKey(сет, 2 или 4) из всех связок всех билдов
  menuSets: ReadonlySet<string>;
  pin?: Pin;                            // закреплённый набор (§6): броня других сетов не годится
}

// Закрепление (FORMULA §6, PLAN Д9): набор одного билда героя и цепочка этого билда. Ключ — имя билда + подпись набора
export interface Pin { key: string; build: Build; combo: Combo }

export const partKey = (set: string, n: number): string => `${set}:${n}`;

// цепочка, которая у большинства билдов героя (при равенстве — первого из них в outerpedia); null — билдов нет
const chainMemo = new WeakMap<Char, Build>();
export function defaultChain(c: Char): Build | null {
  if (!c.builds.length) return null;
  const hit = chainMemo.get(c);
  if (hit) return hit;
  const count = new Map<string, number>();
  for (const b of c.builds) count.set(JSON.stringify(b.subs), (count.get(JSON.stringify(b.subs)) ?? 0) + 1);
  const top = Math.max(...count.values());
  const b = c.builds.find((x) => count.get(JSON.stringify(x.subs)) === top)!;
  chainMemo.set(c, b);
  return b;
}

// очки строки бонуса для героя: сегменты стата × вес его места в цепочке без main; стата нет в цепочке — 0. Без потолка
// в 6 сегментов: строка — не сабстат
export function rowPoints(P: Pick<Profile, 'ctx' | 'c' | 'W0'>, bon: SetBonus): number {
  const segs = bonusSegments(P.ctx, P.c, bon);
  const w = segs && bon.stat ? P.W0.get(bon.stat) : undefined;
  if (!segs || !w || !w.credit) return 0;
  return weightOfPlace(w.tier) * w.credit * segs;
}

// один профиль на (ctx, герой): от ctx зависят база героя (lv120, quirks) и данные сетов
const memo = new WeakMap<Ctx, WeakMap<Char, Profile>>();
export function profileOf(ctx: Ctx, c: Char): Profile | null {
  let byChar = memo.get(ctx);
  if (!byChar) memo.set(ctx, (byChar = new WeakMap()));
  const hit = byChar.get(c);
  if (hit) return hit;
  const chain = defaultChain(c);
  if (!chain) return null;
  const P = makeProfile(ctx, c, chain, c.builds.flatMap((b) => b.sets));
  byChar.set(c, P);
  return P;
}

// профиль по цепочке и наборам: веса, U и части меню
function makeProfile(ctx: Ctx, c: Char, chain: Build, combos: readonly Combo[]): Profile {
  const parts = new Set<string>(), menuSets = new Set<string>();
  for (const combo of combos) for (const p of combo) { parts.add(partKey(p.set, p.n)); menuSets.add(p.set); }
  const base = { ctx, c, W0: pointWeights(ctx, c, chain) };
  const uBy = ctx.idx.D.sets.filter((s) => s.bonus?.t4.p2 && convertible(ctx, c, s.id))
    .map((s) => ({ set: s.id, pts: rowPoints(base, s.bonus!.t4.p2!) }))
    .sort((a, z) => z.pts - a.pts);
  return { ...base, chain, U: Math.max(0, ...uBy.map((x) => x.pts)), uBy, parts, menuSets };
}

// наборы героя (связки всех его билдов) без повторов, в порядке outerpedia: заказ обмена (§7 п. 1)
const combosMemo = new WeakMap<Char, Combo[]>();
export function combosOf(c: Char): Combo[] {
  const hit = combosMemo.get(c);
  if (hit) return hit;
  const seen = new Set<string>(), out: Combo[] = [];
  for (const b of c.builds) for (const combo of b.sets) {
    const sig = comboSig(combo);
    if (combo.length && !seen.has(sig)) { seen.add(sig); out.push(combo); }
  }
  combosMemo.set(c, out);
  return out;
}

// профиль под один набор: половины — только у его частей (заказ обмена §7 п. 2); цепочка, U и веса — героя
const comboMemo = new WeakMap<Profile, Map<string, Profile>>();
export function comboProfile(P: Profile, combo: Combo): Profile {
  let m = comboMemo.get(P);
  if (!m) comboMemo.set(P, (m = new Map()));
  const sig = comboSig(combo);
  let out = m.get(sig);
  if (!out) {
    out = { ...P, parts: new Set(combo.map((p) => partKey(p.set, p.n))), menuSets: new Set(combo.map((p) => p.set)) };
    m.set(sig, out);
  }
  return out;
}

// ключ закрепления: «герой/билд#подпись набора» — подпись всегда, даже у билда с одним набором (по ней имя набора, когда
// билд пропал из outerpedia)
export const pinKey = (c: Pick<Char, 'id'>, b: Pick<Build, 'name'>, combo: Combo): string => `${buildKey(c.id, b.name)}#${comboSig(combo)}`;

// набор и билд по ключу; билда с этим именем или набора в нём больше нет — null
export function pinOf(c: Char, key: string | null | undefined): Pin | null {
  if (!key || !key.startsWith(c.id + '/')) return null;
  const cut = key.lastIndexOf('#');
  if (cut < 0) return null;
  const name = key.slice(c.id.length + 1, cut), sig = key.slice(cut + 1);
  const build = c.builds.find((b) => b.name === name);
  const combo = build?.sets.find((x) => comboSig(x) === sig);
  return build && combo ? { key, build, combo } : null;
}

// подпись набора из ключа («Speed ×4» — когда билд пропал): части «сетxN»
export const pinCombo = (key: string): Combo =>
  key.slice(key.lastIndexOf('#') + 1).split('+').map((x) => x.split('x')).filter((x) => x.length === 2)
    .map(([set, n]) => ({ set, n: Number(n) }));

// что можно закрепить: наборы всех билдов героя в порядке outerpedia; тот же набор с той же цепочкой — один раз (первый
// билд). У героя с двумя ролями один набор может прийти дважды — с разными цепочками
const optsMemo = new WeakMap<Char, Pin[]>();
export function pinOptions(c: Char): Pin[] {
  const hit = optsMemo.get(c);
  if (hit) return hit;
  const seen = new Set<string>(), out: Pin[] = [];
  for (const build of c.builds) for (const combo of build.sets) {
    const k = comboSig(combo) + JSON.stringify(build.subs);
    if (combo.length && !seen.has(k)) { seen.add(k); out.push({ key: pinKey(c, build, combo), build, combo }); }
  }
  optsMemo.set(c, out);
  return out;
}

// профиль закреплённого (§6): цепочка его билда, половины — только у частей набора, броня других сетов не годится
// (pieceBar). Цепочка та же, что «По статам», — веса и U прежние
const pinMemo = new WeakMap<Profile, Map<string, Profile>>();
export function pinnedProfile(P: Profile, pin: Pin): Profile {
  let m = pinMemo.get(P);
  if (!m) pinMemo.set(P, (m = new Map()));
  let out = m.get(pin.key);
  if (!out) {
    const same = JSON.stringify(pin.build.subs) === JSON.stringify(P.chain.subs);
    const base = same ? comboProfile(P, pin.combo) : makeProfile(P.ctx, P.c, pin.build, [pin.combo]);
    out = { ...base, pin };
    m.set(pin.key, out);
  }
  return out;
}

// профиль героя для его пула: закреплённый, если ключ ещё годится, иначе «По статам»
export function profileFor(ctx: Ctx, c: Char, key?: string | null): Profile | null {
  const P = profileOf(ctx, c);
  const pin = P && key ? pinOf(c, key) : null;
  return P && pin ? pinnedProfile(P, pin) : P;
}
