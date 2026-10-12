// Transcend stars, as the game shows them: six stars, gold up to ★N (owner 2026-10-11: «теперь идеально»). MiniStars — on a
// team slot, a report header and the card header; StarPick — tap the N-th star (min — stars below it are lit and can't be
// picked: the hero's minimum on the card, the card's ★ in Team); StarSheet — the sheet with the pick only: what the stars give
// is not shown here, it just counts.
import type { Char } from '@/game/data/types';
import { TABLER } from '@/game/icons/tabler';
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';

const STAR = TABLER.star[0];
const SIX = [1, 2, 3, 4, 5, 6];
const Star = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>;

export function MiniStars({ n }: { n: number }) {
  const t = useT();
  return (
    <span className="hs-mini" role="img" aria-label={t.ui.star(n)}>
      {SIX.map((k) => <i key={k} className={k <= n ? 'on' : undefined}><Star /></i>)}
    </span>
  );
}

export function StarPick({ star, min = 1, onStar }: { star: number; min?: number; onStar: (n: number) => void }) {
  const t = useT();
  return (
    <div className="hs-big" role="group" aria-label={t.ui.starsGroup}>
      {SIX.map((k) => (
        <button key={k} type="button" className={k <= star ? 'on' : undefined} aria-pressed={k === star} aria-label={t.ui.star(k)}
          disabled={k < min} onClick={() => onStar(k)}><Star /></button>
      ))}
    </div>
  );
}

export function StarSheet({ c, star, min, onStar, onClose }: {
  c: Char; star: number; min?: number; onStar: (n: number) => void; onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet title={t.ui.stars(c.name)} onClose={onClose} className="hs-sheet">
      <StarPick star={star} min={min} onStar={onStar} />
    </Sheet>
  );
}
