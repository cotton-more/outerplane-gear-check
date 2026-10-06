// Порог «годная вещь» для героя (.x/0085 FORMULA §4): прежние правила «Оставить / Временно» ИЛИ очки ≥ 6.
// Броня — armorBar, оружие и аксессуары — gearBar (свой порог, очки не участвуют). Слой eval берёт только game/.
import { CFG } from '@/game/config';
import type { Grade } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { pointsOf } from '@/game/build/points';
import { profileOf } from '@/game/build/profile';
import { tempOk as tempOkFor, type Part, type Row } from '@/game/build/score';

export type Scored = Omit<Row, 'alt'>;

// Броня: s — введённая вещь. Оба правила считают по её сабстатам; main у брони фиксирован сетом, слотом и грейдом
export function armorBar(ctx: Ctx, s: ItemInput) {
  const subs = s.subs;
  const legend = s.grade === 'unique';
  const spdRoll = subs.SPD || 0;
  const yellowOf = (parts: Part[]) => parts.reduce((a, p) => a + (subs[p.key] || 1), 0);
  const full = (m: Scored) => m.parts.filter((p) => p.ok && !p.half);
  // главные статы — засчитаны целиком (не ½ и не слабый flat) и стоят на 1–2 ступени приоритета билда
  const mains = (m: Scored) => full(m).filter((p) => (p.tier ?? Infinity) < CFG.epicTopTiers);
  // Epic не исправить камнями, поэтому решают главные статы и ролл на них:
  //   три полезных — если среди них SPD или главный стат, либо ролл хороший;
  //   или два главных стата с хорошим роллом — тогда третий может быть любым
  const topTier = (m: Scored) => m.parts.some((p) => p.ok && (p.key === 'SPD' || (p.tier ?? Infinity) < CFG.epicTopTiers));
  const strong = (m: Scored) => legend || topTier(m) || m.yellow >= CFG.epicYellow;
  const twoMain = (m: Scored) => !legend && mains(m).length >= 2 && yellowOf(mains(m)) >= CFG.epicYellow;
  // прежний порог: бережёт заготовки под Reforge (три нужных стата с малыми сегментами)
  const passesOld = (m: Scored) => m.good != null && ((m.good >= CFG.keepCount && strong(m)) || (m.spd && m.good >= CFG.spdKeep && spdRoll >= CFG.spdRoll) || twoMain(m));
  // очки считаются по цепочке «По статам» героя, а не по билду строки: у 8 героев две цепочки
  const passesPoints = (m: Scored) => {
    const P = profileOf(ctx, m.c);
    return !!P && pointsOf(ctx, m.c, P.chain, s) >= CFG.goodPoints;
  };
  // «Временно» у Epic: главный стат с хорошим роллом и ещё полезный, вместе 5+ сегментов — носить, пока не выпадет вещь с недостающим
  const tempOk = (m: Scored) => !legend && mains(m).some((p) => (subs[p.key] || 1) >= CFG.epicTempRoll) && full(m).length >= 2 && yellowOf(full(m)) >= CFG.tempYellow;
  return { yellowOf, full, mains, twoMain, tempOk, passesOld, passesPoints, qualifies: (m: Scored) => passesOld(m) || passesPoints(m) };
}

// Оружие и аксессуары: временная замена с хорошими сабстатами (рекомендованная с нужным main решается отдельно)
export const gearBar = (grade: Grade) => ({ tempOk: (m: Scored) => tempOkFor(grade, m) });
