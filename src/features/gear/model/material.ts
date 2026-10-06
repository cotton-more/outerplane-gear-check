// Материал Breakthrough для того, что уже надето: такая же вещь (game/item sameForBt: броня — тот же сет, слот и грейд;
// Legendary оружие и аксессуар — тот же предмет; Epic — любая того же слота) на записанной вещи не на T4 («не указан» —
// тоже ниже T4, решение 10 .x/0060).
// Одна вещь — одна ступень, сабстаты не важны. Тогда «Разобрать» поднимается до «Фоддер»: разобрав, потерял бы
// ступень для вещи, которую носишь. Ищем среди вещей в собираемых сборках всех персонажей, а не только у тех, кому
// вещь подходит по вердикту. «Надета» — стоит в выбранной раскладке (её показывает карточка), не в достижимой: вещь,
// которую держит только достижимая, не надета, и «надень, она лучше» (betterThanWorn) о ней не скажет.
// Штамп только поднимается: «Оставить» и «Временно» не трогаем, там это пометка в «Сейчас на персонажах»; «Спорно» —
// только строка «Материал» (ответ владельца на вопрос 2 ревью eval-only): «Спорно» не понижаем.
// Вещь лучше той надетой, для которой она материал (или в режиме героя у него слот пуст), — совет «надень», а не «отдай».
// Лучше надетой такой же — штамп «Оставляй»: вердикт всегда про ту вещь, которую оцениваем (решение владельца). Снятую
// Legendary материалом не называем (.x/0060 SPEC 4.5): она может быть лучшей для другого героя — «надень её», без «а
// старую — ей в Breakthrough»; Epic не жалко — снятая ей ступень.
import { FLAT, type Index } from '@/game/data';
import type { Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { Piece } from './gear';
import { outcomeFor, type PoolView } from '@/features/gear/pool';
import { buildOfKey } from '@/game/build/variants';
import type { Verdict } from '@/features/eval/verdict/verdict';
import { sameForBt, type ItemInput } from '@/game/item/item';
import { heroName } from '@/game/hero/HeroName';

export interface Need { piece: Piece; key: string; left: number } // key — вариант, где она стоит; left — ступеней до T4

// персонажи, которых нет в данных, пропускаем (их пулы с устройства на более новых данных хранятся, но не видны)
export function materialFor(view: PoolView, item: ItemInput): Need[] {
  const out = new Map<string, Need>();
  const can = (p: Piece | null | undefined): p is Piece => !!p && (p.bt ?? 0) < 4 && sameForBt(item, p);
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
        out.set(p.id, { piece: p, key: v.key, left: 4 - (p.bt ?? 0) });
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
  return `${heroName(idx, id)} · ${buildOfKey(key, t.ui.byStats)}`;
};

// Когда вещь лучше надеть, чем отдать в Breakthrough: up — надетые слабее её (betterThanWorn); target — в режиме героя
// у цели этот слот пуст или вещь лучше надетой («Caren · Speed»); t4 — она сама на T4 (форма): старую ей в
// Breakthrough не отдать, только надеть. У Legendary — тоже только надеть: снятую не отдаём (SPEC 4.5)
export interface Wear { up: Need[]; target: string | null; t4?: boolean }

// штампы, которые «лучше надетой такой же» (up) поднимает до «Оставляй»: «Спорно» — это «Разобрать» или «Фоддер»
// для ростера, поднятые ради тех, кого в нём нет (находка 1 ревью eval-only)
const WEARS = new Set<Verdict['v']>(['junk', 'fodder', 'maybe']);
const wears = (res: Verdict, wear: Wear) => wear.up.length > 0 && WEARS.has(res.v);

// чей вариант называет заголовок «Оставляй — лучше надетой … X» (id персонажа) или null — штамп не из этой ветки.
// App ставит его карточку первой в «Сейчас на персонажах» (находка 4 ревью eval-only)
export const wearLead = (res: Verdict, wear: Wear): string | null =>
  (wears(res, wear) ? wear.up[0].key.slice(0, wear.up[0].key.indexOf('/')) : null);

// «Разобрать» → «Фоддер»; у «Фоддер» — строка, для какой надетой вещи он материал, или что её лучше надеть; у «Спорно» —
// только строка «Материал». Лучше надетой такой же (up) — «Оставляй» из «Разобрать», «Фоддер» и «Спорно»
export function withMaterial(idx: Index, t: Texts, res: Verdict, needs: Need[], wear: Wear = { up: [], target: null }): Verdict {
  if (!needs.length || !WEARS.has(res.v)) return res;
  const M = t.material;
  const slot = needs[0].piece.slot;
  // надетая ниже T4 (bt 0 — форма без «T4», В4) — без счёта ступеней; 1–3 (прежняя правка) — «T2, ещё 2 шт. до T4»
  const need = (n: Need) => (n.piece.bt ? M.need(t.ui.slotNom[slot], whoOf(idx, n.key, t), n.piece.bt, n.left) : M.needBelow(t.ui.slotNom[slot], whoOf(idx, n.key, t)));
  const list = (ns: Need[]) => ns.slice(0, 2).map(need).join('; ')
    + (ns.length > 2 ? t.more(ns.length - 2) : '');
  const feed = needs.filter((n) => !wear.up.includes(n));
  const fed = feed.length ? [M.line(list(feed))] : [];
  const set = needs[0].piece.setId ? idx.SET[needs[0].piece.setId]?.short : undefined;
  if (wears(res, wear)) {
    const who = whoOf(idx, wear.up[0].key, t);
    const keepOld = wear.t4 || needs[0].piece.grade === 'unique';
    // Из прежних строк — первая: кому и чем вещь хороша (как у понижения, features/gear/model/stamp; у «Спорно» — кому из тех, кого нет
    // в ростере, она «Оставить»), и «Проверь HP: flat». Прочие — почему «Разобрать» или «Фоддер» и как поднять до
    // «Оставить» — не про этот штамп; у оружия и аксессуара первая строка «Фоддер» и объясняет — её тоже нет.
    // «Прокачка»: надеть, старая — ей в Breakthrough; новой на T4 — надеть
    const first = res.v === 'fodder' && !set ? -1 : 0;
    const flat = new Set([...FLAT].map((k) => t.verdict.flatHint(k)));
    return {
      ...res, v: 'keep',
      title: keepOld ? M.titleWearT4(slot, who) : M.titleWear(slot, who),
      lines: [(keepOld ? M.lineWearT4 : M.lineWear)(list(wear.up)), ...fed, ...res.lines.filter((l, i) => i === first || flat.has(l))],
      plan: [keepOld ? M.planWear(who) : M.planReplace(who)],
    };
  }
  // «Спорно»: штамп и заголовок те же, «Материал» — после первой строки (кому из тех, кого нет в ростере, она хороша)
  if (res.v === 'maybe') return { ...res, lines: [...res.lines.slice(0, 1), ...fed, ...res.lines.slice(1)] };
  const lines = [...fed, ...res.lines];
  // «Прокачка»: надеть в режиме героя, иначе не прокачивать
  const wearPlan = wear.target ? M.planWear(wear.target) : null;
  if (res.v === 'fodder') return { ...res, lines, ...(wearPlan ? { plan: [wearPlan] } : {}) };
  return {
    ...res, v: 'fodder',
    title: M.title(t.ui.slotGen[slot], whoOf(idx, needs[0].key, t)),
    lines,
    plan: [wearPlan ?? M.plan],
  };
}

// Что сказать о снятой с формы вещи того же слота (сообщение после «Надеть» / «Заменить»): такая же Epic — материал
// новой, и с T4 (Epic не жалко); новая на T4 — материал ей не нужен. Такая же Legendary — «сначала оцени»: может
// подойти другому герою (SPEC 4.5). Другая вещь — ничего
export function oldFate(old: Piece, put: Pick<Piece, 'slot' | 'grade' | 'setId' | 'itemKey' | 'bt'>): 'material' | 'evaluate' | null {
  if (!sameForBt(put, old)) return null;
  if (old.grade === 'unique') return 'evaluate';
  return put.bt === 4 ? null : 'material';
}
