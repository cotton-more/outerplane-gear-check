// Раскладка: «Версия для ПК» на телефоне распознаётся, а поворот телефона — нет (раньше ландшафт после поворота
// выглядел как «Версия для ПК»: страница увеличена в 2+ раза, мобильная раскладка).
import { describe, expect, it } from 'vitest';
import { measure } from '../src/hooks/useLayout';

const phone = { coarse: true };

describe('measure: «Версия для ПК» и поворот', () => {
  it('обычный телефон вертикально — как есть', () => {
    expect(measure({ ...phone, innerWidth: 412, innerHeight: 800, screenWidth: 412, screenHeight: 915 })).toEqual({ width: 412, zoom: 1, desktopModeOnPhone: false });
  });

  it('«Версия для ПК» вертикально — мобильная ширина и увеличение обратно', () => {
    const m = measure({ ...phone, innerWidth: 980, innerHeight: 1900, screenWidth: 412, screenHeight: 915 });
    expect(m).toEqual({ width: 412, zoom: 980 / 412, desktopModeOnPhone: true });
  });

  it('Android во время поворота: окно уже горизонтальное, screen.width ещё портретный — не «Версия для ПК»', () => {
    expect(measure({ ...phone, innerWidth: 915, innerHeight: 412, screenWidth: 412, screenHeight: 915 }).desktopModeOnPhone).toBe(false);
  });

  it('iPhone горизонтально: screen.width там всегда портретный — не «Версия для ПК»', () => {
    expect(measure({ ...phone, innerWidth: 844, innerHeight: 390, screenWidth: 390, screenHeight: 844 })).toEqual({ width: 844, zoom: 1, desktopModeOnPhone: false });
  });

  it('разделённый экран с игрой: узкое окно на горизонтальном телефоне — как есть', () => {
    expect(measure({ ...phone, innerWidth: 281, innerHeight: 419, screenWidth: 915, screenHeight: 412 })).toEqual({ width: 281, zoom: 1, desktopModeOnPhone: false });
  });

  it('компьютер с мышью — никогда не «Версия для ПК»', () => {
    expect(measure({ coarse: false, innerWidth: 1600, innerHeight: 900, screenWidth: 600, screenHeight: 400 }).desktopModeOnPhone).toBe(false);
  });
});
