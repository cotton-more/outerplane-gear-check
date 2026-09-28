// Материал Breakthrough для того, что уже надето: такая же вещь (броня — тот же сет, слот и грейд; оружие и
// аксессуар — тот же предмет и грейд) на записанной вещи, у которой Breakthrough указан и ещё не T4.
// Одна вещь — одна ступень, сабстаты не важны. Тогда «Разобрать» поднимается до «Фоддер»: разобрав, потерял бы
// ступень для вещи, которую носишь. Ищем по всем билдам с вещами, а не только у тех, кому вещь подходит по вердикту.
// Штамп только поднимается: «Оставить» и «Временно» не трогаем, там это пометка в «Сейчас на персонажах».
// Вещь лучше той надетой, для которой она материал (или в примерке у цели слот пуст), — совет «надень», а не «отдай».
import { isArmor, type Index } from '../data';
import type { Texts } from '../i18n';
import type { Ctx } from './context';
import { buildKey, samePiece, usedIn, type GearStore, type Piece } from './gear';
import type { ItemInput, Verdict } from './verdict';
import { compare } from './vs';

export interface Need { piece: Piece; key: string; left: number } // key — билд, где она надета; left — ступеней до T4

// idx — пропустить персонажей, которых нет в данных (билды с устройства на более новых данных хранятся, но не видны)
export function materialFor(st: GearStore, item: ItemInput, idx?: Index): Need[] {
  const armor = isArmor(item.slot);
  const out: Need[] = [];
  for (const p of Object.values(st.pieces)) {
    if (p.slot !== item.slot || p.grade !== item.grade || p.bt === null || p.bt >= 4 || samePiece(item, p)) continue;
    if (armor ? !item.setId || p.setId !== item.setId : !item.itemKey || p.itemKey !== item.itemKey) continue;
    const key = usedIn(st, p.id).find((k) => !idx || idx.CHAR[k.slice(0, k.indexOf('/'))]);
    if (key) out.push({ piece: p, key, left: 4 - p.bt });
  }
  return out.sort((a, z) => z.left - a.left);
}

// Надетые, для которых вещь материал, но которые слабее её (в том билде она ▲ «лучше»): её лучше надеть, а старую
// отдать ей в Breakthrough, а не наоборот (решение владельца)
export function betterThanWorn(ctx: Ctx, st: GearStore, item: ItemInput, needs: Need[]): Need[] {
  return needs.filter((n) => {
    const c = ctx.idx.CHAR[n.key.slice(0, n.key.indexOf('/'))];
    const b = c?.builds.find((x) => buildKey(c.id, x.name) === n.key);
    return !!c && !!b && compare(ctx, st, c, b, item)?.kind === 'up';
  });
}

// чей билд по ключу «персонаж/билд»: «Caren · Speed»
const whoOf = (idx: Index, key: string) => {
  const id = key.slice(0, key.indexOf('/'));
  return `${idx.CHAR[id]?.name ?? id} · ${key.slice(id.length + 1)}`;
};

// Когда вещь лучше надеть, чем отдать в Breakthrough: up — надетые слабее её (betterThanWorn); target — в примерке
// у цели этот слот пуст или вещь лучше надетой («Caren · Speed»)
export interface Wear { up: Need[]; target: string | null }

// «Разобрать» → «Фоддер»; у «Фоддер» — строка, для какой надетой вещи он материал, или что её лучше надеть
export function withMaterial(idx: Index, t: Texts, res: Verdict, needs: Need[], wear: Wear = { up: [], target: null }): Verdict {
  if (!needs.length || (res.v !== 'junk' && res.v !== 'fodder')) return res;
  const M = t.material;
  const slot = needs[0].piece.slot;
  const list = (ns: Need[]) => ns.slice(0, 2).map((n) => M.need(t.ui.slotNom[slot], whoOf(idx, n.key), n.piece.bt!, n.left)).join('; ')
    + (ns.length > 2 ? t.more(ns.length - 2) : '');
  const feed = needs.filter((n) => !wear.up.includes(n));
  // «Копишь фоддер? Включи — станут «Фоддер»» не нужна: штамп уже «Фоддер»
  const set = needs[0].piece.setId ? idx.SET[needs[0].piece.setId]?.short : undefined;
  const lines = [
    ...(wear.up.length ? [M.lineWear(list(wear.up))] : []),
    ...(feed.length ? [M.line(list(feed))] : []),
    ...(set ? res.lines.filter((l) => l !== t.armor.enableFodder(set)) : res.lines),
  ];
  // «Прокачка»: надеть (старая — ей в Breakthrough), надеть в примерке, иначе не прокачивать; кубик — как был
  const gamble = res.gamble ? [t.plan.gamble('junk')] : [];
  const wearPlan = wear.up.length ? M.planReplace(whoOf(idx, wear.up[0].key)) : wear.target ? M.planWear(wear.target) : null;
  if (res.v === 'fodder') return { ...res, lines, ...(wearPlan ? { plan: [wearPlan, ...gamble] } : {}) };
  return {
    ...res, v: 'fodder', badge: '',
    title: wear.up.length ? M.titleWear(t.ui.slotGen[slot], whoOf(idx, wear.up[0].key)) : M.title(t.ui.slotGen[slot], whoOf(idx, needs[0].key)),
    lines,
    plan: [wearPlan ?? (res.gamble ? M.planGamble : M.plan), ...gamble],
  };
}
