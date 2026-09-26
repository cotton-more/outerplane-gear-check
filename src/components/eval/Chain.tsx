import { Fragment } from 'react';
import { CFG } from '../../config';
import { FLAT } from '../../data';
import { takenByMain, tierPlaces, type Part, type Row } from '../../logic/score';
import { useIndex } from '../IndexContext';

const axisOf = (k: string) => k.trim().replace(/%$/, '');

interface Pill { label: string; cls: string; sep: string }

// Цепочка приоритета сабстатов билда («ATK › CHC › SPD › CHD › DMG UP%») с отметками, что из неё есть на предмете:
//   ok — есть и засчитан, half — за ½, low — есть, но далеко в цепочке (или слабый flat), miss — нет на предмете;
//   main — это main stat предмета: сабстатом он быть не может, места в цепочке не занимает, но стат на предмете есть;
//   tail — места дальше четвёртого, которые не считаются (кроме SPD).
// Статы предмета, которых в цепочке нет вовсе, идут в конце зачёркнутыми.
export function Chain({ m }: { m: Omit<Row, 'alt'> }) {
  const { SUB } = useIndex();
  const { main } = m;
  const place = tierPlaces(m.b, main);
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
      // у flat-оси main — её %-версия: main ATK%, а flat ATK ещё бывает сабстатом и место в цепочке за осью остаётся
      const isMain = takenByMain(tok, main) || (flat && main === axis + '%');
      if (isMain) pills.push({ label: main!, cls: 'main' + tail, sep });
      const hits = m.parts.filter((p) => !used.has(p.key) && (flat ? axisOf(p.key) === axis : p.key === tok));
      if (!hits.length) { if (!isMain) pills.push({ label: flat ? axis + '%' : tok, cls: 'miss' + tail, sep }); continue; }
      hits.forEach((p, j) => { used.add(p.key); pills.push({ label: p.key, cls: state(p) + tail, sep: j || isMain ? '/' : sep }); });
    }
  });
  const extra = m.parts.filter((p) => !used.has(p.key));
  return (
    <span className="chain">
      {pills.map((p, i) => (
        <Fragment key={i}>{p.sep && <i className="sep">{p.sep}</i>}<span className={`pill ${p.cls}`}>{p.cls.startsWith('main') && <small>main </small>}{p.label}</span></Fragment>
      ))}
      {extra.length > 0 && <i className="sep">·</i>}
      {extra.map((p) => <span key={p.key} className="pill no">{p.key}</span>)}
    </span>
  );
}
