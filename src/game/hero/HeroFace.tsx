// Портрет героя (картинка из игры). Размер задаёт место: плитка списка, шапка карточки, строки вердикта и обмена.
import type { Char } from '@/game/data/types';
import { Img } from '@/game/icons/Img';

export function HeroFace({ c }: { c: Pick<Char, 'icon'> }) {
  return <Img k={'face:' + c.icon} className="face" />;
}
