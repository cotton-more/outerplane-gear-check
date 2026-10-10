// Подписи вещи в строках экипировки: название вещи и main, Breakthrough, текст бонуса сета.
// Их берут «Надето», «Пул», «Переодеть», шторка вещи и план обмена.
import { EPIC_NAME, isArmor, type Index } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import type { BonusRow } from '@/game/set/setBonus';
import type { Texts } from '@/i18n';
import type { Piece } from '@/features/gear/model/gear';
import { partText, setName } from '@/game/set/setName';
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
// сета или предмета нет в данных (вещь из кода показа с более новых данных) — «нет в твоих данных»
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
      {/* batch: a no-break space glues «· ATK%» to the name's last word, so a wrapped name never leaves it leading a line */}
      {main && <span className={`pm${tone}`}>{name ? `${batch ? '\u00A0' : ''}· ` : ''}{main}</span>}
    </>
  );
}

// a phrase with a piece's caption inside («Снятое оружие Ember — Steel Sword · ATK%»): the caption in the grade's colour,
// like the batch rows (owner 2026-10-10); no caption in the text — the text as is
export function Painted({ text, what, grade }: { text: string; what: string; grade: Piece['grade'] }) {
  const i = what ? text.indexOf(what) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span className={`gname ${grade === 'unique' ? 'legend' : 'epic'}`}>{what}</span>{text.slice(i + what.length)}</>;
}

// Breakthrough вещи в строке: «T4»; «T0–T3» — ниже T4 (форма без «T4», В4); 1–3 — прежняя правка; «T?» — не указан
export const btText = (t: Texts, bt: Bt | null): string => (bt === null ? 'T?' : bt === 0 ? t.ui.btBelow : 'T' + bt);
// Breakthrough отдельной меткой — во всех строках вещей одинаково (Р-3, решение владельца 2026-10-05): в карточке билда и на
// «Надето» — своей колонкой (на телефоне — второй строкой), в списке вещей, плане обмена и «Переодеть» — первой во второй
// строке (.bgear-meta), метки идут столбиком. У любой вещи, и у Epic оружия и аксессуара
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

// A worn set on its own header line (owner 2026-10-10): the set and its value once, its active bonus rows under it —
// «Life ×4   +23,3» / «Health +30% · Health +20%». head — «Life ×4», plus «T4» when every row is T4 and «T?» when a piece's
// Breakthrough is unknown (layout 6.0 decision 3: «mark Breakthrough» ends the rows). body — the rows' bonus texts joined
// with « · »; a row of T4 inside a set that also has T0–T3 rows carries «T4» in front. rows — how many rows the set has:
// one row stays on one line with the head (the UI), several get the head line alone
export interface SetBlock { set: string; head: string; body: string; rows: number }
export function setBlocksOf(t: Texts, idx: Index, rows: readonly BonusRow[]): SetBlock[] {
  const sets: BonusRow[][] = [];
  for (const r of rows) {
    const last = sets[sets.length - 1];
    if (last && last[0].set === r.set) last.push(r);
    else sets.push([r]);
  }
  return sets.map((rs) => {
    const unknown = rs.some((r) => r.unknownBt);
    const allT4 = rs.every((r) => r.tier === 'T4');
    const n = Math.max(...rs.map((r) => r.n));
    const head = partText(idx, { set: rs[0].set, n }) + (allT4 ? ' · T4' : '') + (unknown ? ' · T?' : '');
    const body = rs.map((r) => (!allT4 && r.tier === 'T4' ? 'T4 ' : '') + bonusText(idx, r)).join(' · ') + (unknown ? t.ui.markBt : '');
    return { set: rs[0].set, head, body, rows: rs.length };
  });
}

// a piece in a phrase: armor — «Speed-ботинки», weapon and accessory — «Steel Sword · ATK%» (itemCaption)
export const pieceLabel = (t: Texts, idx: Index) => (p: Piece): string => (p.setId ? t.fit.piece(setName(idx, p.setId), p.slot) : itemCaption(idx, p));
export function usePieceLabel(): (p: Piece) => string {
  return pieceLabel(useT(), useIndex());
}
