// Плитка героя в списке и в ромбе команды обмена: портрет, стихия и класс, имя (приставка Core Fusion — строкой над
// именем), «NEW», сколько надето, пометка заменённого в паре; в углу — серая звезда «в ростер» у героя не из ростера,
// у героя ростера пусто, а в его день рождения — торт (HISTORY.md 0240).
import type { ReactNode } from 'react';
import type { Char } from '@/game/data/types';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import { ClassIcon, Icon } from '@/game/icons/Img';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';

// gear — сколько вещей отмечено надетым: «N/6» на плитке у героя с вещами; off — заменён в паре: пометка, приглушён.
// corner — своя кнопка в углу вместо звезды ростера; null — пустой угол (ромб команды обмена)
export function CharTile({ c, own, bday, selected, isNew, gear, off, partnerName, onSelect, onToggle, corner }: {
  c: Char; own?: boolean; bday?: boolean; selected: boolean; isNew: boolean; gear: number | undefined; off: boolean; partnerName?: string; onSelect: () => void; onToggle?: () => void;
  corner?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="cwrap">
      <button type="button" className={`ctile${c.builds.length ? '' : ' nob'}${off ? ' off' : ''}`} aria-pressed={selected} onClick={onSelect}
        title={c.name + (c.nick && c.nick !== c.prefix ? ' — ' + c.nick : '')}>
        <span className="badges"><ClassIcon cls={c.class} el={c.element} /></span>
        <HeroFace c={c} />{isNew && <span className="newb">NEW</span>}
        {gear !== undefined && <span className="gearb" title={t.ui.gearTile(gear)}><span className="sr-only">{t.ui.gearTile(gear)}</span><span aria-hidden="true">{gear}/6</span></span>}
        <span className="cn"><HeroName c={c} stacked /></span>
        {off && <span className="coff" {...tour('fusion')}>{t.ui.fusionOffMark(c.fusionOf ? (partnerName ?? c.name) : c.name, !!c.fusionOf)}</span>}
      </button>
      {corner !== undefined ? corner : (
        // owner 2026-10-20 (0240): the gold ★ badge is gone — a roster hero is managed only from the card's star sheet;
        // the corner holds the birthday cake for that whole day
        own
          ? bday && <span className="star cake" role="img" aria-label={t.bday.cake} title={t.bday.cake}><Icon name="cake" /></span>
          : <button type="button" className="star" {...tour('star')} aria-pressed={false} aria-label={t.ui.rosterToggle(c.name, false)} onClick={onToggle}>☆</button>
      )}
    </div>
  );
}
