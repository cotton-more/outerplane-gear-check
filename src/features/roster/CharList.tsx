// Список персонажей: поиск, фильтры (и «не всё надето» — кого доодеть), ростер (звёздочки), экспорт/импорт ростера,
// «Обмен для команды».
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { charMatches, compareChars, type CharFilter, type ListAction, type ListState } from './charFilter';
import type { RosterApi } from './useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { isPinned } from '@/features/gear/model/gear';
import { encodeBackup } from './backup';
import { ClassIcon, ElementIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { Toggle } from '@/shared/ui/Toggle';
import { CodeBox } from '@/shared/ui/CodeBox';
import { FilterChips } from '@/shared/ui/FilterChips';
import { CharTile } from './CharTile';

// onBackup — «Заменить» в поле «Резервная копия» (useRosterUi): что вышло — строкой под полем; geared — у кого сколько надето; off — X, которого заменил Core Fusion X (features/gear/model/fusion): в списке
// сразу за ним, с пометкой и приглушённый; звезда на нём — окно «Вернуться к X?» (App);
// touring — идёт обучение: на странице экипировка тура (пример или пусто), резервной копии нет
interface Props {
  s: ListState; dispatch: Dispatch<ListAction>; rosterApi: RosterApi; gear: GearApi; geared: ReadonlyMap<string, number>;
  off: ReadonlyMap<string, string>; onBackup: (text: string) => string; touring: boolean;
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

export function CharList({ s, dispatch, rosterApi, gear, geared, off, onBackup, touring, onTrade }: Props) {
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
      {io && (touring ? <p className="roster-io small muted">{t.ui.gearCodeTour}</p> : <BackupIO rosterApi={rosterApi} gear={gear} onBackup={onBackup} />)}
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

// Резервная копия одним кодом (.x/0060-share-code SPEC 2.3): ростер и вещи; «Заменить» — всё, что было, заменяется кодом
// (есть «Вернуть»), понимает и старые коды экипировки и ростера. Экипировку сохранила более новая версия — «Заменить» нет
function BackupIO({ rosterApi, gear, onBackup }: { rosterApi: RosterApi; gear: GearApi; onBackup: (text: string) => string }) {
  const t = useT();
  const code = useMemo(() => encodeBackup(gear.store, rosterApi.list()), [gear.store, rosterApi.roster]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <CodeBox id="backup-code" msgId="io-msg" label={gear.newer ? t.ui.gearNewer : t.ui.backupLabel}
      code={code}
      actions={({ value, say }) => <button type="button" className="btn" onClick={() => say(onBackup(value()))} disabled={gear.newer}>{t.ui.replace}</button>} />
  );
}
