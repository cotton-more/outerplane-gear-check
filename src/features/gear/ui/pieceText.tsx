// Подписи вещи в строках экипировки: название вещи и main, Breakthrough, текст бонуса сета.
// Их берут «Надето», «Пул», «Переодеть», шторка вещи и план обмена.
import { EPIC_NAME, isArmor, type Index } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import { tierLabel, type BonusRow } from '@/game/set/setBonus';
import type { Texts } from '@/i18n';
import type { Piece } from '@/features/gear/model/gear';
import { setName } from '@/game/set/setName';
import { useT } from '@/i18n';
import { useIndex } from '@/game/data/IndexContext';

// A weapon or accessory named in a phrase, one rule everywhere (owner 2026-10-09, Q4): a Legendary — its item, an Epic —
// the game's name (EPIC_NAME), then the main: «Noblewoman's Guile · HP%», «Steel Sword · ATK%»; main unknown — «Steel Sword»
type Named = Pick<Piece, 'slot' | 'grade' | 'itemKey' | 'main'>;
const itemName = (idx: Index, p: Named): string =>
  (p.itemKey ? idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? (p.grade === 'rare' ? EPIC_NAME[p.slot as GearKind] : '');
// The «·» and the main hang on the name's last word with no-break spaces: a wrapped name never leaves «· ATK%» leading the next line
export const itemCaption = (idx: Index, p: Named): string => [itemName(idx, p), p.main].filter(Boolean).join('\u00A0·\u00A0');

// название вещи и main отдельно: на узком экране обрезается название, а main (DEF% у оружия) остаётся виден
const nameOf = (ctx: Ctx, p: Piece): string => p.setId ? `${setName(ctx.idx, p.setId)} Set` : itemName(ctx.idx, p);
// то же одной строкой («Speed Set», «Combination Simulator · SPD») — для фраз вроде совета «Лучше из своих: …»
export const pieceText = (ctx: Ctx, p: Pick<Piece, 'slot' | 'grade' | 'itemKey' | 'main' | 'setId'>): string =>
  p.setId ? `${setName(ctx.idx, p.setId)} Set` : itemCaption(ctx.idx, p);

// The caption line a weapon or accessory gets under a step title or after a taken-off piece's hero; armor has none:
// its title says the slot, the hero and the set are known (batch title)
export const capLine = (t: Texts, idx: Index, p: Named & Pick<Piece, 'bt'>): string => (isArmor(p.slot) ? '' : batchCaption(t, idx, p));

// The piece in a batch line (Q4): the grade and the set are in the batch's title, so armor is its slot word alone, a
// weapon or accessory its caption; «T4» only at T4 (armor: the word, then T4)
export const batchCaption = (t: Texts, idx: Index, p: Named & Pick<Piece, 'bt'>): string =>
  (isArmor(p.slot) ? t.ui.slotNom[p.slot] : itemCaption(idx, p)) + (p.bt === 4 ? '\u00A0·\u00A0T4' : '');
// сета или предмета нет в данных (вещь из кода показа с более новых данных) — «нет в твоих данных» (.x/0060 SPEC 3.6)
// batch — a row of the batch (Q4): no grade chip, the caption in the grade's colour, armor is its slot word alone
export function PieceName({ ctx, p, batch }: { ctx: Ctx; p: Piece; batch?: boolean }) {
  const t = useT();
  const armor = isArmor(p.slot);
  const unknown = p.setId ? !ctx.idx.SET[p.setId] : !!p.itemKey && !ctx.idx.ITEM[p.slot as GearKind]?.[p.itemKey];
  const name = batch && armor ? t.ui.slotNom[p.slot] : unknown ? t.ui.notInData : nameOf(ctx, p);
  const main = p.setId ? null : p.main;
  const tone = batch ? ` gname ${p.grade === 'unique' ? 'legend' : 'epic'}` : '';
  return (
    <>
      {!batch && <span className={`gl ${p.grade === 'unique' ? 'L' : 'E'}`}>{p.grade === 'unique' ? 'L' : 'E'}</span>}
      {name && <span className={`pn${tone}`}>{name}</span>}
      {main && <span className={`pm${tone}`}>{name ? '· ' : ''}{main}</span>}
    </>
  );
}

// Breakthrough вещи в строке: «T4»; «T0–T3» — ниже T4 (форма без «T4», В4); 1–3 — прежняя правка; «T?» — не указан
export const btText = (t: Texts, bt: Bt | null): string => (bt === null ? 'T?' : bt === 0 ? t.ui.btBelow : 'T' + bt);
// Breakthrough отдельной меткой — во всех строках вещей одинаково (Р-3, решение владельца 2026-10-05): в карточке билда и на
// «Надето» — своей колонкой (на телефоне — второй строкой), в списке вещей, плане обмена и «Переодеть» — первой во второй
// строке (.bgear-meta), метки идут столбиком. У любой вещи, и у Epic оружия и аксессуара (.x/0060)
// t4Only — a batch row (Q4): the tier only at T4, nothing for T0–T3 or an unknown one
export function BtLabel({ p, t4Only }: { p: Pick<Piece, 'slot' | 'grade' | 'bt'>; t4Only?: boolean }) {
  const t = useT();
  if (t4Only && p.bt !== 4) return null;
  return <span className="bgear-m">{btText(t, p.bt)}</span>;
}

// текст бонуса из данных: T4 — p2/p4, T0–T3 — p2base/p4base
export const bonusText = (idx: Index, r: BonusRow): string => {
  const s = idx.SET[r.set];
  return (r.n === 4 ? (r.tier === 'T4' ? s?.p4 : s?.p4base) : r.tier === 'T4' ? s?.p2 : s?.p2base) ?? '';
};

// включённые бонусы с уровнем; «T?» — отметь Breakthrough (макет 6.0 решение 3: строки «не из билдов» нет)
export function bonusLinesOf(t: Texts, idx: Index, rows: readonly BonusRow[]): string[] {
  return rows.map((r) => {
    const tier = r.unknownBt ? 'T?' : tierLabel(r.tier);
    return t.ui.bonusRow(setName(idx, r.set), r.n, tier, bonusText(idx, r)) + (r.unknownBt ? t.ui.markBt : '');
  });
}

// a piece in a phrase: armor — «Speed-ботинки», weapon and accessory — «Steel Sword · ATK%» (itemCaption)
export const pieceLabel = (t: Texts, idx: Index) => (p: Piece): string => (p.setId ? t.fit.piece(setName(idx, p.setId), p.slot) : itemCaption(idx, p));
export function usePieceLabel(): (p: Piece) => string {
  return pieceLabel(useT(), useIndex());
}
