// «Обмен вещами» (.x/0040-trade/SPEC.md; мерило — MODEL.md §7): модель расчёта. Расчёт работает не с вещами
// приложения, а с заранее посчитанными числами: мир (герои, вещи), мерило героя по его заказу (очки вещи, ранг, годная
// ли, ценность сетов), кандидаты получателя. Очки — целые тысячные (R2.2): округляются один раз, при построении модели.
import type { Grade, SlotId } from '@/game/data/types';
import type { Subs } from '@/game/item/subs';
import { THRESHOLD, type Milli } from '@/features/gear/model/vs';

// порядок слотов в ключе сравнения и в пороге (R6.2): оружие, аксессуар, шлем, броня, перчатки, ботинки
export const SLOT_ORDER: readonly SlotId[] = ['weapon', 'accessory', 'helmet', 'armor', 'gloves', 'shoes'];
export const GEAR_SLOTS: readonly SlotId[] = ['weapon', 'accessory'];
export const ARMOR_SLOTS: readonly SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];

export type Fit = 'rec' | 'stopgap' | 'no';

export interface Item {
  id: string;
  slot: SlotId;
  code: string;             // R1.2: всё, кроме BT (codeOf)
  bt: number | null;        // Breakthrough; null — не указан
  set: string | null;       // сет брони
  t4: boolean;              // bt === 4
  ord: number;              // номер записи: меньше — старше
  grade?: Grade;            // Epic ('rare') or Legendary ('unique'); synthetic worlds leave it out (Q7 then never applies)
}

export interface Hero {
  id: string;
  rank: number;             // место в ростере
  locked: boolean;          // переодет в этом окне обмена: его надетое следующие не берут (MODEL.md §7 item 4)
  worn: Partial<Record<SlotId, string>>;
  pool: readonly string[];
}

// часть заказа: сет и сколько вещей (2 или 4)
export interface Part { set: string; n: number }
// ценность сета в раскладке (MODEL.md §2): очки, включённые половины, из них — половины сета-эффекта
export interface SetGain { v: Milli; halves: number; eff: number }
// вещь для героя: очки (MODEL.md §1), ранг оружия и аксессуара (MODEL.md §3), годная ли (порог MODEL.md §4; надетое получателя годно всегда)
export interface Worth { v: Milli; fit: Fit; ok: boolean }

// Мерило героя — его заказ (MODEL.md §7 item 1): «По статам» (parts пустые, половины — у всех частей меню) или набор (половины —
// только у его частей)
export interface Gauge {
  key: string;
  parts: readonly Part[];
  value(itemId: string): Worth | null; // null — герой не может носить (класс)
  bonus(set: string, n: number, n4: number): SetGain;
}

export interface World {
  heroes: readonly Hero[];  // герои с вещами, в порядке ростера
  items: Readonly<Record<string, Item>>;
  gauge(heroId: string): Gauge | null; // null — у героя нет билдов (R2.7)
}

export type Cost = 0 | 1 | 2 | 3; // R1.7: надета на получателе, его запас, инвентарь, надета на другом

export interface Cand {
  item: Item;
  v: Milli;
  fit: Fit;
  cost: Cost;
  loss: Milli;              // сколько теряет держатель, если опустеет только этот слот; запас, свободная, своя — 0
  holder: string | null;    // null — свободная вещь
  rank: number;             // место держателя в ростере; свободная — −1
}

export type Cands = Partial<Record<SlotId, readonly Cand[]>>;

// rank — Σ рангов оружия и аксессуара; total — V; pts — очки вещей без сетов; halves / eff — включённые половины (все и
// сетов-эффектов); дальше — ничьи R6.1
export interface KitKey {
  rank: number; total: Milli; pts: Milli; halves: number; eff: number; filled: number;
  legends: number;          // slots held by a Legendary that nobody else wears (cost < 3): at equal V it wins (Q7)
  cost: number; loss: Milli; ranks: number[]; ords: number[];
}
export interface Kit { slots: Partial<Record<SlotId, Cand>>; key: KitKey }

const lex = (a: readonly number[], z: readonly number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) return a[i] - z[i];
  return 0;
};

// польза комплекта, как у лучшей раскладки (MODEL.md §3): ранг, V, заполненность. > 0 — a лучше
export function cmpUse(a: KitKey, z: KitKey): number {
  return a.rank - z.rank || a.total - z.total || a.filled - z.filled;
}

// MODEL.md §3 item 3 и MODEL.md §7 item 5: b лучше a по порогу — выше ранг, или V больше хотя бы на 1 очко, или включилась половина
// сета-эффекта при не меньшем V
// legendOverEpic (Q7): V not lower is enough, no +1 — see legendOverEpic
export const gains = (a: KitKey, b: KitKey, soft = false): boolean =>
  b.rank > a.rank || b.total - a.total >= (soft ? 0 : THRESHOLD) || (b.eff > a.eff && b.total >= a.total);

// Q7 (owner, 2026-10-09): a Legendary from the hero's own pool, a reserve or the inventory in place of the worn Epic of the
// slot needs no +1 point margin, V not lower is enough (its bigger main stat breaks the tie, as in the verdict). A piece
// that another hero wears (cost 3) is not taken for nothing
export const isLegend = (c: Cand): boolean => c.item.grade === 'unique' && c.cost < 3;
export const legendOverEpic = (from: Cand | null | undefined, to: Cand): boolean => !!from && from.item.grade === 'rare' && isLegend(to);

// полный порядок (R2.5, потом ничьи R6.1): > 0 — a лучше
export function cmpKit(a: KitKey, z: KitKey): number {
  return cmpUse(a, z) || a.legends - z.legends || z.cost - a.cost || z.loss - a.loss || -lex(a.ranks, z.ranks) || -lex(a.ords, z.ords);
}

// R1.2: код вещи — содержимое без BT
export function codeOf(p: { slot: SlotId; grade: Grade; setId: string | null; itemKey: string | null; main: string | null; unlisted?: boolean; lit: Subs }): string {
  const lit = Object.entries(p.lit).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0));
  return JSON.stringify([p.slot, p.grade, p.setId, p.itemKey, p.main, !!p.unlisted, lit]);
}
