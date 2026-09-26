import { useT } from '../../i18n';
import type { MainOption } from '../../logic/lists';
import { StatIcon } from '../Img';

// Main stat оружия — кнопками рядом с грейдом, без окна: у оружия он всегда один из трёх (ATK%, DEF%, HP%).
// all — все три по порядку; opts — какие бывают у выбранного предмета (у одного Legendary — только HP%),
// ярче — нужен (просят билды для пассивки или кто-то в этом слоте). Повторное нажатие снимает main.
export function MainButtons({ all, opts, current, onPick }: {
  all: MainOption[]; opts: MainOption[]; current: string | null; onPick: (main: string) => void;
}) {
  const t = useT();
  return (
    <div className="mainsw" role="group" aria-label={t.ui.mainGroup}>
      {all.map(({ key }) => {
        const o = opts.find((x) => x.key === key);
        return (
          <button key={key} type="button" className={`msw${o && !o.want ? ' u0' : ''}`} aria-pressed={current === key} disabled={!o}
            title={`Main ${key}`} onClick={() => onPick(key)}>
            <StatIcon stat={key} /><span>{key}</span>
          </button>
        );
      })}
    </div>
  );
}
