// Кубик Reforge (logic/gamble): свежую Epic с тремя сабстатами может вытянуть 4-й от первого Reforge.
// Штамп вердикта не меняется — он о том, что будет, если ничего не делать; кубик рядом говорит, стоит ли сыграть.
// Пунктир цветом цели: зелёный — станет «Оставить», жёлтый — «Временно» (пунктир в цепочке — «нет на вещи»).
import { subLabel } from '../../data';
import { useT } from '../../i18n';
import type { Gamble } from '../../logic/gamble';
import type { VerdictKind } from '../../logic/verdict';
import { tour } from '../../tour/anchors';
import { Icon } from '../Img';
import { Chain } from './Chain';

const temp = (v: 'keep' | 'temp') => (v === 'temp' ? ' t' : '');

// «⚄ 3/9» у штампа; long — «⚄ Reforge: 3 из 9 → Оставить» в шапке подробностей
export function DiceChip({ g, long }: { g: Gamble; long?: boolean }) {
  const t = useT();
  const label = t.ui.verdictLabel[g.target];
  return (
    <span className={`dice${temp(g.target)}`} title={t.ui.diceTitle(g.hits.length, g.of, label)} {...tour('dice')}>
      <Icon name="dice-3" />{long ? t.ui.diceLong(g.hits.length, g.of, label) : `${g.hits.length}/${g.of}`}
    </span>
  );
}

// строка карточки: «1 Reforge на удачу: SPD CHD ATK → «Оставить». Другой — в разбор.»
export function GambleLine({ g, v }: { g: Gamble; v: VerdictKind }) {
  const t = useT();
  const hits = g.hits.filter((h) => h.v === g.target);
  return (
    <span className="vc-line vc-gamble">
      {t.ui.gambleCard}{' '}
      {hits.map((h) => <span key={h.key} className={`pill miss lucky${temp(h.v)}`}>{subLabel(h.key)}</span>)}
      {' '}{t.ui.gambleCardTo(t.ui.verdictLabel[g.target], v === 'maybe')}
    </span>
  );
}

// блок подробностей: какой стат кому и с какой цепочкой; чего 4-м не будет
export function GambleBlock({ g, v, subs }: { g: Gamble; v: VerdictKind; subs: Record<string, number> }) {
  const t = useT();
  const on = Object.keys(subs).map(subLabel);
  return (
    <div className="v-gamble">
      <h3>{t.ui.gambleTitle}</h3>
      <p>{t.ui.gambleLead(g.of, g.hits.length)}</p>
      <ul>
        {g.hits.map((h) => (
          <li key={h.key}>
            <span className="g-head">
              <span className={`pill miss lucky${temp(h.v)}`}>{subLabel(h.key)}</span>
              <span className="sep" aria-hidden="true">→</span>
              <span className={`stamp s v-${h.v}`}>{t.ui.verdictLabel[h.v]}</span>
              {h.best && <><b>{h.best.c.name}</b><span className="bn">{h.best.b.name}{h.n > 1 ? t.more(h.n - 1) : ''}</span></>}
            </span>
            {h.best && h.best.b.subs.length > 0 && <Chain m={h.best} fresh={h.key} />}
          </li>
        ))}
      </ul>
      <p className="muted small">{t.ui.gambleAfter(v)}</p>
      <p className="muted small">{t.ui.gambleCant(g.main.map(subLabel), on)}</p>
    </div>
  );
}
