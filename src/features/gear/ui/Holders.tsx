// Who has this piece (features/gear/find holdersOf): «Надето: X» and «В пуле: Y», a name opens the hero's card. «Найти вещь»
// and the verdict (owner 2026-10-17: a summary only, the verdict doesn't change) show it the same way
import type { Index } from '@/game/data';
import { useT } from '@/i18n';
import { ClassIcon } from '@/game/icons/Img';
import { HeroName } from '@/game/hero/HeroName';
import type { Holders as H } from '@/features/gear/find';

export function Holders({ idx, h, className, onOpenChar }: { idx: Index; h: H; className: string; onOpenChar: (id: string) => void }) {
  const t = useT();
  // a name is plain text with the class icon in the element's colour (owner 2026-10-18), still a button: it opens the card
  const names = (ids: string[]) => ids.map((id, i) => {
    const c = idx.CHAR[id];
    return (
      <span key={id}>{i > 0 && ', '}<button type="button" className="hold-n" onClick={() => onOpenChar(id)}>
        {c ? <><HeroName c={c} /><ClassIcon cls={c.class} el={c.element} /></> : id}
      </button></span>
    );
  });
  return (
    <div className={className}>
      {h.worn.length > 0 && <p>{t.ui.findWorn} {names(h.worn)}</p>}
      {h.stash.length > 0 && <p>{t.ui.findStash} {names(h.stash)}</p>}
    </div>
  );
}
