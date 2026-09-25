// Панель вердикта и её мобильная версия — плашка внизу экрана с кнопкой «Далее».
import { useEffect, type Dispatch } from 'react';
import { CFG } from '../../config';
import { isArmor } from '../../data';
import type { GearKind } from '../../data/types';
import { comboText } from '../../logic/builds';
import type { Row } from '../../logic/score';
import { fmtGood, persons } from '../../logic/text';
import type { Section, Verdict as VerdictData, VerdictKind } from '../../logic/verdict';
import type { Action, AppState } from '../../state/appState';
import { Img } from '../Img';
import { useIndex } from '../IndexContext';
import { Rich } from '../Rich';
import { Sheet } from '../Sheet';

const LABEL: Record<VerdictKind, string> = { keep: 'Оставить', temp: 'Временно', maybe: 'Спорно', fodder: 'Фоддер', junk: 'Разобрать', idle: '…' };

interface Props { r: VerdictData; s: AppState; dispatch: Dispatch<Action>; onOpenChar: (id: string) => void }

// Широкий экран: вердикт колонкой справа от формы.
export function Verdict(props: Props) {
  return <aside className="panel verdict eval-out" id="verdict" aria-live="polite"><VerdictBody {...props} /></aside>;
}

// Содержимое вердикта — в колонке справа или в шторке, которая открывается с плашки внизу.
export function VerdictBody({ r, s, dispatch, onOpenChar }: Props) {
  const idx = useIndex();
  const item = !isArmor(s.slot) && s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  const set = isArmor(s.slot) && s.setId ? idx.SET[s.setId] : undefined;
  const icon = item && s.grade === 'unique' ? item.icon : set ? (isArmor(s.slot) && set.pieces[s.slot]) || set.icon : null;
  const nSubs = Object.keys(s.subs).length;
  return (
    <>
      <div className={`v-head v-${r.v}`}>
        <div className="v-row">
          <span className="stamp">{LABEL[r.v]}</span>
          {r.badge && <span className="badge">{r.badge}</span>}
          {icon && (
            <span className="v-item">
              <span className="frame"><Img k={'frame:' + s.grade} /><Img k={'eq:' + icon} className="ic" /></span>
              {set && <Img k={'eq:' + set.icon} className="seticon" />}
            </span>
          )}
        </div>
        <p className="v-summary">{r.title}</p>
        {r.lines.length > 0 && <ul className="v-reasons">{r.lines.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>}
      </div>
      {r.sections.filter((sec) => sec.rows.length).map((sec) => (
        <VerdictSection key={sec.title} sec={sec} r={r} expand={s.expand} nSubs={nSubs} dispatch={dispatch} onOpenChar={onOpenChar} />
      ))}
      <div className="v-foot">
        {nSubs > 0 && <span>Цифра у стата — ступень приоритета билда (1 — важнее всего); жёлтый — засчитан за ½; зачёркнут — билду не нужен.</span>}
        <span>{r.foot}</span>
      </div>
    </>
  );
}

function VerdictSection({ sec, r, expand, nSubs, dispatch, onOpenChar }: {
  sec: Section; r: VerdictData; expand: Record<string, boolean>; nSubs: number; dispatch: Dispatch<Action>; onOpenChar: (id: string) => void;
}) {
  const key = sec.title;
  const count = sec.count ?? sec.rows.length;
  if (sec.collapsed && !expand[key]) {
    return (
      <div className="v-sec">
        <button type="button" className="v-toggle" onClick={() => dispatch({ type: 'expand', key })}>
          <span>{sec.title} · {count}</span><span aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }
  const limit = expand[key + ':all'] ? Infinity : (sec.limit || 12);
  return (
    <div className="v-sec">
      <div className="v-list-h"><h3>{sec.title}</h3><span className="muted small">{persons(count)}</span></div>
      <ul className="matches">
        {sec.rows.slice(0, limit).map((m) => <MatchRow key={m.c.id} m={m} sec={sec} r={r} nSubs={nSubs} onOpenChar={onOpenChar} />)}
      </ul>
      {sec.rows.length > limit && (
        <div className="more">
          <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'expand', key: key + ':all' })}>показать всех ({sec.rows.length})</button>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, sec, r, nSubs, onOpenChar }: { m: Row; sec: Section; r: VerdictData; nSubs: number; onOpenChar: (id: string) => void }) {
  const idx = useIndex();
  const c = m.c;
  let score = <span />;
  if (m.good != null) {
    const ok = r.qualifies ? r.qualifies(m) : m.good >= CFG.keepCount;
    const cls = ok ? 'hi' : m.good >= 2 ? 'mid' : 'lo';
    score = (
      <span className={`score ${cls}`} title={`Полезных сабстатов ${fmtGood(m.good)} из ${nSubs}; взвешенно по приоритету — ${Math.round(Math.min(m.ratio ?? 0, 1) * 100)}%`}>
        {fmtGood(m.good)}/{nSubs}
      </span>
    );
  }
  return (
    <li className={`match${sec.dim ? ' dim' : ''}`}>
      <Img k={'face:' + c.icon} className="face" />
      <div className="nm">
        <button type="button" title="Открыть билды" onClick={() => onOpenChar(c.id)}>{c.name}</button>
        <span className="bn">{m.b.name}{m.alt.length ? ` · ещё: ${m.alt.join(', ')}` : ''}</span>
      </div>
      {score}
      <div className="det">
        {m.combos?.map((cb, i) => <span key={'c' + i} className="tok cmb">{comboText(idx, cb)}</span>)}
        {m.mainOk !== undefined
          ? <span className={`tok ${m.mainOk ? 'ok' : 'bad'}`}>main {m.mains?.join('/') || 'любой'}</span>
          : sec.mainNote && <span className="tok ok">main {sec.mainNote}</span>}
        {m.parts.map((p) => (
          <span key={p.key} className={`tok ${p.ok ? (p.half ? 'half' : 'ok') : 'no'}`} title={p.ok ? `ступень ${(p.tier ?? 0) + 1}${p.half ? ' — засчитан за ½' : ''}` : 'билду не нужен'}>
            {p.key}{p.ok && <sup>{(p.tier ?? 0) + 1}</sup>}
          </span>
        ))}
        {!m.parts.length && m.b.subs.length > 0 && <span className="tok">{m.b.subs.filter((t) => t.length).map((t) => t.join('=')).join(' › ')}</span>}
      </div>
    </li>
  );
}

// На плашке слово вердикта уже есть в штампе: «Оставляй — подходит 26 персонажам» → «подходит 26 персонажам»
const barTitle = (r: VerdictData) => (r.v !== 'idle' && r.title.includes(' — ') ? r.title.slice(r.title.indexOf(' — ') + 3) : r.title);

// Узкий экран (разделённый экран с игрой): вердикт закреплён внизу — штамп, заголовок и «Далее».
// Нажатие открывает подробности шторкой, без прокрутки страницы.
export function VBar({ r, show, onNext, onOpen }: { r: VerdictData; show: boolean; onNext: () => void; onOpen: () => void }) {
  useEffect(() => {
    document.body.classList.toggle('has-vbar', show);
    return () => document.body.classList.remove('has-vbar');
  }, [show]);
  if (!show) return null;
  return (
    <div className={`vbar v-${r.v}`} id="vbar">
      <button type="button" className="vb-main" aria-label="Вердикт — показать подробности" onClick={onOpen}>
        <span className="stamp">{LABEL[r.v]}</span><span className="vt">{barTitle(r)}</span><span className="vb-more" aria-hidden="true">▴</span>
      </button>
      <button type="button" className="vb-next" onClick={onNext}>Далее</button>
    </div>
  );
}

export function VerdictSheet(props: Props & { onClose: () => void }) {
  const { onClose, onOpenChar, ...rest } = props;
  return (
    <Sheet title="Вердикт" onClose={onClose} className="vdrawer">
      <div className="verdict"><VerdictBody {...rest} onOpenChar={(id) => { onClose(); onOpenChar(id); }} /></div>
    </Sheet>
  );
}
