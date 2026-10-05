// Картинки по ключу датасета (face:…, eq:…, stat:…, class:…, elem:…, frame:…).
// Нет картинки — серая заглушка того же размера; не загрузилась — прячем, чтобы не торчал значок битой картинки.
// Статы, слоты, грейд, предметы, сеты, стихии, классы и талисманы рисуются своими значками (Icon, src/game/icons/own.ts);
// картинки из игры для них — по выбору в «Ещё» → «Настройки» (GameIconsContext), без выбора — из игры. Портреты — из игры.
import { createContext, useContext } from 'react';
import { STAT_ICON } from '@/game/data';
import type { GearSet, Item, SlotId } from '@/game/data/types';
import { CLASS_ICON, ELEMENT_ICON, SLOT_ICON, TALISMAN_ICON, setIcon, statIcon } from './own';
import { TABLER, type IconName } from './tabler';
import { useIndex } from '@/game/data/IndexContext';

// true — значки из игры вместо своих («Ещё» → «Настройки»; без выбора — из игры)
export const GameIconsContext = createContext(false);
const useGameIcons = () => useContext(GameIconsContext);

export function Img({ k, className, alt = '' }: { k: string; className?: string; alt?: string }) {
  const src = useIndex().D.img?.[k];
  if (!src) return <span className={className ? `noimg ${className}` : 'noimg'} aria-hidden="true" />;
  return <img className={className} src={src} alt={alt} decoding="async" onError={(e) => e.currentTarget.classList.add('broken')} />;
}

// Свой значок: контур Tabler цветом текста — тёмная тема и подсветка клетки работают сами.
// Размер задают те же правила, что картинкам (… img, … .ico). badge — «%» или «↓» в углу.
export function Icon({ name, badge, className }: { name: IconName; badge?: string; className?: string }) {
  return (
    <span className={className ? `ico ${className}` : 'ico'} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {TABLER[name].map((d, i) => <path key={i} d={d} />)}
      </svg>
      {badge && <span className="ico-b">{badge}</span>}
    </span>
  );
}

// main — стат как строка main: там EFF и RES — flat, без «%»
export function StatIcon({ stat, main = false }: { stat: string; main?: boolean }) {
  const game = useGameIcons();
  if (game) return <Img k={'stat:' + (STAT_ICON[stat] || '')} alt={stat} />;
  const own = statIcon(stat, main);
  return own ? <Icon name={own.name} badge={own.badge} /> : <span className="noimg" aria-hidden="true" />;
}

export function SlotIcon({ slot }: { slot: SlotId }) {
  const { D } = useIndex();
  return useGameIcons() ? <Img k={'eq:' + D.slotIcons[slot]} /> : <Icon name={SLOT_ICON[slot]} />;
}

// значок сета — в рамке, чтобы Attack Set не путался со статом ATK
export function SetIcon({ set, className }: { set: GearSet | undefined; className?: string }) {
  if (useGameIcons()) return <Img k={'eq:' + (set ? set.icon : '')} className={className} />;
  return <Icon name={setIcon(set?.short ?? '')} className={className ? `ico-set ${className}` : 'ico-set'} />;
}

// фон кнопки грейда: красный Legendary, синий Epic
export function GradeFrame({ grade }: { grade: string }) {
  return useGameIcons() ? <Img k={'frame:' + grade} /> : <span className={`gframe ${grade === 'rare' ? 'rare' : 'unique'}`} aria-hidden="true" />;
}

// предмет или вещь брони в рамке грейда; своя версия — значок слота: картинки у каждого предмета нет
export function GearFrame({ grade, slot, icon }: { grade: string; slot: SlotId; icon: string }) {
  const g = grade === 'rare' ? 'rare' : 'unique';
  if (useGameIcons()) return <span className="frame"><Img k={'frame:' + g} /><Img k={'eq:' + icon} className="ic" /></span>;
  return <span className={`frame own ${g}`}><Icon name={SLOT_ICON[slot]} /></span>;
}

export const Frame = ({ item }: { item: Item }) => <GearFrame grade={item.grade} slot={item.kind} icon={item.icon} />;

export function ElementIcon({ el }: { el: string }) {
  return useGameIcons() ? <Img k={'elem:' + el} /> : <Icon name={ELEMENT_ICON[el] ?? 'hexagon'} className={`el-${el}`} />;
}

export function ClassIcon({ cls }: { cls: string }) {
  return useGameIcons() ? <Img k={'class:' + cls} /> : <Icon name={CLASS_ICON[cls] ?? 'hexagon'} />;
}

export function TalismanIcon({ icon }: { icon: string }) {
  return useGameIcons() ? <Img k={'eq:' + icon} /> : <Icon name={TALISMAN_ICON} />;
}
