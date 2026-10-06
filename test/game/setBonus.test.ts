// Бонусы сетов по Breakthrough (game/set/setBonus) — правило и примеры владельца; ценность бонуса в сегментах.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { bonusRows, bonusSegments, convertible } from '@/game/set/setBonus';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const pieces = (short: string, ...bts: (number | null)[]) => bts.map((bt) => ({ setId: set(short), bt }));
// сумма бонуса стата по строкам, как в игре складываются 2P и 4P
const sum = (rows: ReturnType<typeof bonusRows>) => rows.reduce((n, r) => n + r.bon.value, 0);
const caren = D.chars.find((c) => c.name === 'Caren')!;

describe('бонус сета по Breakthrough — примеры владельца', () => {
  it('Speed T4 T4 → +13%', () => expect(sum(bonusRows(idx.SET, pieces('Speed', 4, 4)))).toBe(13));
  it('Speed T4 T4 T0 → +13%: третья вещь ничего не меняет', () => expect(sum(bonusRows(idx.SET, pieces('Speed', 4, 4, 0)))).toBe(13));
  it('Speed T4 T4 T0 T0 → +25%: 4P T0–T3 — весь бонус, 2P T4 не прибавляется', () => {
    const rows = bonusRows(idx.SET, pieces('Speed', 4, 4, 0, 0));
    expect(rows.map((r) => [r.n, r.tier])).toEqual([[4, 'T0']]);
    expect(sum(rows)).toBe(25);
  });
  it('Speed T4 ×4 → 13 + 12', () => {
    const rows = bonusRows(idx.SET, pieces('Speed', 4, 4, 4, 4));
    expect(rows.map((r) => [r.n, r.tier, r.bon.value])).toEqual([[2, 'T4', 13], [4, 'T4', 12]]);
  });
  it('Attack T4 T4 T0 T0 → 35 + 20 = 55%', () => expect(sum(bonusRows(idx.SET, pieces('Attack', 4, 4, 0, 0)))).toBe(55));
  it('Attack T4 T0 → 30% (2P T0–T3)', () => {
    expect(bonusRows(idx.SET, pieces('Attack', 4, 0)).map((r) => [r.n, r.tier, r.bon.value])).toEqual([[2, 'T0', 30]]);
  });
  it('Attack T0 ×4 → 30 + 20', () => expect(sum(bonusRows(idx.SET, pieces('Attack', 0, 0, 0, 0)))).toBe(50));
  it('Speed ×2 на T0 — бонуса нет вовсе; одна вещь — нет ни у кого', () => {
    expect(bonusRows(idx.SET, pieces('Speed', 0, 4))).toEqual([]);
    expect(bonusRows(idx.SET, pieces('Attack', 4))).toEqual([]);
  });
  it('Breakthrough не указан — строка T0–T3 с пометкой; сеты считаются каждый сам по себе', () => {
    const rows = bonusRows(idx.SET, [...pieces('Attack', null, 0), ...pieces('Effectiveness', 4, 4)]);
    expect(rows.map((r) => [r.set, r.tier, r.unknownBt])).toEqual([[set('Attack'), 'T0', true], [set('Effectiveness'), 'T4', false]]);
  });
});

describe('бонус в сегментах сабстата', () => {
  it('в сегментах сабстата: Attack 2P T4 35% = 35 / 4 сегмента ATK%; Speed — % от базы SPD (Caren 98)', () => {
    expect(bonusSegments(ctx, caren, { stat: 'ATK%', value: 35, mode: 'rate' })).toBeCloseTo(8.75);
    expect(bonusSegments(ctx, caren, { stat: 'SPD', value: 13, mode: 'rate' })).toBeCloseTo(0.13 * (98 + 4) / 3); // quirks +4
    expect(bonusSegments(ctx, caren, { stat: null, value: 11, mode: 'add' })).toBeNull();
  });

  it('переводимы 8 сетов-статов; Penetration, Immunity, Counterattack — нет; без базы SPD Speed — нет', () => {
    const conv = D.sets.filter((s) => convertible(ctx, caren, s.id)).map((s) => s.short).sort();
    expect(conv).toEqual(['Attack', 'Critical Hit', 'Critical Strike', 'Defense', 'Effectiveness', 'Life', 'Resilience', 'Speed']);
    expect(convertible(ctx, { ...caren, spd: undefined }, set('Speed'))).toBe(false);
  });

  it('бонусы в данных — как у владельца (таблица check-data): ключи стата есть среди сабстатов', () => {
    for (const s of D.sets) for (const r of Object.values(s.bonus!).flatMap((t) => [t.p2, t.p4])) if (r?.stat) expect(idx.SUB[r.stat]).toBeTruthy();
    expect(D.sets.find((s) => s.short === 'Critical Strike')!.bonus).toMatchObject({ t4: { p2: { stat: 'CHD', value: 33 }, p4: { value: 22 } }, t0: { p2: { value: 20 }, p4: { value: 15 } } });
  });

  // на этом стоит П7 (features/gear/pool rivalOf): вещь сета в том же слоте на T4 не хуже такой же не на T4
  it('ещё одна вещь на T4 бонус сета не уменьшает: сумма по стату и самая большая строка (2P/4P) не меньше', () => {
    const bad: string[] = [];
    for (const s of D.sets) {
      for (let n = 2; n <= 4; n++) {
        for (let n4 = 0; n4 < n; n4++) {
          const at = (k: number) => bonusRows(idx.SET, Array.from({ length: n }, (_, i) => ({ setId: s.id, bt: i < k ? 4 : 0 })));
          const by = (rows: ReturnType<typeof bonusRows>) => rows.reduce((m, r) => m.set(r.bon.stat, (m.get(r.bon.stat) ?? 0) + r.bon.value), new Map<string | null, number>());
          const was = at(n4), now = at(n4 + 1), a = by(was), z = by(now);
          const top = (rows: typeof was) => Math.max(0, ...rows.map((r) => r.n));
          if (top(now) < top(was) || [...a].some(([k, v]) => (z.get(k) ?? 0) < v)) bad.push(`${s.short} ${n} шт., T4 ${n4} → ${n4 + 1}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('старый снимок без bonus: строки по тексту, без чисел', () => {
    const { bonus: _, ...old } = idx.SET[set('Attack')];
    expect(bonusRows({ [old.id]: old }, pieces('Attack', 0, 0)).map((r) => r.bon)).toEqual([{ stat: null, value: 0, mode: 'add' }]);
  });
});
