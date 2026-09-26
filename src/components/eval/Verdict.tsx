// Панель вердикта и её мобильная версия — плашка внизу экрана с кнопкой «Сброс».
import { Fragment, useEffect, type Dispatch } from 'react';
import { CFG } from '../../config';
import { isArmor } from '../../data';
import type { GearKind } from '../../data/types';
import { comboText } from '../../logic/builds';
import type { Row } from '../../logic/score';
import { useT } from '../../i18n';
import { fmtGood } from '../../logic/text';
import type { Section, Verdict as VerdictData } from '../../logic/verdict';
import { itemInput, type Action, type AppState, type Tab } from '../../state/appState';
import { Img } from '../Img';
import { useIndex } from '../IndexContext';
import { Rich } from '../Rich';
import { Sheet } from '../Sheet';
import { Chain } from './Chain';
import { ShareCode } from './ItemCode';

interface Props { r: VerdictData; s: AppState; dispatch: Dispatch<Action>; onOpenChar: (id: string) => void }

// Широкий экран: вердикт колонкой справа от формы.
export function Verdict(props: Props) {
  return <aside className="panel verdict eval-out" id="verdict" aria-live="polite"><VerdictBody {...props} /></aside>;
}

// Содержимое вердикта — в колонке справа или в шторке, которая открывается с плашки внизу.
export function VerdictBody({ r, s, dispatch, onOpenChar }: Props) {
  const idx = useIndex();
  const t = useT();
  const item = !isArmor(s.slot) && s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  const set = isArmor(s.slot) && s.setId ? idx.SET[s.setId] : undefined;
  const icon = item && s.grade === 'unique' ? item.icon : set ? (isArmor(s.slot) && set.pieces[s.slot]) || set.icon : null;
  const nSubs = Object.keys(s.subs).length;
  return (
    <>
      <div className={`v-head v-${r.v}`}>
        <div className="v-row">
          <span className="stamp">{t.ui.verdictLabel[r.v]}</span>
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
      {r.plan.length > 0 && (
        <div className="v-plan">
          <h3>{t.plan.title}</h3>
          <ul>{r.plan.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>
        </div>
      )}
      {r.v !== 'idle' && <ShareCode item={itemInput(s)} />}
      {r.sections.filter((sec) => sec.rows.length).map((sec) => (
        <VerdictSection key={sec.title} sec={sec} r={r} expand={s.expand} nSubs={nSubs} setId={set?.id ?? null} dispatch={dispatch} onOpenChar={onOpenChar} />
      ))}
      <div className="v-foot">
        {nSubs > 0 && <span>{t.ui.tierLegend}</span>}
        <span>{r.foot}</span>
      </div>
    </>
  );
}

function VerdictSection({ sec, r, expand, nSubs, setId, dispatch, onOpenChar }: {
  sec: Section; r: VerdictData; expand: Record<string, boolean>; nSubs: number; setId: string | null; dispatch: Dispatch<Action>; onOpenChar: (id: string) => void;
}) {
  const t = useT();
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
  // броня: сначала те, у кого сет в первой связке билда; перед первым «запасным» — разделитель с пояснением,
  // иначе непонятно, почему 2½/3 стоит ниже 2/3
  const alt = (m: Row) => !!setId && !!m.combos && !m.b.sets[0]?.some((p) => p.set === setId);
  const firstAlt = sec.rows.slice(0, limit).findIndex(alt);
  return (
    <div className="v-sec">
      <div className="v-list-h"><h3>{sec.title}</h3><span className="muted small">{t.persons(count)}</span></div>
      <ul className="matches">
        {sec.rows.slice(0, limit).map((m, i) => (
          <Fragment key={m.c.id}>
            {i === firstAlt && <li className="match-div">{t.ui.altGroup}</li>}
            <MatchRow m={m} sec={sec} r={r} nSubs={nSubs} onOpenChar={onOpenChar} />
          </Fragment>
        ))}
      </ul>
      {sec.rows.length > limit && (
        <div className="more">
          <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'expand', key: key + ':all' })}>{t.ui.showAll(sec.rows.length)}</button>
        </div>
      )}
    </div>
  );
}

function MatchRow({ m, sec, r, nSubs, onOpenChar }: { m: Row; sec: Section; r: VerdictData; nSubs: number; onOpenChar: (id: string) => void }) {
  const idx = useIndex();
  const t = useT();
  const c = m.c;
  let score = <span />;
  if (m.good != null) {
    const ok = r.qualifies ? r.qualifies(m) : m.good >= CFG.keepCount;
    const cls = ok ? 'hi' : m.good >= 2 ? 'mid' : 'lo';
    score = (
      <span className={`score ${cls}`} title={t.ui.scoreTitle(fmtGood(m.good), nSubs, Math.round(Math.min(m.ratio ?? 0, 1) * 100))}>
        {fmtGood(m.good)}/{nSubs}
      </span>
    );
  }
  return (
    <li className={`match${sec.dim ? ' dim' : ''}`}>
      <Img k={'face:' + c.icon} className="face" />
      <div className="nm">
        <button type="button" title={t.ui.openBuilds} onClick={() => onOpenChar(c.id)}>{c.name}</button>
        <span className="bn">{m.b.name}{m.alt.length ? t.ui.alsoBuilds(m.alt.join(', ')) : ''}</span>
      </div>
      {score}
      <div className="det">
        {m.combos?.map((cb, i) => <span key={'c' + i} className="tok cmb">{comboText(idx, cb)}</span>)}
        {m.mainOk !== undefined
          ? <span className={`tok ${m.mainOk ? 'ok' : 'bad'}`}>main {m.mains?.join('/') || t.ui.anyMain}</span>
          : sec.mainNote && <span className="tok ok">main {sec.mainNote}</span>}
      </div>
      {/* цепочка приоритета лучшего билда; у билдов с другой цепочкой — своя строка с названием */}
      {m.b.subs.length > 0 && (
        <div className="chains">
          <Chain m={m} />
          {m.other?.map((o) => <span key={o.b.name} className="chain-alt"><span className="bn">{o.b.name}:</span><Chain m={o} /></span>)}
        </div>
      )}
    </li>
  );
}

