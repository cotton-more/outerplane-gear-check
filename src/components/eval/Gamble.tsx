// Кубик Reforge (logic/gamble): свежую Epic с тремя сабстатами может вытянуть 4-й от первого Reforge.
// Штамп вердикта не меняется — он о том, что будет, если ничего не делать; кубик рядом говорит, стоит ли сыграть.
// Удачный стат — как «нет на вещи» (серый пунктир), с точкой цветом цели: зелёная — станет «Оставить»,
// жёлтая — «Временно». Зелёная плашка в цепочке по-прежнему значит только «есть на вещи и засчитан».
import { subLabel } from '../../data';
import { useT } from '../../i18n';
import type { Gamble, GambleHit, GambleTarget } from '../../logic/gamble';
import type { VerdictKind } from '../../logic/verdict';
import { tour } from '../../tour/anchors';
import { Icon } from '../Img';
import { Chain } from './Chain';

const tcls = (v: GambleTarget) => (v === 'temp' ? ' t' : '');
export const toTarget = (g: Gamble) => g.hits.filter((h) => h.v === g.target);

// удачный стат: серый пунктир и точка цветом цели
export function LuckyPill({ k, v }: { k: string; v: GambleTarget }) {
  return <span className="pill miss lucky">{subLabel(k)}<i className={`lucky-dot${tcls(v)}`} aria-hidden="true" /></span>;
}

// «⚄ 3/9» у штампа — сколько статов ведут к лучшему исходу; long — «⚄ Reforge: 3 из 9 → Оставить» в подробностях
export function DiceChip({ g, long }: { g: Gamble; long?: boolean }) {
  const t = useT();
  const label = t.ui.verdictLabel[g.target];
  const n = toTarget(g).length;
  return (
    <span className={`dice${tcls(g.target)}`} title={t.ui.diceTitle(n, g.of, label)} {...tour('dice')}>
      <Icon name="dice-3" />{long ? t.ui.diceLong(n, g.of, label) : `${n}/${g.of}`}
    </span>
  );
}

// строка карточки: цель вперёд — «1 Reforge → «Оставить»: SPD CHD ATK · «Временно»: EFF%»; что делать, если
// не повезло, — в подробностях (на узкой карточке хвост обрезался бы)
export function GambleLine({ g }: { g: Gamble }) {
  const t = useT();
  const pills = (hs: GambleHit[]) => hs.map((h) => <LuckyPill key={h.key} k={h.key} v={h.v} />);
  const rest = g.hits.filter((h) => h.v !== g.target);
  return (
    <span className="vc-line vc-gamble">
      {t.ui.gambleCard(t.ui.verdictLabel[g.target])} {pills(toTarget(g))}
      {rest.length > 0 && <> · {t.ui.gambleCardAlso(t.ui.verdictLabel.temp)} {pills(rest)}</>}
    </span>
  );
}

// блок подробностей: какой стат кому и с какой цепочкой; что с двумя сегментами; чего 4-м не будет
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
              <LuckyPill k={h.key} v={h.v} />
              <span className="sep" aria-hidden="true">→</span>
              <span className={`stamp s v-${h.v}`}>{t.ui.verdictLabel[h.v]}</span>
              {h.best && <><b>{h.best.c.name}</b><span className="bn">{h.best.b.name}</span>{h.n > 1 && <span className="bn">· {t.ui.gambleMore(h.n - 1)}</span>}</>}
            </span>
            {h.best && h.best.b.subs.length > 0 && <Chain m={h.best} fresh={h.key} />}
          </li>
        ))}
      </ul>
      {g.near.length > 0 && <p className="muted g-near">{t.ui.gambleNear} {g.near.map((x) => <LuckyPill key={x.key} k={x.key} v={x.v} />)}</p>}
      <p className="muted">{t.ui.gambleAfter(v)}</p>
      <p className="muted">{t.ui.gambleCant(g.main.map(subLabel), on)}</p>
    </div>
  );
}
