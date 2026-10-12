// A stage as the player sees it in the game: special request and guild raid «13», singularity «SSS++», joint challenge
// in words («Очень сложный»).
import type { Boss } from '@/game/data/types';
import type { Texts } from '@/i18n';

export const stageText = (t: Texts, b: Boss, label: string) => (b.mode === 'jc' ? t.boss.jc[label] ?? label : label);
