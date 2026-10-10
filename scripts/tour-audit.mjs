// Обучение не отстаёт от поведения: коммиты после опубликованной сборки, которые меняют то, что видит игрок
// (компоненты, состояние, логику, тексты), должны либо трогать обучение (src/tour, *.tour.ts), либо нести
// в теле строку «Обучение: …» — добавлено / обновлено (rev) / не нужно — почему. Только предупреждает: код выхода 0.
// Запускается из `task test`. База — сборка из docs/index.html в HEAD: робот публикует сразу после push.
//   node scripts/tour-audit.mjs            (TOUR_AUDIT_BASE=<sha> — считать от другого коммита)
import { execFileSync } from 'node:child_process';

// Wiki сюда не входит: база — сборка кода, и коммит только в Wiki оставался бы «непубликованным» до следующего кода
const WATCH = ['src/app', 'src/screens', 'src/features', 'src/game', 'src/shared', 'src/i18n/ru.ts'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
const touchesTour = (files) => files.some((f) => f.startsWith('src/tour/') || f.endsWith('.tour.ts'));

let base = process.env.TOUR_AUDIT_BASE ?? '';
if (!base) try {
  const html = git('show', 'HEAD:docs/index.html');
  base = /hash:[`"]([0-9a-f]+)[`"]/.exec(html)?.[1] ?? '';
} catch { /* docs/ ещё нет */ }

const warn = [];
if (base) {
  let log = '';
  try {
    log = git('log', '--format=%h%x00%s%x00%b%x01', `${base}..HEAD`, '--', ...WATCH);
  } catch { /* сборка из коммита, которого нет в этой ветке */ }
  for (const rec of log.split('\x01').map((x) => x.trim()).filter(Boolean)) {
    const [hash, subject, body] = rec.split('\x00');
    if (/^(Tour|Обучение):/m.test(body)) continue; // CLAUDE.md asks for «Tour: …» since 2026-10-07; older commits say «Обучение: …»
    if (touchesTour(git('show', '--name-only', '--format=', hash).split('\n'))) continue;
    warn.push(`${hash} ${subject}`);
  }
}

const dirty = git('status', '--porcelain', '--', ...WATCH).split('\n').filter(Boolean);
const dirtyTour = git('status', '--porcelain', '--', 'src').split('\n').some((l) => l.endsWith('.tour.ts') || l.includes('src/tour/'));

if (warn.length || (dirty.length && !dirtyTour)) {
  console.log('\n⚠️  Tour not settled (CLAUDE.md → «Tour»):');
  for (const w of warn) console.log(`  ${w}`);
  if (dirty.length && !dirtyTour) console.log(`  незакоммиченные правки в ${dirty.length} файл(ах) того, что видит игрок`);
  console.log('  Игрок увидит разницу → подсказка или rev + 1 (src/tour, *.tour.ts); не увидит → строка в теле коммита');
  console.log('  «Tour: not needed — why».\n');
}
