// «Сейчас на персонажах» в подробностях вердикта (GEARPOOL): у тех, кому вещь подходит и у кого есть вещи, — одна
// строка на персонажа: его лучший исход (logic/pool, logic/poolVs) — соберёт, сет 3 из 4, пустой слот, лучше, на уровне,
// хуже, ломает сет, только статы. Ниже — тусклая «Ещё: …» с остальными вариантами; по нажатию — они целиком.
// Две цепочки рядом — что закрывает вещь в слоте и что — новая. Штамп вердикта от этого не меняется. Кнопка — только
// для полезной вещи (poolVs useful, Р4): надеть или заменить — то, что сделает «Надеть». Вещь только начнёт билд —
// строка «начнёт» с кнопкой (и у персонажа без вещей).
import { useState } from 'react';
import { GRADE_NAME, subLabel, type Index } from '../../data';
import type { SetPiece } from '../../data/types';
import { useT } from '../../i18n';
import { reforgeScale } from '../../logic/gear';
import { holds, isStats, type Outcome, type PoolView } from '../../logic/pool';
import type { CharVs } from '../../logic/poolVs';
import type { BonusRow } from '../../logic/setBonus';
import { buildOfKey } from '../../logic/variants';
import { vsFigure, type VsFigure } from '../../logic/vs';
import { Icon, Img } from '../Img';
import { useIndex } from '../IndexContext';
import { Chain } from './Chain';
import { tour } from '../../tour/anchors';

type T = ReturnType<typeof useT>;
const num = (f: Exclude<VsFigure, { kind: 'empty' }>) => (f.kind === 'times' ? `×${f.n}` : `${f.n > 0 ? '+' : f.n < 0 ? '−' : '±'}${Math.abs(f.n)}%`);
// разница: у вставшей — выигрыш к вытесненному, у невставшей — против вещи в её слоте. Вытесненное ничего не стоило —
// «полезных нет», а не «×2609»
const figOf = (o: Outcome) => vsFigure({ delta: o.delta, wornEmpty: (!!o.pair?.wornEmpty || o.lostEmpty) && o.kind !== 'completes' && o.kind !== 'closer' });
const upKind = (o: Outcome) => o.kind === 'up' || o.kind === 'completes' || o.kind === 'closer';

// слово исхода: для сообщений («Rin · Speed: соберёт»)
export function outcomeWord(t: T, o: Outcome): string {
  if (o.kind === 'closer') return t.ui.vsCloser(o.after.progress, o.after.need);
  if (o.kind === 'up' || o.kind === 'down') {
    const f = figOf(o);
    return o.pair?.why ? t.ui.vsKind[o.pair.why] : !f ? t.ui.vsKind.better : f.kind === 'empty' ? t.ui.vsKind.better : num(f);
  }
  return t.ui.vsKind[o.kind] ?? o.kind;
}

// чип исхода; o null — «уже есть»
export function VsChip({ o, starts }: { o: Outcome | null; starts?: boolean }) {
  const t = useT();
  if (starts || (o?.entering && o.used)) return <span className="vs fill">{t.ui.vsKind.starts}</span>;
  if (!o) return <span className="vs worn"><Icon name="check" />{t.ui.vsKind.worn}</span>;
  if (o.kind === 'up' || o.kind === 'down' || o.kind === 'completes' || o.kind === 'closer') {
    const up = o.kind !== 'down';
    const sr = o.kind === 'up' || o.kind === 'down' ? t.ui.vsSr[o.kind] : '';
    return <span className={`vs ${up ? 'up' : 'down'}`}><Icon name={up ? 'trending-up' : 'trending-down'} />{sr && <span className="sr-only">{sr}</span>}{outcomeWord(t, o)}</span>;
  }
  const cls = o.kind === 'capped' ? 'eq' : o.kind === 'stats' ? 'off' : o.kind;
  return <span className={`vs ${cls}`}>{o.kind === 'eq' || o.kind === 'capped' ? <Icon name="equal" /> : null}{t.ui.vsKind[o.kind]}</span>;
}