// Карточка вердикта на форме (телефон): встаёт на место сетки сабстатов, когда вердикт готов.
// Штамп, коротко — почему, и цепочка лучшего кандидата: что из нужного ему есть на предмете.
export function VerdictCard({ r, onOpen }: { r: VerdictData; onOpen: () => void }) {
  const t = useT();
  const sec = r.v === 'junk' || r.v === 'idle' ? undefined : r.sections.find((x) => x.rows.length && !x.collapsed && !x.dim);
  const best = sec?.rows[0];
  return (
    <button type="button" className={`vcard v-${r.v}`} onClick={onOpen} aria-label={t.ui.verdictDetails}>
      <span className="vc-top">
        <span className="stamp">{t.ui.verdictLabel[r.v]}</span>
        {r.badge && <span className="badge">{r.badge}</span>}
        <span className="vc-more">{t.ui.details} ▸</span>
      </span>
      <span className="vc-title">{barTitle(r)}</span>
      {best && best.good != null
        ? <span className="vc-chain"><b>{best.c.name}</b><Chain m={best} /></span>
        : r.lines[0] && <span className="vc-line"><Rich text={r.lines[0]} /></span>}
    </button>
  );
}

// На плашке слово вердикта уже есть в штампе: «Оставляй — подходит 26 персонажам» → «подходит 26 персонажам»
const barTitle = (r: VerdictData) => (r.v !== 'idle' && r.title.includes(' — ') ? r.title.slice(r.title.indexOf(' — ') + 3) : r.title);

// Узкий экран (телефон, разделённый экран с игрой): шапки нет, внизу одна плашка на обе вкладки.
//   Оценка:    [☰ меню, ★ ростер] [вердикт или подсказка — нажми, подробности шторкой] [Следующий]
//   Персонажи: [← Оценка] [вердикт текущей вещи — нажми, вернёшься к оценке]
// compact — самая узкая ширина: штампа нет, заголовок целиком («Оставляй — подходит 26 персонажам»), вердикт виден и по цвету.
// stampless — вердикт уже на карточке формы, на плашке не повторяем; hint — подсказка вместо заголовка (сет выбран, сабстатов нет).
export function VBar({ r, show, compact, stampless, hint, tab, rosterSize, onTab, onMenu, onReset, onOpen }: {
  r: VerdictData; show: boolean; compact: boolean; stampless: boolean; hint: string | null; tab: Tab; rosterSize: number;
  onTab: (t: Tab) => void; onMenu: () => void; onReset: () => void; onOpen: () => void;
}) {
  const t = useT();
  useEffect(() => {
    document.body.classList.toggle('has-vbar', show);
    return () => document.body.classList.remove('has-vbar');
  }, [show]);
  if (!show) return null;
  const evalTab = tab === 'eval';
  return (
    <div className={`vbar v-${r.v}`} id="vbar">
      {evalTab
        ? <button type="button" className="vb-tab" aria-label={t.ui.menu} onClick={onMenu}>☰{rosterSize > 0 && <> <span className="vb-star">★</span>{rosterSize}</>}</button>
        : <button type="button" className="vb-tab" onClick={() => onTab('eval')}>{t.ui.toEval}</button>}
      <button type="button" className="vb-main" aria-label={evalTab ? t.ui.verdictDetails : t.ui.backToEval}
        onClick={evalTab ? onOpen : () => onTab('eval')}>
        {evalTab && hint
          ? <span className="vt">{hint}</span>
          : evalTab && stampless
            ? <span className="vt vt-more">{t.ui.details}</span>
            : <>{!compact && <span className="stamp">{t.ui.verdictLabel[r.v]}</span>}<span className="vt">{compact ? r.title : barTitle(r)}</span></>}
        {evalTab && <span className="vb-more" aria-hidden="true">▴</span>}
      </button>
      {evalTab && <button type="button" className="vb-reset" aria-label={t.ui.resetItem} onClick={onReset}>{t.ui.reset}</button>}
    </div>
  );
}

export function VerdictSheet(props: Props & { onClose: () => void }) {
  const { onClose, onOpenChar, ...rest } = props;
  const t = useT();
  return (
    <Sheet title={t.ui.verdict} onClose={onClose} className="vdrawer">
      <div className="verdict"><VerdictBody {...rest} onOpenChar={(id) => { onClose(); onOpenChar(id); }} /></div>
    </Sheet>
  );
}
