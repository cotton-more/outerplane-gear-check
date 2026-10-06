// Пул экипировки, общее разделов: что пул берёт из хранилища, слоты, малые числа. Обзор и решения — index.ts.
import type { Piece, Worn } from '@/features/gear/model/gear';

// то, что пул берёт из хранилища (GearStore v3): вещи, пулы персонажей, seq — счётчик id: по нему номер вещи, которую добавит «Надеть» (planFor);
// worn — надетое героев (слот → запись его пула): его пул держит всегда
export interface PoolStore {
  pieces: Readonly<Record<string, Piece>>;
  pools: Readonly<Record<string, readonly string[]>>;
  worn?: Readonly<Record<string, Readonly<Worn>>>;
  pin?: Readonly<Record<string, string>>; // закрепление героя (.x/0085 FORMULA §6): ключ набора (profile pinKey)
  seq?: number;
}

export const NEWEST = 1e9; // вещь с формы — всегда новее записанных: при равенстве она ничего не вытесняет
export const EPS = 1e-9;

// номер записи из id («p12» → 12); не число или не конечное («p1e400») — 0, как у seqOf хранилища (gearStore)
export const numOf = (id: string) => { const n = Number(id.replace(/^\D+/, '')); return Number.isFinite(n) ? n : 0; };
