// Что делает форма «Оценки» после ввода: «Следующий» и «Вернуть» формы, «Надеть» из карточки, вердикта и «Кому
// надеть?» — новая запись в пуле героя (features/gear/pool putOn), сообщение с «Вернуть», форма — как после «Следующий».
import type { Dispatch } from 'react';
import type { Index } from '@/game/data';
import type { Char, GearKind, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { buildOfKey } from '@/game/build/variants';
import type { Texts } from '@/i18n';
import { itemInput, type FormAction, type FormState } from '@/features/eval/form/formState';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { holds, poolView, putOn, undoPut, type PoolView, type PutResult } from '@/features/gear/pool';
import { nextToWear, whereUsed, type CharVs } from '@/features/gear/model/poolVs';
import { oldFate } from '@/features/gear/model/material';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import type { Switched } from '@/features/roster/useRosterUi';
import type { Hero } from '@/features/tryon/tryon';
import { setName } from '@/game/set/setName';

const both = (f?: () => void, g?: () => void) => (f || g ? () => { f?.(); g?.(); } : undefined);

export function useFormFlow({ idx, t, ctx, s, dispatch, gear, input, hero, heroVs, replace, tview, vsList, canEquip, touring, narrow,
  dropReplace, backReplace, formUndo, setFormUndo, closeVerdict, closeEquip, fusionGate, joinRoster, say }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; dispatch: Dispatch<FormAction>; gear: GearApi; input: ItemInput;
  hero: Hero | null; heroVs: CharVs | null; replace: string | null; tview: PoolView; vsList: CharVs[];
  canEquip: boolean;                     // не во время обучения (кроме примера) и не на чужой версии экипировки
  touring: boolean; narrow: boolean;
  dropReplace: () => void; backReplace: (charId: string, rep: string | null) => void;
  formUndo: ItemInput | null; setFormUndo: (u: ItemInput | null) => void; // «Следующий» убрал вещь — её «Вернуть»
  closeVerdict: () => void; closeEquip: () => void;
  fusionGate: (id: string, then?: (sw: Switched) => void) => boolean;
  joinRoster: (id: string) => (() => void) | undefined;
  say: (m: GearMsg) => void;
}) {
  const onReset = () => {
    const cur = itemInput(s);
    closeVerdict();
    dispatch({ type: 'reset' });
    dropReplace();
    setFormUndo(Object.keys(cur.subs).length || cur.itemKey || cur.unlisted ? cur : null); // main и сет «Следующий» не трогает
    if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
  };
  const onUndo = () => { if (formUndo) { dispatch({ type: 'load', item: formUndo }); dropReplace(); } setFormUndo(null); };
  // кнопка под карточкой — только для полезной вещи (решение владельца: хлам к персонажу не попадает; Р4 — исход на
  // карточке держит и вещь в нём встаёт, или она начнёт билд: poolVs useful; в режиме героя из «Примерить замену» —
  // «Заменить» всегда); вторая — «или — Rin · Speed ▸», если такой исход есть и у другого (в режиме героя других нет)
  const cardVs = vsList[0];
  const cardEquip = canEquip && !!cardVs?.useful;
  // «Дальше: {слот}» — ввод надетого: режим героя, «Надеть» есть, слот формы у героя не надет и есть ещё ненадетые
  const wearNext: SlotId | null = hero && canEquip && heroVs?.useful ? nextToWear(tview, hero.c.id, s.slot) : null;
  const nextNote = wearNext ? t.ui.nextWear(t.ui.slotNames[wearNext]) : null;
  const cardOther = cardEquip && !hero ? vsList.slice(1).find((x) => x.useful && x.best && holds(x.best)) ?? null : null;
  // надеть вещь с формы на персонажа (features/gear/pool putOn); персонаж попадает в ростер; сообщение — куда она встала и что
  // стало с вытесненной, с «Вернуть». Всегда новая запись — и при такой же у него или у другого: в Оценку вводят новую
  // вещь из инвентаря, пулы независимы (В9; окна «Это шлем Rin?» нет)
  const buildName = (key: string) => buildOfKey(key, t.ui.byStatsQ); // во фразе: «Идёт в …», «(в …)»
  // где запись стоит у персонажа: имена билдов (родителей вариантов) его собираемых сборок
  const usedFor = (st: GearStore, charId: string, id: string) =>
    [...new Set(whereUsed(poolView(ctx, st), charId, id).map((v) => buildName(v.key)))];
  // вещь по имени для тоста «Заменить»: сет у брони, предмет у оружия и аксессуара (Epic без предмета — main)
  const pieceLabel = (p: Piece) => (p.setId ? setName(idx, p.setId)
    : (p.itemKey ? idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? p.main ?? '');
  // «Надеть на CF», когда есть X, — сначала окно перехода (в). Строка и кнопка CF посчитаны по этому же хранилищу
  // (viewOf, П9)
  const doEquip = (c: Char) => {
    closeEquip();
    if (!fusionGate(c.id, (sw) => equipOn(c, sw))) equipOn(c, null);
  };
  // sw — переход Core Fusion перед этим «Надеть»: его строка — в сообщение, его «Вернуть» — вместе с этим. В режиме
  // героя из «Примерить замену» запись replace уходит в любом случае (features/gear/pool planPut)
  const equipOn = (c: Char, sw: Switched | null) => {
    const rep = hero?.c.id === c.id ? replace : null;
    const r = putOn(ctx, sw?.st ?? gear.store, c.id, input, { replace: rep });
    // после «Надеть» форма — как после «Следующий» (решение владельца, refute-10 п. 6): иначе та же вещь на форме
    // сравнивается со своей записью («на уровне», штамп ниже) и «Надеть» на другого клал бы её вторым героям. Шторку
    // вердикта закрыть, как «Следующий»; режим героя остаётся. «Вернуть» — и пул, и вещь на форму (с «T4»)
    // в обучении — ни ростера, ни сообщения: его «Вернуть» после тура отменило бы что-то в записях игрока
    const joined = joinRoster(c.id);
    const st = r.st;
    gear.set(st);
    const was = input;
    closeVerdict();
    // ввод надетого (режим героя, слот формы не был надет): форма — на следующем ненадетом слоте героя («Дальше: …»)
    const go = hero?.c.id === c.id ? wearNext : null;
    dispatch(go ? { type: 'reset', slot: go } : { type: 'reset' });
    dropReplace(); // записи уже нет, форма пуста — замена сделана
    setFormUndo(null);
    if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
    if (touring) return;
    const used = usedFor(st, c.id, r.id);
    // «· T4» — нажата «T4» на форме (В4): с каким Breakthrough вещь легла в пул
    const t4 = input.bt === 4 ? t.ui.withT4 : '';
    // В1: «Заменено» — только про вещи её слота; вытесненные из всех билдов в других слотах — строкой prunedNote (без
    // перечня, вопрос 6).
    // Убраны 2+ вещи её слота — назвать каждую: «Заменено: ботинки Caren — убраны прежние: Speed и Immunity.»
    // Р4: была надетая её слота (её держат билды — осталась в пуле) — тоже «Заменено», как на кнопке (poolVs replaces)
    const mine = r.removed.filter((p) => p.slot === r.piece.slot), pruned = r.removed.filter((p) => p.slot !== r.piece.slot);
    const wasOn = !!r.wasWorn && r.was.includes(r.wasWorn);
    const text = mine.length > 1 ? t.ui.replacedMany(c.name, r.piece.slot, [...new Set(mine.map(pieceLabel))], t4)
      : mine.length || wasOn ? t.ui.replaced(c.name, r.piece.slot, t4) : [t.ui.equipped(c.name, r.piece.slot, t4), used.length ? t.ui.countsIn(used.join(', ')) : ''].filter(Boolean).join(' ');
    const notes: string[] = [];
    // «Начал собирать …» — билды, которые эта вещь начала (Р19: по вещам, не по отметке)
    if (r.began.length) notes.push(t.ui.startedFilling([...new Set(r.began.map(buildName))].join(', ')));
    notes.push(...removedNotes(r, mine, rep));
    // вопрос 6: убранные в других слотах не перечисляем — одна строка «Лишнее убрано…»
    if (pruned.length) notes.push(t.ui.prunedNote);
    if (sw) notes.push(sw.note);
    say({
      text, note: notes.join(' '), tab: 'eval',
      undo: (x) => (sw ? sw.undo(undoPut(x, c.id, r)) : undoPut(x, c.id, r)),
      after: both(both(joined, sw?.after), () => { dispatch({ type: 'load', item: was }); backReplace(c.id, rep); }),
    });
  };
  // что стало с убранными вещами её слота (mine; другие слоты — строкой prunedNote): такая же Epic — материал новой,
  // такая же Legendary — «сначала оцени» (features/gear/model/material oldFate, .x/0060 SPEC 4.5). Кому отдать снятую —
  // не предлагаем никогда (Р15): игрок снимет её в игре и оценит сам. Запись из «Примерить замену» (rep) — та же вещь в
  // игре, введённая заново (Reforge, Transistone): ни то, ни другое. Убраны 2+ — в строках имя сета или предмета вместо
  // «Старые» (заголовок replacedMany их уже перечислил)
  const removedNotes = (r: PutResult, mine: readonly Piece[], rep: string | null) => {
    const many = mine.length > 1;
    return mine.filter((old) => old.id !== rep).flatMap((old) => {
      const fate = oldFate(old, r.piece);
      const what = many ? pieceLabel(old) : undefined;
      return fate === 'material' ? [t.ui.oldMaterial(old.slot, what)] : fate === 'evaluate' ? [t.ui.oldEvaluate(old.slot, what)] : [];
    });
  };
  return { onReset, onUndo, doEquip, cardEquip, cardOther, nextNote };
}
