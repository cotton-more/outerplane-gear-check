// Варианты билда (GEARPOOL): у билда outerpedia с несколькими связками сетов каждая связка — отдельный билд, который
// собирается из вещей персонажа сам (Anarky «Defense mix» → Penetration, Swiftness, Immunity: 13 билдов → 44
// варианта, всего 296). Цепочка, оружие и аксессуар — всегда родителя. В D.chars варианты не попадают: вердикт
// (evaluate) и эталон видят билды как есть.
import type { Index } from '@/game/data';
import type { Build, Char, Combo } from '@/game/data/types';
import { comboText } from './builds';
import { setName } from '@/game/set/setName';

// ключ билда героя; билд — по имени: номер в списке outerpedia может сдвинуться при обновлении данных
export const buildKey = (charId: string, build: string) => `${charId}/${build}`;

export interface Variant {
  key: string;        // ключ: у билда с одной связкой — buildKey, иначе buildKey#sig
  name: string;       // для показа (не ключ): «Defense mix · Penetration»
  parent: Build;
  parentKey: string;  // buildKey родителя
  b: Build;           // билд с одной связкой: у единственной — сам родитель
  sig: string | null; // подпись связки (null — у билда с одной связкой)
}

// подпись связки: части по номеру сета, «2x2+11x2» — от порядка связки в outerpedia (он ничего не значит) не зависит
export const comboSig = (combo: Combo): string =>
  [...combo].sort((a, z) => Number(a.set) - Number(z.set) || a.n - z.n).map((p) => `${p.set}x${p.n}`).join('+');

// что отличает связку от соседних: сет, общий для всех связок билда (у 11 из 13), не называем
function varyingPart(idx: Index, b: Build, combo: Combo): string {
  const common = b.sets[0].filter((p) => b.sets.every((cb) => cb.some((q) => q.set === p.set))).map((p) => p.set);
  const rest = combo.filter((p) => !common.includes(p.set));
  return common.length && rest.length ? rest.map((p) => setName(idx, p.set)).join(' + ') : comboText(idx, combo);
}

const memo = new WeakMap<Char, Variant[]>();

export function variantsOf(idx: Index, c: Char): Variant[] {
  const hit = memo.get(c);
  if (hit) return hit;
  const out: Variant[] = [];
  for (const parent of c.builds) {
    const parentKey = buildKey(c.id, parent.name);
    if (parent.sets.length <= 1) { out.push({ key: parentKey, name: parent.name, parent, parentKey, b: parent, sig: null }); continue; }
    for (const combo of parent.sets) {
      const sig = comboSig(combo);
      const name = `${parent.name} · ${varyingPart(idx, parent, combo)}`;
      out.push({ key: `${parentKey}#${sig}`, name, parent, parentKey, b: { ...parent, name, sets: [combo] }, sig });
    }
  }
  memo.set(c, out);
  return out;
}

// имя билда по ключу варианта — родителя, без подписи связки («2000116/Defense mix#2x2+11x2» → «Defense mix»);
// stats — как назвать «По статам»
export function buildOfKey(key: string, stats: string): string {
  const name = key.slice(key.indexOf('/') + 1).split('#')[0];
  return name || stats;
}
