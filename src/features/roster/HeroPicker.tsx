// Hero list to pick one from: portrait and name in a grid of buttons («Обмен вещами» — whom to re-dress, a team spot;
// «Команда» — a team spot, in its own sheet: no title line). search — placeholder of a name field above the list (none — no field): matches like the
// character list's search (name, slug, nickname).
import { useState } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';

export function HeroPicker({ ids, title, empty, search, onPick }: {
  ids: readonly string[]; title?: string; empty: string; search?: string; onPick: (id: string) => void;
}) {
  const idx = useIndex();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = query
    ? ids.filter((id) => { const c = idx.CHAR[id]; return c.name.toLowerCase().includes(query) || c.slug.includes(query) || (c.nick || '').toLowerCase().includes(query); })
    : ids;
  return (
    <div className="trade-pick">
      {title && <p className="trade-q">{title}</p>}
      {search && ids.length > 0 && (
        <input className="pick-q" type="search" value={q} placeholder={search} aria-label={search} onChange={(e) => setQ(e.target.value)} />
      )}
      {ids.length ? (
        <ul className="trade-heroes">
          {shown.map((id) => (
            <li key={id}>
              <button type="button" className="trade-hero" onClick={() => onPick(id)}>
                <HeroFace c={idx.CHAR[id]} />
                <span className="trade-hn"><HeroName c={idx.CHAR[id]} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : empty && <p className="muted small">{empty}</p>}
    </div>
  );
}
