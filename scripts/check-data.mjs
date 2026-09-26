// Проверка сборки перед публикацией: сравнивает опубликованную страницу (docs/index.html в git) с новой.
// Нужна автообновлению (.github/workflows/data.yml — пишет отчёт в описание PR) и task publish (останавливает публикацию).
//
//   node scripts/check-data.mjs [--old файл] [--new docs/index.html] [--report новый.json] [--base-report старый.json] [--md отчёт.md]
//
// --old по умолчанию — docs/index.html из HEAD (то, что сейчас на сайте). --report/--base-report — итог update.py
// (--report-json) для новых и для опубликованных данных: тогда новые предупреждения update.py тоже считаются ошибкой.
// Код выхода: 0 — можно публиковать, 1 — есть ошибки (причины — в отчёте), 2 — не удалось даже начать.
//
// Почти все проверки относительные: старые данные прогоняются тем же новым кодом, и ошибкой считается только то,
// чего раньше не было. Так давно известные странности outerpedia (опечатка в билде) не краснят каждый прогон,
// а новые — краснят.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const LIMITS = {
  buildsDrop: 0.1,      // билдов стало меньше больше чем на 10% — подозрительно
  verdictShare: 0.2,    // изменилась пятая часть вердиктов — не ошибка, но в отчёте громкое предупреждение
  examples: 10,         // сколько примеров показывать в каждом списке
};
const REPO = 'Sevih/outerpedia';
const golden = JSON.parse(readFileSync(new URL('../test/golden.json', import.meta.url), 'utf8'));

// --------------------------------------------------------------------------- аргументы и входы

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) throw new Error(`непонятный аргумент: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

const DATA_RE = /<script>window\.OGC_DATA = (\{.*?\});<\/script>/s;
const dataOf = (html) => {
  const m = DATA_RE.exec(html);
  if (!m) throw new Error('в странице нет window.OGC_DATA');
  return JSON.parse(m[1].replace(/<\\\//g, '</'));
};
const withData = (html, other) => html.replace(DATA_RE, () => DATA_RE.exec(other)[0]);
const readJson = (path) => (path ? JSON.parse(readFileSync(path, 'utf8')) : null);

// --------------------------------------------------------------------------- страница в jsdom

// jsdom не исполняет <script type="module">: вынимаем бандл и запускаем его сами после разбора документа —
// как браузер запускает отложенный модуль
function loadPage(html, storage = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('error', (...a) => errors.push(a.map((x) => (x instanceof Error ? x.stack || x.message : String(x))).join(' ')));
  vc.on('jsdomError', (e) => errors.push(e.stack || e.message));
  let bundle = '';
  const page = html.replace(/<script type="module"[^>]*>([\s\S]*?)<\/script>/, (_, code) => { bundle = code; return ''; });
  if (!bundle) throw new Error('в странице нет бандла приложения (<script type="module">)');
  const dom = new JSDOM(page, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem('ogc.' + k, JSON.stringify(v));
    },
  });
  const w = dom.window;
  try {
    w.eval(bundle);
  } catch (e) {
    errors.push(e.stack || String(e));
  }
  return { w, errors, root: () => w.document.getElementById('root') };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// build из window.__ogc, а у страниц до автообновления — из текста бандла
function buildOf(html, w) {
  if (w?.__ogc?.build) return w.__ogc.build;
  const m = /hash:[`"]([0-9a-f]*)[`"],date:[`"]([^`"]*)[`"],dirty:(!0|!1)/.exec(html);
  return m ? { hash: m[1], date: m[2], dirty: m[3] === '!0' } : null;
}

// --------------------------------------------------------------------------- оценка

const settingsOf = (inp) => ({ rosterOnly: inp.rosterOnly, fodder: !!inp.fodder, stage: inp.stage ?? 'grow', lv120: !!inp.lv120, quirks: inp.quirks ?? true });

