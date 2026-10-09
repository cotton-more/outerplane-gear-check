// Строки героев по вещи с формы (features/gear/model/poolVs charVs): когда у героя есть кнопка «Надеть» / «Заменить», и
// подпись чипа (VsChip chipLabel). Пример владельца: у Caren в цепочке пусто 3-е место — новая его закрывает.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { type Piece } from '@/features/gear/model/gear';
import type { Bt } from '@/game/item/item';
import { poolView } from '@/features/gear/pool';
import { chipLabel } from '@/features/gear/ui/VsChip';
import { TEXTS } from '@/i18n';
import { charVs, type CharVs } from '@/features/gear/model/poolVs';
import type { HeroRes } from '@/features/gear/verdict';
import type { Subs } from '@/game/item/subs';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%
let seq = 0;

describe('строка героя по вещи с формы', () => {
  const armor = (slot: SlotId, s: string, subs: Subs, grade: Piece['grade'] = 'unique') =>
    ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
  // записанная вещь: yellow — из оценки, lit — горит всего
  const rec = (x: ReturnType<typeof armor>, lit: Subs = x.subs, bt: Bt | null = null): Piece =>
    ({ id: 'p' + ++seq, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main, yellow: x.subs, lit, bt, at: '' });
  const helmetT4 = (lit: Subs, yellow: Subs) => rec(armor('helmet', 'Speed', yellow), lit, 4);

  // строки героев по «статам + сетам» (features/gear/model/poolVs charVs): кнопка «Надеть» — когда вещь ему «Надень», в
  // режиме героя или когда герой найден по имени в «Кому надеть?» (any)
  describe('«Сейчас на персонажах» и «Кому надеть?»: строка героя', () => {
    const worn = () => helmetT4({ 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });
    const store = (ps: Piece[]) => ({ pieces: Object.fromEntries(ps.map((p) => [p.id, p])), pools: { [caren.id]: ps.map((p) => p.id) },
      worn: { [caren.id]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });

    it('новая лучше надетой на 1+ очко — «Надень», кнопка «Заменить»; цепочка героя — его «По статам»', () => {
      const x = charVs(ctx, poolView(ctx, store([worn()])), caren.id, armor('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }))!;
      expect({ kind: x.h.kind, useful: x.useful, replaces: x.replaces }).toEqual({ kind: 'wear', useful: true, replaces: true });
      expect(x.chain.b).toBe(caren.builds.find((b) => JSON.stringify(b.subs) === JSON.stringify(x.chain.b.subs)));
    });

    it('не лучше — кнопки нет; найден по имени (any) или режим героя (wear) — есть', () => {
      const v = poolView(ctx, store([worn()]));
      const weak = armor('helmet', 'Speed', { RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
      expect(charVs(ctx, v, caren.id, weak)!.useful).toBe(false);
      expect(charVs(ctx, v, caren.id, weak, { any: true })!.useful).toBe(true);
      expect(charVs(ctx, v, caren.id, weak, { wear: true })).toMatchObject({ useful: true, asWorn: true });
    });

    it('предмет не для класса героя — строки нет', () => {
      const item = D.weapons.find((i) => i.classLimits.length && !i.classLimits.includes(caren.class))!;
      expect(charVs(ctx, poolView(ctx, store([])), caren.id, { slot: 'weapon', grade: 'unique', setId: null, itemKey: item.key, main: item.mains[0], subs: { CHC: 1 } })).toBeNull();
    });
  });
});


// подпись чипа и карточки для диктора (VsChip chipLabel): прирост в очках, «держи», ранг без прироста
describe('chipLabel', () => {
  const x = (h: Partial<HeroRes>, slot: SlotId = 'helmet') => ({ slot, h: { kind: 'wear', dV: 2.5, rankUp: false, ...h } }) as unknown as CharVs;

  it('«+2,5 очк.», «держи», «рекомендованный» у аксессуара без прироста; ничего — без чипа', () => {
    expect([chipLabel(TEXTS.ru, x({})), chipLabel(TEXTS.ru, x({ kind: 'keep' })), chipLabel(TEXTS.ru, x({ dV: -3, rankUp: true }, 'accessory')), chipLabel(TEXTS.ru, x({ kind: 'none', dV: 0 }))])
      .toEqual(['+2,5 очк.', 'держи', 'рекомендованный', null]);
  });

  it('прирост называют от 0,05 очка: «+0,1 очк.» есть, «+0 очк.» не бывает; одна цифра после запятой', () => {
    expect(chipLabel(TEXTS.ru, x({ dV: 0.04 }))).toBeNull();
    expect(chipLabel(TEXTS.ru, x({ dV: 0.05 }))).toBe('+0,1 очк.');
    expect(chipLabel(TEXTS.ru, x({ dV: 4.87 }))).toBe('+4,9 очк.');
    expect(chipLabel(TEXTS.en, x({ dV: 4.87 }))).toBe('+4.9 pts');
    expect(chipLabel(TEXTS.ru, x({ dV: 0.04, rankUp: true }))).toBe(TEXTS.ru.fit.chipRank('helmet'));
  });
});
