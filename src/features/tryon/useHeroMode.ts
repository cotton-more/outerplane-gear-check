// Режим «для героя» на странице (features/tryon/tryon): чей он (у тура «Экипировка» — свой, на примере), цель, запись
// «Примерить замену» и вход из карточки персонажа. Строка карточки, «Сейчас на персонажах» и «Надеть» — только про героя,
// по всем его билдам; штамп общий. На время обучения режима нет (кроме примера тура «Экипировка»).
import { useEffect, useMemo, useRef } from 'react';
import { isArmor, type Index } from '@/game/data';
import type { Build, Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { poolView, type PoolView } from '@/features/gear/pool';
import type { GearApi } from '@/features/gear/store/useGear';
import type { Switched } from '@/features/roster/useRosterUi';
import { itemInput, type FormState } from '@/features/eval/form/formState';
import { hasItem } from '@/tour/useTour';
import { heroTarget, noReplace, tryOnPreset, type TryOn } from './tryon';
import { useTryOn } from './useTryOn';

type TryOnApi = { value: TryOn | null; set: (next: TryOn | null) => void };

export function useHeroMode({ idx, ctx, view, gear, form, demoTry, touring, off, narrow, fusionGate, switchToast, joinRoster, load, toEval, closeVerdict, setFormUndo }: {
  idx: Index; ctx: Ctx; view: PoolView; gear: GearApi;
  form: FormState;                       // форма сейчас: слот, грейд, сет, main
  demoTry: TryOnApi | null;              // режим тура «Экипировка» — в памяти
  touring: boolean; off: ReadonlyMap<string, string>; narrow: boolean;
  fusionGate: (id: string, then?: (sw: Switched) => void) => boolean;
  switchToast: (sw: Switched, tab: 'eval') => void;
  joinRoster: (id: string) => (() => void) | undefined;
  load: (item: ItemInput) => void;       // вещь на форму (и к оценке)
  toEval: () => void;                    // к оценке, форма как есть
  closeVerdict: () => void;
  setFormUndo: (f: (u: ItemInput | null) => ItemInput | null) => void; // «Вернуть» формы
}) {
  const realTry = useTryOn(idx, !touring);
  const tryOn = demoTry ?? realTry;
  // X при Core Fusion X — не герой режима (features/gear/model/fusion). Вариант предустановки здесь не нужен — он только для формы
  const demoValue = demoTry?.value;
  const hero = useMemo(() => {
    const h = demoTry ? heroTarget(idx, demoValue ?? null) : touring ? null : heroTarget(idx, realTry.value);
    return h && (off.has(h.c.id) && !h.c.fusionOf) ? null : h;
  }, [idx, !!demoTry, demoValue, realTry.value, touring, off]); // eslint-disable-line react-hooks/exhaustive-deps
  // «Примерить замену»: запись, которую «Надеть» заменит в любом случае (features/gear/pool planPut); её уже нет в пуле или она
  // другого слота — как без неё
  const replace = hero ? tryOn.value?.replace ?? null : null;
  // replace — на одну введённую вещь (вопрос 1 (б) ревью eval-only): снимают «Следующий», load другой вещи (код,
  // «Вернуть» формы), смена слота на форме (ниже) и «Надеть»; режим героя остаётся. tryOn.set пишет и ogc.tryon — иначе
  // после перезапуска замена вернулась бы. Режима героя нет (обучение, X при Core Fusion) — не трогаем
  const dropReplace = () => { if (replace && tryOn.value) tryOn.set(noReplace(tryOn.value)); };
  // слот на форме сменили (цифры, сетка слотов, load) — это уже не та вещь: снимаем, и на прежнем слоте замены нет.
  // Грейд, сет, сабстаты — ввод той же вещи, не снимают
  const repSlot = replace ? gear.store.pieces[replace]?.slot : undefined;
  useEffect(() => { if (repSlot && repSlot !== form.slot) dropReplace(); }, [repSlot, form.slot]); // eslint-disable-line react-hooks/exhaustive-deps
  // режим героя сейчас — для «Вернуть» после «Заменить» (его колбэк создан раньше)
  const tryNow = useRef(tryOn.value);
  useEffect(() => { tryNow.current = tryOn.value; });
  // «Вернуть» после «Заменить» из «Примерить замену» откатывает и снятие replace: запись снова в пуле, та же вещь на
  // форме — та же кнопка «Заменить». Режим за эти секунды сменили (другой герой, своя замена, ✕) — не трогаем
  const backReplace = (charId: string, rep: string | null) => {
    const cur = tryNow.current;
    if (rep && cur?.charId === charId && !cur.replace) tryOn.set({ ...cur, replace: rep });
  };
  // правка в карточке вещи: общую запись скопировали (новый id у этого героя), а это запись replace его режима — replace
  // идёт за копией (иначе «Заменить» пропадёт)
  const followEdit = (charId: string, was: string, now: string) => {
    const v = tryOn.value;
    if (now !== was && v?.charId === charId && v.replace === was) tryOn.set({ ...v, replace: now });
  };
  // режим «для героя» из карточки персонажа (В10): «Оценить вещь для Caren» — только режим; «Собрать билд»,
  // «Примерить» (пустой слот), «Слабее всех» — ещё слот и сет на форму (build/combo — предустановка); «Примерить
  // замену» (replacing) — ещё запись from: «Надеть» заменит её в любом случае. Персонаж — в ростер (как у «Надеть»),
  // грейд прежний. Вещь, которую вводили, уходит в «Вернуть»; та же вещь на форме (слот и сет те же) остаётся.
  // Режим героя на CF, когда есть X (или на X, когда есть CF), — сначала окно перехода (в). slotOnly — «Ввести» на вкладке
  // «Надето»: билд и связка героя — в режим, а на форме только слот (сет, предмет, main и сабстаты пустые, грейд прежний)
  const start = (c: Char, b?: Build, slot?: SlotId, from?: Piece, combo?: string | null, replacing = false, slotOnly = false) => {
    const go = (st: GearStore) => tryOnGo(c, st, b, slot, from, combo, replacing, slotOnly);
    if (!fusionGate(c.id, (sw) => { go(sw.st); switchToast(sw, 'eval'); })) go(gear.store);
  };
  const tryOnGo = (c: Char, st: GearStore, b?: Build, slot?: SlotId, from?: Piece, combo?: string | null, replacing = false, slotOnly = false) => {
    const next: TryOn = {
      charId: c.id, ...(b ? { build: b.name } : {}), ...(b && combo ? { combo } : {}), ...(replacing && from ? { replace: from.id } : {}),
    };
    tryOn.set(next);
    joinRoster(c.id);
    closeVerdict();
    const sv = st === gear.store ? view : poolView(ctx, st);
    const h = slot ? heroTarget(idx, next, sv) : null;
    const p = slot && h ? (slotOnly ? { slot, setId: null } : tryOnPreset(sv, h, slot, from)) : null;
    const s = form;
    if (p && (slotOnly || s.slot !== p.slot || (isArmor(p.slot) && s.setId !== p.setId))) {
      const cur = itemInput(s);
      // на форме уже пустая заготовка (второй «Примерить» подряд) — прежнее «Вернуть» остаётся
      setFormUndo((u) => (touring ? null : hasItem(cur) ? cur : u));
      load({ slot: p.slot, grade: s.grade, setId: p.setId, itemKey: null, main: !slotOnly && s.slot === p.slot ? s.main : null, unlisted: false, subs: {} });
    } else toEval();
    if (narrow) requestAnimationFrame(() => document.getElementById('eval-in')?.scrollIntoView({ block: 'start' }));
  };
  return { tryOn, hero, replace, dropReplace, backReplace, followEdit, start };
}