function describeCase(inp, D) {
  const name = (list, key) => list.find((x) => x.key === key || x.id === key)?.name ?? key;
  const what = inp.setId ? name(D.sets, inp.setId) : inp.itemKey ? name(inp.slot === 'weapon' ? D.weapons : D.amulets, inp.itemKey) : inp.main || '—';
  const subs = inp.subs.map(([k, n]) => `${k}${n > 1 ? '×' + n : ''}`).join(' ');
  return `${inp.grade === 'unique' ? 'L' : 'E'} ${inp.slot} · ${what}${subs ? ' · ' + subs : ''}`;
}

// входы эталона test/golden.json: предметы на сетах/предметах, которых нет в данных, пропускаем
function runCases(ogc) {
  const { idx, makeCtx, evaluate, D } = ogc;
  const out = [];
  for (const [i, { in: inp }] of golden.cases.entries()) {
    if ((inp.setId && !idx.SET[inp.setId]) || (inp.itemKey && !idx.ITEM[inp.slot][inp.itemKey])) { out.push({ i, skip: true }); continue; }
    const roster = new Set((golden.meta.rosters[inp.roster] || []).filter((id) => idx.CHAR[id]));
    try {
      const res = evaluate(makeCtx(idx, settingsOf(inp), roster), { slot: inp.slot, grade: inp.grade, setId: inp.setId, itemKey: inp.itemKey, main: inp.main, unlisted: false, subs: Object.fromEntries(inp.subs) });
      const best = res.sections[0]?.rows[0];
      out.push({ i, v: res.v, title: res.title, best: best ? `${best.c.name} / ${best.b.name}` : '' });
    } catch (e) {
      out.push({ i, error: `${describeCase(inp, D)}: ${e.message}` });
    }
  }
  return out;
}

// каждый билд должен находить себя: Legendary-броня его основного сета с его же первыми сабстатами, ростер — только
// этот персонаж, — «Оставить». Не нашёл — значит, логика не понимает что-то в записи билда
function reachability(ogc) {
  const { idx, makeCtx, evaluate, D } = ogc;
  const keys = new Set(D.substats.map((s) => s.key));
  const settings = { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true };
  const miss = new Map();
  for (const c of D.chars) {
    for (const b of c.builds) {
      const setId = b.sets[0]?.[0]?.set;
      if (!setId) continue;
      const subs = {};
      for (const tok of b.subs.flat()) {
        const key = keys.has(tok) ? tok : keys.has(tok + '%') ? tok + '%' : null;
        if (key && Object.keys(subs).length < 4) subs[key] = 3;
      }
      if (Object.keys(subs).length < 3) continue;
      let v;
      try {
        v = evaluate(makeCtx(idx, settings, new Set([c.id])), { slot: 'helmet', grade: 'unique', setId, itemKey: null, main: null, unlisted: false, subs }).v;
      } catch (e) {
        v = 'ошибка: ' + e.message;
      }
      if (v !== 'keep') miss.set(`${c.name} / ${b.name}`, v);
    }
  }
  return miss;
}

// --------------------------------------------------------------------------- данные

