// Список персонажей: поиск, фильтры (и «не всё надето» — кого доодеть), ростер (звёздочки), экспорт/импорт ростера,
// «Обмен для команды».
import { useCallback, useMemo, useState, type Dispatch } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { charMatches, compareChars, effectiveMode, type CharFilter, type ListAction, type ListState } from './charFilter';
import type { RosterApi } from './useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { isPinned } from '@/features/gear/model/gear';
import { encodeBackup } from './backup';
import { ClassIcon, ElementIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { SegSwitch } from '@/shared/ui/SegSwitch';
import { CodeBox } from '@/shared/ui/CodeBox';
import { FilterChips } from '@/shared/ui/FilterChips';
import { CharTile } from './CharTile';

// onBackup — «Заменить» в поле «Резервная копия» (useRosterUi): что вышло — строкой под полем; geared — у кого сколько надето; off — X, которого заменил Core Fusion X (features/gear/model/fusion): в списке
// рядом с ним (пара всегда в одном порядке, fusionOrder), с пометкой и приглушённый; звезда на нём — окно «Вернуться к X?» (App);
// touring — идёт обучение: на странице экипировка тура (пример или пусто), резервной копии нет
interface Props {
  s: ListState; dispatch: Dispatch<ListAction>; rosterApi: RosterApi; gear: GearApi; geared: ReadonlyMap<string, number>;
  off: ReadonlyMap<string, string>; todressN: number; onBackup: (text: string) => string; touring: boolean;
  onTrade?: () => void; // «Обмен для команды» (features/trade, сразу режим «Команда») — вход и на ПК, без меню ☰
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

export function CharList({ s, dispatch, rosterApi, gear, geared, off, todressN, onBackup, touring, onTrade }: Props) {
  const idx = useIndex();
  const t = useT();
  const { D } = idx;
  const { roster } = rosterApi;
  const [io, setIo] = useState(false);
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
        {roster.size > 0 && (
          <SegSwitch className="cmode" label="" group={t.ui.modeGroup} value={mode} onChange={(cMode) => filter({ cMode })}
            options={[
              { value: 'mine', label: <><span className="vb-star">★</span> {t.ui.modeMine} {roster.size}</> },
              { value: 'todress', label: <>{t.ui.modeToDress} {todressN}</> },
              { value: 'all', label: t.ui.modeAll },
            ]} />
        )}
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
