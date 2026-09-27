import { Fragment } from 'react';
import { CFG } from '../../config';
import { FLAT, subLabel } from '../../data';
import { mainsOnAxis, subForms } from '../../logic/mains';
import { tierPlaces, type Part, type Row } from '../../logic/score';
import { useT } from '../../i18n';
import { useIndex } from '../IndexContext';
import { tour } from '../../tour/anchors';

const axisOf = (k: string) => k.trim().replace(/%$/, '');

interface Pill { label: string; cls: string; sep: string; title?: string }

// Цепочка приоритета сабстатов билда («ATK › CHC › SPD › CHD › DMG UP%») с отметками, что из неё есть на предмете:
//   ok — есть и засчитан, half — за ½, low — есть, но далеко в цепочке (или слабый flat), miss — нет на предмете;
//   main — стат есть в main предмета (у брони и оружия — и в фиксированных строках: HP% шлема, flat ATK оружия).
//     Место в цепочке он занимает, только если сабстатом этому стату на предмете ещё можно выпасть: при main ATK%
//     бывает flat ATK, при flat EFF в main — EFF%; такой сабстат идёт рядом через «/», а если его нет — пунктиром:
//     у оружия с main DEF% «main ATK / ATK%» — базовый flat ATK есть всегда и в счёт не идёт, засчитается только ATK%.
//     Если оставшийся вид персонажу ничего не даёт (flat HP при main HP% — m.useless), место занято main, пунктира нет;
//   tail — места дальше четвёртого, которые не считаются (кроме SPD). Если такой стат есть на вещи — обычная серая
//   плашка с подсказкой «не считается»: он на вещи, это видно; нет на вещи — мелкий пунктир.
//   Не зелёный: зелёный в цепочке — «засчитан», а этот стат в счёт не идёт.
// Сабстаты подписаны, как на вещи (subLabel: EFF%, RES%), строки main — без %: «main EFF / EFF%» у перчаток.
// Статы предмета, которых в цепочке нет вовсе, идут в конце зачёркнутыми.
export function Chain({ m }: { m: Omit<Row, 'alt'> }) {
  const { SUB } = useIndex();
  const t = useT();
  const { im } = m;
  const useless = m.useless ?? [];
  const place = tierPlaces(m.b, im, useless);
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
      const on = mainsOnAxis(tok, im);
      if (on.length) pills.push({ label: on.join('/'), cls: 'main' + tail, sep });
      const hits = m.parts.filter((p) => !used.has(p.key) && (flat ? axisOf(p.key) === axis : p.key === tok));
      if (!hits.length) {
        // место за статом осталось, а сабстата нет: пунктир того вида, что ещё выпадает (при main рядом через «/»)
        const open = subForms(tok).filter((k) => SUB[k] && !im.blocked.has(k) && !useless.includes(k));
        if (!on.length) pills.push({ label: flat ? axis + '%' : subLabel(tok), cls: 'miss' + tail, sep });
        else if (open.length) pills.push({ label: subLabel(open.includes(axis + '%') ? axis + '%' : open[0]), cls: 'miss' + tail, sep: '/' });
        continue;
      }
      hits.forEach((p, j) => {
        used.add(p.key);
        pills.push({ label: subLabel(p.key), cls: state(p) + (tail && ' tail on'), sep: j || on.length ? '/' : sep, title: tail ? t.ui.chainTail(subLabel(p.key)) : undefined });
      });
    }
  });
  const extra = m.parts.filter((p) => !used.has(p.key));
  return (
    <span className="chain" {...tour('chain')}>
      {pills.map((p, i) => (
        <Fragment key={i}>{p.sep && <i className="sep">{p.sep}</i>}<span className={`pill ${p.cls}`} title={p.title}>{p.cls.startsWith('main') && <small>main </small>}{p.label}</span></Fragment>
      ))}
      {extra.length > 0 && <i className="sep">·</i>}
      {extra.map((p) => <span key={p.key} className="pill no">{subLabel(p.key)}</span>)}
    </span>
  );
}
