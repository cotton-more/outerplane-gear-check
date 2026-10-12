// Hero list to pick one from: portrait and name in a grid of buttons («Обмен вещами» — whom to re-dress, a team spot;
// «Команда» — a team spot, in its own sheet: no title line). search — placeholder of a name field above the list (none — no field): matches like the
// character list's search (name, slug, nickname). mark — an optional per-row mark at the end («Кого переодеть?»: the gain now,
// «—», ✓); off — the row can't be picked.
import { useState } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import type { Char } from '@/game/data/types';

// the name search of hero lists: name, slug, nickname
export const heroMatches = (c: Pick<Char, 'name' | 'slug' | 'nick'>, query: string) => {
  const q = query.trim().toLowerCase();
  return !q || c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.nick || '').toLowerCase().includes(q);
};

// text — shown; title — what it means (screen readers, hover); cls — its colour (up / down)
export interface PickMark { text: string; title: string; cls?: string; off?: boolean }

export function HeroPicker({ ids, title, empty, search, mark, onPick }: {
  ids: readonly string[]; title?: string; empty: string; search?: string; mark?: (id: string) => PickMark | null; onPick: (id: string) => void;
}) {
  const idx = useIndex();
  const [q, setQ] = useState('');
  const shown = ids.filter((id) => heroMatches(idx.CHAR[id], q));
  return (
    <div className="trade-pick">
      {title && <p className="trade-q">{title}</p>}
      {search && ids.length > 0 && (
        <input className="pick-q" type="search" value={q} placeholder={search} aria-label={search} onChange={(e) => setQ(e.target.value)} />
      )}
      {ids.length ? (
        <ul className="trade-heroes">
          {shown.map((id) => {
            const m = mark?.(id);
            return (
              <li key={id}>
                <button type="button" className="trade-hero" disabled={m?.off} onClick={() => onPick(id)}>
                  <HeroFace c={idx.CHAR[id]} />
                  {m ? (
                    // the mark under the name: a long name keeps its width on a 280 px phone
                    <span className="trade-ht">
                      <span className="trade-hn"><HeroName c={idx.CHAR[id]} /></span>
                      <span className={`trade-mk${m.cls ? ' ' + m.cls : ''}`} title={m.title} aria-hidden="true">{m.text}</span>
                      <span className="sr-only">{m.title}</span>
                    </span>
                  ) : <span className="trade-hn"><HeroName c={idx.CHAR[id]} /></span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : empty && <p className="muted small">{empty}</p>}
    </div>
  );
}