// что сделает кнопка: заменить, если «Надеть» уберёт вещь её слота (poolVs replaces), иначе — надеть
export const equipLabel = (t: T, x: CharVs, slot: string) =>
  x.replaces ? t.ui.replaceOn(slot, x.c.name) : t.ui.equipTo(x.c.name);

const setName = (idx: Index, set: string | null | undefined) => (set ? idx.SET[set]?.short ?? set : '');
const partText = (idx: Index, p: Pick<SetPiece, 'set' | 'n'>) => `${setName(idx, p.set)} ×${p.n}`;
const bonusText = (idx: Index, r: BonusRow) => {
  const s = idx.SET[r.set];
  return (r.n === 4 ? (r.tier === 'T4' ? s?.p4 : s?.p4base) : r.tier === 'T4' ? s?.p2 : s?.p2base) ?? '';
};
const ARMOR = ['helmet', 'armor', 'gloves', 'shoes'] as const;
const buildName = (t: T, key: string) => buildOfKey(key, t.ui.byStats);

// строки одного исхода (раздел «Тексты» HANDOFF)
export function OutcomeLines({ o, rows }: { o: Outcome; rows: Outcome[] }) {
  const t = useT();
  const idx = useIndex();
  const out: string[] = [];
  const dim: string[] = [];
  const bn = buildName(t, o.v.key);
  const wornSet = o.worn?.setId ?? null;
  const cnt = (a: typeof o.after, set: string) => ARMOR.filter((sl) => a.slots[sl]?.setId === set).length;
  if (o.used) {
    if ((o.kind === 'completes' || o.kind === 'closer') && o.part) {
      out.push(t.ui.vsProgress(bn, o.after.progress, o.after.need, setName(idx, o.part.set), Math.min(cnt(o.after, o.part.set), o.part.n), o.part.n));
      const done = o.after.complete.find((p) => !o.before.complete.some((q) => q.set === p.set));
      if (done && o.after.progress < o.after.need) out.push(t.ui.vsHalf(partText(idx, done)));
      const miss = o.after.missing;
      if (miss.length === 1 && miss[0].n - miss[0].have === 1) {
        const free = ARMOR.filter((sl) => o.after.roles[sl] !== 'set');
        out.push(t.ui.vsNeed(setName(idx, miss[0].set), [...free]));
      }
    }
    if (o.surplus && o.part) out.push(t.ui.vsSurplus(partText(idx, o.part)));
    if (o.worn && wornSet && o.worn.piece) {
      const stays = rows.filter((r) => r !== o && Object.values(r.before.slots).some((e) => e?.id === o.worn!.id) && !r.displaced.some((e) => e.id === o.worn!.id));
      if (stays.length) out.push(t.ui.vsStays(setName(idx, wornSet), o.worn.slot, [...new Set(stays.map((r) => buildName(t, r.v.key)))].join(', ')));
    }
    for (const e of o.displaced) {
      if (e.id === o.worn?.id) continue;
      const now = o.after.slots[e.slot];
      if (now && now.setId && e.setId) out.push(t.ui.vsShuffle(e.slot, setName(idx, now.setId), setName(idx, e.setId)));
    }
    if (o.broken && o.worn) {
      const lost = o.lostBonus.filter((r) => r.set === o.broken);
      if (o.brokenSegs && lost[0]?.bon.stat) out.push(t.ui.vsNetGain(partText(idx, { set: o.broken, n: lost[0].n }), dec(o.brokenSegs), subLabel(lost[0].bon.stat), o.worn.slot));
    }
  } else if (o.kind === 'breaks' && o.broken && o.worn) {
    // распадается то, чей бонус теряется (Pen ×4 на T0 у Luna, а не часть связки Pen ×2), иначе — часть связки
    const lost = o.lostBonus.filter((r) => r.set === o.broken).sort((a, z) => z.n - a.n)[0];
    const part = lost ? { set: o.broken, n: lost.n } : o.v.b.sets[0]?.find((p) => p.set === o.broken) ?? { set: o.broken, n: 2 };
    const pct = Math.round((o.pair?.delta ?? 0) * 100);
    out.push(t.ui.vsBreaksBy(setName(idx, o.worn.setId), o.worn.slot, pct, partText(idx, part)));
    // отметить одну вещь (другая уже на T4) — строки пока нет: «у двух» было бы неверно
    if (o.fix?.mark) { if (o.fix.slots.length === 2) out.push(t.ui.vsBreaksMark(setName(idx, o.fix.set))); }
    else if (o.fix) out.push(t.ui.vsBreaksFix(setName(idx, o.fix.set), o.fix.t4, o.fix.slots));
    if (lost?.bon.stat && o.brokenSegs) {
      out.push(t.ui.vsSetCost(partText(idx, part), lost.tier, bonusText(idx, lost), dec(o.brokenSegs), subLabel(lost.bon.stat), o.worn.slot));
    } else dim.push(t.ui.vsNoTrade(setName(idx, o.broken)));
  } else if (o.kind === 'stats' && o.worn) {
    const pct = Math.round((o.pair?.delta ?? 0) * 100);
    const part = o.v.b.sets[0]?.find((p) => p.set === wornSet);
    dim.push(t.ui.vsStatsOnly(pct, o.worn.slot, part ? partText(idx, part) : setName(idx, wornSet) || t.ui.byStats));
  }
  for (const r of o.gainedBonus) dim.push(t.ui.vsBonusGain(partText(idx, r), bonusText(idx, r)));
  for (const r of o.lostBonus) if (o.used) dim.push(t.ui.vsBonusLost(partText(idx, r), r.tier, bonusText(idx, r)));
  return (
    <>
      {out.map((x, i) => <p key={'o' + i}>{x}</p>)}
      {dim.map((x, i) => <p key={'d' + i} className="muted">{x}</p>)}
    </>
  );
}
const dec = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

