// Transcend stars, as the game shows them: six stars, gold up to ★N (owner 2026-10-11: «теперь идеально»). MiniStars — on a
// team slot, a report header and the card header; StarPick — tap the N-th star (min — stars below it are lit and can't be
// picked: the hero's minimum on the card, the card's ★ in Team); StarSheet — the sheet with the pick (none without onStar)
// and the caller's actions below it (the card: «Убрать из ростера»); what the stars give is not shown here, it just counts.
// With `level` (the card, .x/0205) — «Уровень [100][120][по умолчанию]» under the stars: the pressed buttons are the hero's
// level and, while it follows the settings, «по умолчанию»; 100/120 marks the hero, «по умолчанию» forgets the mark.
import type { ReactNode } from 'react';
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

export interface LevelPick { lv120: boolean; marked: boolean; onLevel?: (v: 100 | 120 | null) => void }

function LevelRow({ lv120, marked, onLevel }: LevelPick) {
  const t = useT();
  const b = (on: boolean, v: 100 | 120 | null, label: string, cls = 'chip') => (
    <button type="button" className={cls} aria-pressed={on} disabled={!onLevel} onClick={() => onLevel?.(v)}>{label}</button>
  );
  return (
    <div className="hs-lv" role="group" aria-label={t.ui.levelHero}>
      <span className="hs-lvl">{t.ui.levelRow}</span>
      {b(!lv120, 100, '100')}{b(lv120, 120, '120')}{b(!marked, null, t.ui.levelDefault, 'chip hs-def')}
    </div>
  );
}

export function StarSheet({ c, star, min, onStar, level, onClose, children }: {
  c: Char; star: number; min?: number; onStar?: (n: number) => void; level?: LevelPick; onClose: () => void; children?: ReactNode;
}) {
  const t = useT();
  return (
    <Sheet title={level ? t.ui.starsLevel(c.name) : t.ui.stars(c.name)} onClose={onClose} className="hs-sheet">
      {onStar && <StarPick star={star} min={min} onStar={onStar} />}
      {level && <LevelRow {...level} />}
      {children && <div className="hs-act">{children}</div>}
    </Sheet>
  );
}
