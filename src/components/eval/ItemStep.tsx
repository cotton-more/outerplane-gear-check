import { useMemo } from 'react';
import type { GearKind, Item } from '../../data/types';
import { buildsOf, gearList, gearRef } from '../../logic/builds';
import { itemOptions } from '../../logic/lists';
import { classText } from '../../logic/text';
import { Frame, Img, StatIcon } from '../Img';
import type { StepProps } from './EvalPanel';

// Legendary оружие/аксессуар: ценность — в уникальной пассивке, поэтому ищем сам предмет.
export function ItemStep({ s, dispatch, ctx, kind }: StepProps & { kind: GearKind }) {
  const item = s.itemKey ? ctx.idx.ITEM[kind][s.itemKey] : undefined;
  return (
    <div className="step">
      <div className="step-h">
        <h2>{kind === 'weapon' ? 'Оружие' : 'Аксессуар'}</h2><span className="hint">название или пассивка — на английском</span>
        {item
          ? <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'item', itemKey: null })}>сменить</button>
          : <button type="button" className="linkbtn" onClick={() => dispatch({ type: 'unlisted' })}>нет в списке</button>}
      </div>
      {item ? <PickedItem s={s} dispatch={dispatch} ctx={ctx} kind={kind} item={item} /> : <ItemSearch s={s} dispatch={dispatch} ctx={ctx} kind={kind} />}
    </div>
  );
}

function PickedItem({ s, dispatch, ctx, kind, item }: StepProps & { kind: GearKind; item: Item }) {
  const idx = ctx.idx;
  const mains = [...item.mains, ...item.extraMains];
  // какой main просят билды (в ростере, если он включён) для этой пассивки
  const wanted = useMemo(() => new Set(buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === item.key))
    .filter((x) => ctx.inScope(x.c)).flatMap((x) => gearRef(x.b, kind, item.key).mains)), [idx, ctx, kind, item]);
  return (
    <>
      <div className="picked">
        <Frame item={item} />
        <div>
          <b>{item.name}{item.irregular && <> <span className="tok">Irregular</span></>}</b>
          <span>{classText(item, idx.D.classes)} · {item.users ? `в билдах у ${item.users}` : 'нет в билдах outerpedia'}{item.src ? ' · ' + item.src : ''}</span>
        </div>
      </div>
      {item.passives.map((p, i) => <p key={i} className="passive"><b>{p.name}.</b> {p.desc}</p>)}
      {item.key.includes(':') && (
        <p className="note-line">В игре у всех классовых версий одно имя — класс видно по иконке на плитке и суффиксу пассивки: Aggression — Striker, Determination — Defender, Precision — Ranger, Mystery — Mage, Blessing — Healer.</p>
      )}
      {mains.length > 0 && (
        <>
          <div className="step-h" style={{ marginTop: 14 }}><h2>Main stat</h2><span className="hint">«нужен» — что просят билды для этой пассивки</span></div>
          <div className="chips">
            {mains.map((m) => {
              const rare = item.extraMains.includes(m);
              return (
                <button key={m} type="button" className={`chip${rare ? ' rare-main' : ''}`} aria-pressed={s.main === m} onClick={() => dispatch({ type: 'main', main: m })}
                  title={rare ? 'Только у фиксированных копий (ивенты, Dimensional Supply)' : undefined}>
                  <StatIcon stat={m} />{m}{wanted.has(m) && <span className="want">нужен</span>}
                </button>
              );
            })}
          </div>
          {item.extraMains.length > 0 && <p className="note-line">Пунктиром — main stat, который бывает только у фиксированных копий этого предмета.</p>}
        </>
      )}
    </>
  );
}

function ItemSearch({ s, dispatch, ctx, kind }: StepProps & { kind: GearKind }) {
  const list = useMemo(() => itemOptions(ctx, kind, s.q, s.cls), [ctx, kind, s.q, s.cls]);
  return (
    <>
      <div className="tools">
        <input className="search" id="item-q" type="search" placeholder="Например: Caracal, Destruction…" value={s.q}
          onChange={(e) => dispatch({ type: 'query', q: e.target.value })} autoComplete="off" enterKeyHint="search" />
        <div className="filt">
          {Object.entries(ctx.idx.D.classes).map(([k, v]) => (
            <button key={k} type="button" className="fbtn" aria-pressed={s.cls === k} onClick={() => dispatch({ type: 'cls', cls: k })}>
              <Img k={'class:' + k} />{v}
            </button>
          ))}
        </div>
      </div>
      <div className="items" id="items">
        {list.length ? list.map(({ i, n }) => (
          <button key={i.key} type="button" className={`item${i.users ? '' : ' unused'}`} onClick={() => dispatch({ type: 'item', itemKey: i.key })}>
            <Frame item={i} />
            <div style={{ minWidth: 0 }}>
              <b>{i.name}</b>
              <span>{i.passives[0] ? i.passives[0].name : 'без пассивки'} · {i.users ? (ctx.scoped ? `${n} из ростера` : `в билдах у ${n}`) : 'нет в билдах'}</span>
            </div>
          </button>
        )) : (
          <div className="empty">
            <p style={{ margin: '0 0 8px' }}>Ничего не нашлось. Проверь написание{s.cls ? ' или сними фильтр класса' : ''}.</p>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'unlisted' })}>Нет в списке — оценить по main stat</button>
          </div>
        )}
      </div>
    </>
  );
}
