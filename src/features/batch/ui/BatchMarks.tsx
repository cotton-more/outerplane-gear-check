// «E · надето» and «🔒 · отложено» next to «В партию» (owner 2026-10-10: they add an entry just like it): the form's
// footer on a wide screen, the bottom bar on a phone (words hidden there, see batch.css). «E» — a piece worn by a hero
// (picker: heroes wearing this slot that fits the batch), no substats; «🔒» — a locked piece, entered on the form like
// «В партию»: its substats only say which piece it is
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import { LockIcon } from '@/game/icons/Img';

// what — the batch's kind for «Никто из твоих героев не носит здесь Legendary Speed»
export function BatchMarks({ cands, what, onWorn, onLock }: {
  cands: () => Char[] | null; what: string;
  onWorn: (c: string, from: Element | null) => void; onLock: () => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<Char[] | null>(null);
  const [e, worn] = t.batch.wornAdd.split(' · ');
  return (
    <span className="batch-marks">
      <button type="button" className="btn bmark-b hit" aria-label={t.batch.wornAdd} title={t.batch.wornAdd} onClick={() => { const c = cands(); if (c) setPick(c); }}>
        <b aria-hidden="true">{e}</b><span className="bm-long" aria-hidden="true"> · {worn}</span>
      </button>
      <button type="button" className="btn bmark-b hit" aria-label={t.batch.lockAddLabel} title={t.batch.lockAddLabel} onClick={onLock}>
        <LockIcon /><span className="bm-long" aria-hidden="true"> {t.batch.lockAdd}</span>
      </button>
      {pick && (
        <Sheet title={t.batch.whose} onClose={() => setPick(null)}>
          <div className="batch-whose">
            {pick.length ? pick.map((c) => (
              <button key={c.id} type="button" className="btn bwho" onClick={(ev) => { onWorn(c.id, ev.currentTarget.querySelector('.face') ?? ev.currentTarget); setPick(null); }}>
                <HeroFace c={c} round /><HeroName c={c} />
              </button>
            )) : <p className="muted small">{t.batch.whoseNone(what)}</p>}
          </div>
        </Sheet>
      )}
    </span>
  );
}
