import { Fragment } from 'react';
import { CFG } from '../../config';
import { FLAT } from '../../data';
import { tierPlaces, type Part, type Row } from '../../logic/score';
import { useIndex } from '../IndexContext';

const axisOf = (k: string) => k.trim().replace(/%$/, '');

interface Pill { label: string; cls: string; sep: string }

// Цепочка приоритета сабстатов билда («ATK › CHC › SPD › CHD › DMG UP%») с отметками, что из неё есть на предмете:
//   ok — есть и засчитан, half — за ½, low — есть, но далеко в цепочке (или слабый flat), miss — нет на предмете;
//   tail — места дальше четвёртого, которые не считаются (кроме SPD).
// Статы предмета, которых в цепочке нет вовсе, идут в конце зачёркнутыми.
export function Chain({ m }: { m: Omit<Row, 'alt'> }) {
  const { SUB } = useIndex();
  const place = tierPlaces(m.b);
  const used = new Set<string>();
  const pills: Pill[] = [];
  const state = (p: Part) => (p.ok ? (p.half ? 'half' : 'ok') : 'low');
  m.b.subs.forEach((tier, i) => {
    let first = true;
    for (const raw of tier) {
      const tok = raw.trim();
      const axis = axisOf(tok);
      const flat = FLAT.has(axis);
      if (!flat && !SUB[tok]) continue; // токены, которые не выпадают сабстатом
      const tail = tok !== 'SPD' && place[i] >= CFG.tierCredit.length ? ' tail' : '';
      const sep = !pills.length ? '' : first ? '›' : '=';
      first = false;
      const hits = m.parts.filter((p) => !used.has(p.key) && (flat ? axisOf(p.key) === axis : p.key === tok));
      if (!hits.length) { pills.push({ label: flat ? axis + '%' : tok, cls: 'miss' + tail, sep }); continue; }
      hits.forEach((p, j) => { used.add(p.key); pills.push({ label: p.key, cls: state(p) + tail, sep: j ? '/' : sep }); });
    }
  });
  const extra = m.parts.filter((p) => !used.has(p.key));
  return (
    <span className="chain">
      {pills.map((p, i) => (
        <Fragment key={i}>{p.sep && <i className="sep">{p.sep}</i>}<span className={`pill ${p.cls}`}>{p.label}</span></Fragment>
      ))}
      {extra.length > 0 && <i className="sep">·</i>}
      {extra.map((p) => <span key={p.key} className="pill no">{p.key}</span>)}
    </span>
  );
}
