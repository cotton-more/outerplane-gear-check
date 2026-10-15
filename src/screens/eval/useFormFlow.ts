// Что делает форма «Оценки» после ввода: «Следующий» и «Вернуть» формы, «Надеть» из карточки, вердикта и списка героев (HeroList) — новая запись в пуле героя (features/gear/pool putOn), сообщение с «Вернуть», форма — как после «Следующий».
// «Надеть» of a new piece is also a promise in «Надеть в игре» (features/ingame).
import type { Dispatch } from 'react';
import type { Index } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { Texts } from '@/i18n';
import { itemInput, type FormAction, type FormState } from '@/features/eval/form/formState';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { putOn, removeFrom, removeUndo, undoRemove, stashOn, undoPut, undoWear, wearFromPool, type PoolView, type PutResult } from '@/features/gear/pool';
import type { Same } from '@/features/gear/verdict';
import { nextToWear, type CharVs } from '@/features/gear/model/poolVs';
import type { HeroGroup, HeroRow } from '@/features/gear/model/heroList';
import { oldFate } from '@/features/gear/model/material';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { itemCaption } from '@/features/gear/ui/pieceText';
import type { Switched } from '@/features/roster/useRosterUi';
import type { Hero, TryOnVia } from '@/features/tryon/tryon';
import { lineAt, lineOf, promisedOf, type Fed } from '@/features/ingame/ingame';
import type { IngameApi } from '@/features/ingame/useIngame';
import { setName } from '@/game/set/setName';

const sameRecord = (a: Piece, b: Piece) => a.slot === b.slot && a.grade === b.grade && a.setId === b.setId && a.itemKey === b.itemKey && a.main === b.main;
const both = (f?: () => void, g?: () => void) => (f || g ? () => { f?.(); g?.(); } : undefined);

