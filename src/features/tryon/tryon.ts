// Оценка для героя (В7, В10; прежде — примерка одного билда). Цель — герой: строка карточки, «Сейчас на персонажах» и
// «Надеть» — про него, по всем его билдам; штамп общий по ростеру, а заголовок после « — » говорит и про других, и про
// героя, чтобы штамп и строка не спорили. Входы — в карточке персонажа: «Оценить вещь для …», «Собрать билд»,
// «Примерить» (пустой слот), «Слабее всех», «Примерить замену» (вещь) — они только ставят слот и сет на форму
// (build/combo — предустановка) и включают режим героя; «Следующий» его не сбрасывает. «Примерить замену» ещё
// запоминает запись (replace): «Надеть» заменит её в любом случае (решение владельца (а), features/gear/pool planPut). replace —
// на одну введённую вещь (вопрос 1 (б) ревью eval-only): его снимают «Следующий», load другой вещи, смена слота и
// «Надеть» (App), режим героя остаётся.
import { isArmor, type Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import { isStats, statVariant, STATS, type PoolView } from '@/features/gear/pool';
import type { CharVs } from '@/features/gear/model/poolVs';
import type { Verdict } from '@/features/eval/verdict/verdict';
import type { ItemInput } from '@/game/item/item';
import { wearable } from '@/features/gear/model/vs';
import { variantsOf, type Variant } from '@/game/build/variants';
import { setName } from '@/game/set/setName';

// build — предустановка формы: билд (STATS — «По статам», у персонажа с билдами); нет — режим героя без неё.
// combo — подпись связки варианта (game/build/variants); нет — у билда одна связка или берём самую собранную.
// replace — id записи его пула из «Примерить замену»; есть ли она ещё в пуле, проверяет тот, кто её использует
// (planPut, charVs: replaceOf) — запись могли убрать и после чтения из хранилища
export interface TryOn { charId: string; build?: string; combo?: string; replace?: string }
// тот же режим без replace (на одну вещь — App снимает его)
export function noReplace(t: TryOn): TryOn {
  const { replace, ...rest } = t;
  return rest;
}
// герой режима и вариант предустановки формы (heroTarget); v нет — предустановки нет
export interface Hero { c: Char; v?: Variant }

// из хранилища: персонажа в данных больше нет (или это не запись) — режима героя нет. Билда больше нет — режим героя
// без предустановки (build и combo отбрасываем); старое { charId, build } — режим героя с предустановкой. replace —
// только строка
export function restoreTryOn(raw: unknown, idx: Index): TryOn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = typeof r.charId === 'string' ? idx.CHAR[r.charId] : undefined;
  if (!c) return null;
  const build = typeof r.build !== 'string' ? null
    : r.build === STATS ? (c.builds.length ? STATS : null)
      : c.builds.some((b) => b.name === r.build) ? r.build : null;
  return {
    charId: c.id,
    ...(build ? { build } : {}),
    ...(build && build !== STATS && typeof r.combo === 'string' ? { combo: r.combo } : {}),
    ...(typeof r.replace === 'string' && r.replace ? { replace: r.replace } : {}),
  };
}

// цель режима героя: герой и вариант предустановки (только для формы, tryOnPreset; сравнение — по всем билдам).
// Вариант: STATS — «По статам»; билд — вариант из combo, его нет в данных (или combo нет) — собранный больше других
// (view), при равенстве первый; build нет или устарел — без варианта. Герой без билдов (его так не включить, а в
// хранилище бывает от старых данных) — режима героя нет
export function heroTarget(idx: Index, t: TryOn | null, view?: PoolView | null): Hero | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  if (!c?.builds.length) return null; // без билдов сравнивать не с чем (ни билдов, ни «По статам»)
  const v = t!.build === STATS ? statVariant(c) ?? undefined : t!.build ? presetOf(idx, c, t!, view) : undefined;
  return v ? { c, v } : { c };
}

function presetOf(idx: Index, c: Char, t: TryOn, view?: PoolView | null): Variant | undefined {
  const b = c.builds.find((x) => x.name === t.build);
  if (!b) return undefined;
  const vs = variantsOf(idx, c).filter((v) => v.parent === b);
  const exact = t.combo ? vs.find((v) => v.sig === t.combo) : undefined;
  const asm = view?.of(c.id)?.asm;
  return exact ?? vs.reduce((best, x) => ((asm?.get(x.key)?.progress ?? 0) > (asm?.get(best.key)?.progress ?? 0) ? x : best), vs[0]);
}

