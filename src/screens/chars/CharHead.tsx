// Шапка героя: портрет со значками стихии и класса, имя, подкласс и роль, тиры PvE / PvP, ник, ссылка outerpedia —
// только показ. star — звезда ростера у имени (карточка героя); в карточке показа её нет.
import type { ReactNode } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { cap } from '@/game/text';
import { ClassIcon } from '@/game/icons/Img';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';

const ROLE: Record<string, string> = { dps: 'DPS', support: 'Support', sustain: 'Sustain' };
// оценка outerpedia PvE / PvP (S…E): подпись приглушённая, буква — плашкой цвета оценки (chars.css .tier-*)
const Tier = ({ k, v }: { k: string; v: string }) => (
  <span className="tier"><span className="tier-k">{k}</span><b className={`tier-v tier-${v.toLowerCase()}`}>{v}</b></span>
);

export function CharHead({ c, ctx, star }: { c: Char; ctx: Ctx; star?: ReactNode }) {
  const t = useT();
  const { D } = ctx.idx;
  const elName = D.elements[c.element] || c.element;
  const clsName = D.classes[c.class] || c.class;
  return (
    <div className="cd-head">
      {/* класс в цвете стихии — один значок на подложке поверх портрета: названий на экране нет, поэтому aria-label «Mage · Water» */}
      <span className="cd-face">
        <HeroFace c={c} />
        <span className="cd-badge" role="img" aria-label={`${clsName} · ${elName}`} title={`${clsName} · ${elName}`}><ClassIcon cls={c.class} el={c.element} /></span>
      </span>
      <div>
        <div className="cd-name">
          <h2><HeroName c={c} stacked /></h2>
          {star}
        </div>
        {/* класса текстом нет — его показывает значок; подкласс есть у всех, но без него — название класса */}
        <div className="meta">{[c.subClass ? cap(c.subClass) : clsName, c.role && (ROLE[c.role] || c.role)].filter(Boolean).join(' · ')}</div>
      </div>
      {/* оценки outerpedia, прозвище (режется многоточием) и ссылка на страницу персонажа — без языкового префикса: /ru/ нет */}
      <div className="cd-foot">
        {c.rank && <Tier k="PvE" v={c.rank} />}
        {c.rankPvp && <Tier k="PvP" v={c.rankPvp} />}
        {c.nick && c.nick !== c.prefix && <span className="cd-nick muted small">{c.nick}</span>}
        <a className="cd-opedia" href={`https://outerpedia.com/characters/${c.slug}`} target="_blank" rel="noopener noreferrer"
          aria-label={t.ui.opediaAria(c.name)}>{t.ui.opedia} ↗</a>
      </div>
    </div>
  );
}
