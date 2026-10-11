// «α» next to a feature's name: it is in alpha — new, may be wrong and will still change (owner 2026-10-11, the Team
// screen; the letter, not the word — more compact). The word goes to the screen reader and the hint.
import { useT } from '@/i18n';

export function AlphaMark() {
  const t = useT();
  return <span className="alpha" title={t.team.alphaHint} aria-label={t.team.alpha}>α</span>;
}
