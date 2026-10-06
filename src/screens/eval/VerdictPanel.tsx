// Панель вердикта и её мобильная версия — плашка внизу экрана с кнопкой «Сброс».
import { Fragment, useRef, type Dispatch } from 'react';
import { CFG } from '@/game/config';
import { isArmor } from '@/game/data';
import type { GearKind } from '@/game/data/types';
import { useFillViewport } from '@/shared/layout/useFillViewport';
import { comboText } from '@/game/build/builds';
import type { Row } from '@/game/build/score';
import { useT } from '@/i18n';
import { fmtGood } from '@/game/text';
import { type Section, type Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import type { FormAction, FormState } from '@/features/eval/form/formState';
import { itemInput } from '@/features/eval/form/formState';
import { tour } from '@/tour/anchors';
import { GearFrame, SetIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { Rich } from '@/shared/ui/Rich';
import { Sheet } from '@/shared/ui/Sheet';
import { Chain } from '@/features/eval/verdict/Chain';
import type { CharVs } from '@/features/gear/model/poolVs';
import { Icon } from '@/game/icons/Img';
import { VsSection } from '@/features/gear/ui/VsSection';
import { ShareCode } from '@/features/eval/code/ItemCode';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';

// vs — «Сейчас на персонажах» (features/gear/model/poolVs); onEquip — надеть из этого раздела; onEquipPick — «Кому надеть?»
interface Props {
  r: VerdictData; s: FormState; dispatch: Dispatch<FormAction>; onOpenChar: (id: string) => void;
  vs?: CharVs[]; onEquip?: (vs: CharVs) => void; onEquipPick?: () => void; onStash?: (vs: CharVs) => void;
  nextNote?: string | null; // «Дальше: Ботинки» под кнопкой «Надеть» (режим героя, ввод надетого)
  offNote?: string | null; // режим «для героя»: строка про героя (features/tryon/tryon heroNote) — не носит, не нужна, «По статам»
}

// Широкий экран: вердикт липкой колонкой справа от формы — во всю высоту до низа окна.
export function Verdict(props: Props) {
  const ref = useRef<HTMLElement>(null);
  useFillViewport(ref);
  return <aside ref={ref} className="panel verdict eval-out" id="verdict" aria-live="polite" {...tour('verdict')}><VerdictBody {...props} /></aside>;
}

// Содержимое вердикта — в колонке справа или в шторке, которая открывается с плашки внизу.
export function VerdictBody({ r, s, dispatch, onOpenChar, vs = [], onEquip, onEquipPick, onStash, offNote, nextNote }: Props) {
  const idx = useIndex();
  const t = useT();
  const item = !isArmor(s.slot) && s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  const set = isArmor(s.slot) && s.setId ? idx.SET[s.setId] : undefined;
  const icon = item && s.grade === 'unique' ? item.icon : set ? (isArmor(s.slot) && set.pieces[s.slot]) || set.icon : null;
  const nSubs = Object.keys(s.subs).length;
  const input = itemInput(s);
  return (
    <>
      <div className={`v-head v-${r.v}`}>
        <div className="v-row">
          {r.v !== 'idle' && <span className="stamp">{t.ui.verdictLabel[r.v]}</span>}
          {icon && (
            <span className="v-item">
              <GearFrame grade={s.grade} slot={s.slot} icon={icon} />
              {set && <SetIcon set={set} className="seticon" />}
            </span>
          )}
        </div>
        <p className="v-summary">{r.title}</p>
        {r.lines.length > 0 && <ul className="v-reasons">{r.lines.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>}
        {r.v !== 'idle' && onEquipPick && <button type="button" className="btn v-equip" onClick={onEquipPick}><Icon name="check" />{t.ui.equipPick}</button>}
      </div>
      {offNote && <p className="v-off muted">{offNote}</p>}
      {onEquip && <VsSection list={vs} item={input} slot={t.ui.slotAcc[s.slot]} t4={input.bt === 4} nextNote={nextNote} onEquip={onEquip} onStash={onStash} onOpenChar={onOpenChar} />}
      {r.plan.length > 0 && (
        <div className="v-plan">
          <h3>{t.plan.title}</h3>
          <ul>{r.plan.map((l, i) => <li key={i}><Rich text={l} /></li>)}</ul>
        </div>
      )}
      {r.v !== 'idle' && <ShareCode item={input} />}
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
  sec: Section; r: VerdictData; expand: Record<string, boolean>; nSubs: number; setId: string | null; dispatch: Dispatch<FormAction>; onOpenChar: (id: string) => void;
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
      <HeroFace c={c} />
      <div className="nm">
        <button type="button" title={t.ui.openBuilds} onClick={() => onOpenChar(c.id)}><HeroName c={c} /></button>
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

export function VerdictSheet(props: Props & { onClose: () => void }) {
  const { onClose, onOpenChar, ...rest } = props;
  const t = useT();
  return (
    <Sheet title={t.ui.verdict} onClose={onClose} className="vdrawer">
      <div className="verdict"><VerdictBody {...rest} onOpenChar={(id) => { onClose(); onOpenChar(id); }} /></div>
    </Sheet>
  );
}
