// A stage as the player sees it in the game: special request and guild raid «13», singularity «SSS++», joint challenge
// in words («Очень сложный»); short — the badge on the boss slot's portrait («Оч. сложн.», .x/0206-boss-sheet mockup).
import type { Boss } from '@/game/data/types';
import type { Texts } from '@/i18n';

export const stageText = (t: Texts, b: Boss, label: string, short = false) =>
  (b.mode === 'jc' ? (short ? t.boss.jcShort : t.boss.jc)[label] ?? label : label);
