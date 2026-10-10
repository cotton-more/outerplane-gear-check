// Ценность сета в раскладке брони героя (MODEL.md §2): половины × U + строки, не покрытые половинами (у статового
// сета — их очки, у сета-эффекта — 0). Строки включаются по правилу Breakthrough (bonusRows).
//   - 2 половины — в меню есть часть «S ×4» и включена строка на 4 вещи;
//   - иначе 1 — в меню есть «S ×2» и включена строка на 2 вещи или на 4 (A4: строка 4P T0–T3 у Speed, Penetration и
//     Bursting заменяет 2P и уже содержит её — тогда она покрыта);
//   - иначе 0.
import { bonusRows, convertible } from './setBonus';
import { partKey, rowPoints, type Profile } from '@/game/build/profile';

export interface SetRowValue { n: 2 | 4; tier: 'T4' | 'T0'; pts: number; covered: boolean }
export interface SetValue {
  set: string;
  n: number;            // вещей сета в раскладке
  n4: number;           // …из них на T4
  halves: 0 | 1 | 2;
  effect: boolean;      // не статовый сет: непокрытые строки стоят 0
  rows: SetRowValue[];
  rowsValue: number;    // очки непокрытых строк (только статовый сет)
  value: number;        // halves × U + rowsValue
}

const memo = new WeakMap<Profile, Map<string, SetValue>>();
export function setValue(P: Profile, set: string, n: number, n4: number): SetValue {
  let m = memo.get(P);
  if (!m) memo.set(P, (m = new Map()));
  const key = `${set}:${n}:${n4}`;
  const hit = m.get(key);
  if (hit) return hit;
  const rows = bonusRows(P.ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
  const row2 = rows.some((r) => r.n === 2), row4 = rows.some((r) => r.n === 4);
  const halves: 0 | 1 | 2 = P.parts.has(partKey(set, 4)) && row4 ? 2 : P.parts.has(partKey(set, 2)) && (row2 || row4) ? 1 : 0;
  // одна половина покрывает строку на 2 вещи, а если её нет — строку на 4, которая её заменила
  const covered = (rn: 2 | 4) => halves === 2 || (halves === 1 && (rn === 2 || !row2));
  const effect = !convertible(P.ctx, P.c, set);
  const rv = rows.map((r): SetRowValue => ({ n: r.n, tier: r.tier, pts: rowPoints(P, r.bon), covered: covered(r.n) }));
  const rowsValue = effect ? 0 : rv.filter((r) => !r.covered).reduce((s, r) => s + r.pts, 0);
  const out: SetValue = { set, n, n4, halves, effect, rows: rv, rowsValue, value: halves * P.U + rowsValue };
  m.set(key, out);
  return out;
}
