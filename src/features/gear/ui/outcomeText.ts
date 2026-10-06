// Слова вердикта «статы + сеты» (.x/0085 TEXTS.md): штамп, заголовок и строки по исходу вещи (features/gear/verdict) —
// для панели вердикта, карточки и «Сейчас на персонажах». Штамп — про оцениваемую вещь (PLAN Д2).
import { isArmor, type Index } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import type { Texts } from '@/i18n';
import type { ItemInput } from '@/game/item/item';
import { partText, setName } from '@/game/set/setName';
import { subsText } from '@/game/text';
import type { Piece } from '@/features/gear/model/gear';
import type { VerdictKind } from '@/features/eval/verdict/verdict';
import type { HeroRes, Result } from '@/features/gear/verdict';

type Label = (p: Piece) => string;
const itemName = (idx: Index, x: Pick<ItemInput, 'slot' | 'itemKey' | 'main'>): string =>
  (x.itemKey ? idx.ITEM[x.slot as GearKind][x.itemKey]?.name : undefined) ?? x.main ?? '';

// отложенная вещь во фразе — как найти её в игре: «Это Speed-шлем · DEF 1, SPD 2, RES 2, отложен 06.10.»
export const stashedLine = (t: Texts, p: Piece, label: Label): string => t.fit.stashedOne(p.slot, label(p), subsText(p.lit), t.fit.date(p.at));

// «Слабый Speed-шлем из запаса Caren — в Breakthrough этой» (§4 п. 3б, 3в) и какой он
function feedLines(t: Texts, idx: Index, h: HeroRes, item: ItemInput, label: Label): string[] {
  if (!h.reserveBt) return [];
  const feed = item.setId ? t.fit.feed(setName(idx, item.setId), item.slot, h.c.name) : t.fit.feedItem(itemName(idx, item), h.c.name);
  return [feed, stashedLine(t, h.reserveBt, label)];
}

// строки героя: «Надень» — прирост, половины, вещи пула вместе с ней; «Оставь» — почему держать; запасная — ей в Breakthrough
export function heroLines(t: Texts, idx: Index, h: HeroRes, item: ItemInput, label: Label): string[] {
  const F = t.fit;
  const out: string[] = [];
  const name = h.c.name;
  if (h.kind === 'wear') {
    if (h.dV >= 0.005) out.push(F.gain(name, F.pts(h.dV)));
    if (h.rankUp) out.push(F.rankUp(name));
    const parts = F.parts(h.parts.on.map((p) => partText(idx, p)), h.parts.off.map((p) => partText(idx, p)));
    if (parts) out.push(parts);
    if (h.alsoWear.length) out.push(F.alsoWear(name, h.alsoWear.map(label)));
  } else if (h.kind === 'keep' && item.setId) {
    const set = setName(idx, item.setId);
    if (h.sub === 'a') {
      out.push(F.keepWait(name, set));
      if (h.needT4) out.push(F.keepT4(partText(idx, h.needT4)));
    } else out.push(F.keepStatsWhy(set, name));
  }
  out.push(...feedLines(t, idx, h, item, label));
  return out;
}

// штамп, заголовок и строки по исходу. «Надень» и «Оставь» — без строк: что даёт каждому названному герою, говорит
// «Сейчас на персонажах» (PLAN Д3). «Спорно» и «Разобрать» — в useVerdictModel, где есть прежний вердикт по порогам
export function resultHead(t: Texts, idx: Index, r: Result, item: ItemInput, label: Label): { v: VerdictKind; title: string; lines: string[] } | null {
  const F = t.fit;
  const h = r.named[0];
  if (r.kind === 'wear') {
    const title = h.temp ? (h.slotEmpty ? F.tempEmpty : F.tempBetter)(h.c.name) : (h.slotEmpty ? F.wearEmpty : F.wearBetter)(h.c.name);
    return { v: h.temp ? 'temp' : 'keep', title, lines: [] };
  }
  if (r.kind === 'keep') {
    const set = item.setId ? setName(idx, item.setId) : '';
    const title = h.sub === 'a' ? F.keepBest(set, item.slot, h.c.name, h.temp) : F.keepStats(h.c.name, h.temp);
    return { v: h.temp ? 'temp' : 'keep', title, lines: [] };
  }
  if (r.kind === 'material' && r.sub === 'now') {
    const n = r.now[0];
    // цель не надета (отложена) — как её найти
    const stashed = n.worn ? [] : [stashedLine(t, n.piece, label)];
    return { v: 'fodder', title: F.btNow(item.slot, n.c.name), lines: [F.btNowWhy(item.slot, n.c.name), ...stashed] };
  }
  if (r.kind === 'material' && r.sub === 'inventory' && item.setId) {
    const set = setName(idx, item.setId);
    return { v: 'fodder', title: F.inventory, lines: [F.inventoryWhy(r.reserve[0].name, set, item.slot)] };
  }
  if (r.kind === 'material') {
    const c = r.reserve[0];
    if (isArmor(item.slot) && item.setId) {
      const set = setName(idx, item.setId);
      return { v: 'fodder', title: F.reserve(set, item.slot, c.name), lines: [F.reserveWhy(c.name, set, item.slot)] };
    }
    const name = itemName(idx, item);
    const mains = [...new Set(c.builds.flatMap((b) => (item.slot === 'weapon' ? b.weapons : b.amulets).filter((g) => g.key === item.itemKey).flatMap((g) => g.mains)))];
    return { v: 'fodder', title: F.reserveItem(name, c.name), lines: [F.reserveItemWhy(c.name, name, mains.join('/'))] };
  }
  return null;
}
