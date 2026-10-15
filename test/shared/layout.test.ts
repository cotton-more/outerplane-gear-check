// Раскладка: «Версия для ПК» на телефоне распознаётся, а поворот телефона — нет (раньше ландшафт после поворота
// выглядел как «Версия для ПК»: страница увеличена в 2+ раза, мобильная раскладка).
import { describe, expect, it } from 'vitest';
import { MIN_W, measure } from '@/shared/layout/useLayout';

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

  it('разделённый экран с игрой: окно на горизонтальном телефоне — как есть', () => {
    expect(measure({ ...phone, innerWidth: 421, innerHeight: 363, screenWidth: 919, screenHeight: 412 })).toEqual({ width: 421, zoom: 1, desktopModeOnPhone: false });
  });

  it('narrower than MIN_W: laid out at MIN_W and scaled down — no sideways scroll', () => {
    expect(measure({ ...phone, innerWidth: 281, innerHeight: 419, screenWidth: 915, screenHeight: 412 })).toEqual({ width: MIN_W, zoom: 281 / MIN_W, desktopModeOnPhone: false });
    expect(measure({ coarse: false, innerWidth: 300, innerHeight: 700, screenWidth: 2056, screenHeight: 1329 }).width).toBe(MIN_W);
  });

  it('«desktop site» on a phone narrower than MIN_W: scaled to MIN_W, not to the screen width', () => {
    const m = measure({ ...phone, innerWidth: 980, innerHeight: 1900, screenWidth: 360, screenHeight: 800 });
    expect(m).toEqual({ width: MIN_W, zoom: 980 / MIN_W, desktopModeOnPhone: true });
  });

  it('компьютер с мышью — никогда не «Версия для ПК»', () => {
    expect(measure({ coarse: false, innerWidth: 1600, innerHeight: 900, screenWidth: 600, screenHeight: 400 }).desktopModeOnPhone).toBe(false);
  });
});
