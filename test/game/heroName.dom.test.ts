// @vitest-environment jsdom
// Имя героя одной строкой (Р-2): приставка — отдельным приглушённым куском, который режется первым (CSS .hname-p), имя —
// своим, полное имя — в подсказке. Без приставки — просто имя, без обёртки.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { HeroName } from '@/game/hero/HeroName';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

async function html(c: { name: string; prefix: string | null; base: string }): Promise<HTMLElement> {
  const el = document.createElement('div');
  const root = createRoot(el);
  await act(async () => root.render(createElement(HeroName, { c })));
  return el;
}

describe('HeroName', () => {
  it('с приставкой: приставка и имя — разными кусками, полное имя в подсказке', async () => {
    const el = await html({ name: 'Kitsune of Eternity Tamamo-no-Mae', prefix: 'Kitsune of Eternity', base: 'Tamamo-no-Mae' });
    expect(el.querySelector('.hname-p')?.textContent).toBe('Kitsune of Eternity');
    expect(el.querySelector('.hname-b')?.textContent).toBe('Tamamo-no-Mae');
    expect(el.querySelector('.hname')?.getAttribute('title')).toBe('Kitsune of Eternity Tamamo-no-Mae');
    expect(el.textContent).toBe('Kitsune of Eternity Tamamo-no-Mae'); // читается и копируется целиком
  });

  it('без приставки — просто имя', async () => {
    const el = await html({ name: 'Caren', prefix: null, base: 'Caren' });
    expect(el.innerHTML).toBe('Caren');
  });
});
