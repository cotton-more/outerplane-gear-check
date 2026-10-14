// The four team spots: 2×2 beside the boss slot (HISTORY.md 0206, owner 2026-10-14; one row when the snapshot has no
// bosses — screens/team lays them out). An empty spot is «+». A hero (owner 2026-10-11): tap the portrait — pick another
// hero, ✕ in the corner — remove, the stars on the portrait's foot — set ★ (TeamScreen opens the sheets); no name on the spot
// (0206 mockup: the turn plan below names them; the buttons say it to screen readers). below — what hangs under a hero's spot
// (the build for the team trade, HISTORY.md 0200-boss E2 — composed by screens/team).
import type { ReactNode } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import type { TeamMember } from '@/game/synergy/check';
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import { tour } from '@/tour/anchors';
import { MiniStars } from '@/game/hero/Stars';

export function TeamSlots({ team, onPick, onStars, onRemove, below }: {
  team: readonly (TeamMember | null)[]; onPick: (i: number) => void; onStars: (i: number) => void; onRemove: (i: number) => void;
  below?: (i: number, id: string) => ReactNode;
}) {
  const t = useT();
  const idx = useIndex();
  return (
    <div className="tm-team" {...tour('team')}>
      {team.map((m, i) => {
        const c = m ? idx.CHAR[m.id] : null;
        return m && c ? (
          <div key={i} className={below ? 'tm-p tm-pb' : 'tm-p'}>
            <button type="button" className="tm-slot" aria-label={t.team.replace(c.name)} onClick={() => onPick(i)}>
              <HeroFace c={c} />
            </button>
            <button type="button" className="tm-sb" aria-label={t.ui.stars(c.name)} onClick={() => onStars(i)}><MiniStars n={m.star} /></button>
            <CloseButton className="tm-x hit" label={t.team.removeMember(c.name)} onClick={() => onRemove(i)} />
            {below?.(i, m.id)}
          </div>
        ) : (
          <button key={i} type="button" className="tm-add" aria-label={t.team.addMember} onClick={() => onPick(i)}>+</button>
        );
      })}
    </div>
  );
}
