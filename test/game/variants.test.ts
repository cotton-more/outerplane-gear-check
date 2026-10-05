// Варианты билда (game/build/variants): билд с несколькими связками сетов — по варианту на связку, ключи, имена, дубли.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { comboSig, variantsOf } from '@/game/build/variants';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const char = (name: string) => D.chars.find((c) => c.name === name)!;

describe('варианты билдов', () => {
  it('265 билдов → 296 вариантов; у 13 билдов несколько связок; ключи персонажа не повторяются', () => {
    const all = D.chars.flatMap((c) => variantsOf(idx, c));
    expect(D.chars.reduce((n, c) => n + c.builds.length, 0)).toBe(265);
    expect(all).toHaveLength(296);
    expect(new Set(all.filter((v) => v.sig).map((v) => v.parentKey)).size).toBe(13);
    for (const c of D.chars) {
      const keys = variantsOf(idx, c).map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('билд с одной связкой — сам родитель, ключ — buildKey', () => {
    const caren = char('Caren');
    const [v] = variantsOf(idx, caren);
    expect(v).toMatchObject({ key: `${caren.id}/Speed`, name: 'Speed', sig: null, parentKey: `${caren.id}/Speed` });
    expect(v.b).toBe(v.parent);
  });

  it('Anarky «Defense mix»: ключ по подписи связки, имя — сет, который отличает; цепочка и оружие родителя', () => {
    const anarky = char('Anarky');
    const mix = variantsOf(idx, anarky).filter((v) => v.parent.name === 'Defense mix');
    const def = D.sets.find((s) => s.short === 'Defense')!.id, pen = D.sets.find((s) => s.short === 'Penetration')!.id;

    expect(mix.map((v) => v.name)).toEqual(['Defense mix · Penetration', 'Defense mix · Swiftness', 'Defense mix · Immunity']);
    expect(mix[0].key).toBe(`${anarky.id}/Defense mix#${[def, pen].sort((a, z) => +a - +z).map((s) => s + 'x2').join('+')}`);
    expect(mix[0].b.sets).toEqual([mix[0].parent.sets[0]]);
    expect(mix[0].b.subs).toBe(mix[0].parent.subs);
    expect(mix[0].b.weapons).toBe(mix[0].parent.weapons);
  });

  it('подпись не зависит от порядка частей в связке', () => {
    expect(comboSig([{ set: '11', n: 2 }, { set: '2', n: 2 }])).toBe(comboSig([{ set: '2', n: 2 }, { set: '11', n: 2 }]));
    expect(comboSig([{ set: '11', n: 2 }, { set: '2', n: 2 }])).toBe('2x2+11x2');
  });

  it('общего сета нет (Heatwave Cop Delta · DPS) — связка целиком', () => {
    expect(variantsOf(idx, char('Heatwave Cop Delta')).filter((v) => v.parent.name === 'DPS').map((v) => v.name))
      .toEqual(['DPS · Penetration ×4', 'DPS · Attack ×2 + Speed ×2', 'DPS · Penetration ×2 + Attack ×2']);
  });

  it('одинаковые варианты персонажа (Sigma «Speed» и «Support») — второй ссылается на первый', () => {
    const sigma = variantsOf(idx, char('Sigma'));
    const speed = sigma.find((v) => v.name === 'Speed')!, support = sigma.find((v) => v.name === 'Support')!;
    expect(speed.dupOf).toBeUndefined();
    expect(support.dupOf).toBe(speed.key);
  });

  it('варианты не меняют данные: в D.chars те же билды', () => {
    const anarky = char('Anarky');
    variantsOf(idx, anarky);
    expect(anarky.builds.find((b) => b.name === 'Defense mix')!.sets).toHaveLength(3);
  });
});
