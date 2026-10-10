// Что делает форма «Оценки» после ввода: «Следующий» и «Вернуть» формы, «Надеть» из карточки, вердикта и «Кому
// надеть?» — новая запись в пуле героя (features/gear/pool putOn), сообщение с «Вернуть», форма — как после «Следующий».
import type { Dispatch } from 'react';
import type { Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Texts } from '@/i18n';
import { itemInput, type FormAction, type FormState } from '@/features/eval/form/formState';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { putOn, removeFrom, removeUndo, stashOn, undoPut, undoWear, wearFromPool, type PoolView, type PutResult } from '@/features/gear/pool';
import type { Same } from '@/features/gear/verdict';
import { nextToWear, type CharVs } from '@/features/gear/model/poolVs';
import { oldFate } from '@/features/gear/model/material';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { itemCaption } from '@/features/gear/ui/pieceText';
import type { Switched } from '@/features/roster/useRosterUi';
import type { Hero } from '@/features/tryon/tryon';
import { setName } from '@/game/set/setName';

const both = (f?: () => void, g?: () => void) => (f || g ? () => { f?.(); g?.(); } : undefined);

export function useFormFlow({ idx, t, ctx, s, dispatch, gear, input, hero, heroVs, replace, tview, vsList, same, canEquip, touring, narrow,
  dropReplace, backReplace, formUndo, setFormUndo, closeVerdict, closeEquip, fusionGate, joinRoster, say }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; dispatch: Dispatch<FormAction>; gear: GearApi; input: ItemInput;
  hero: Hero | null; heroVs: CharVs | null; replace: string | null; tview: PoolView; vsList: CharVs[];
  same: Same | null;                     // the piece looks like one set aside for same.c (guard, useVerdictModel)
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
  // «Отложить для X» под карточкой — когда первый названный герой её держит («Оставь») или она ему запас
  const cardStash = canEquip && !!cardVs?.stash;
  // «Дальше: {слот}» — ввод надетого: режим героя, «Надеть» есть, слот формы у героя не надет и есть ещё ненадетые
  const wearNext: SlotId | null = hero && canEquip && heroVs?.useful ? nextToWear(tview, hero.c.id, s.slot) : null;
  const nextNote = wearNext ? t.ui.nextWear(t.ui.slotNames[wearNext]) : null;
  const cardOther = cardEquip && !hero ? vsList.slice(1).find((x) => x.useful && x.h.kind === 'wear') ?? null : null;
  // надеть вещь с формы на персонажа (features/gear/pool putOn); персонаж попадает в ростер; сообщение — куда она встала и что
  // стало с вытесненной, с «Вернуть». Всегда новая запись — и при такой же у него или у другого: в Оценку вводят новую
  // вещь из инвентаря, пулы независимы (В9; окна «Это шлем Rin?» нет)
  // вещь по имени для тоста «Заменить»: сет у брони, предмет у оружия и аксессуара (Epic без предмета — main)
  const pieceLabel = (p: Piece) => (p.setId ? setName(idx, p.setId) : itemCaption(idx, p));
  // «Надеть на CF», когда есть X, — сначала окно перехода (в). Строка и кнопка CF посчитаны по этому же хранилищу
  // (viewOf)
  const doEquip = (c: Char) => {
    closeEquip();
    if (!fusionGate(c.id, (sw) => equipOn(c, sw))) equipOn(c, null);
  };
  // «Отложить для X» (features/gear/pool stashOn): вещь в пул героя без отметки «надета»; форма — как после «Следующий»
  const doStash = (c: Char) => {
    if (!fusionGate(c.id, (sw) => stashFor(c, sw))) stashFor(c, null);
  };
  const stashFor = (c: Char, sw: Switched | null) => {
    const r = stashOn(sw?.st ?? gear.store, c.id, input);
    const joined = joinRoster(c.id);
    gear.set(r.st);
    const was = input;
    closeVerdict();
    dispatch({ type: 'reset' });
    dropReplace();
    setFormUndo(null);
    if (narrow) document.getElementById('eval-in')?.scrollIntoView({ block: 'start' });
    if (touring) return;
    say({
      text: t.fit.stashed(c.name, r.slot), note: sw ? sw.note : '', tab: 'eval',
      undo: (x) => (sw ? sw.undo(undoPut(x, c.id, r)) : undoPut(x, c.id, r)),
      after: both(both(joined, sw?.after), () => dispatch({ type: 'load', item: was })),
    });
  };
  // sw — переход Core Fusion перед этим «Надеть»: его строка — в сообщение, его «Вернуть» — вместе с этим. В режиме
  // героя из «Примерить замену» запись replace уходит в любом случае (features/gear/pool planPut)
  const equipOn = (c: Char, sw: Switched | null) => {
    const rep = hero?.c.id === c.id ? replace : null;
    const base = sw?.st ?? gear.store;
    // it looks like the piece set aside for this very hero (guard): «Надеть» wears that record, no second one
    const wore = same?.c.id === c.id && !rep ? wearFromPool(ctx, base, c.id, same.piece.id) : null;
    const r: PutResult = wore ? { ...wore, piece: wore.st.pieces[wore.id] } : putOn(ctx, base, c.id, input, { replace: rep });
    // the feed line named other heroes' reserves («из запаса Aer»): they go to this one's Breakthrough — their records
    // leave with this «Надеть», as the hero's own reserves do (planPut); «Вернуть» brings them back
    const h = wore ? undefined : vsList.find((v) => v.c.id === c.id)?.h;
    const fed = (h?.reserveBt ?? []).filter((f) => f.of && f.of.id !== c.id).map((f) => ({ of: f.of!, piece: f.piece }));
    let st = r.st;
    const backs: ((x: GearStore) => GearStore)[] = [];
    for (const f of fed) { backs.unshift(removeUndo(st, f.of.id, f.piece)); st = removeFrom(st, f.of.id, f.piece.id); }
    const undo = (x: GearStore) => {
      const y = wore ? undoWear(x, c.id, wore) : undoPut(x, c.id, r);
      const z = backs.reduce((acc, b) => b(acc), y);
      return sw ? sw.undo(z) : z;
    };
    // после «Надеть» форма — как после «Следующий» (решение владельца, refute-10 п. 6): иначе та же вещь на форме
    // сравнивается со своей записью («на уровне», штамп ниже) и «Надеть» на другого клал бы её вторым героям. Шторку
    // вердикта закрыть, как «Следующий»; режим героя остаётся. «Вернуть» — и пул, и вещь на форму (с «T4»)
    // в обучении — ни ростера, ни сообщения: его «Вернуть» после тура отменило бы что-то в записях игрока
    const joined = joinRoster(c.id);
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
    // «· T4» — нажата «T4» на форме (В4): с каким Breakthrough вещь легла в пул
    const t4 = input.bt === 4 ? t.ui.withT4 : '';
    // В1: «Заменено» — только про вещи её слота; вытесненные из всех билдов в других слотах — строкой prunedNote (без
    // перечня, вопрос 6).
    // Убраны 2+ вещи её слота — назвать каждую: «Заменено: ботинки Caren — убраны прежние: Speed и Immunity.»
    // Р4: была надетая её слота (её держат билды — осталась в пуле) — тоже «Заменено», как на кнопке (poolVs replaces)
    const mine = r.removed.filter((p) => p.slot === r.piece.slot), pruned = r.removed.filter((p) => p.slot !== r.piece.slot);
    const wasOn = !!r.wasWorn && r.was.includes(r.wasWorn);
    const text = mine.length > 1 ? t.ui.replacedMany(c.name, r.piece.slot, [...new Set(mine.map(pieceLabel))], t4)
      : mine.length || wasOn ? t.ui.replaced(c.name, r.piece.slot, t4) : t.ui.equipped(c.name, r.piece.slot, t4);
    const notes: string[] = [];
    notes.push(...removedNotes(r, mine, rep));
    // вопрос 6, PLAN Д7: убранные в других слотах не перечисляем — одна строка «Лишнее убрано…»
    if (pruned.length) notes.push(t.fit.pruned(c.name));
    if (fed.length === 1) notes.push(t.fit.fed(fed[0].piece.slot, pieceLabel(fed[0].piece), fed[0].of.name, !!fed[0].piece.setId));
    else if (fed.length) notes.push(t.fit.fedMany(fed.length, [...new Set(fed.map((f) => f.of.name))]));
    if (sw) notes.push(sw.note);
    say({
      text, note: notes.join(' '), tab: 'eval',
      undo,
      after: both(both(joined, sw?.after), () => { dispatch({ type: 'load', item: was }); backReplace(c.id, rep); }),
    });
  };
  // что стало с убранными вещами её слота (mine; другие слоты — строкой prunedNote): такая же Epic — материал новой,
  // такая же Legendary — «сначала оцени» (features/gear/model/material oldFate, MODEL.md §4). Кому отдать снятую —
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
  return { onReset, onUndo, doEquip, doStash, cardEquip, cardStash, cardOther, nextNote };
}