export function useFormFlow({ idx, t, ctx, s, dispatch, gear, input, hero, via, heroVs, replace, tview, list, same, canEquip, touring, narrow,
  dropReplace, backReplace, formUndo, setFormUndo, closeVerdict, fusionGate, joinRoster, say, ingame }: {
  idx: Index; t: Texts; ctx: Ctx;
  s: FormState; dispatch: Dispatch<FormAction>; gear: GearApi; input: ItemInput;
  hero: Hero | null; heroVs: CharVs | null; replace: string | null; tview: PoolView; list: HeroGroup[];
  via: TryOnVia | null;                  // how hero mode was entered (TryOn.via)
  ingame: IngameApi;                     // «Надеть в игре»
  same: Same | null;                     // the piece looks like one set aside for same.c (guard, useVerdictModel)
  canEquip: boolean;                     // не во время обучения (кроме примера) и не на чужой версии экипировки
  touring: boolean; narrow: boolean;
  dropReplace: () => void; backReplace: (charId: string, rep: string | null) => void;
  formUndo: ItemInput | null; setFormUndo: (u: ItemInput | null) => void; // «Следующий» убрал вещь — её «Вернуть»
  closeVerdict: () => void;
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
  // the card's pick: the row the stamp names (★ of the hero list); hero mode — the hero's single row. The big button follows
  // the row's action: «Надеть» / «Заменить» for a piece that goes on (Р4, Р7: the outcome holds it and it stands, or it starts a
  // build; hero mode — always), «Отложить для X» when the piece is «Оставь» for him or his reserve
  const rows = list.flatMap((g) => [...g.rows, ...g.more]);
  const cardRow: HeroRow | null = hero ? null : rows.find((r) => r.star) ?? null;
  const cardVs = hero ? heroVs : cardRow?.vs ?? null;
  const cardEquip = canEquip && (hero ? !!heroVs?.useful : cardRow?.action === 'wear' || cardRow?.action === 'replace');
  const cardStash = canEquip && (hero ? !!heroVs?.stash : cardRow?.action === 'stash');
  // the card's line of the next heroes: the list order after the pick (none in hero mode)
  const cardNext = hero ? [] : rows.filter((r) => r !== cardRow);
  // «Дальше: {слот}» — ввод надетого: режим героя, «Надеть» есть, слот формы у героя не надет и есть ещё ненадетые
  const wearNext: SlotId | null = hero && canEquip && heroVs?.useful ? nextToWear(tview, hero.c.id, s.slot) : null;
  const nextNote = wearNext ? t.ui.nextWear(t.ui.slotNames[wearNext]) : null;
  // надеть вещь с формы на персонажа (features/gear/pool putOn); персонаж попадает в ростер; сообщение — куда она встала и что
  // стало с вытесненной, с «Вернуть». Всегда новая запись — и при такой же у него или у другого: в Оценку вводят новую
  // вещь из инвентаря, пулы независимы (В9; окна «Это шлем Rin?» нет)
  // вещь по имени для тоста «Заменить»: сет у брони, предмет у оружия и аксессуара (Epic без предмета — main)
  const pieceLabel = (p: Piece) => (p.setId ? setName(idx, p.setId) : itemCaption(idx, p));
  // «Надеть на CF», когда есть X, — сначала окно перехода (в). Строка и кнопка CF посчитаны по этому же хранилищу
  // (viewOf)
  const doEquip = (c: Char) => {
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
    // «Надеть в игре» (features/ingame): a new piece from the inventory is a promise — the card, the hero list, name search,
    // hero mode in rate mode («Оценить вещь для X», also after «Примерить замену» is used up): every «Надеть» /
    // «Заменить» is a line, «Носит в игре» or not (already worn in the game — one tap clears it). Hero mode from «Ввести»
    // or «Примерить замену» itself enters what the game already has on: no line. Not in a tour. prev — the slot's live promise: the new piece
    // supersedes it, and its record leaves the pool (putOn promised)
    const promise = !touring && (!hero || via === 'rate');
    const promised = promise ? promisedOf(ingame.value, base, c.id) : null;
    const prev = promise ? lineAt(ingame.value, base, c.id, input.slot) : null;
    // it looks like the piece set aside for this very hero (guard): «Надеть» wears that record, no second one
    const wore = same?.c.id === c.id && !same.promised && !rep ? wearFromPool(ctx, base, c.id, same.piece.id, promised) : null;
    const r: PutResult = wore ? { ...wore, piece: wore.st.pieces[wore.id] } : putOn(ctx, base, c.id, input, { replace: rep, promised });
    // the feed line named other heroes' reserves («из запаса Aer»): they go to this one's Breakthrough — their records
    // leave with this «Надеть», as the hero's own reserves do (planPut); «Вернуть» brings them back
    const h = wore ? undefined : rows.find((r) => r.vs.c.id === c.id)?.vs.h;
    const fed = (h?.reserveBt ?? []).filter((f) => f.of && f.of.id !== c.id).map((f) => ({ of: f.of!, piece: f.piece }));
    let st = r.st;
    const backs: ((x: GearStore) => GearStore)[] = [];
    // a superseded promise (prev): its fed reserves were never eaten in the game — back into their heroes' pools (a record
    // already there is left alone; one that is gone with another piece under its id stays gone)
    for (const f of prev?.fed ?? []) {
      const have = st.pieces[f.snap.id];
      if (st.pools[f.hero]?.includes(f.snap.id) || (have && !sameRecord(have, f.snap))) continue;
      st = undoRemove(st, f.snap, [f.hero]);
      backs.unshift((x) => removeFrom(x, f.hero, f.snap.id));
    }
    // ... and the piece the game takes off (P0, a reserve of the hero) just drops into the inventory: it leaves the pool
    if (prev?.was && st.pools[c.id]?.includes(prev.was)) {
      const back = removeUndo(st, c.id, st.pieces[prev.was]), at = st.pools[c.id].indexOf(prev.was), id = prev.was;
      // «Вернуть» puts it back where it stood in the pool (undoRemove appends)
      backs.unshift((x) => {
        if (x.pools[c.id]?.includes(id)) return x;
        const y = back(x), pl = [...(y.pools[c.id] ?? [])];
        pl.splice(Math.min(at, pl.length - 1), 0, pl.pop()!);
        return { ...y, pools: { ...y.pools, [c.id]: pl } };
      });
      st = removeFrom(st, c.id, id);
    }
    for (const f of fed) { backs.unshift(removeUndo(st, f.of.id, f.piece)); st = removeFrom(st, f.of.id, f.piece.id); }
    const fedLines: Fed[] = fed.map((f) => ({ hero: f.of.id, snap: f.piece }));
    const line = promise ? lineOf(r, st, c.id, prev, fedLines) : null;
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
    if (line) ingame.add(line, st);
    // «· T4» — нажата «T4» на форме (В4): с каким Breakthrough вещь легла в пул
    const t4 = input.bt === 4 ? t.ui.withT4 : '';
    // В1: «Заменено» — только про вещи её слота; вытесненные из всех билдов в других слотах — строкой prunedNote (без
    // перечня, вопрос 6).
    // Убраны 2+ вещи её слота — назвать каждую: «Заменено: ботинки Caren — убраны прежние: Speed и Immunity.»
    // Р4: была надетая её слота (её держат билды — осталась в пуле) — тоже «Заменено», как на кнопке (poolVs replaces)
    const mine = r.removed.filter((p) => p.slot === r.piece.slot), pruned = r.removed.filter((p) => p.slot !== r.piece.slot);
    const wasOn = !!r.wasWorn && r.was.includes(r.wasWorn);
    const base1 = mine.length > 1 ? t.ui.replacedMany(c.name, r.piece.slot, [...new Set(mine.map(pieceLabel))], t4)
      : mine.length || wasOn ? t.ui.replaced(c.name, r.piece.slot, t4) : t.ui.equipped(c.name, r.piece.slot, t4);
    // N2: a written line is named in the message; N8: the promise it superseded is gone from the app
    const text = line ? t.ingame.toList(base1) : base1;
    const notes: string[] = [];
    if (line && prev) notes.push(t.ingame.superseded);
    // a superseded promise (prev) never went on in the game: no advice about it (it is rated again from the inventory)
    notes.push(...removedNotes(r, prev ? mine.filter((p) => p.id !== prev.piece) : mine, rep));
    // вопрос 6, PLAN Д7: убранные в других слотах не перечисляем — одна строка «Лишнее убрано…»
    if (pruned.length) notes.push(t.fit.pruned(c.name));
    if (fed.length === 1) notes.push(t.fit.fed(fed[0].piece.slot, pieceLabel(fed[0].piece), fed[0].of.name, !!fed[0].piece.setId));
    else if (fed.length) notes.push(t.fit.fedMany(fed.length, [...new Set(fed.map((f) => f.of.name))]));
    if (sw) notes.push(sw.note);
    say({
      text, note: notes.join(' '), tab: 'eval',
      undo,
      after: both(both(joined, sw?.after), () => { dispatch({ type: 'load', item: was }); backReplace(c.id, rep); if (line) ingame.undo(line, prev); }),
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
  return { onReset, onUndo, doEquip, doStash, cardVs, cardEquip, cardStash, cardNext, nextNote };
}
