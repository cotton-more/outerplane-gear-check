// Датасет страницы — то, что update.py кладёт в window.OGC_DATA (build_dataset / build_view / build_families).
// Меняешь формат в update.py — поправь и здесь.

export type Grade = 'unique' | 'rare';
export type GearKind = 'weapon' | 'accessory';
export type ArmorSlot = 'helmet' | 'armor' | 'gloves' | 'shoes';
export type SlotId = GearKind | ArmorSlot;

export interface SetPiece { set: string; n: number }
export type Combo = SetPiece[];

export interface GearRef {
  key: string;
  mains: string[];
  bad?: string[]; // main stat, которого у предмета не бывает (опечатка outerpedia)
}

export interface Build {
  name: string;
  sets: Combo[];
  weapons: GearRef[];
  amulets: GearRef[];
  talismans: string[];
  subs: string[][]; // ступени приоритета; пустая ступень — разрыв («>>»)
  note: string;
}

// [база на lv100, база на макс. Limit Break, flat-бонус Quirks]
export type FlatBase = [number, number, number];

export interface Char {
  id: string;
  slug: string;
  name: string;
  base: string;
  prefix: string | null;
  nick: string;
  rarity: number | null;
  element: string;
  class: string;
  subClass: string | null;
  icon: string;
  rank: string | null;
  role: string | null;
  free: boolean;
  builds: Build[];
  gameSets?: string[];
  rankPvp: string | null;
  flat: { levels: [number, number]; ATK: FlatBase | null; DEF: FlatBase | null; HP: FlatBase | null };
}

export interface GearSet {
  id: string;
  name: string;
  short: string;
  icon: string;
  p2: string | null;
  p4: string | null;
  p2base: string | null;
  p4base: string | null;
  pieces: Partial<Record<ArmorSlot, string>>;
  users: number;
}

export interface Passive { name: string; desc: string; icon: string | null }

export interface Item {
  key: string;
  family: string;
  name: string;
  baseName: string;
  icon: string;
  kind: GearKind;
  grade: string;
  star: number;
  stars: number[];
  irregular: boolean;
  src: string | null;
  classLimits: string[];
  mains: string[];
  extraMains: string[]; // бывает только у фиксированных копий
  passives: Passive[];
  users: number;
}

export interface Substat {
  key: string;
  step: number;
  pct: boolean;
  stat: string;
  mode: string | null;
}

export interface Talisman { name: string; icon: string; mode: string | null }

export interface Meta {
  generatedAt: string;
  source: string;
  commit: string | null;
  commitDate: string | null;
  gameVersion: string | null;
  counts: { characters: number; withBuilds: number; builds: number; weapons: number; accessories: number };
  newIds?: string[];
}

export interface Dataset {
  meta: Meta;
  classes: Record<string, string>;
  elements: Record<string, string>;
  statNames: Record<string, string>;
  substats: Substat[];
  slotIcons: Record<SlotId, string | null>;
  mainLabels: string[];
  sets: GearSet[];
  weapons: Item[];
  amulets: Item[];
  talismans: Record<string, Talisman>;
  chars: Char[];
  img?: Record<string, string>; // ключ картинки → data URI, относительный путь или URL CDN
}