// «подписи» проблем в записи данных: сверяются старые с новыми, ошибка — только новая подпись
function problems(D) {
  const out = new Set();
  const sets = new Set(D.sets.map((s) => s.id));
  const items = { weapon: new Set(D.weapons.map((i) => i.key)), accessory: new Set(D.amulets.map((i) => i.key)) };
  const subKeys = new Set(D.substats.map((s) => s.key));
  for (const c of D.chars) {
    if (!c.name || !c.slug) out.add(`у персонажа ${c.id} нет имени или slug`);
    if (!D.elements[c.element]) out.add(`${c.name}: неизвестная стихия «${c.element}»`);
    if (!D.classes[c.class]) out.add(`${c.name}: неизвестный класс «${c.class}»`);
    for (const b of c.builds) {
      const at = `${c.name} / ${b.name}`;
      if (!b.sets.length) out.add(`${at}: нет сетов`);
      for (const p of b.sets.flat()) if (!sets.has(p.set)) out.add(`${at}: сет ${p.set} не найден`);
      for (const [kind, refs] of [['weapon', b.weapons], ['accessory', b.amulets]]) {
        for (const r of refs) if (!items[kind].has(r.key)) out.add(`${at}: ${kind} ${r.key} не найден`);
      }
      if (!b.subs.flat().length) out.add(`${at}: пустой приоритет сабстатов`);
      for (const tok of b.subs.flat()) if (!subKeys.has(tok) && !subKeys.has(tok + '%')) out.add(`сабстат «${tok}» в приоритете неизвестен странице`);
      for (const t of b.talismans) if (!D.talismans[t]) out.add(`${at}: талисман «${t}» не найден`);
    }
  }
  for (const s of D.sets) {
    if (s.users > 0) for (const slot of ['helmet', 'armor', 'gloves', 'shoes']) if (!s.pieces[slot]) out.add(`сет ${s.name}: нет предмета для слота ${slot}`);
  }
  for (const i of [...D.weapons, ...D.amulets]) if (!i.mains.length) out.add(`предмет ${i.name}: нет ни одного main stat`);
  return out;
}

function dataDiff(A, B) {
  const a = new Map(A.chars.map((c) => [c.id, c]));
  const b = new Map(B.chars.map((c) => [c.id, c]));
  const d = { added: [], lost: [], lostBuilds: [], changed: [], items: [], lostItems: [] };
  for (const [id, c] of b) {
    const o = a.get(id);
    if (!o) d.added.push(c.name + (c.builds.length ? '' : ' (пока без билдов)'));
    else if (JSON.stringify(o.builds) !== JSON.stringify(c.builds)) {
      d.changed.push(c.name);
      if (o.builds.length && !c.builds.length) d.lostBuilds.push(c.name);
    }
  }
  for (const [id, o] of a) if (!b.has(id)) d.lost.push(o.name);
  for (const [label, key, id] of [['сет', 'sets', 'id'], ['оружие', 'weapons', 'key'], ['аксессуар', 'amulets', 'key']]) {
    const was = new Map(A[key].map((x) => [x[id], x]));
    const now = new Map(B[key].map((x) => [x[id], x]));
    for (const [k, x] of now) if (!was.has(k)) d.items.push(`${label} ${x.name}`);
    for (const [k, x] of was) if (!now.has(k)) d.lostItems.push({ text: `${label} ${x.name}`, used: x.users > 0 });
  }
  return d;
}

// --------------------------------------------------------------------------- проверки

const checks = [];
const check = (name, ok, lines = []) => checks.push({ name, ok, lines });
const cap = (list) => (list.length > LIMITS.examples ? [...list.slice(0, LIMITS.examples), `…и ещё ${list.length - LIMITS.examples}`] : list);
const minus = (a, b) => [...a].filter((x) => !b.has(x));

async function renderAll(html, D) {
  const errs = [];
  // пустой ввод, две вещи с полным разбором (броня и оружие) и карточка каждого персонажа
  const top = D.sets.slice().sort((x, y) => y.users - x.users)[0];
  const weapon = D.weapons.filter((i) => i.star === 6 && i.grade === 'unique').sort((x, y) => y.users - x.users)[0];
  const screens = [
    ['пустой экран', {}],
    [`броня ${top?.name}`, { state: { tab: 'eval', slot: 'helmet', grade: 'unique', rosterOnly: false }, item: { setId: top?.id, subs: { SPD: 2, 'ATK%': 3, CHC: 1, CHD: 2 } } }],
    [`оружие ${weapon?.name}`, { state: { tab: 'eval', slot: 'weapon', grade: 'unique', rosterOnly: false }, item: { itemKey: weapon?.key, main: weapon?.mains[0], subs: { SPD: 1, 'ATK%': 2, CHC: 1 } } }],
  ];
  for (const [label, storage] of screens) {
    const p = loadPage(html, storage);
    await tick(50);
    if (!p.w.__ogc) errs.push(`${label}: приложение не запустилось`);
    else if (!p.root()?.textContent.trim()) errs.push(`${label}: пустая страница`);
    errs.push(...p.errors.map((e) => `${label}: ${e.split('\n').slice(0, 3).join(' ⏎ ')}`));
    p.w.close();
  }
  const p = loadPage(html, { state: { tab: 'chars' } });
  await tick(50);
  for (const c of D.chars) {
    const before = p.errors.length;
    p.w.location.hash = '#' + c.slug;
    await tick(10);
    if (p.errors.length > before) errs.push(`карточка ${c.name}: ${p.errors[before].split('\n').slice(0, 3).join(' ⏎ ')}`);
    else if (!p.root()?.textContent.includes(c.name)) errs.push(`карточка ${c.name}: не отрисовалась`);
  }
  p.w.close();
  return errs;
}

