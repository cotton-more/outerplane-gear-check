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
  fusionOf?: string; // у Core Fusion — id обычного героя: Core Fusion X заменяет X в ростере
  builds: Build[];
  gameSets?: string[];
  rankPvp: string | null;
  flat: { levels: [number, number]; ATK: FlatBase | null; DEF: FlatBase | null; HP: FlatBase | null };
  spd?: FlatBase | null; // база SPD для бонуса Speed Set (он в % от базы); нет в старых снимках — бонус не переводится в статы
  // CHC from sources that are always on, ‰ (1000 = 100 %): base, class passive (Striker +50), awakening quirks (by the
  // `quirks` setting). Missing in old snapshots: no «Крит: 45%» line. trans — CHC of the transcend passive by the
  // in-game ★1…6, ‰ (the bearer's own sheet); only for the heroes whose stars give crit
  chc?: { base: number; cls: number; quirk: number; trans?: number[] };
  // EFF from sources that are always on (update.py eff_profile; the game's formula in HISTORY.md 0200-boss RESEARCH §1.2):
  // w — white EFF [Lv100, Lv120] (the `lv120` setting picks one); r — flat quirk node (Ranger +50, by `quirks`); p — a
  // passive's permanent premium, ‰ (Core Fusion Notia +500, only at Core Fusion level 5 = fusion passive level 2; the
  // data assumes it maxed); t — transcend passive by the in-game ★1…6: r premium ‰, f flat; tm — 1 when that t.r
  // premium is a MY_TEAM row: it reaches every ally in battle (+3 % ★4–5, +6 % ★6; Gnosis Nella +6 % from ★4), not only
  // the bearer's own sheet; without tm it is self-only. Heroes with both kinds of rows are not flagged (none today);
  // ee — the EE's permanent self premium, ‰ (the app can't know whether the player owns the EE or its level: used only
  // for the «type EFF from the game» hint, never added to the sheet); d — 1 when the hero needs EFF against a boss's RES (rule R, HISTORY.md 0200-boss
  // RESEARCH §1.5). Missing in old snapshots
  eff?: { w: [number, number]; r?: number; p?: number; t?: { r?: number[]; f?: number[] }; tm?: 1; ee?: number; d?: 1 };
  // SPD the transcend passive adds in battle (update.py spd_up, HISTORY.md 0200-boss E4 Q6): t — flat by the in-game ★1…6; tm — 1 when it
  // reaches every ally (outerpedia's "Ally Speed transcend bonus"), else the hero alone. Missing — no such row (or an old snapshot)
  spdUp?: { t: number[]; tm?: 1 };
  // why the hero should move before the boss (update.py turn_reasons, E4 Q1): a skill ready on turn 1 and what it does — to the
  // boss (fx — the effect the boss may be immune to, Boss.imm ids) or for the team. Missing — nothing timed on turn 1
  turn?: TurnReason[];
}

// a turn-1 reason: on the boss — atk, slow (SPD down), crit, push (priority down), taunt, stun, freeze, stone, silence,
// cool (cooldown up); for the team — shield, def, cut (damage taken down), invul, immune; shield1 — a shield on the one ally
// with the lowest HP (not the whole team: its own text). lv — the lowest skill level the reason holds from (2…5); missing —
// from level 1. The app assumes the max skill level, so lv only goes to the why line
export type TurnKind = 'atk' | 'slow' | 'crit' | 'push' | 'taunt' | 'stun' | 'freeze' | 'stone' | 'silence' | 'cool'
  | 'shield' | 'shield1' | 'def' | 'cut' | 'invul' | 'immune';
export interface TurnReason { s: 's1' | 's2' | 's3'; k: TurnKind; fx?: string; lv?: number }

// Строка бонуса сета числом, в единицах сабстата stat (Attack 2P T4 → ATK% 35). stat — ключ сабстата, если бонус
// выражается им (8 сетов-статов); иначе null — в статах не выразить (Penetration, Counterattack, сеты-эффекты; у
// эффекта value 0). mode: rate — % от базы персонажа (у SPD — от базы SPD), add — прибавка, как у сабстата
export interface SetBonus { stat: string | null; value: number; mode: 'rate' | 'add' }
export interface SetBonusRows { p2: SetBonus | null; p4: SetBonus | null }

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
  bonus?: { t0: SetBonusRows; t4: SetBonusRows }; // t0 — строка T0–T3, t4 — T4; нет в старых снимках — бонус не считается
  users: number;
  fixed?: Partial<Record<ArmorSlot, Partial<Record<Grade, string[]>>>>; // строки main брони этого сета (у брони main не выбирают)
}

// слот → грейд → строки main, обычные для слота (у брони — все строки, у оружия — базовый flat ATK)
export type FixedMains = Partial<Record<SlotId, Partial<Record<Grade, string[]>>>>;

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
  fixed?: string[];     // строки main, которые есть всегда, а не на выбор: у оружия — flat ATK
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

