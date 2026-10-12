// Transcend stars, as the game shows them: six stars, gold up to ★N (owner 2026-10-11: «теперь идеально»). MiniStars — on a
// team slot, a report header and the card header; StarPick — tap the N-th star (min — stars below it are lit and can't be
// picked: the hero's minimum on the card, the card's ★ in Team); StarSheet — the sheet with the pick (none without onStar)
// and the caller's actions below it (the card: «Убрать из ростера»); what the stars give is not shown here, it just counts.
// With `level` (the card, .x/0205) — under the stars one pill «по умолчанию | Lv 100 | Lv 120» (owner 2026-10-12: a
// three-way switch): «по умолчанию» chosen — the level the settings give is lit pale gold; a level chosen — bright gold.
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
  // a level half: bright gold when marked on the hero, pale while the default gives it
  const seg = (v: 100 | 120) => {
    const on = (v === 120) === lv120;
    return (
      <button type="button" className={`lv-seg${on ? (marked ? ' on' : ' on soft') : ''}`} aria-pressed={on && marked} disabled={!onLevel}
        onClick={() => onLevel?.(v)}><small>Lv</small><b>{v}</b></button>
    );
  };
  return (
    <div className="lv-pill" role="group" aria-label={t.ui.levelHero}>
      <button type="button" className={`lv-seg lv-auto${marked ? '' : ' on'}`} aria-pressed={!marked} disabled={!onLevel}
        onClick={() => onLevel?.(null)}>{t.ui.levelDefault}</button>
      {seg(100)}{seg(120)}
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