async function changedSourceFiles(from, to, files) {
  if (!from || !to || from === to || !files?.length) return null;
  try {
    const headers = { 'User-Agent': 'outerplane-gear-check', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
    const r = await fetch(`https://api.github.com/repos/${REPO}/compare/${from}...${to}`, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    const ours = new Set(files);
    return { commits: j.total_commits, files: j.files.map((f) => f.filename).filter((f) => ours.has(f)) };
  } catch {
    return null;
  }
}

function codeCommits(from, to) {
  try {
    return execFileSync('git', ['log', '--format=%h %s', `${from}..${to}`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------- отчёт

function markdown({ ok, oldD, newD, diff, verdicts, src, code, report }) {
  const L = [];
  const reasons = checks.filter((c) => c.ok === false).map((c) => c.name);
  L.push(ok ? '## ✅ Проверки пройдены — можно вливать' : `## ⛔ Не вливать: ${reasons.join('; ')}`, '');
  const oc = oldD.meta.commit;
  const nc = newD.meta.commit;
  if (oc && nc && oc !== nc) {
    L.push(`**outerpedia:** [${oc.slice(0, 7)}…${nc.slice(0, 7)}](https://github.com/${REPO}/compare/${oc}...${nc})` +
      (src ? ` — коммитов ${src.commits}, из читаемых файлов изменились: ${src.files.length ? src.files.map((f) => '`' + f + '`').join(', ') : 'ни один'}` : ''), '');
  }
  const c = newD.meta.counts;
  const o = oldD.meta.counts;
  const delta = (k) => (c[k] === o[k] ? `${c[k]}` : `${o[k]} → **${c[k]}**`);
  L.push(`Персонажей ${delta('characters')} (с билдами ${delta('withBuilds')}), билдов ${delta('builds')}, оружия ${delta('weapons')}, аксессуаров ${delta('accessories')}.`, '');

  L.push('### Что изменилось в данных', '');
  const items = [
    ...diff.added.map((x) => `+ новый персонаж: ${x}`),
    ...diff.lost.map((x) => `− персонаж пропал: ${x}`),
    ...diff.changed.map((x) => `~ обновлены билды: ${x}`),
    ...diff.items.map((x) => `+ новый ${x}`),
    ...diff.lostItems.map((x) => `− пропал ${x.text}${x.used ? ' (был в билдах)' : ''}`),
  ];
  L.push(...(items.length ? items.map((x) => `- ${x}`) : ['Персонажи, билды и предметы те же.']), '');
  if (code) {
    L.push('### Код приложения', '', `Страница собрана из кода новее опубликованного (${code.from || '?'} → ${code.to}) — вместе с данными выйдут и эти правки:`, '');
    L.push(...(code.commits.length ? cap(code.commits).map((x) => `- ${x}`) : ['- (список коммитов недоступен)']), '');
  }

  L.push('### Проверки', '');
  for (const ch of checks) {
    L.push(`- ${ch.ok === true ? '✅' : ch.ok === false ? '⛔' : '⚠️'} **${ch.name}**`);
    for (const line of cap(ch.lines)) L.push(`  - ${line}`);
  }
  L.push('');

  if (verdicts) {
    L.push('### Вердикты на тестовых предметах', '');
    L.push(`Изменилось **${verdicts.changed.length} из ${verdicts.total}** (${verdicts.total ? Math.round((100 * verdicts.changed.length) / verdicts.total) : 0}%)` +
      (verdicts.skipped ? `; пропущено ${verdicts.skipped} — их сета или предмета нет в новых данных` : '') + '.', '');
    if (verdicts.changed.length) {
      L.push('| Предмет | Было | Стало |', '|---|---|---|');
      for (const x of verdicts.changed.slice(0, LIMITS.examples)) L.push(`| ${x.item} | ${x.was} | ${x.now} |`);
      L.push('');
    }
  }
  if (report?.warnings?.length) {
    L.push('<details><summary>Предупреждения update.py (' + report.warnings.length + ')</summary>', '', ...report.warnings.map((w) => `- ${w}`), '', '</details>', '');
  }
  L.push('---', `Воспроизвести у себя: \`task build:pwa -- --ref ${nc || 'main'}\`, затем \`node scripts/check-data.mjs\`.`);
  return L.join('\n');
}

// --------------------------------------------------------------------------- main

// проверка, которая сама упала на кривых данных, — тоже ошибка с понятной причиной, а не обрыв всего отчёта
async function guarded(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name, false, [`проверка упала: ${(e.stack || String(e)).split('\n').slice(0, 4).join(' ⏎ ')}`]);
  }
}

async function main() {
  const a = args();
  const newHtml = readFileSync(a.new || 'docs/index.html', 'utf8');
  const oldHtml = a.old ? readFileSync(a.old, 'utf8') : execFileSync('git', ['show', 'HEAD:docs/index.html'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const report = readJson(a.report);
  const base = readJson(a['base-report']);
  const oldD = dataOf(oldHtml);
  const newD = dataOf(newHtml);

  // 1. итог update.py: новые предупреждения и несопоставленные рекомендации
  if (report) {
    await guarded('Разбор данных outerpedia', () => {
      if (base) {
        const dropped = minus(report.dropped, new Set(base.dropped));
        const warns = minus(report.warnings, new Set(base.warnings));
        check('Разбор данных outerpedia', !dropped.length && !warns.length, [
          ...dropped.map((x) => `рекомендация не сопоставилась с предметом: ${x}`),
          ...warns.map((x) => `новое предупреждение: ${x}`),
        ]);
      } else {
        check('Разбор данных outerpedia', report.dropped.length ? 'warn' : true,
          report.dropped.map((x) => `рекомендация не сопоставилась с предметом: ${x}`));
      }
    });
  }

  // 2. правдоподобие: ничего заметного не пропало
  let diff = { added: [], lost: [], lostBuilds: [], changed: [], items: [], lostItems: [] };
  await guarded('Ничего не пропало', () => {
    diff = dataDiff(oldD, newD);
    const oc = oldD.meta.counts;
    const nc = newD.meta.counts;
    const lostUsed = diff.lostItems.filter((x) => x.used).map((x) => x.text);
    const buildsDrop = oc.builds ? (oc.builds - nc.builds) / oc.builds : 0;
    check('Ничего не пропало', !diff.lost.length && !diff.lostBuilds.length && !lostUsed.length && buildsDrop <= LIMITS.buildsDrop, [
      ...diff.lost.map((x) => `персонаж пропал из данных: ${x}`),
      ...diff.lostBuilds.map((x) => `у персонажа не осталось билдов: ${x}`),
      ...lostUsed.map((x) => `пропал ${x}, который был в билдах`),
      ...(buildsDrop > LIMITS.buildsDrop ? [`билдов стало меньше на ${Math.round(buildsDrop * 100)}%: ${oc.builds} → ${nc.builds}`] : []),
    ]);
  });

  // 3. целостность записи: ссылки билдов ведут на существующие сеты, предметы, сабстаты
  await guarded('Ссылки в данных целы', () => {
    const fresh = minus(problems(newD), problems(oldD));
    check('Ссылки в данных целы', !fresh.length, fresh);
  });

  // 4. страница запускается и рисует всё
  await guarded('Страница работает', async () => {
    const errs = await renderAll(newHtml, newD);
    check('Страница работает', !errs.length, errs.length ? errs : [`экран оценки, два разбора и карточки ${newD.chars.length} персонажей — без ошибок`]);
  });

  // 5. логика на новых данных — тем же новым кодом на старых и на новых данных
  const pNew = loadPage(newHtml);
  const pOld = loadPage(withData(newHtml, oldHtml));
  await tick(50);
  let verdicts = null;
  await guarded('Оценка на новых данных', () => {
    if (!pNew.w.__ogc?.makeCtx || !pOld.w.__ogc?.makeCtx) {
      check('Оценка на новых данных', false, ['в странице нет window.__ogc.makeCtx — приложение не запустилось, см. «Страница работает»']);
      return;
    }
    const now = runCases(pNew.w.__ogc);
    const was = runCases(pOld.w.__ogc);
    const errs = now.filter((x) => x.error).map((x) => x.error);
    const missNew = reachability(pNew.w.__ogc);
    const missOld = reachability(pOld.w.__ogc);
    const lost = [...missNew].filter(([k]) => !missOld.has(k)).map(([k, v]) => `${k}: вещь по его же приоритету получила «${v}» вместо «keep»`);
    check('Оценка на новых данных', !errs.length && !lost.length, [...errs.map((e) => `исключение: ${e}`), ...lost,
      ...(!errs.length && !lost.length ? [`${now.filter((x) => !x.skip).length} тестовых предметов без ошибок; каждый билд находит свою вещь`] : [])]);
    const changed = [];
    let skipped = 0;
    let total = 0;
    for (const [k, x] of now.entries()) {
      const y = was[k];
      if (x.skip || y.skip || x.error || y.error) { skipped += x.skip || y.skip ? 1 : 0; continue; }
      total++;
      if (x.v !== y.v || x.best !== y.best) {
        changed.push({ item: describeCase(golden.cases[k].in, newD), was: `${y.v}${y.best ? ' · ' + y.best : ''}`, now: `${x.v}${x.best ? ' · ' + x.best : ''}`, flip: x.v !== y.v });
      }
    }
    changed.sort((p, q) => q.flip - p.flip); // сначала сменившие вердикт, потом сменившие лучшего кандидата
    verdicts = { total, skipped, changed };
    if (total && changed.length / total > LIMITS.verdictShare) {
      check('Доля изменённых вердиктов', 'warn', [`изменилось ${Math.round((100 * changed.length) / total)}% — посмотри примеры ниже внимательнее`]);
    }
  });

  // 6. код приложения новее опубликованного — выйдет вместе с данными
  const bOld = buildOf(oldHtml, null);
  const bNew = buildOf(newHtml, pNew.w);
  pNew.w.close();
  pOld.w.close();
  const code = bNew && bOld?.hash !== bNew.hash ? { from: bOld?.hash, to: bNew.hash, commits: bOld?.hash ? codeCommits(bOld.hash, bNew.hash) : [] } : null;
  if (bNew?.dirty) check('Код закоммичен', false, ['страница собрана с незакоммиченными правками в коде приложения']);

  const src = await changedSourceFiles(oldD.meta.commit, newD.meta.commit, report?.sourceFiles);
  const ok = checks.every((c) => c.ok !== false);
  const md = markdown({ ok, oldD, newD, diff, verdicts, src, code, report });
  if (a.md) writeFileSync(a.md, md + '\n');
  console.log(md);
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => {
  console.error('check-data: не удалось выполнить проверку —', e.stack || e);
  process.exit(2);
});
