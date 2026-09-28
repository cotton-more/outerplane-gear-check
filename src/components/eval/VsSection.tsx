// «Сейчас на персонажах» в подробностях вердикта: у тех, кому вещь подходит, в собираемых билдах — слот пуст,
// или новая лучше, на уровне, хуже надетой (logic/vs). Две цепочки рядом: что закрывает надетая и что — новая.
// Штамп вердикта от этого не меняется. Кнопка — надеть в пустой слот или заменить надетую.
import { subLabel } from '../../data';
import { useT } from '../../i18n';
import { reforgesDone } from '../../logic/gear';
import type { Vs } from '../../logic/vs';
import { Icon, Img } from '../Img';
import { useIndex } from '../IndexContext';
import { Chain } from './Chain';

const GRADE: Record<string, string> = { unique: 'Legendary', rare: 'Epic' };

export function VsChip({ vs }: { vs: Vs }) {
  const t = useT();
  const pct = vs.delta == null ? 0 : Math.round(vs.delta * 100);
  if (vs.kind === 'up' || vs.kind === 'down') {
    return <span className={`vs ${vs.kind}`}><Icon name={vs.kind === 'up' ? 'trending-up' : 'trending-down'} />{pct > 0 ? '+' : '−'}{Math.abs(pct)}%</span>;
  }
  const icon = vs.kind === 'eq' ? 'equal' : vs.kind === 'worn' ? 'check' : null;
  return <span className={`vs ${vs.kind}`}>{icon && <Icon name={icon} />}{t.ui.vsKind[vs.kind]}</span>;
}

export function VsSection({ list, slot, onEquip, onOpenChar }: {
  list: Vs[]; slot: string; onEquip: (vs: Vs) => void; onOpenChar: (id: string) => void;
}) {
  const t = useT();
  const { SET } = useIndex();
  if (!list.length) return null;
  return (
    <div className="v-vs">
      <h3>{t.ui.vsTitle}</h3>
      <ul>
        {list.map((vs) => {
          const w = vs.worn;
          return (
            <li key={vs.key} className={`vs-row vs-${vs.kind}`}>
              <div className="vs-h">
                <Img k={'face:' + vs.c.icon} className="face" />
                <div className="nm">
                  <button type="button" onClick={() => onOpenChar(vs.c.id)}><b>{vs.c.name}</b></button> <span className="bn">{vs.b.name}</span>
                  {w && <span className="vs-worn">{t.ui.vsWorn(GRADE[w.grade], w.bt, reforgesDone(w))}</span>}
                </div>
                <VsChip vs={vs} />
              </div>
              {vs.chains && (
                <div className="vs-cmp">
                  <span>{t.ui.vsNow}</span><Chain m={vs.chains.worn} />
                  <span>{t.ui.vsNew}</span><Chain m={vs.chains.next} />
                </div>
              )}
              {(vs.gained.length > 0 || vs.lost.length > 0) && (
                <p className="vs-places">{t.ui.vsPlaces(vs.gained.map((x) => ({ ...x, key: subLabel(x.key) })), vs.lost.map((x) => ({ ...x, key: subLabel(x.key) })))}</p>
              )}
              {vs.delta != null && vs.kind !== 'breaks' && <p className="muted">{t.ui.vsDelta(Math.round(vs.delta * 100))}</p>}
              {vs.broken && <p className="muted">{t.ui.vsBreaks(SET[vs.broken]?.short ?? vs.broken)}</p>}
              {vs.worse && <p className="muted">{t.ui.vsWorse}</p>}
              {vs.passive && <p className="muted">{t.ui.vsPassive}</p>}
              {w && w.bt != null && w.bt > 0 && !vs.material && <p className="muted">{t.ui.vsBt(w.bt)}</p>}
              {vs.material && w && <p className="muted">{t.ui.vsMaterial(w.bt ?? 0)}</p>}
              {vs.kind !== 'worn' && (
                <button type="button" className={`btn vs-act${vs.kind === 'fill' || vs.kind === 'up' ? ' good' : ''}`} onClick={() => onEquip(vs)}>
                  <Icon name={vs.kind === 'fill' ? 'check' : 'replace'} />
                  {vs.kind === 'fill' ? t.ui.equipTo(vs.c.name, vs.b.name) : t.ui.replaceOn(slot, vs.c.name)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
