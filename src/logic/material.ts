// Материал Breakthrough для того, что уже надето: такая же вещь (броня — тот же сет, слот и грейд; оружие и
// аксессуар — тот же предмет и грейд) на записанной вещи, у которой Breakthrough указан и ещё не T4.
// Одна вещь — одна ступень, сабстаты не важны. Тогда «Разобрать» поднимается до «Фоддер»: разобрав, потерял бы
// ступень для вещи, которую носишь. Ищем по всем билдам с вещами, а не только у тех, кому вещь подходит по вердикту.
// Штамп только поднимается: «Оставить» и «Временно» не трогаем, там это пометка в «Сейчас на персонажах».
import { isArmor, type Index } from '../data';
import type { Texts } from '../i18n';
import { samePiece, usedIn, type GearStore, type Piece } from './gear';
import type { ItemInput, Verdict } from './verdict';

export interface Need { piece: Piece; key: string; left: number } // key — билд, где она надета; left — ступеней до T4

export function materialFor(st: GearStore, item: ItemInput): Need[] {
  const armor = isArmor(item.slot);
  const out: Need[] = [];
  for (const p of Object.values(st.pieces)) {
    if (p.slot !== item.slot || p.grade !== item.grade || p.bt === null || p.bt >= 4 || samePiece(item, p)) continue;
    if (armor ? !item.setId || p.setId !== item.setId : !item.itemKey || p.itemKey !== item.itemKey) continue;
    const key = usedIn(st, p.id)[0];
    if (key) out.push({ piece: p, key, left: 4 - p.bt });
  }
  return out.sort((a, z) => z.left - a.left);
}

// чей билд по ключу «персонаж/билд»: «Caren · Speed»
const whoOf = (idx: Index, key: string) => {
  const id = key.slice(0, key.indexOf('/'));
  return `${idx.CHAR[id]?.name ?? id} · ${key.slice(id.length + 1)}`;
};

// «Разобрать» → «Фоддер»; у «Фоддер» — строка, для какой надетой вещи он материал
export function withMaterial(idx: Index, t: Texts, res: Verdict, needs: Need[]): Verdict {
  if (!needs.length || (res.v !== 'junk' && res.v !== 'fodder')) return res;
  const M = t.material;
  const slot = needs[0].piece.slot;
  const list = needs.slice(0, 2).map((n) => M.need(t.ui.slotNom[slot], whoOf(idx, n.key), n.piece.bt!, n.left)).join('; ')
    + (needs.length > 2 ? t.more(needs.length - 2) : '');
  const line = M.line(list);
  if (res.v === 'fodder') return { ...res, lines: [line, ...res.lines] };
  return {
    ...res, v: 'fodder', badge: '',
    title: M.title(t.ui.slotGen[slot], whoOf(idx, needs[0].key)),
    lines: [line, ...res.lines],
    // «Прокачка»: вместо «есть такая же не на T4? — ступень ей» — точно: не прокачивай, это материал; кубик — как был
    plan: [M.plan, ...(res.gamble ? [t.plan.gamble('junk')] : [])],
  };
}
