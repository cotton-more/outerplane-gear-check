// Портрет героя (картинка из игры). Размер задаёт место: плитка списка, шапка карточки, строки вердикта и обмена.
// round — a round portrait like the game's item panel (.face-round in base.css): batch rows and the «E · worn» picker
import type { Char } from '@/game/data/types';
import { Img } from '@/game/icons/Img';

export function HeroFace({ c, round }: { c: Pick<Char, 'icon'>; round?: boolean }) {
  const face = <Img k={'face:' + c.icon} className="face" />;
  return round ? <span className="face-round">{face}</span> : face;
}