// Team synergy (update.py build_synergy): the statuses a hero's skills need and the statuses heroes give.
// ★ — the in-game transcend star from which the row works; cd — turns before the skill is first ready (startCool).
export type SkillSlot = 's1' | 's2' | 's3' | 'burst' | 'passive';
// self — the caster only; team — all allies with the caster; ally — another ally (single-target too); enemy
export interface SynGive { st: string; to: 'self' | 'team' | 'ally' | 'enemy'; slot: SkillSlot; star: number; cd: number }
// cd — startCool of the earliest S1–S3 slot that needs it (0 for burst/passive only); fx — what the status switches on in
// each slot, most telling first ('dual' — Dual Attack, 'dmg' — more damage…; names in i18n team.fx; no field in old snapshots)
export interface SynNeed { st: string; on: 'self' | 'enemy'; slots: SkillSlot[]; star: number; cd: number; fx?: Partial<Record<SkillSlot, string[]>> }
export interface Synergy {
  statuses: Record<string, { en: string; debuff: boolean }>;
  heroes: Record<string, { give?: SynGive[]; need?: SynNeed[] }>;
}

// outerpedia's recommended teams (update.py build_teams, guides' teams.json): four slots, each a list of interchangeable
// heroes (ids); g — the guides that recommend it (keys of guides: guide path → its English title)
export interface GuideTeams { guides: Record<string, string>; list: { g: string[]; s: string[][] }[] }

// Boss fights of outerpedia's guides (update.py build_bosses, HISTORY.md 0200-boss). A table row per stage: [level, RES, SPD,
// label]; RES raw, before the account's Challenge quirk q (‰, −200 at the full tree: RES × (1000 + q)/1000).
// label: "7" — stage, "4:SS" — world boss league:rank, "AA+" — singularity rank, "normal"/"hard"/"very_hard"
export type BossRow = [number, number, number, string];
// mode: sr special request, gr guild raid (main and the subA/subB bosses — group names the raid), wb world boss,
// jc joint challenge, ie irregular extermination, ds dimensional singularity
export type BossMode = 'sr' | 'gr' | 'wb' | 'jc' | 'ie' | 'ds';
// a guide team: hero ids per slot (alternatives in guide order); st — the stages it is for (none = all); r — guild
// raid requirements as the guide writes them ("268", "518/259", "≤180"; trans — transcend ★).
// p — a pool (singularity guides' content.json, HISTORY.md 0208): s is 3–8 groups of heroes in the guide's order, not four
// spots — four of them make the team; l — its name as the guide gives it: an element (e), an effect (x — glossary effect
// id, as the immunities), a hero (h; a title-only or unnamed team — its first group's first hero)
export type BossTeamLabel = { e: string } | { x: string } | { h: string };
export interface BossTeam { st?: [number, number]; s: string[][]; r?: { h: string; eff?: string; spd?: string; trans?: string }[]; p?: 1; l?: BossTeamLabel }
export interface Boss {
  key: string; // "sr:meteos", "gr:frost-legion:subA"
  name: string;
  mode: BossMode;
  element: string;
  class: string;
  icon?: string; // top-stage boss portrait: image key `boss:<icon>` (missing in old snapshots)
  table: string; // key of Bosses.t
  imm: [number, string[]][]; // immunities by stage: runs [first row, ids]; the stage's set is the last run whose first row ≤ the stage's row (row = index in Bosses.t[table]); ids — outerpedia glossary effect ids (`effects`), names are the app's own strings
  group?: string; // guild raid: the raid's name
  live?: [string, string]; // world boss, guild raid, joint challenge: start and battle end of the latest season (ISO)
  guide: string; // outerpedia guide path: "special-request/meteos"
  teams?: BossTeam[];
}
export interface Bosses { q: number; t: Record<string, BossRow[]>; b: Boss[] }

export interface Dataset {
  meta: Meta;
  classes: Record<string, string>;
  elements: Record<string, string>;
  statNames: Record<string, string>;
  substats: Substat[];
  slotIcons: Record<SlotId, string | null>;
  mainLabels: string[];
  // метка main → сабстат, который из-за неё не выпадает. Игра сравнивает стат вместе с видом: flat EFF в main
  // сабстату EFF% не мешает (null). Нет поля — данные старше: main запрещает сабстат с той же меткой
  mainBlocks?: Record<string, string | null>;
  fixedMains?: FixedMains;
  // main line at +10 by Breakthrough tier: slot → grade → label → [T0…T4], game units (‰ for % stats, CHC 400 = 40 %);
  // the value most of the slot's items carry (older snapshots: the smallest — Legendary gloves EFF 45, not 50). Missing
  // in old snapshots
  mainValues?: Partial<Record<SlotId, Partial<Record<Grade, Record<string, number[]>>>>>;
  sets: GearSet[];
  weapons: Item[];
  amulets: Item[];
  talismans: Record<string, Talisman>;
  chars: Char[];
  synergy?: Synergy; // missing in old snapshots: the Team screen shows a notice instead
  teams?: GuideTeams; // missing in old snapshots or when the guide list was not fetched: no suggestions from outerpedia
  bosses?: Bosses; // missing in old snapshots or when the guide list was not fetched
  img?: Record<string, string>; // ключ картинки → data URI, относительный путь или URL CDN
}
