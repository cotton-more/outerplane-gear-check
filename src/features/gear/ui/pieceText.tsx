// Подписи вещи в строках экипировки: название вещи и main, Breakthrough, текст бонуса сета.
// Их берут «Надето», «Пул», «Переодеть», шторка вещи и план обмена.
import type { Index } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import { tierLabel, type BonusRow } from '@/game/set/setBonus';
import type { Texts } from '@/i18n';
import type { Piece } from '@/features/gear/model/gear';
import { setName } from '@/game/set/setName';
import { useT } from '@/i18n';
import { useIndex } from '@/game/data/IndexContext';

// название вещи и main отдельно: на узком экране обрезается название, а main (DEF% у оружия) остаётся виден
const nameOf = (ctx: Ctx, p: Piece): string => p.setId
  ? `${setName(ctx.idx, p.setId)} Set`
  : (p.itemKey ? ctx.idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? (p.grade === 'rare' ? 'Epic' : '');
// то же одной строкой («Speed Set», «Combination Simulator · SPD») — для фраз вроде совета «Лучше из своих: …»
export const pieceText = (ctx: Ctx, p: Piece): string => {
  const name = nameOf(ctx, p);
  return p.setId || !p.main ? name : `${name ? name + ' · ' : ''}${p.main}`;
};
// сета или предмета нет в данных (вещь из кода показа с более новых данных) — «нет в твоих данных» (.x/0060 SPEC 3.6)
export function PieceName({ ctx, p }: { ctx: Ctx; p: Piece }) {
  const t = useT();
  const unknown = p.setId ? !ctx.idx.SET[p.setId] : !!p.itemKey && !ctx.idx.ITEM[p.slot as GearKind]?.[p.itemKey];
  const name = unknown ? t.ui.notInData : nameOf(ctx, p);
  const main = p.setId ? null : p.main;
  return (
    <>
      <span className={`gl ${p.grade === 'unique' ? 'L' : 'E'}`}>{p.grade === 'unique' ? 'L' : 'E'}</span>
      {name && <span className="pn">{name}</span>}
      {main && <span className="pm">{name ? '· ' : ''}{main}</span>}
    </>
  );
}

// Breakthrough вещи в строке: «T4»; «T0–T3» — ниже T4 (форма без «T4», В4); 1–3 — прежняя правка; «T?» — не указан
export const btText = (t: Texts, bt: Bt | null): string => (bt === null ? 'T?' : bt === 0 ? t.ui.btBelow : 'T' + bt);
// Breakthrough отдельной меткой — во всех строках вещей одинаково (Р-3, решение владельца 2026-10-05): в карточке билда и на
// «Надето» — своей колонкой (на телефоне — второй строкой), в списке вещей, плане обмена и «Переодеть» — первой во второй
// строке (.bgear-meta), метки идут столбиком. У любой вещи, и у Epic оружия и аксессуара (.x/0060)
export function BtLabel({ p }: { p: Pick<Piece, 'slot' | 'grade' | 'bt'> }) {
  const t = useT();
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

// вещь во фразе: броня — «Speed-ботинки», оружие и аксессуар — имя предмета (Epic — main)
export const pieceLabel = (t: Texts, idx: Index) => (p: Piece): string => (p.setId ? t.fit.piece(setName(idx, p.setId), p.slot)
  : (p.itemKey ? idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? p.main ?? '');
export function usePieceLabel(): (p: Piece) => string {
  return pieceLabel(useT(), useIndex());
}
