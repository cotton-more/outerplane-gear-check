// Свои значки вместо картинок из игры — контуры Tabler Icons (MIT, © Paweł Kuna).
// Скачивает выбранные outline-иконки фиксированной версии и пишет src/icons/tabler.ts: имя → пути SVG.
// Страница их не качает: пути лежат в коде. Новая иконка — дописать имя в NAMES и запустить:
//   node scripts/tabler-icons.mjs
// Какая иконка у какого стата, слота, сета — src/icons/own.ts. Лицензия — src/licenses.ts.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '3.48.0';
const NAMES = [
  // статы
  'sword', 'shield', 'heart', 'eye', 'umbrella', 'bolt', 'target', 'sparkles', 'trending-up', 'trending-down', 'arrow-bar-to-right',
  // слоты, талисман
  'swords', 'diamond', 'helmet', 'shirt', 'hand-stop', 'shoe', 'star',
  // сеты (остальные — значки статов), запасной — для сета, которого нет в own.ts
  'arrow-back-up', 'wall', 'heart-plus', 'bomb', 'skull', 'hourglass', 'hammer', 'shield-check', 'wind', 'heart-broken', 'hexagon',
  // стихии и классы
  'flame', 'droplet', 'leaf', 'sun', 'moon', 'axe', 'building-castle', 'target-arrow', 'first-aid-kit', 'wand',
];

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons', 'tabler.ts');
const url = (name) => `https://cdn.jsdelivr.net/npm/@tabler/icons@${VERSION}/icons/outline/${name}.svg`;

const icons = {};
for (const name of NAMES) {
  const res = await fetch(url(name));
  if (!res.ok) throw new Error(`${name}: ${res.status} ${url(name)}`);
  const svg = await res.text();
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const els = [...inner.matchAll(/<(\w+)([^>]*)\/>/g)];
  const paths = [];
  for (const [, tag, attrs] of els) {
    if (/stroke="none"/.test(attrs)) continue; // прозрачная рамка 24×24
    if (tag !== 'path') throw new Error(`${name}: <${tag}> — страница рисует только <path>`);
    paths.push(/\sd="([^"]+)"/.exec(attrs)[1]);
  }
  if (!paths.length) throw new Error(`${name}: нет путей`);
  icons[name] = paths;
}

const body = Object.entries(icons).map(([k, v]) => `  '${k}': ${JSON.stringify(v)},`).join('\n');
writeFileSync(OUT, `// Сгенерировано scripts/tabler-icons.mjs из @tabler/icons ${VERSION} (MIT, © Paweł Kuna) — не править руками.
export const TABLER_VERSION = '${VERSION}';
export const TABLER = {
${body}
} as const satisfies Record<string, readonly string[]>;
export type IconName = keyof typeof TABLER;
`);
console.log(`src/icons/tabler.ts: ${NAMES.length} иконок из @tabler/icons ${VERSION}`);
