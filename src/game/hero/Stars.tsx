// Transcend stars, as the game shows them: six stars, gold up to ★N (owner 2026-10-11: «теперь идеально»). MiniStars — on a
// team slot, a report header and the card header (null — not set: six unlit); StarPick — tap the N-th star; StarSheet — the
// sheet with the pick and, for heroes whose stars give crit, the line about it (card and Team: one value per hero).
import type { Char } from '@/game/data/types';
import { TABLER } from '@/game/icons/tabler';
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';

const STAR = TABLER.star[0];
const SIX = [1, 2, 3, 4, 5, 6];
const Star = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} /></svg>;

export function MiniStars({ n }: { n: number | null }) {
  const t = useT();
  return (
    <span className="hs-mini" role="img" aria-label={n === null ? t.ui.starsUnset : t.ui.star(n)}>
      {SIX.map((k) => <i key={k} className={n !== null && k <= n ? 'on' : undefined}><Star /></i>)}
    </span>
  );
}

export function StarPick({ star, onStar }: { star: number | null; onStar: (n: number) => void }) {
  const t = useT();
  return (
    <div className="hs-big" role="group" aria-label={t.ui.starsGroup}>
      {SIX.map((k) => (
        <button key={k} type="button" className={star !== null && k <= star ? 'on' : undefined} aria-pressed={k === star} aria-label={t.ui.star(k)}
          onClick={() => onStar(k)}><Star /></button>
      ))}
    </div>
  );
}

// what the stars add to the hero's crit, % — «+65%» at the set ★ that gives it, else «from ★5 +65%» (the first ★ that does);
// null — nothing (most heroes)
export function starsCritLine(c: Char, t: ReturnType<typeof useT>, star: number | null): string | null {
  const row = c.chc?.trans;
  const first = row ? row.findIndex((v) => v > 0) : -1;
  if (!row || first < 0) return null;
  const now = star === null ? 0 : row[star - 1] ?? 0;
  return now > 0 ? t.ui.starsCrit(now / 10) : t.ui.starsCritFrom(row[first] / 10, first + 1);
}

export function StarSheet({ c, star, onStar, onClose }: { c: Char; star: number | null; onStar: (n: number) => void; onClose: () => void }) {
  const t = useT();
  const line = starsCritLine(c, t, star);
  return (
    <Sheet title={t.ui.stars(c.name)} onClose={onClose} className="hs-sheet">
      <StarPick star={star} onStar={onStar} />
      {line && <p className="hs-crit muted small">{line}</p>}
    </Sheet>
  );
}