// что поставить на форму: слот; у брони — сет, которого варианту не хватает (у «Примерить замену» — сет той вещи,
// если он варианту нужен: вещь не по билду меняют на свою); в связке — первый сет, которого меньше, чем нужно.
// У «По статам» связки нет, варианта нет — сет той вещи или никакого. Грейд не трогаем.
export function tryOnPreset(view: PoolView | null, hero: Hero, slot: SlotId, from?: Piece | null): { slot: SlotId; setId: string | null } {
  if (!isArmor(slot)) return { slot, setId: null };
  const v = hero.v;
  if (!v || isStats(v)) return { slot, setId: from?.setId ?? null };
  const combo = v.b.sets[0] ?? [];
  if (from?.setId && combo.some((p) => p.set === from.setId)) return { slot, setId: from.setId };
  const a = view?.of(hero.c.id)?.asm.get(v.key);
  const count = (set: string) => (['helmet', 'armor', 'gloves', 'shoes'] as SlotId[]).filter((sl) => a?.slots[sl]?.setId === set).length;
  const part = combo.find((p) => count(p.set) < p.n) ?? combo[0];
  return { slot, setId: part?.set ?? null };
}

// Заголовок в режиме героя (В7, В10): штамп общий, после « — » — его причина и исход героя (h — charVs героя):
// «Оставляй — надень на Rin; лучше, чем на Caren». Вердикт уже про него (lead — первый названный герой) — как есть.
// Исхода нет или вещь ему не по классу — про героя ничего: строку под карточкой даёт heroNote
export function heroTitle(t: Texts, res: Verdict, c: Char, vs: CharVs | null, lead: string | null): string {
  if (res.v === 'idle' || !vs || lead === c.id) return res.title;
  const T = t.tryon;
  const h = vs.h;
  const i = res.title.indexOf(' — ');
  const head = i >= 0 ? res.title.slice(0, i) : res.title;
  const tail = i >= 0 ? res.title.slice(i + 3) : '';
  const kind = h.kind === 'wear' ? (h.slotEmpty ? 'wearEmpty' : 'wear') : h.kind === 'keep' ? 'keep' : h.bar ? 'none' : 'weak';
  // штамп «Разобрать» или «Фоддер», а ей вещь «Надень» — «но …: надень, пока нет лучше»
  if ((res.v === 'junk' || res.v === 'fodder') && h.kind === 'wear') return `${head} — ${T.butWear(h.slotEmpty ? 'fill' : 'up', c.name)}`;
  const mine = T.clause(kind, c.name, h.temp);
  if (!mine) return res.title;
  // в заголовке не было « — » — второе тире не ставим
  return i >= 0 ? `${head} — ${tail ? `${tail}; ${mine}` : mine}` : `${head}; ${mine}`;
}

// строка под карточкой в режиме героя: не для его класса — «не носит»; «Надень» вещи сета не из его билдов — «подходит по
// статам, не по билду»; сета брони нет ни в одном его билде и она ему не «Надень» и не «Оставь» — offHero «Caren она не
// нужна: Attack нет в билдах Caren»; полезных ему статов у вещи нет (0 очков) — «ничего не даст». Иначе строки нет
export function heroNote(t: Texts, ctx: Ctx, c: Char, item: ItemInput, vs: CharVs | null): string | null {
  if (!wearable(ctx, c, item)) return t.tryon.noClass(c.name);
  const h = vs?.h;
  const set = item.setId;
  const offSet = isArmor(item.slot) && !!set && !c.builds.some((b) => b.sets.some((cb) => cb.some((p) => p.set === set)));
  if (h?.kind === 'wear' && offSet) return t.tryon.offStats(c.name);
  if (offSet && h?.kind !== 'keep') return t.tryon.offHero(c.name, setName(ctx.idx, set!));
  return h && h.kind === 'none' && h.pts < 0.005 ? t.tryon.noStats(c.name) : null;
}
