// Окно у точки (Sheet at, окно уровня сабстата): центр тела окна — на точке, окно целиком в экране с отступом 8 px
import { describe, expect, it } from 'vitest';
import { popPlace } from '@/shared/ui/Sheet';

// окно уровня: 300×180, тело (кнопки 1–6) начинается через 56 px заголовка и занимает 124 px
const BOX = { w: 300, h: 180, bodyTop: 56, bodyH: 124 };
const VIEW = { w: 1200, h: 800 };

describe('popPlace — окно у нажатой клетки', () => {
  it('место есть: центр кнопок — на точке', () => {
    expect(popPlace({ x: 400, y: 300 }, BOX, VIEW)).toEqual({ left: 250, top: 182 });
  });

  it('клетка у левого и верхнего края — окно прижато внутрь с отступом 8', () => {
    expect(popPlace({ x: 20, y: 30 }, BOX, VIEW)).toEqual({ left: 8, top: 8 });
  });

  it('клетка у правого и нижнего края — окно прижато внутрь с отступом 8', () => {
    expect(popPlace({ x: 1190, y: 790 }, BOX, VIEW)).toEqual({ left: 892, top: 612 });
  });

  it('экран меньше окна — к левому и верхнему краю: заголовок и ✕ видны', () => {
    expect(popPlace({ x: 140, y: 100 }, BOX, { w: 280, h: 150 })).toEqual({ left: 8, top: 8 });
  });
});
