// Where the Worn heading's points come from (owner 2026-10-10): Stats (the pieces' points; the sum is the heading minus the sets,
// in tenths, so the panel adds up to the heading; a chip per worn slot), Sets (what the sets add; one set — on the heading's
// line, several — a line each), Passive (the worn weapon's and accessory's rank as a word — no points). Opens under the heading
// (WornGear). No new math: layoutValue splits ptsSum / setSum, the rank is gearRank (wearing.passive).
import { useT } from '@/i18n';
import type { Index } from '@/game/data';
import { SLOTS } from '@/game/data';
import { SlotIcon } from '@/game/icons/Img';
import { namedGain } from '@/features/gear/model/vs';
import { partText } from '@/game/set/setName';
import type { Fit } from '@/features/gear/model/vs';
import type { SlotId } from '@/game/data/types';
import type { WornView } from './wearing';

export const BUDGET_ID = 'worn-budget';

// a slot chip: its icon (named for a screen reader) and a word or a number
function Chip({ slot, children }: { slot: SlotId; children: string }) {
  const t = useT();
  return <span className="wbud-chip"><SlotIcon slot={slot} /><span className="sr-only">{t.ui.slotNames[slot]}</span>{children}</span>;
}

export function WornBudget({ idx, wv }: { idx: Index; wv: WornView }) {
  const t = useT();
  const v = wv.value;
  if (!v) return null;
  const pts = (x: number) => t.fit.pts(x);
  const stats = (Math.round(v.v * 10) - Math.round(v.setSum * 10)) / 10;
  const sets = v.sets.filter((s) => namedGain(s.value)).map((s) => {
    const n = Math.max(0, ...wv.bonuses.filter((r) => r.set === s.set).map((r) => r.n)) || s.n;
    return { set: s.set, label: partText(idx, { set: s.set, n }), value: s.value };
  });
  const word = (slot: 'weapon' | 'accessory', fit: Fit) => (fit === 'rec' ? t.fit.chipRank(slot) : fit === 'stopgap' ? t.ui.verdictLabel.temp.toLowerCase() : t.ui.notInBuilds);
  return (
    <dl className="wbud" id={BUDGET_ID}>
      <div>
        <dt>{t.card.budgetStats}</dt><dd className="wpts">{pts(stats)}</dd>
        <dd className="wbud-chips">
          {SLOTS.filter(({ id }) => v.ptsBySlot[id] !== undefined).map(({ id }) => <Chip key={id} slot={id}>{pts(v.ptsBySlot[id]!)}</Chip>)}
        </dd>
      </div>
      {sets.length > 0 && (
        <div>
          <dt>{t.card.budgetSets}{sets.length === 1 && ` · ${sets[0].label}`}</dt><dd className="wpts">{pts(v.setSum)}</dd>
          {sets.length > 1 && sets.map((s) => <dd key={s.set} className="wbud-set"><span>{s.label}</span><span className="wpts">{pts(s.value)}</span></dd>)}
        </div>
      )}
      {wv.passive.length > 0 && (
        <div>
          <dt>{t.card.budgetPassive}</dt>
          <dd className="wbud-chips">{wv.passive.map((p) => <Chip key={p.slot} slot={p.slot}>{word(p.slot, p.fit)}</Chip>)}</dd>
        </div>
      )}
    </dl>
  );
}
