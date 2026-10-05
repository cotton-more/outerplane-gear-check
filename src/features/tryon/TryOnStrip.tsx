// Полоса над формой в режиме «для героя» (features/tryon/tryon): «Только для · [лицо] Caren» и ✕ — снова для всех.
// Одна строка: в ландшафте 812×375 и в окне 420×390 форма не должна уехать вниз.
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import { HeroFace } from '@/game/hero/HeroFace';
import { CloseButton } from '@/shared/ui/CloseButton';
import { HeroName } from '@/game/hero/HeroName';

export function TryOnStrip({ c, onEnd }: { c: Char; onEnd: () => void }) {
  const t = useT();
  return (
    <div className="tryon" role="status" {...tour('tryon')}>
      <span className="tryon-k">{t.tryon.label}</span>
      <span className="tryon-d" aria-hidden="true">·</span>
      <HeroFace c={c} />
      <span className="tryon-n" title={c.name}><b><HeroName c={c} /></b></span>
      <CloseButton className="tryon-x" label={t.tryon.end} title={t.tryon.end} onClick={onEnd} />
    </div>
  );
}
