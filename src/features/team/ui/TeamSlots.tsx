// The four team spots in one row (not the trade diamond: the split screen is short — owner OK 2026-10-11). An empty spot
// is «+». A hero (owner 2026-10-11): tap the portrait — pick another hero, ✕ in the corner — remove, the stars at the
// bottom — set ★ (TeamScreen opens the sheets).
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import type { TeamMember } from '@/game/synergy/check';
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import { tour } from '@/tour/anchors';
import { MiniStars } from './Stars';

export function TeamSlots({ team, onPick, onStars, onRemove }: {
  team: readonly (TeamMember | null)[]; onPick: (i: number) => void; onStars: (i: number) => void; onRemove: (i: number) => void;
}) {
  const t = useT();
  const idx = useIndex();
  return (
    <div className="tm-team" {...tour('team')}>
      {team.map((m, i) => {
        const c = m ? idx.CHAR[m.id] : null;
        return m && c ? (
          <div key={i} className="tm-p">
            <button type="button" className="tm-slot" aria-label={t.team.replace(c.name)} onClick={() => onPick(i)}>
              <HeroFace c={c} />
              <span className="tm-n"><HeroName c={c} /></span>
            </button>
            <button type="button" className="tm-sb" aria-label={t.team.stars(c.name)} onClick={() => onStars(i)}><MiniStars n={m.star} /></button>
            <CloseButton className="tm-x hit" label={t.team.removeMember(c.name)} onClick={() => onRemove(i)} />
          </div>
        ) : (
          <button key={i} type="button" className="tm-add" aria-label={t.team.addMember} onClick={() => onPick(i)}>+</button>
        );
      })}
    </div>
  );
}
