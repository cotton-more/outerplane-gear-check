// Картинки по ключу датасета (face:…, eq:…, stat:…, class:…, elem:…, frame:…).
// Нет картинки — серая заглушка того же размера; не загрузилась — прячем, чтобы не торчал значок битой картинки.
import { STAT_ICON } from '../data';
import type { Item } from '../data/types';
import { useIndex } from './IndexContext';

export function Img({ k, className, alt = '' }: { k: string; className?: string; alt?: string }) {
  const src = useIndex().D.img?.[k];
  if (!src) return <span className={className ? `noimg ${className}` : 'noimg'} aria-hidden="true" />;
  return <img className={className} src={src} alt={alt} decoding="async" onError={(e) => e.currentTarget.classList.add('broken')} />;
}

export const StatIcon = ({ stat }: { stat: string }) => <Img k={'stat:' + (STAT_ICON[stat] || '')} alt={stat} />;

// иконка предмета в рамке грейда
export const Frame = ({ item }: { item: Item }) => (
  <span className="frame">
    <Img k={'frame:' + (item.grade === 'rare' ? 'rare' : 'unique')} />
    <Img k={'eq:' + item.icon} className="ic" />
  </span>
);
