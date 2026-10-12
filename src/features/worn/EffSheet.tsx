// «Эфф: ≈ 233» and the sheet «Эфф для X» (.x/0200-boss stage D, Q3): the hero's EFF the app knows (game/stat/eff) and the
// player's stat-screen value. The sheet: the number (with «≈» when it is an estimate), «Герой 170 · вещи 63 · ×2», a quiet
// line when gear changed since typing (owner: keep it for now), the field «В игре» (empty — the app's number in grey),
// «Сбросить» (forget the typed value), the text, «Готово». Saved on «Готово»: the typed number with the app's EFF now
// (effShown keeps the ratio); the field untouched — nothing changes (a stale value isn't re-anchored to new gear by a tap).
// The parent stores it (CharDetail / TeamScreen, setEff).
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { EFF_MAX } from '@/features/gear/model/gear';
import type { EffCal } from '@/game/stat/eff';
import { HeroFace } from '@/game/hero/HeroFace';
import { Sheet } from '@/shared/ui/Sheet';
import type { WornEff } from './wearing';

// the multiplier the shown number carries, to one decimal («2», «1,5» — t.fit.pts); none when ≈ 1
export const effX = (t: ReturnType<typeof useT>, x: number): string | null => (Math.abs(x - 1) < 0.05 ? null : t.fit.pts(x));

// «≈ 233»: the sign for the eye, the word for a screen reader
export function EffNum({ shown }: { shown: WornEff['shown'] }) {
  const t = useT();
  return <>{shown.approx && <><span aria-hidden="true">≈{'\u2009'}</span><span className="sr-only">{t.card.effApprox}{' '}</span></>}{shown.v}</>;
}

export function EffSheet({ c, eff, onClose, onSave }: {
  c: Char; eff: WornEff; onClose: () => void; onSave: (cal: EffCal | null) => void;
}) {
  const t = useT();
  const first = eff.cal ? String(eff.cal.typed) : '';
  const [text, setText] = useState(first);
  const n = /^\d{1,4}$/.test(text) && Number(text) >= 1 && Number(text) <= EFF_MAX ? Number(text) : null;
  const { e, shown } = eff;
  const x = effX(t, shown.x);
  const save = () => {
    if (text === first || (text !== '' && n === null)) onClose(); // empty — forget the value; not a number in range — leave it
    else onSave(n === null ? null : { typed: n, at: e.total });
  };
  return (
    <Sheet title={t.card.effTitle(c.name)} onClose={onClose} className="effsheet">
      <div className="vsheet">
        <div className="eff-h">
          <HeroFace c={c} round />
          <p><span className="eff-l">{t.card.effShown}</span><b className="eff-v"><EffNum shown={shown} /></b></p>
        </div>
        <p className="eff-split">{t.card.effSplit(e.hero, e.gear, x, !eff.cal && e.premium > 0)}</p>
        {eff.cal && shown.approx && <p className="eff-stale">{t.card.effStale}</p>}
        <div className="eff-in">
          <label htmlFor="eff-typed">{t.card.effInGame}</label>
          <input id="eff-typed" inputMode="numeric" pattern="[0-9]*" maxLength={4} aria-label={t.card.effInGameAria}
            placeholder={String(shown.v)} value={text} onChange={(ev) => setText(ev.target.value.replace(/\D/g, ''))} />
          <button type="button" className="linkbtn crit-reset" disabled={!text} onClick={() => setText('')}>{t.card.effReset}</button>
        </div>
        <p className="crit-about">{t.card.effAbout}</p>
        <button type="button" className="btn primary aim-go" onClick={save}>{t.card.effGo}</button>
      </div>
    </Sheet>
  );
}
