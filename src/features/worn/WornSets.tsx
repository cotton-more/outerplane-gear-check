// The sets under the chain on «Надето»: each worn set on its own header line with what it adds on the right (the points of
// its bonus on top of the pieces'), its active bonus rows under it; a set with one row stays on one line (owner 2026-10-10).
// A value of 0 prints no number. Data — wearing.wornView (bonuses, value.sets).
import { useT } from '@/i18n';
import type { Index } from '@/game/data';
import { setBlocksOf } from '@/features/gear/ui/pieceText';
import type { WornView } from './wearing';

// points to one decimal («23,3») — fit.pts rounds itself and prints no «,0»
export function Pts({ x }: { x: number }) {
  const t = useT();
  return <span className="wpts">+{t.fit.pts(x)}</span>;
}

// head — the set («Life ×4»); text — what follows it on the same line (one-row set: its bonus); sub — the rows line under it
export function SetLine({ head, text, sub, value }: { head: string; text?: string; sub?: string; value: number | null }) {
  return (
    <div className="wset">
      <p className="wset-h"><span><b>{head}</b>{text ? ` · ${text}` : ''}</span>{value ? <Pts x={value} /> : null}</p>
      {sub && <p className="wset-b">{sub}</p>}
    </div>
  );
}

export function WornSets({ idx, wv }: { idx: Index; wv: WornView }) {
  const t = useT();
  const blocks = setBlocksOf(t, idx, wv.bonuses);
  if (!blocks.length) return null;
  return (
    <div className="bgear-set">
      {blocks.map((b) => {
        const value = wv.value?.sets.find((x) => x.set === b.set)?.value ?? null;
        return b.rows === 1
          ? <SetLine key={b.set} head={b.head} text={b.body} value={value} />
          : <SetLine key={b.set} head={b.head} sub={b.body} value={value} />;
      })}
    </div>
  );
}
