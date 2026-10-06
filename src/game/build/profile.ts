// Профиль героя для «статов + сетов» (.x/0085 FORMULA §0, §2 п. 3): цепочка «По статам», меню частей сетов из всех его
// билдов и U — очки самой ценной строки T4 на 2 вещи среди статовых сетов. Половина сета из меню стоит U.
import type { Build, Char, SetBonus } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { bonusSegments, convertible } from '@/game/set/setBonus';
import type { SubWeight } from './score';
import { pointWeights, weightOfPlace } from './points';

export interface Profile {
  ctx: Ctx;
  c: Char;
  chain: Build;                         // «По статам»: самая частая цепочка билдов (defaultChain)
  W0: Map<string, SubWeight>;           // веса цепочки без main — для строк бонусов сетов
  U: number;
  uBy: { set: string; pts: number }[];  // строки 2P T4 статовых сетов, по убыванию
  parts: ReadonlySet<string>;           // части меню: partKey(сет, 2 или 4) из всех связок всех билдов
  menuSets: ReadonlySet<string>;
}

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
  const parts = new Set<string>(), menuSets = new Set<string>();
  for (const b of c.builds) for (const combo of b.sets) for (const p of combo) { parts.add(partKey(p.set, p.n)); menuSets.add(p.set); }
  const base = { ctx, c, W0: pointWeights(ctx, c, chain) };
  const uBy = ctx.idx.D.sets.filter((s) => s.bonus?.t4.p2 && convertible(ctx, c, s.id))
    .map((s) => ({ set: s.id, pts: rowPoints(base, s.bonus!.t4.p2!) }))
    .sort((a, z) => z.pts - a.pts);
  const P: Profile = { ...base, chain, U: Math.max(0, ...uBy.map((x) => x.pts)), uBy, parts, menuSets };
  byChar.set(c, P);
  return P;
}
