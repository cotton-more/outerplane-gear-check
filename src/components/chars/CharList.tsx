// Список персонажей: поиск, фильтры, ростер (звёздочки), экспорт/импорт ростера.
import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Char } from '../../data/types';
import { useT } from '../../i18n';
import { charMatches, type CharFilter } from '../../logic/lists';
import { encodeRoster, parseRoster } from '../../logic/rosterCode';
import type { Action, AppState } from '../../state/appState';
import type { RosterApi } from '../../state/useRoster';
import type { GearApi } from '../../state/useGear';
import { decodeGear, encodeGear, type GearStore } from '../../logic/gear';
import { ClassIcon, ElementIcon, Img } from '../Img';
import { useIndex } from '../IndexContext';
import { tour } from '../../tour/anchors';

// onGearImport — код экипировки заменил записи: всех, у кого есть вещи, — в ростер, сообщение с «Вернуть» (App); geared — у кого сколько надето;
// touring — идёт обучение: на странице экипировка тура (пример или пусто), кода экипировки нет
interface Props {
  s: AppState; dispatch: Dispatch<Action>; rosterApi: RosterApi; gear: GearApi; geared: ReadonlyMap<string, number>;
  onGearImport: (prev: GearStore, st: GearStore, text: string) => void; touring: boolean;
}

export function CharList({ s, dispatch, rosterApi, gear, geared, onGearImport, touring }: Props) {
  const idx = useIndex();
  const t = useT();
  const { D } = idx;
  const { roster } = rosterApi;
  const [io, setIo] = useState(false);
  const shown = useMemo(() => D.chars.filter((c) => charMatches(c, s, roster, geared)), [D, s, roster, geared]);
  const nGeared = D.chars.filter((c) => geared.has(c.id) && c.builds.length).length; // как в меню «Экипировка · N»
  // с фильтром «с экипировкой» — сколько персонажей ростера ещё ничего не собрали
  const rest = s.cGear ? D.chars.filter((c) => roster.has(c.id) && !geared.has(c.id) && c.builds.length).length : 0;
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
          <div className="filt">
            {Object.entries(D.elements).map(([k, v]) => (
              <button key={k} type="button" className="fbtn" aria-pressed={s.cel === k} onClick={() => filter({ cel: s.cel === k ? '' : k })}>
                <ElementIcon el={k} />{v}
              </button>
            ))}
          </div>
          <div className="filt">
            {Object.entries(D.classes).map(([k, v]) => (
              <button key={k} type="button" className="fbtn" aria-pressed={s.ccl === k} onClick={() => filter({ ccl: s.ccl === k ? '' : k })}>
                <ClassIcon cls={k} />{v}
              </button>
            ))}
          </div>
        </div>
        <div className="filt">
          <label className="toggle"><input type="checkbox" id="c-owned" checked={s.cOwned} onChange={(e) => filter({ cOwned: e.target.checked })} /> {t.ui.onlyMine}</label>
          <label className="toggle"><input type="checkbox" id="c-gear" checked={!!s.cGear} onChange={(e) => filter({ cGear: e.target.checked })} /> {t.ui.withGear}</label>
          <label className="toggle"><input type="checkbox" id="c-all" checked={s.cAll} onChange={(e) => filter({ cAll: e.target.checked })} /> {t.ui.withoutBuilds}</label>
        </div>
      </div>
      <div className="roster-bar">
        <span>{t.ui.rosterCount} <b>{roster.size}</b>{nGeared > 0 && <> · {t.ui.gearCount(nGeared)}</>}</span>
        <button type="button" className="linkbtn" onClick={() => rosterApi.add(shown.map((c) => c.id))}>{t.ui.markShown}</button>
        <button type="button" className="linkbtn" onClick={() => setIo(!io)}>{t.ui.exportImport}</button>
        {roster.size > 0 && <ClearRoster onClear={rosterApi.clear} />}
      </div>
      {io && <RosterIO rosterApi={rosterApi} />}
      {io && (touring ? <p className="roster-io small muted">{t.ui.gearCodeTour}</p> : <GearIO gear={gear} onImport={onGearImport} />)}
      <div className="cgrid" id="cgrid">
        {shown.length ? shown.map((c) => (
          <CharTile key={c.id} c={c} own={roster.has(c.id)} selected={s.charId === c.id} isNew={idx.NEW.has(c.id)} gear={geared.get(c.id) ?? 0}
            onSelect={() => dispatch({ type: 'selectChar', id: c.id })} onToggle={() => rosterApi.toggle(c.id)} />
        )) : <p className="empty">{s.cGear && !nGeared ? t.ui.gearNobody : t.ui.nobodyFound}</p>}
      </div>
      {rest > 0 && shown.length > 0 && <p className="muted small cgrid-note">{t.ui.gearRest(rest)}</p>}
    </div>
  );
}

