// The four team spots in one row (not the trade diamond: the split screen is short — owner OK 2026-10-11). An empty spot
// is «+»; a hero — portrait, name, six small stars. Tap — pick this spot (TeamScreen shows the list or the stars under it).
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import type { TeamMember } from '@/game/synergy/check';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import { MiniStars } from './Stars';

export function TeamSlots({ team, sel, onSlot }: { team: readonly (TeamMember | null)[]; sel: number | null; onSlot: (i: number) => void }) {
  const t = useT();
  const idx = useIndex();
  return (
    <div className="tm-team" {...tour('team')}>
      {team.map((m, i) => {
        const c = m ? idx.CHAR[m.id] : null;
        return m && c ? (
          <button key={i} type="button" className="tm-slot" aria-pressed={sel === i} onClick={() => onSlot(i)}>
            <HeroFace c={c} />
            <span className="tm-n"><HeroName c={c} /></span>
            <MiniStars n={m.star} />
          </button>
        ) : (
          <button key={i} type="button" className="tm-add" aria-pressed={sel === i} aria-label={t.team.addMember} onClick={() => onSlot(i)}>+</button>
        );
      })}
    </div>
  );
}
