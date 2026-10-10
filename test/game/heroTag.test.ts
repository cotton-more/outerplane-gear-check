// withHero (batch plan and walk): the hero's name in a phrase becomes a tag — only as a whole word, never a piece of an item
// name («K» in «Cradle's Key», «Snow» in «Snow-white Embrace»; merge review A5)
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Char } from '@/game/data/types';
import { withHero } from '@/game/hero/HeroTag';

describe('withHero tags the hero, not a piece of an item name', () => {
  const hero = (name: string) => ({ name, element: 'fire', class: 'striker' }) as Pick<Char, 'name' | 'element' | 'class'>;
  const html = (text: string, c: ReturnType<typeof hero> | null) => renderToStaticMarkup(createElement('span', null, withHero(text, c)));
  const tagged = (h: string) => /<b>([^<]*)<\/b>/.exec(h)?.[1];
  it("K and «Cradle's Key»: the K of «для K»", () => {
    const h = html("#7 Cradle's Key · HP% — для K", hero('K'));
    expect(tagged(h)).toBe('K');
    expect(h.indexOf('htag')).toBeGreaterThan(h.indexOf('Key'));
    expect(html("Cradle's Key", hero('K'))).not.toContain('htag');
  });
  it('Snow and «Snow-white Embrace»', () => {
    const h = html('#21 Snow-white Embrace · ATK% — для Snow', hero('Snow'));
    expect(tagged(h)).toBe('Snow');
    expect(h.indexOf('htag')).toBeGreaterThan(h.indexOf('Embrace'));
    expect(html('Snow-white Embrace', hero('Snow'))).not.toContain('htag');
  });
  it("the usual phrases: the name at the start, in the middle, with «'s»; a name that isn't there — plain text", () => {
    expect(tagged(html('Rin → Breakthrough', hero('Rin')))).toBe('Rin');
    expect(tagged(html('Надень на Rin — вместо шлема', hero('Rin')))).toBe('Rin');
    expect(tagged(html("Rin's set-aside helmet", hero('Rin')))).toBe('Rin');
    expect(html('Шлем Caren', hero('Rin'))).toBe('<span>Шлем Caren</span>');
    expect(html('Шлем Caren', null)).toBe('<span>Шлем Caren</span>');
    expect(tagged(html('Корм для Tamamo-no-Mae', hero('Tamamo-no-Mae')))).toBe('Tamamo-no-Mae');
  });
  it("the tag and the characters stuck to it are one no-wrap unit: «Kappa's», «Caren · запас»; a plain space parts them", () => {
    expect(html("Kappa's helmet", hero('Kappa'))).toContain('<span class="nwx">&#x27;s helmet</span></span>');
    expect(html('для Caren\u00A0·\u00A0запас', hero('Caren'))).toContain('<span class="nwx">\u00A0·\u00A0запас</span></span>');
    expect(html('Rin → Breakthrough', hero('Rin'))).toMatch(/^<span><span class="nw"><span class="htag.*<\/span><\/span> → Breakthrough<\/span>$/);
  });
});
