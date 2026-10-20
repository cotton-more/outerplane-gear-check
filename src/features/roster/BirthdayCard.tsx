// Birthday card above the page (HISTORY.md 0240): the roster heroes born today — portrait with a cake, the greeting and
// their favourite gift type. Static confetti in the (first) hero's element colour; it only slides in (motion.css).
// A portrait opens the hero's card; ✕ closes. Shown once a year per person (useBirthdays)
import type { CSSProperties } from 'react';
import { HeroFace } from '@/game/hero/HeroFace';
import { Icon } from '@/game/icons/Img';
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import type { BdayPerson } from './birthday';

export function BirthdayCard({ people, onOpen, onClose }: { people: BdayPerson[]; onOpen: (id: string) => void; onClose: () => void }) {
  const t = useT();
  const gift = (p: BdayPerson) => (p.c.gift ? t.bday.gifts[p.c.gift - 1] : undefined);
  const names = people.map((p) => p.c.base);
  const gifts = people.flatMap((p) => { const g = gift(p); return g ? [[p.c.base, g] as [string, string]] : []; });
  const giftLine = !gifts.length ? null : people.length === 1 ? t.bday.giftOne(gifts[0][1]) : t.bday.giftMany(gifts);
  return (
    <div className="bday" role="status" style={{ '--elc': `var(--el-${people[0].c.element})` } as CSSProperties}>
      <div className="bday-faces">
        {people.map((p) => (
          <button key={p.key} type="button" className="bday-face" aria-label={t.bday.open(p.c.base)} onClick={() => onOpen(p.c.id)}>
            <HeroFace c={p.c} /><Icon name="cake" className="bday-cake" />
          </button>
        ))}
      </div>
      <div className="bday-t">
        <b>{people.length === 1 ? t.bday.one(names[0]) : t.bday.many(names)}</b>
        {giftLine && <span className="bday-g"><Icon name="gift" />{giftLine}</span>}
      </div>
      <CloseButton className="bday-x" label={t.bday.close} onClick={onClose} />
    </div>
  );
}
