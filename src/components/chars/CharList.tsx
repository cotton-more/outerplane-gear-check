// Список персонажей: поиск, фильтры, ростер (звёздочки), экспорт/импорт ростера.
import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Char } from '../../data/types';
import { useT } from '../../i18n';
import { charMatches, type CharFilter } from '../../logic/lists';
import { encodeRoster, parseRoster } from '../../logic/rosterCode';
import type { Action, AppState } from '../../state/appState';
import type { RosterApi } from '../../state/useRoster';
import { Img } from '../Img';
import { useIndex } from '../IndexContext';

interface Props { s: AppState; dispatch: Dispatch<Action>; rosterApi: RosterApi }

export function CharList({ s, dispatch, rosterApi }: Props) {
  const idx = useIndex();
  const t = useT();
  const { D } = idx;
  const { roster } = rosterApi;
  const [io, setIo] = useState(false);
  const shown = useMemo(() => D.chars.filter((c) => charMatches(c, s, roster)), [D, s, roster]);
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
                <Img k={'elem:' + k} />{v}
              </button>
            ))}
          </div>
          <div className="filt">
            {Object.entries(D.classes).map(([k, v]) => (
              <button key={k} type="button" className="fbtn" aria-pressed={s.ccl === k} onClick={() => filter({ ccl: s.ccl === k ? '' : k })}>
                <Img k={'class:' + k} />{v}
              </button>
            ))}
          </div>
        </div>
        <div className="filt">
          <label className="toggle"><input type="checkbox" id="c-owned" checked={s.cOwned} onChange={(e) => filter({ cOwned: e.target.checked })} /> {t.ui.onlyMine}</label>
          <label className="toggle"><input type="checkbox" id="c-all" checked={s.cAll} onChange={(e) => filter({ cAll: e.target.checked })} /> {t.ui.withoutBuilds}</label>
        </div>
      </div>
      <div className="roster-bar">
        <span>{t.ui.rosterCount} <b>{roster.size}</b></span>
        <button type="button" className="linkbtn" onClick={() => rosterApi.add(shown.map((c) => c.id))}>{t.ui.markShown}</button>
        <button type="button" className="linkbtn" onClick={() => setIo(!io)}>{t.ui.exportImport}</button>
        {roster.size > 0 && <ClearRoster onClear={rosterApi.clear} />}
      </div>
      {io && <RosterIO rosterApi={rosterApi} />}
      <div className="cgrid" id="cgrid">
        {shown.length ? shown.map((c) => (
          <CharTile key={c.id} c={c} own={roster.has(c.id)} selected={s.charId === c.id} isNew={idx.NEW.has(c.id)}
            onSelect={() => dispatch({ type: 'selectChar', id: c.id })} onToggle={() => rosterApi.toggle(c.id)} />
        )) : <p className="empty">{t.ui.nobodyFound}</p>}
      </div>
    </div>
  );
}

function CharTile({ c, own, selected, isNew, onSelect, onToggle }: {
  c: Char; own: boolean; selected: boolean; isNew: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const t = useT();
  const base = c.prefix ? c.name.slice(c.prefix.length + 1) : c.name;
  return (
    <div className="cwrap">
      <button type="button" className={`ctile${c.builds.length ? '' : ' nob'}`} aria-pressed={selected} onClick={onSelect}
        title={c.name + (c.nick && c.nick !== c.prefix ? ' — ' + c.nick : '')}>
        <span className="badges"><Img k={'elem:' + c.element} /><Img k={'class:' + c.class} /></span>
        <Img k={'face:' + c.icon} className="face" />{isNew && <span className="newb">NEW</span>}
        <span className="cn">{c.prefix && <span className="cp">{c.prefix}</span>}{base}</span>
      </button>
      <button type="button" className="star" aria-pressed={own} aria-label={t.ui.rosterToggle(c.name, own)} onClick={onToggle}>
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
