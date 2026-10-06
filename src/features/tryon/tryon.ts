// Оценка для героя (В7, В10; прежде — примерка одного билда). Цель — герой: строка карточки, «Сейчас на персонажах» и
// «Надеть» — про него, по всем его билдам; штамп общий по ростеру, а заголовок после « — » говорит и про других, и про
// героя, чтобы штамп и строка не спорили. Входы — в карточке персонажа: «Оценить вещь для …», «Собрать билд»,
// «Примерить» (пустой слот), «Слабее всех», «Примерить замену» (вещь) — они только ставят слот и сет на форму
// и включают режим героя; «Следующий» его не сбрасывает. «Примерить замену» ещё
// запоминает запись (replace): «Надеть» заменит её в любом случае (решение владельца (а), features/gear/pool planPut). replace —
// на одну введённую вещь (вопрос 1 (б) ревью eval-only): его снимают «Следующий», load другой вещи, смена слота и
// «Надеть» (App), режим героя остаётся.
import { isArmor, type Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import type { CharVs } from '@/features/gear/model/poolVs';
import type { Verdict } from '@/features/eval/verdict/verdict';
import type { ItemInput } from '@/game/item/item';
import { wearable } from '@/features/gear/model/vs';
import { setName } from '@/game/set/setName';

// replace — id записи его пула из «Примерить замену»; есть ли она ещё в пуле, проверяет тот, кто её использует
// (planPut, charVs: replaceOf) — запись могли убрать и после чтения из хранилища. Старые build и combo (предустановка
// формы по билду) читаем и отбрасываем (restoreTryOn), не пишем
export interface TryOn { charId: string; replace?: string }
// тот же режим без replace (на одну вещь — App снимает его)
export function noReplace(t: TryOn): TryOn {
  const { replace, ...rest } = t;
  return rest;
}
export interface Hero { c: Char }

// из хранилища: персонажа в данных больше нет (или это не запись) — режима героя нет. build и combo прежних версий
// отбрасываем; replace — только строка
export function restoreTryOn(raw: unknown, idx: Index): TryOn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = typeof r.charId === 'string' ? idx.CHAR[r.charId] : undefined;
  if (!c) return null;
  return { charId: c.id, ...(typeof r.replace === 'string' && r.replace ? { replace: r.replace } : {}) };
}

// цель режима героя. Герой без билдов (его так не включить, а в хранилище бывает от старых данных) — режима героя нет
export function heroTarget(idx: Index, t: TryOn | null): Hero | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  return c?.builds.length ? { c } : null;
}

// что поставить на форму: слот; у брони — сет «Примерить замену» (вещь не по билду меняют на свою). Грейд не трогаем
export function tryOnPreset(slot: SlotId, from?: Piece | null): { slot: SlotId; setId: string | null } {
  return { slot, setId: isArmor(slot) ? from?.setId ?? null : null };
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
