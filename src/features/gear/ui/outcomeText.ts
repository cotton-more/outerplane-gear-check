// Слова вердикта «статы + сеты» (.x/0085 TEXTS.md): штамп, заголовок и строки по исходу вещи (features/gear/verdict) —
// для панели вердикта, карточки и «Сейчас на персонажах». Штамп — про оцениваемую вещь (PLAN Д2).
import { isArmor, type Index } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import type { Texts } from '@/i18n';
import type { ItemInput } from '@/game/item/item';
import { partText, setName } from '@/game/set/setName';
import type { Piece } from '@/features/gear/model/gear';
import type { VerdictKind } from '@/features/eval/verdict/verdict';
import type { HeroRes, Result } from '@/features/gear/verdict';

type Label = (p: Piece) => string;
const itemName = (idx: Index, x: Pick<ItemInput, 'slot' | 'itemKey' | 'main'>): string =>
  (x.itemKey ? idx.ITEM[x.slot as GearKind][x.itemKey]?.name : undefined) ?? x.main ?? '';

// «Слабый Speed-шлем из запаса Caren — в Breakthrough этой» (§4 п. 3б, 3в)
function feedLine(t: Texts, idx: Index, h: HeroRes, item: ItemInput): string | null {
  if (!h.reserveBt) return null;
  return item.setId ? t.fit.feed(setName(idx, item.setId), item.slot, h.c.name) : t.fit.feedItem(itemName(idx, item), h.c.name);
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
  const feed = feedLine(t, idx, h, item);
  if (feed) out.push(feed);
  return out;
}

// штамп, заголовок и строки по исходу. «Надень» и «Оставь» — без строк: что даёт каждому названному герою, говорит
// «Сейчас на персонажах» (PLAN Д3). «Спорно» и «Разобрать» — в useVerdictModel, где есть прежний вердикт по порогам
export function resultHead(t: Texts, idx: Index, r: Result, item: ItemInput): { v: VerdictKind; title: string; lines: string[] } | null {
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
    return { v: 'fodder', title: F.btNow(item.slot, n.c.name), lines: [F.btNowWhy(item.slot, n.c.name)] };
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
