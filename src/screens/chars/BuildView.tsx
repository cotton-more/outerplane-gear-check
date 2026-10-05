// Билд персонажа из outerpedia в его карточке: связки сетов, цепочка приоритета сабстатов (flat или %), талисманы,
// оружие и аксессуары с main stat.
import { Fragment } from 'react';
import { FLAT } from '@/game/data';
import type { Build, Char, GearKind, GearRef } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { flatFactor } from '@/game/build/score';
import { classText } from '@/game/text';
import { Frame, SetIcon, TalismanIcon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';

export function BuildView({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const { D, SET, SUB } = ctx.idx;
  const t = useT();
  return (
    <div className="bsec">
      <div>
        <h4>{t.ui.armorSets}</h4>
        {b.sets.length ? b.sets.map((combo, i) => (
          <div key={i} className="combo">
            {i > 0 && <span className="or">{t.ui.or}</span>}
            {combo.map((p, j) => {
              const st = SET[p.set];
              return <span key={j} className="setpill"><SetIcon set={st} />{st ? st.short : p.set} <span className="n">×{p.n}</span></span>;
            })}
          </div>
        )) : <span className="muted">—</span>}
      </div>
      <GearBlock title={t.ui.weapon} refs={b.weapons} kind="weapon" ctx={ctx} />
      <GearBlock title={t.ui.accessory} refs={b.amulets} kind="accessory" ctx={ctx} />
      <div>
        <h4>{t.ui.subPriority}</h4>
        <div className="prio" {...tour('prio')}>
          {b.subs.map((tier, ti) => (
            <Fragment key={ti}>
              {ti > 0 && <span className="gt">›</span>}
              {tier.length ? tier.map((k, j) => (
                <Fragment key={k}>
                  {j > 0 && <span className="gt">=</span>}
                  {SUB[k] || FLAT.has(k.replace(/%$/, ''))
                    ? <span className={`tok t${Math.min(ti, 2)}`}>{k}</span>
                    : <span className="tok no" title={t.ui.notSub}>{k}</span>}
                </Fragment>
              )) : <span className="gt" title={t.ui.prioGap}>…</span>}
            </Fragment>
          ))}
        </div>
        <PrioHint c={c} b={b} ctx={ctx} />
      </div>
      {b.talismans.length > 0 && (
        <div>
          <h4>{t.ui.talismans}</h4>
          <div className="tal">
            {b.talismans.map((id) => {
              const t = D.talismans[id];
              return <span key={id}><TalismanIcon icon={t.icon} />{t.name}{t.name === "Executioner's Charm" ? ' +10' : ''}</span>;
            })}
          </div>
        </div>
      )}
      {b.note && <div><h4>{t.ui.buildNote}</h4><div className="bnote">{b.note}</div></div>}
    </div>
  );
}

// «ATK, DEF, HP в приоритете — что брать: flat или %» для этого персонажа
function PrioHint({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const axes = [...new Set(b.subs.flat().map((k) => k.replace(/%$/, '')).filter((k) => FLAT.has(k)))];
  const t = useT();
  if (!axes.length) return null;
  const { lv120, quirks } = ctx.settings;
  return (
    <>
      <ul className="prio-hint">
        {axes.map((ax) => {
          const r = flatFactor(ctx, c, ax);
          const pct = Math.round(r * 100);
          if (Math.abs(1 / r - 1) <= 0.05) return <li key={ax}><b>{ax}</b>{t.ui.flatEqual(ax)}</li>;
          if (r > 1) return <li key={ax}><b>{ax}</b>{t.ui.flatBetter(ax, pct)}</li>;
          return <li key={ax}><b>{ax}</b>{t.ui.pctBetter(ax, pct)}</li>;
        })}
      </ul>
      <p className="muted small" style={{ margin: '4px 0 0' }}>{t.ui.flatFor(lv120 ? 120 : 100, quirks)}</p>
    </>
  );
}

function GearBlock({ title, refs, kind, ctx }: { title: string; refs: GearRef[]; kind: GearKind; ctx: Ctx }) {
  const { D, ITEM } = ctx.idx;
  const t = useT();
  if (!refs.length) return null;
  return (
    <div>
      <h4>{title}</h4>
      <div className="gear">
        {refs.map((g) => {
          const it = ITEM[kind][g.key];
          if (!it) return null;
          return (
            <div key={g.key} className="gearrow">
              <Frame item={it} />
              <div>
                <b>{it.name}</b>
                {it.passives[0] && <> <span className="ps">· {it.passives[0].name}</span></>}
                {it.star < 6 && <> <span className="ps">· {it.star}★</span></>}
                <div className="gm">
                  {g.mains.map((m) => <span key={m} className="tok ok">{m}</span>)}
                  {(g.bad || []).map((m) => <span key={'bad' + m} className="tok bad" title={t.ui.badMain}>{m}?</span>)}
                  {it.classLimits.length > 0 && <span className="tok">{classText(it, D.classes, t.anyClass)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
