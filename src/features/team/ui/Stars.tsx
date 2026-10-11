// Transcend stars, as the game shows them: six stars, gold up to ★N. MiniStars — on a team slot and a report header;
// StarPick — in the stars sheet of a team hero: tap the N-th star (owner 2026-10-11: «теперь идеально»).
import { TABLER } from '@/game/icons/tabler';
import { useT } from '@/i18n';

const STAR = TABLER.star[0];
const SIX = [1, 2, 3, 4, 5, 6];
const Star = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>;

export function MiniStars({ n }: { n: number }) {
  const t = useT();
  return (
    <span className="tm-mini" role="img" aria-label={t.team.star(n)}>
      {SIX.map((k) => <i key={k} className={k <= n ? 'on' : undefined}><Star /></i>)}
    </span>
  );
}

export function StarPick({ star, onStar }: { star: number; onStar: (n: number) => void }) {
  const t = useT();
  return (
    <div className="tm-big" role="group" aria-label={t.team.starsGroup}>
      {SIX.map((k) => (
        <button key={k} type="button" className={k <= star ? 'on' : undefined} aria-pressed={k === star} aria-label={t.team.star(k)}
          onClick={() => onStar(k)}><Star /></button>
      ))}
    </div>
  );
}
