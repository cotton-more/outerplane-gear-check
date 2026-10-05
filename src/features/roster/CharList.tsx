// Список персонажей: поиск, фильтры (и «не всё надето» — кого доодеть), ростер (звёздочки), экспорт/импорт ростера,
// «Обмен для команды».
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { charMatches, compareChars, type CharFilter, type ListAction, type ListState } from './charFilter';
import { encodeRoster, parseRoster } from './rosterCode';
import type { RosterApi } from './useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { isPinned, type GearStore } from '@/features/gear/model/gear';
import { encodeGear, readGearCode } from '@/features/gear/store/gearStore';
import { ClassIcon, ElementIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { Toggle } from '@/shared/ui/Toggle';
import { CodeBox } from '@/shared/ui/CodeBox';
import { FilterChips } from '@/shared/ui/FilterChips';
import { CharTile } from './CharTile';

// onGearImport — код экипировки заменил записи: всех, у кого есть вещи, — в ростер, сообщение с «Вернуть» (App; вещей
// в коде нет — false); geared — у кого сколько надето; off — X, которого заменил Core Fusion X (features/gear/model/fusion): в списке
// сразу за ним, с пометкой и приглушённый; звезда на нём — окно «Вернуться к X?» (App);
// touring — идёт обучение: на странице экипировка тура (пример или пусто), кода экипировки нет
interface Props {
  s: ListState; dispatch: Dispatch<ListAction>; rosterApi: RosterApi; gear: GearApi; geared: ReadonlyMap<string, number>;
  off: ReadonlyMap<string, string>; onGearImport: (prev: GearStore, raw: unknown) => boolean; touring: boolean;
  onTrade?: () => void; // «Обмен для команды» (features/trade, сразу режим «Команда») — вход и на ПК, без меню ☰
}

// Неактивный герой пары (X при Core Fusion X или Core Fusion X при X) — сразу за своим активным, если тот тоже в списке
function fusionOrder(
  list: Char[],
  off: ReadonlyMap<string, string>,
  char: (id: string) => Char | undefined,
  partner: (id: string) => string | undefined,
): Char[] {
  const ids = new Set(list.map((c) => c.id));
  const out: Char[] = [];
  for (const c of list) {
    if (off.has(c.id) && ids.has(off.get(c.id)!)) continue;
    out.push(c);
    const pid = partner(c.id);
    if (pid && off.get(pid) === c.id && ids.has(pid)) {
      const p = char(pid);
      if (p) out.push(p);
    }
  }
  return out;
}

export function CharList({ s, dispatch, rosterApi, gear, geared, off, onGearImport, touring, onTrade }: Props) {
  const idx = useIndex();
  const t = useT();
  const { D } = idx;
  const { roster } = rosterApi;
  const [io, setIo] = useState(false);
  const partner = useCallback((id: string) => idx.CHAR[id]?.fusionOf ?? idx.FUSED[id], [idx]);
  const shown = useMemo(() => {
    const matched = D.chars.filter((c) => charMatches(c, s, roster, geared, off)).sort(compareChars);
    return fusionOrder(matched, off, (id) => idx.CHAR[id], partner);
  }, [D, s, roster, geared, off, idx, partner]);
  const nGeared = D.chars.filter((c) => geared.has(c.id) && c.builds.length).length; // как в меню «Экипировка · N»
  // «не всё надето» пусто, и сузить больше нечем: все одеты
  const allDressed = !!s.cBare && !s.cq && !s.cel && !s.ccl;
  const filter = (patch: Partial<CharFilter>) => dispatch({ type: 'charFilter', patch });
  return (
    <div className="panel" id="char-list">
      <div className="step">
        <div className="step-h"><h2>{t.ui.tabChars}</h2><span className="hint">{t.ui.charsHint}</span></div>
        <div className="tools">
          <input className="search" id="char-q" type="search" placeholder={t.ui.charSearch} value={s.cq}
            onChange={(e) => filter({ cq: e.target.value })} autoComplete="off" enterKeyHint="search" />
        </div>
        <div className="tools">
          <FilterChips options={D.elements} value={s.cel} onChange={(cel) => filter({ cel })} icon={(k) => <ElementIcon el={k} />} />
          <FilterChips options={D.classes} value={s.ccl} onChange={(ccl) => filter({ ccl })} icon={(k) => <ClassIcon cls={k} />} />
        </div>
        <div className="filt">
          <Toggle id="c-owned" checked={s.cOwned} onChange={(on) => filter({ cOwned: on })}>{t.ui.onlyMine}</Toggle>
          <Toggle id="c-bare" checked={!!s.cBare} onChange={(on) => filter({ cBare: on })}>{t.ui.notAllWorn}</Toggle>
          <Toggle id="c-all" checked={s.cAll} onChange={(on) => filter({ cAll: on })}>{t.ui.withoutBuilds}</Toggle>
        </div>
      </div>
      <div className="roster-bar">
        <span>{t.ui.rosterCount} <b>{roster.size}</b>{nGeared > 0 && <> · {t.ui.gearCount(nGeared)}</>}</span>
        <button type="button" className="linkbtn" onClick={() => setIo(!io)}>{t.ui.exportImport}</button>
        {onTrade && nGeared > 0 && <button type="button" className="linkbtn" onClick={onTrade}>{t.trade.teamOpen}</button>}
      </div>
      {io && <RosterIO rosterApi={rosterApi} />}
      {io && (touring ? <p className="roster-io small muted">{t.ui.gearCodeTour}</p> : <GearIO gear={gear} onImport={onGearImport} />)}
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

function RosterIO({ rosterApi }: { rosterApi: RosterApi }) {
  const idx = useIndex();
  const t = useT();
  const apply = (value: string, mode: 'replace' | 'add', say: (msg: string) => void) => {
    const { found, missed } = parseRoster(idx, value);
    if (mode === 'replace') rosterApi.replace(found); else rosterApi.add(found);
    say(t.ui.rosterApplied(mode === 'replace', found.length, missed.length ? missed.slice(0, 5).join(', ') + (missed.length > 5 ? '…' : '') : ''));
  };
  return (
    <CodeBox id="roster-code" msgId="io-msg" label={t.ui.rosterCodeLabel} code={encodeRoster(idx, rosterApi.roster)}
      actions={({ value, say }) => <>
        <button type="button" className="btn" onClick={() => apply(value(), 'replace', say)}>{t.ui.replace}</button>
        <button type="button" className="btn" onClick={() => apply(value(), 'add', say)}>{t.ui.add}</button>
      </>} />
  );
}

// резервная копия экипировки кодом (OGC-GEAR2): вещи и пулы целиком; «Заменить» — всё, что было, заменяется кодом (есть «Вернуть»)
function GearIO({ gear, onImport }: { gear: GearApi; onImport: (prev: GearStore, raw: unknown) => boolean }) {
  const t = useT();
  const apply = (value: string, say: (msg: string) => void) => {
    const raw = readGearCode(value);
    if (raw === 'newer') { say(t.ui.gearNewerCode); return; }
    say(raw !== null && onImport(gear.store, raw) ? '' : t.ui.gearBad);
  };
  return (
    <CodeBox id="gear-code" label={gear.newer ? t.ui.gearNewer : t.ui.gearCodeLabel}
      code={Object.keys(gear.store.pieces).length ? encodeGear(gear.store) : ''}
      actions={({ value, say }) => <button type="button" className="btn" onClick={() => apply(value(), say)} disabled={gear.newer}>{t.ui.replace}</button>} />
  );
}