// gear — сколько вещей в самом собранном билде: «6/6» на плитке
function CharTile({ c, own, selected, isNew, gear, onSelect, onToggle }: {
  c: Char; own: boolean; selected: boolean; isNew: boolean; gear: number; onSelect: () => void; onToggle: () => void;
}) {
  const t = useT();
  const base = c.prefix ? c.name.slice(c.prefix.length + 1) : c.name;
  return (
    <div className="cwrap">
      <button type="button" className={`ctile${c.builds.length ? '' : ' nob'}`} aria-pressed={selected} onClick={onSelect}
        title={c.name + (c.nick && c.nick !== c.prefix ? ' — ' + c.nick : '')}>
        <span className="badges"><ElementIcon el={c.element} /><ClassIcon cls={c.class} /></span>
        <Img k={'face:' + c.icon} className="face" />{isNew && <span className="newb">NEW</span>}
        {gear > 0 && <span className="gearb" title={t.ui.gearTile(gear)}><span className="sr-only">{t.ui.gearTile(gear)}</span><span aria-hidden="true">{gear}/6</span></span>}
        <span className="cn">{c.prefix && <span className="cp">{c.prefix}</span>}{base}</span>
      </button>
      <button type="button" className="star" {...tour('star')} aria-pressed={own} aria-label={t.ui.rosterToggle(c.name, own)} onClick={onToggle}>
        {own ? '★' : '☆'}
      </button>
    </div>
  );
}

// «Очистить ростер» — со вторым нажатием. Подтверждение гаснет через 4 с или от нажатия любой другой кнопки.
function ClearRoster({ onClear }: { onClear: () => void }) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirm) return;
    const timer = setTimeout(() => setConfirm(false), 4000);
    const onClick = (e: MouseEvent) => {
      const b = (e.target as Element).closest?.('button');
      if (b && b !== ref.current) setConfirm(false);
    };
    document.addEventListener('click', onClick, true);
    return () => { clearTimeout(timer); document.removeEventListener('click', onClick, true); };
  }, [confirm]);
  return (
    <button ref={ref} type="button" className="linkbtn" onClick={() => { if (confirm) { onClear(); setConfirm(false); } else setConfirm(true); }}>
      {confirm ? t.ui.clearConfirm : t.ui.clearRoster}
    </button>
  );
}

function RosterIO({ rosterApi }: { rosterApi: RosterApi }) {
  const idx = useIndex();
  const t = useT();
  const code = encodeRoster(idx, rosterApi.roster);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const copy = () => {
    const el = ta.current;
    if (!el) return;
    const fallback = () => { el.select(); setMsg(t.ui.rosterSelected); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(() => setMsg(t.ui.copied), fallback);
    else fallback();
  };
  const apply = (mode: 'replace' | 'add') => {
    const { found, missed } = parseRoster(idx, ta.current?.value || '');
    if (mode === 'replace') rosterApi.replace(found); else rosterApi.add(found);
    setMsg(t.ui.rosterApplied(mode === 'replace', found.length, missed.length ? missed.slice(0, 5).join(', ') + (missed.length > 5 ? '…' : '') : ''));
  };
  return (
    <div className="roster-io">
      <label className="small muted" htmlFor="roster-code">{t.ui.rosterCodeLabel}</label>
      {/* key: после изменения ростера поле показывает свежий код */}
      <textarea key={code} id="roster-code" ref={ta} defaultValue={code} />
      <div className="filt">
        <button type="button" className="btn" onClick={copy}>{t.ui.copy}</button>
        <button type="button" className="btn" onClick={() => apply('replace')}>{t.ui.replace}</button>
        <button type="button" className="btn" onClick={() => apply('add')}>{t.ui.add}</button>
        <span className="small muted" id="io-msg" role="status">{msg}</span>
      </div>
    </div>
  );
}

// резервная копия экипировки кодом: вещи и билды целиком; «Заменить» — всё, что было, заменяется кодом (есть «Вернуть»)
function GearIO({ gear, onImport }: { gear: GearApi; onImport: (prev: GearStore, st: GearStore, text: string) => void }) {
  const idx = useIndex();
  const t = useT();
  const code = Object.keys(gear.store.pieces).length ? encodeGear(gear.store) : '';
  const ta = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState('');
  const copy = () => {
    const el = ta.current;
    if (!el) return;
    const fallback = () => { el.select(); setMsg(t.ui.rosterSelected); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(() => setMsg(t.ui.copied), fallback);
    else fallback();
  };
  const apply = () => {
    const st = decodeGear(ta.current?.value || '', idx);
    if (!st) { setMsg(t.ui.gearBad); return; }
    const prev = gear.store;
    gear.set(st);
    setMsg('');
    onImport(prev, st, t.ui.gearApplied(Object.keys(st.pieces).length));
  };
  return (
    <div className="roster-io">
      <label className="small muted" htmlFor="gear-code">{gear.newer ? t.ui.gearNewer : t.ui.gearCodeLabel}</label>
      <textarea key={code} id="gear-code" ref={ta} defaultValue={code} />
      <div className="filt">
        <button type="button" className="btn" onClick={copy}>{t.ui.copy}</button>
        <button type="button" className="btn" onClick={apply} disabled={gear.newer}>{t.ui.replace}</button>
        <span className="small muted" role="status">{msg}</span>
      </div>
    </div>
  );
}
