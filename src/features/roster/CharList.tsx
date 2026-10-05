// Список персонажей: панель над сеткой (CharBar: поиск, фильтр, «Мои · Доодеть · Все», «Обмен») и сетка плиток со звёздочками.
import { useCallback, useMemo, type Dispatch } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { charMatches, compareChars, effectiveMode, type ListAction, type ListState } from './charFilter';
import type { RosterApi } from './useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { isPinned } from '@/features/gear/model/gear';
import { useIndex } from '@/game/data/IndexContext';
import { CharBar } from './CharBar';
import { CharTile } from './CharTile';

// geared — у кого сколько надето; off — X, которого заменил Core Fusion X (features/gear/model/fusion): в списке
// рядом с ним (пара всегда в одном порядке, fusionOrder), с пометкой и приглушённый; звезда на нём — окно «Вернуться к X?» (App);
// todressN — сколько своих доодеть (у «Доодеть»)
interface Props {
  s: ListState; dispatch: Dispatch<ListAction>; rosterApi: RosterApi; gear: GearApi; geared: ReadonlyMap<string, number>;
  off: ReadonlyMap<string, string>; todressN: number;
  onTrade?: () => void; // «Обмен» (features/trade, сразу режим «Команда») — кнопка на панели, когда у кого-то есть вещи
}

// Пара X и Core Fusion X — рядом и всегда в одном порядке: Core Fusion X сразу за X, кто бы из них ни был активен
// (неактивный приглушён). Иначе при смене героя в ростере пара менялась бы местами (владелец 2026-10-05)
function fusionOrder(list: Char[], partner: (id: string) => string | undefined, char: (id: string) => Char | undefined): Char[] {
  const ids = new Set(list.map((c) => c.id));
  const out: Char[] = [];
  for (const c of list) {
    if (c.fusionOf && ids.has(c.fusionOf)) continue;
    out.push(c);
    const pid = partner(c.id);
    const p = pid && !c.fusionOf && ids.has(pid) ? char(pid) : undefined;
    if (p) out.push(p);
  }
  return out;
}

export function CharList({ s, dispatch, rosterApi, gear, geared, off, todressN, onTrade }: Props) {
  const idx = useIndex();
  const t = useT();
  const { D } = idx;
  const { roster } = rosterApi;
  const partner = useCallback((id: string) => idx.CHAR[id]?.fusionOf ?? idx.FUSED[id], [idx]);
  // пока ростер пуст, режим «Все» (SPEC 6)
  const mode = effectiveMode(s.cMode, roster.size);
  const shown = useMemo(() => {
    const matched = D.chars.filter((c) => charMatches(c, { ...s, cMode: mode }, roster, geared, off)).sort(compareChars);
    return fusionOrder(matched, partner, (id) => idx.CHAR[id]);
  }, [D, s, mode, roster, geared, off, idx, partner]);
  const nGeared = D.chars.filter((c) => geared.has(c.id) && c.builds.length).length; // у скольких есть вещи
  // «Доодеть» пусто, и сузить больше нечем: все одеты
  const allDressed = mode === 'todress' && !s.cq && !s.cel && !s.ccl;
  return (
    <div className="panel" id="char-list">
      <CharBar s={s} dispatch={dispatch} rosterSize={roster.size} todressN={todressN} onTrade={onTrade && nGeared > 0 ? onTrade : undefined} />
      <div className="cgrid" id="cgrid">
        {shown.length ? shown.map((c) => (
          <CharTile key={c.id} c={c} own={roster.has(c.id)} selected={s.charId === c.id} isNew={idx.NEW.has(c.id)} gear={geared.get(c.id)} off={off.has(c.id)} pinned={isPinned(gear.store, c.id)}
            partnerName={idx.CHAR[partner(c.id) ?? '']?.name}
            onSelect={() => dispatch({ type: 'selectChar', id: c.id })} onToggle={() => rosterApi.toggle(c.id)} />
        )) : <p className="empty">{allDressed ? t.ui.allDressed : t.ui.nobodyFound}</p>}
      </div>
    </div>
  );
}