// строки сравнения с вещью в слоте (как было): цепочки, места, почему, процент, T4, Breakthrough, материал, пассивка
function PairLines({ o }: { o: Outcome }) {
  const t = useT();
  const idx = useIndex();
  const p = o.pair;
  const w = o.worn?.piece ?? null;
  const fig = figOf(o);
  return (
    <>
      {p?.chains && (
        <div className="vs-cmp">
          <span>{t.ui.vsNow}</span><Chain m={p.chains.worn} />
          <span>{t.ui.vsNew}</span><Chain m={p.chains.next} />
        </div>
      )}
      {p && (p.gained.length > 0 || p.lost.length > 0) && (o.kind === 'up' || o.kind === 'eq' || o.kind === 'down') && (
        <p className="vs-places">{t.ui.vsPlaces(p.gained.map((x) => ({ ...x, key: subLabel(x.key) })), p.lost.map((x) => ({ ...x, key: subLabel(x.key) })))}</p>
      )}
      {p?.why && <p className="muted">{t.ui.vsWhy[p.why]}</p>}
      {fig && (o.kind === 'up' || o.kind === 'eq' || o.kind === 'down') && <p className="muted">{fig.kind === 'empty' ? t.ui.vsEmpty : fig.kind === 'times' ? t.ui.vsTimes(fig.n) : t.ui.vsDelta(fig.n)}</p>}
      {o.t4 && (o.kind === 'fill' || o.kind === 'up' || o.kind === 'capped' || o.kind === 'closer') && (
        <p className="muted">{t.ui.vsT4(setName(idx, o.t4.set), o.t4.n, o.kind === 'capped')}</p>
      )}
      {p?.passive && <p className="muted">{t.ui.vsPassive}</p>}
      {p?.ahead && <p className="muted">{t.ui.vsAhead(subLabel(p.ahead.key), p.ahead.worn, p.ahead.next)}</p>}
      {/* ▲ лучше — надевают новую: важнее, сколько Breakthrough у той (старая ей материал — скажет сообщение после «Заменить») */}
      {w && w.bt != null && w.bt > 0 && (!p?.material || upKind(o)) && p?.why !== 'stopgap' && <p className="muted">{t.ui.vsBt(w.bt)}</p>}
      {p?.material && !upKind(o) && w && <p className="muted">{t.ui.vsMaterial(w.bt ?? 0)}</p>}
    </>
  );
}

