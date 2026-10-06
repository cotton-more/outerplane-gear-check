// Тур «Экипировка»: пять шагов на примере — «Надето» у Caren, карточка вещи, оценка для Caren, «Заменить», ✕.
// Пример живёт только в памяти: у тура своя экипировка и свой режим героя (App), записи игрока — ogc.gear, ogc.tryon,
// ростер — не трогаются. Вещь на форме откладывается и возвращается, как в главном туре (useTour).
// Тексты — ru.ts и en.ts, раздел tour.steps (g…).
import type { Index } from '@/game/data';
import type { Build, Char } from '@/game/data/types';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { combosWith } from '@/game/build/builds';
import type { ItemInput } from '@/game/item/item';
import type { Step } from './types';

const DEMO = { char: '2000089', build: 'Speed', set: 'Speed' } as const; // Caren: Speed ×4, цепочка DEF › CHC › CHD › SPD

export interface GearDemo { c: Char; b: Build; store: GearStore; item: ItemInput }

// Пример: на Caren надеты три вещи Speed — шлем послабее (T2, прокачан: уровни lit), броня на T4 и Epic-перчатки.
// На форму тур кладёт шлем заметно лучше надетого: сравнение — как есть, по уровням надетой. Нет Caren или её билда в данных — тура нет (его не предлагаем)
export function gearDemo(idx: Index): GearDemo | null {
  const c = idx.CHAR[DEMO.char];
  const b = c?.builds.find((x) => x.name === DEMO.build);
  const set = idx.D.sets.find((x) => x.short === DEMO.set);
  if (!c || !b || !set || !combosWith(b, set.id).length) return null;
  // один уровень, как у записи с формы (gear newPiece): yellow = lit — здесь все уровни не выше 4
  const piece = (id: string, slot: Piece['slot'], grade: Piece['grade'], lit: Piece['lit'], bt: Piece['bt']): Piece =>
    ({ id, slot, grade, setId: set.id, itemKey: null, main: null, yellow: lit, lit, bt, at: '' });
  const pieces = {
    p1: piece('p1', 'helmet', 'unique', { 'DEF%': 3, CHC: 2, SPD: 2, EFF: 3 }, 2),
    p2: piece('p2', 'armor', 'unique', { CHC: 4, CHD: 3, SPD: 2, 'DEF%': 2 }, 4),
    p3: piece('p3', 'gloves', 'rare', { 'DEF%': 2, CHC: 1, SPD: 2 }, 1),
  };
  const store: GearStore = { v: 2, seq: 3, pieces, pools: { [c.id]: ['p1', 'p2', 'p3'] }, worn: { [c.id]: { helmet: 'p1', armor: 'p2', gloves: 'p3' } } };
  // новый лучше надетого (его уровни — lit) на ~31%: шаг 4 «Заменить шлем Caren» держится на этом
  const item: ItemInput = { slot: 'helmet', grade: 'unique', setId: set.id, itemKey: null, main: null, subs: { 'DEF%': 3, CHC: 3, CHD: 3, HP: 1 } };
  return { c, b, store, item };
}

export const GEAR: Step[] = [
  // «Надето»: рамка на шлеме — нажми, откроется карточка вещи
  { id: 'gBuild', rev: 2, home: 'chars', layer: 'card', at: () => ['gslots'], pin: () => ['gslots:helmet'], done: (c) => c.pieceOpen },
  // карточка вещи: сегменты и «T4»; «Примерить замену» — оценка для Caren (тур кладёт на форму пример)
  // рамка — на кнопке: вокруг всей карточки полоса на низком экране легла бы поверх неё
  { id: 'gPiece', rev: 2, home: 'chars', layer: 'sheet', at: () => ['gpiece'], pin: () => ['gpiece:try'], done: (c) => c.tryOn && c.s.tab === 'eval' },
  // полоса «Только для · Caren» и карточка вердикта (на широком — колонка вердикта): посмотреть и «Дальше». Режим героя
  // примера ставит сам шаг (App onStep), если шаги 1–2 прошли «Дальше» без действия.
  // layer: на телефоне карточку можно нажать — откроется шторка вердикта; шаг и «Заменить» идут и в ней
  { id: 'gCard', rev: 3, layer: 'sheet', at: () => ['tryon', 'verdict'] },
  { id: 'gEquip', rev: 2, layer: 'sheet', at: () => ['gequip'], done: (c, start) => c.gearSeq > start.gearSeq },
  { id: 'gNext', rev: 2, at: () => ['tryon'], done: (c) => !c.tryOn },
];
