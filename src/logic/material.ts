// Материал Breakthrough для того, что уже надето: такая же вещь (броня — тот же сет, слот и грейд; оружие и
// аксессуар — тот же предмет и грейд) на записанной вещи, у которой Breakthrough указан и ещё не T4.
// Одна вещь — одна ступень, сабстаты не важны. Тогда «Разобрать» поднимается до «Фоддер»: разобрав, потерял бы
// ступень для вещи, которую носишь. Ищем среди вещей в собираемых сборках всех персонажей, а не только у тех, кому
// вещь подходит по вердикту. «Надета» — стоит в выбранной раскладке (её показывает карточка), не в достижимой: вещь,
// которую держит только достижимая, не надета, и «надень, она лучше» (betterThanWorn) о ней не скажет.
// Штамп только поднимается: «Оставить» и «Временно» не трогаем, там это пометка в «Сейчас на персонажах».
// Вещь лучше той надетой, для которой она материал (или в примерке у цели слот пуст), — совет «надень», а не «отдай».
// Лучше надетой такой же — штамп «Оставляй»: вердикт всегда про ту вещь, которую оцениваем (решение владельца).
import { FLAT, isArmor, type Index } from '../data';
import type { Texts } from '../i18n';
import type { Ctx } from './context';
import type { Piece } from './gear';
import { outcomeFor, type PoolView } from './pool';
import { buildOfKey } from './variants';
import type { ItemInput, Verdict } from './verdict';

export interface Need { piece: Piece; key: string; left: number } // key — вариант, где она стоит; left — ступеней до T4

// персонажи, которых нет в данных, пропускаем (их пулы с устройства на более новых данных хранятся, но не видны)
export function materialFor(view: PoolView, item: ItemInput): Need[] {
  const armor = isArmor(item.slot);
  const out = new Map<string, Need>();
  const can = (p: Piece | null | undefined): p is Piece & { bt: number } =>
    !!p && p.slot === item.slot && p.grade === item.grade && p.bt !== null && p.bt < 4
    && (armor ? !!item.setId && p.setId === item.setId : !!item.itemKey && p.itemKey === item.itemKey);
  for (const [id, ids] of Object.entries(view.st.pools)) {
    // сборки считаем только у тех, у кого такая вещь вообще есть в пуле (находка 27: иначе первое нажатие после
    // правки пула собирало бы всех персонажей)
    if (!ids.some((pid) => can(view.st.pieces[pid]))) continue;
    const cp = view.of(id);
    if (!cp) continue;
    for (const v of cp.inPlay) {
      for (const e of Object.values(cp.asm.get(v.key)!.slots)) {
        const p = e?.piece;
        if (!can(p) || out.has(p.id)) continue;
        out.set(p.id, { piece: p, key: v.key, left: 4 - p.bt });
      }
    }
  }
  return [...out.values()].sort((a, z) => z.left - a.left);
}

// Надетые, для которых вещь материал, но которые слабее её (в том варианте она встаёт на их место с выигрышем):
// её лучше надеть, а старую отдать ей в Breakthrough, а не наоборот (решение владельца)
export function betterThanWorn(ctx: Ctx, view: PoolView, item: ItemInput, needs: Need[]): Need[] {
  return needs.filter((n) => {
    const row = outcomeFor(ctx, view, n.key.slice(0, n.key.indexOf('/')), item)?.rows.find((r) => r.v.key === n.key);
    return !!row && (row.kind === 'up' || row.kind === 'closer' || row.kind === 'completes') && row.displaced.some((e) => e.id === n.piece.id);
  });
}

// чей вариант по ключу: «Caren · Speed»
const whoOf = (idx: Index, key: string, t: Texts) => {
  const id = key.slice(0, key.indexOf('/'));
  return `${idx.CHAR[id]?.name ?? id} · ${buildOfKey(key, t.ui.byStats)}`;
};

// Когда вещь лучше надеть, чем отдать в Breakthrough: up — надетые слабее её (betterThanWorn); target — в примерке
// у цели этот слот пуст или вещь лучше надетой («Caren · Speed»); t4 — она сама на T4 (форма): старую ей в
// Breakthrough не отдать, только надеть
export interface Wear { up: Need[]; target: string | null; t4?: boolean }

// «Разобрать» → «Фоддер»; у «Фоддер» — строка, для какой надетой вещи он материал, или что её лучше надеть.
// Лучше надетой такой же (up) — «Оставляй» и из «Разобрать», и из «Фоддер»
export function withMaterial(idx: Index, t: Texts, res: Verdict, needs: Need[], wear: Wear = { up: [], target: null }): Verdict {
  if (!needs.length || (res.v !== 'junk' && res.v !== 'fodder')) return res;
  const M = t.material;
  const slot = needs[0].piece.slot;
  const list = (ns: Need[]) => ns.slice(0, 2).map((n) => M.need(t.ui.slotNom[slot], whoOf(idx, n.key, t), n.piece.bt!, n.left)).join('; ')
    + (ns.length > 2 ? t.more(ns.length - 2) : '');
  const feed = needs.filter((n) => !wear.up.includes(n));
  const fed = feed.length ? [M.line(list(feed))] : [];
  // «Копишь фоддер? Включи — станут «Фоддер»» не нужна: штамп уже «Фоддер»
  const set = needs[0].piece.setId ? idx.SET[needs[0].piece.setId]?.short : undefined;
  const own = set ? res.lines.filter((l) => l !== t.armor.enableFodder(set)) : res.lines;
  if (wear.up.length) {
    const who = whoOf(idx, wear.up[0].key, t);
    // Из прежних строк — первая: кому и чем вещь хороша (как у понижения, logic/worn), и «Проверь HP: flat». Прочие —
    // почему «Разобрать» или «Фоддер» и как поднять до «Оставить» — не про этот штамп; у оружия и аксессуара первая
    // строка «Фоддер» и объясняет — её тоже нет. «Прокачка»: надеть, старая — ей в Breakthrough; новой на T4 — надеть
    const first = res.v === 'fodder' && !set ? -1 : 0;
    const flat = new Set([...FLAT].map((k) => t.verdict.flatHint(k)));
    return {
      ...res, v: 'keep', badge: '',
      title: wear.t4 ? M.titleWearT4(slot, who) : M.titleWear(slot, who),
      lines: [(wear.t4 ? M.lineWearT4 : M.lineWear)(list(wear.up)), ...fed, ...own.filter((l, i) => i === first || flat.has(l))],
      plan: [wear.t4 ? M.planWear(who) : M.planReplace(who)],
    };
  }
  const lines = [...fed, ...own];
  // «Прокачка»: надеть в примерке, иначе не прокачивать
  const wearPlan = wear.target ? M.planWear(wear.target) : null;
  if (res.v === 'fodder') return { ...res, lines, ...(wearPlan ? { plan: [wearPlan] } : {}) };
  return {
    ...res, v: 'fodder', badge: '',
    title: M.title(t.ui.slotGen[slot], whoOf(idx, needs[0].key, t)),
    lines,
    plan: [wearPlan ?? M.plan],
  };
}