export function VsSection({ list, view, slot, onEquip, onOpenChar }: {
  list: CharVs[]; view: PoolView; slot: string; onEquip?: (x: CharVs) => void; onOpenChar: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  if (!list.length) return null;
  return (
    <div className="v-vs" {...tour('vs')}>
      <h3>{t.ui.vsTitle}</h3>
      <ul>
        {list.map((x) => {
          const o = x.best;
          const w = o?.worn?.piece ?? null;
          const others = x.rows.filter((r) => r !== o && !r.v.dupOf);
          const cp = view.of(x.c.id);
          // собираемые варианты, которых вещь не касается: «Speed она не тронет»
          const safe = o && cp ? cp.inPlay.filter((v) => !isStats(v) && !v.dupOf && !x.rows.some((r) => r.v.key === v.key)).map((v) => buildName(t, v.key)) : [];
          // варианты, в которые она пошла бы, но их не собирают (и она их не начнёт)
          const idle = cp && o?.part ? cp.variants.filter((v) => !isStats(v) && !v.dupOf && !cp.inPlay.includes(v) && !x.starts.includes(v) && v.b.sets[0]?.some((p) => p.set === o.part!.set)).map((v) => v.name) : [];
          const names = [...new Set(x.rows.filter((r) => r.kind === o?.kind).map((r) => buildName(t, r.v.key)))];
          return (
            <li key={x.c.id} className={`vs-row vs-${o?.kind ?? (x.worn ? 'worn' : 'starts')}`}>
              <div className="vs-h">
                <Img k={'face:' + x.c.icon} className="face" />
                <div className="nm">
                  <button type="button" onClick={() => onOpenChar(x.c.id)}><b>{x.c.name}</b></button> <span className="bn">{o ? names.join(', ') : ''}</span>
                  {w && <span className="vs-worn">{t.ui.vsWorn(GRADE_NAME[w.grade], w.bt, reforgeScale(w).done, reforgeScale(w).of)}</span>}
                </div>
                <VsChip o={o} starts={o ? o.entering : !x.worn} />
              </div>
              {o && <OutcomeLines o={o} rows={x.rows} />}
              {o && <PairLines o={o} />}
              {safe.length > 0 && !x.rows.some((r) => r.kind === 'stats') && <p className="muted">{t.ui.vsSafe(safe.join(', '))}</p>}
              {onEquip && x.useful && (
                <button type="button" className={`btn vs-act${o && holds(o) ? ' good' : ''}`} onClick={() => onEquip(x)} {...tour('gequip')}>
                  <Icon name={x.replaces ? 'replace' : 'check'} />
                  {equipLabel(t, x, slot)}
                </button>
              )}
              {x.starts.length > 0 && <p className="muted small">{t.ui.vsStarts([...new Set(x.starts.map((v) => v.name))].join(', '))}</p>}
              {idle.length > 0 && <p className="muted small">{t.ui.vsAlso(idle.join(', '), idle.length)}</p>}
              {others.length > 0 && (open === x.c.id
                ? others.map((r) => (
                  <div key={r.v.key} className="vs-more">
                    <p className="vs-more-h"><span className="bn">{r.v.name}</span> <VsChip o={r} /></p>
                    <OutcomeLines o={r} rows={x.rows} />
                  </div>
                ))
                : (
                  <button type="button" className="linkbtn vs-more-btn" onClick={() => setOpen(x.c.id)}>
                    {t.ui.vsMore(others.map((r) => `${r.v.name} — ${outcomeWord(t, r)}`).join(' · '))}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
