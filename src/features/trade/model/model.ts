// «Обмен вещами» (.x/0040-trade/SPEC.md, решения реализации — DESIGN.md): модель расчёта. Расчёт работает не с вещами
// приложения, а с заранее посчитанными числами: мир (герои, вещи), мерило героя (ценность вещи, рекомендованность,
// бонусы сетов), кандидаты получателя. Очки — целые тысячные (R2.2): округляются один раз, при построении модели.
import type { Grade, SlotId } from '@/game/data/types';
import type { Subs } from '@/game/item/subs';

export type Milli = number;
export const milli = (points: number): Milli => Math.round(points * 1000);

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
}

export interface Hero {
  id: string;
  rank: number;             // место в ростере
  pinned: boolean;          // «Не отдавать надетое» (R3)
  worn: Partial<Record<SlotId, string>>;
  pool: readonly string[];
}

// часть связки мерила: сет, сколько вещей нужно, конвертируемый ли (R2.3)
export interface Part { set: string; n: number; conv: boolean }
export interface SetGain { v: Milli; top: number } // очки бонусов сета и наибольшая активная строка (0, 2, 4)

// Мерило героя (R2.1): билд из «Надето» или «По статам» (parts пустые)
export interface Gauge {
  key: string;
  parts: readonly Part[];
  value(itemId: string): { v: Milli; fit: Fit } | null; // null — герой не может носить (класс)
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

export interface KitKey {
  hard: number; live: number; soft: number; rec: number; stop: number; total: Milli; filled: number;
  cost: number; loss: Milli; ranks: number[]; ords: number[];
}
export interface Kit { slots: Partial<Record<SlotId, Cand>>; key: KitKey }

const lex = (a: readonly number[], z: readonly number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) return a[i] - z[i];
  return 0;
};

// польза комплекта по R2.5: > 0 — a лучше
export function cmpUse(a: KitKey, z: KitKey): number {
  return a.hard - z.hard || a.live - z.live || a.soft - z.soft || a.rec - z.rec || a.stop - z.stop
    || a.total - z.total || a.filled - z.filled;
}

// полный порядок (R2.5, потом ничьи R6.1): > 0 — a лучше
export function cmpKit(a: KitKey, z: KitKey): number {
  return cmpUse(a, z) || z.cost - a.cost || z.loss - a.loss || -lex(a.ranks, z.ranks) || -lex(a.ords, z.ords);
}

// R1.2: код вещи — содержимое без BT
export function codeOf(p: { slot: SlotId; grade: Grade; setId: string | null; itemKey: string | null; main: string | null; unlisted?: boolean; lit: Subs }): string {
  const lit = Object.entries(p.lit).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0));
  return JSON.stringify([p.slot, p.grade, p.setId, p.itemKey, p.main, !!p.unlisted, lit]);
}
