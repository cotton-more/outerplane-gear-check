// Подписи вещи и билда в строках экипировки: название вещи и main, Breakthrough, текст бонуса сета, «почему собираю».
// Их берут карточка билда (screens/chars/BuildGear), пул, «Надето», «Переодеть» и план обмена.
import type { Index } from '@/game/data';
import type { Char, GearKind } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Bt } from '@/game/item/item';
import { tierLabel, type BonusRow } from '@/game/set/setBonus';
import { buildOfKey, type Variant } from '@/game/build/variants';
import type { Texts } from '@/i18n';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { isStats, markOfVariant, type CharPool } from '@/features/gear/pool';
import { partText, setName } from '@/game/set/setName';
import { useT } from '@/i18n';
import { hasBt } from '@/game/item/item';

// название вещи и main отдельно: на узком экране обрезается название, а main (DEF% у оружия) остаётся виден
const nameOf = (ctx: Ctx, p: Piece): string => p.setId
  ? `${setName(ctx.idx, p.setId)} Set`
  : (p.itemKey ? ctx.idx.ITEM[p.slot as GearKind][p.itemKey]?.name : undefined) ?? (p.grade === 'rare' ? 'Epic' : '');
// то же одной строкой («Speed Set», «Combination Simulator · SPD») — для фраз вроде совета «Лучше из своих: …»
export const pieceText = (ctx: Ctx, p: Piece): string => {
  const name = nameOf(ctx, p);
  return p.setId || !p.main ? name : `${name ? name + ' · ' : ''}${p.main}`;
};
export function PieceName({ ctx, p }: { ctx: Ctx; p: Piece }) {
  const name = nameOf(ctx, p);
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
// строке (.bgear-meta), метки идут столбиком. У Epic оружия и аксессуара Breakthrough нет — метки нет
export function BtLabel({ p }: { p: Pick<Piece, 'slot' | 'grade' | 'bt'> }) {
  const t = useT();
  return hasBt(p.slot, p.grade) ? <span className="bgear-m">{btText(t, p.bt)}</span> : null;
}

// текст бонуса из данных: T4 — p2/p4, T0–T3 — p2base/p4base
export const bonusText = (idx: Index, r: BonusRow): string => {
  const s = idx.SET[r.set];
  return (r.n === 4 ? (r.tier === 'T4' ? s?.p4 : s?.p4base) : r.tier === 'T4' ? s?.p2 : s?.p2base) ?? '';
};

// Собираю: почему вариант собирается (или нет) — строка рядом с переключателем. Всё — по показанной раскладке, как чип
// и слоты. Собирается он потому, что часть связки можно собрать из пула, а раскладка ради статов её не взяла (Р1), —
// «— Speed ×2 собирается из вещей Caren, но сейчас выгоднее без неё»: «готова» противоречило бы слотам
export function wantWhy(t: Texts, idx: Index, cp: CharPool, st: GearStore, v: Variant): string {
  if (!cp.inPlay.includes(v)) return t.ui.fillingOff;
  if (isStats(v)) return '';
  const a = cp.asm.get(v.key)!;
  if (a.need && a.progress === a.need) return t.ui.fillingWhy.done;
  const mark = markOfVariant(st.marks, v);
  if (mark === 'want') return (st.v1builds as Record<string, unknown> | undefined)?.[v.parentKey] ? t.ui.fillingWhy.prev : '';
  if (a.complete.length) return t.ui.fillingHalf(`${idx.SET[a.complete[0].set]?.short ?? a.complete[0].set} ×${a.complete[0].n}`);
  const reach = cp.reach.get(v.key) ?? a;
  if (reach !== a) {
    const part = reach.complete.find((p) => !a.complete.some((q) => q.set === p.set));
    return part ? t.ui.fillingReach(partText(idx, part), cp.c.name) : '';
  }
  // начат (Р14), но не ближе всех — строки нет: «ближе всех» было бы неправдой
  const top = Math.max(0, ...cp.inPlay.filter((x) => !isStats(x)).map((x) => (cp.reach.get(x.key) ?? cp.asm.get(x.key)!).progress));
  return a.progress && a.progress === top ? t.ui.fillingWhy.closest : '';
}

// бонусы: все активные с уровнем; «T?» — отметь Breakthrough; сет не из связки — бонус всё равно считается
export function bonusLinesOf(t: Texts, idx: Index, c: Char, rows: readonly BonusRow[], combo: readonly { set: string }[]): string[] {
  return rows.map((r) => {
    const tier = r.unknownBt ? 'T?' : tierLabel(r.tier);
    const own = combo.some((p) => p.set === r.set);
    return t.ui.bonusRow(setName(idx, r.set), r.n, tier, bonusText(idx, r)) + (r.unknownBt ? t.ui.markBt : '') + (own ? '' : ` · ${t.ui.incidental(c.name)}`);
  });
}

// имя варианта для показа (Р5: «Defense mix · Swiftness», а не имя родителя): у «По статам» — «По статам», не его ключ.
// Выбранный билд героя — везде им (решение владельца 2026-10-05, Р-1): карточка, «Надето», обмен, режим героя, вердикт
export const variantName = (t: Texts, v: Variant) => (isStats(v) ? t.ui.byStats : v.name);
// имя билда по ключу во фразе: «Идёт в …», «остаётся в …» — у «По статам» в кавычках
export const buildName = (t: Texts, key: string) => buildOfKey(key, t.ui.byStatsQ);
