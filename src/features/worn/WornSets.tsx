// The sets under the chain on «Надето»: each worn set on its own header line with what it adds on the right (the points of
// its bonus on top of the pieces'), its active bonus rows under it; a set with one row stays on one line (owner 2026-10-10).
// A value of 0 prints no number. Data — wearing.wornView (bonuses, value.sets).
import { useT } from '@/i18n';
import type { Index } from '@/game/data';
import { partText } from '@/game/set/setName';
import { bonusText, setBlocksOf } from '@/features/gear/ui/pieceText';
import type { WornView } from './wearing';

// points to one decimal («23,3») — fit.pts rounds itself and prints no «,0»
export function Pts({ x }: { x: number }) {
  const t = useT();
  return <span className="wpts">+{t.fit.pts(x)}</span>;
}

// head — the set («Life ×4»); text — what follows it on the same line (one-row set: its bonus); sub — the rows line under it
export function SetLine({ head, text, sub, value, faint }: { head: string; text?: string; sub?: string; value: number | null; faint?: boolean }) {
  return (
    <div className={faint ? 'wset pot' : 'wset'}>
      <p className="wset-h"><span><b>{head}</b>{text ? ` · ${text}` : ''}</span>{value ? <Pts x={value} /> : null}</p>
      {sub && <p className="wset-b">{sub}</p>}
    </div>
  );
}

// t4 — the faint «what T4 would add» lines after the sets (not on the shared view-only card)
export function WornSets({ idx, wv, t4 }: { idx: Index; wv: WornView; t4: boolean }) {
  const t = useT();
  const blocks = setBlocksOf(t, idx, wv.bonuses);
  const lines = t4 ? wv.t4 : [];
  if (!blocks.length && !lines.length) return null;
  return (
    <div className="bgear-set">
      {blocks.map((b) => {
        const value = wv.value?.sets.find((x) => x.set === b.set)?.value ?? null;
        return b.rows === 1
          ? <SetLine key={b.set} head={b.head} text={b.body} value={value} />
          : <SetLine key={b.set} head={b.head} sub={b.body} value={value} />;
      })}
      {lines.map((l) => (
        <SetLine key={'t4' + l.set} faint head={t.card.t4Head(partText(idx, { set: l.set, n: Math.max(...l.rows.map((r) => r.n)) }))}
          text={l.rows.map((r) => bonusText(idx, r)).join(' · ')} sub={t.card.t4Need(l.slots)} value={l.gain} />
      ))}
    </div>
  );
}
