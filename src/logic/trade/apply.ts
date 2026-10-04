// «Сделал» плана героя (R6.6, R8.5, R8.6, R3.2, R4.3–R4.5, R10.6, .x/0040-trade/SPEC.md): одна запись в хранилище.
// Изменения: вещь уходит из пула держателя (была надета — дыра), входит в пул получателя и надевается; свободная — просто
// в пул; снятая остаётся в пуле получателя ненадетой. Копии взятого (тот же код) в пуле получателя уходят из пула — их
// может взять дыра, иначе их больше нет в приложении (leftovers). Заполнения дыр: вещь — из пула держателя (свободная —
// из пула получателя), в пул героя дыры, надета. Закрепление получателя = переключатель плана. План считали на другом
// хранилище — null (пересчитать). «Вернуть» — хранилище до шага, если после шага его не трогали.
import type { SlotId } from '../../data/types';
import { gc, setPinned, type GearStore } from '../gear';
import { codeOf } from './model';
import type { HeroPlan } from './plan';

export const stampOf = (st: GearStore): string => JSON.stringify(st);

// копии взятого в пуле получателя: тот же код, сама вещь не взята (R6.6)
function copiesOf(st: GearStore, hp: HeroPlan, to: string): string[] {
  const taken = new Set(hp.plan.changes.map((c) => c.cand.item.id));
  const codes = new Set([...taken].map((id) => st.pieces[id]).filter(Boolean).map(codeOf));
  return (st.pools[to] ?? []).filter((id) => !taken.has(id) && st.pieces[id] && codes.has(codeOf(st.pieces[id])));
}

// копии, которые после «Сделал» не будут ни в одном пуле: «старый … останется в инвентаре, из приложения уйдёт»
export function leftovers(st: GearStore, hp: HeroPlan, to: string): string[] {
  const filled = new Set(hp.holes.fills.map((f) => f.cand?.item.id));
  return copiesOf(st, hp, to).filter((id) => !filled.has(id));
}

export interface Applied { st: GearStore; undo: (x: GearStore) => GearStore | null }

export function applyHero(st: GearStore, o: { to: string; hp: HeroPlan; pin: boolean; stamp: string }): Applied | null {
  if (stampOf(st) !== o.stamp) return null;
  const pools: Record<string, string[]> = Object.fromEntries(Object.entries(st.pools).map(([c, ids]) => [c, [...ids]]));
  const worn: Record<string, Partial<Record<SlotId, string>>> = Object.fromEntries(Object.entries(st.worn ?? {}).map(([c, w]) => [c, { ...w }]));
  const out = (c: string, id: string) => { if (pools[c]) pools[c] = pools[c].filter((x) => x !== id); };
  const put = (c: string, slot: SlotId, id: string) => {
    if (!(pools[c] ??= []).includes(id)) pools[c].push(id);
    (worn[c] ??= {})[slot] = id;
  };
  const { to } = o;
  for (const id of copiesOf(st, o.hp, to)) out(to, id);
  for (const { slot, cand } of o.hp.plan.changes) {
    if (cand.holder && cand.holder !== to) out(cand.holder, cand.item.id);
    if (worn[to]?.[slot] && worn[to][slot] !== cand.item.id) delete worn[to][slot];
    put(to, slot, cand.item.id);
  }
  for (const f of o.hp.holes.fills) {
    if (!f.cand) continue;
    out(f.cand.holder ?? to, f.cand.item.id);
    put(f.hero, f.slot, f.cand.item.id);
  }
  const rest = Object.fromEntries(Object.entries(worn).filter(([, w]) => Object.keys(w).length));
  const { worn: _w, ...base } = st;
  const next = setPinned(gc({ ...base, pools, ...(Object.keys(rest).length ? { worn: rest } : {}) }), to, o.pin);
  const after = stampOf(next);
  return { st: next, undo: (x) => (stampOf(x) === after ? st : null) };
}
