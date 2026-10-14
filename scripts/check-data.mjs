// Проверка сборки перед публикацией: сравнивает опубликованную страницу (docs/index.html в git) с новой.
// Нужна автообновлению (.github/workflows/data.yml — пишет отчёт в описание PR) и task publish (останавливает публикацию).
//
//   node scripts/check-data.mjs [--old файл] [--new docs/index.html] [--report новый.json] [--base-report старый.json] [--md отчёт.md] [--for pr|publish]
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
// код приложения — те же пути, по которым vite.config.ts берёт версию для подвала
const APP_PATHS = ['src', 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'update.py', 'pwa'];
const golden = JSON.parse(readFileSync(new URL('../test/golden.json', import.meta.url), 'utf8'));
// status ids that have names in the app (team.status in src/i18n/ru.ts, block between the status markers)
const STATUS_RU = new Set([...(/\/\/ statuses:begin([\s\S]*?)\/\/ statuses:end/.exec(
  readFileSync(new URL('../src/i18n/ru.ts', import.meta.url), 'utf8'))?.[1] ?? '').matchAll(/'(\d+)':/g)].map((m) => m[1]));

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

// набор без меток — как same_content в update.py: снимок (коммит outerpedia, его дата, откуда собран), newIds и img
// зависят от прошлой страницы, а не от данных. Ключи по порядку: порядок полей зависит от кода, а не от данных
const STAMP = new Set(['generatedAt', 'source', 'commit', 'commitDate', 'newIds']);
const canon = (v) => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const contentOf = (D) => {
  const { img: _img, meta, ...rest } = D;
  return JSON.stringify(canon({ ...rest, meta: Object.fromEntries(Object.entries(meta).filter(([k]) => !STAMP.has(k))) }));
};

// --------------------------------------------------------------------------- страница в jsdom

// jsdom не исполняет <script type="module">: вынимаем бандл и запускаем его сами после разбора документа —
// как браузер запускает отложенный модуль
// width — ширина окна: по умолчанию jsdom рисует 1024px (раскладка ПК), 360 — телефон
function loadPage(html, storage = {}, width = 0) {
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
      if (width) Object.defineProperty(w, 'innerWidth', { configurable: true, value: width });
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

const settingsOf = (inp) => ({ rosterOnly: inp.rosterOnly, stage: inp.stage ?? 'grow', lv120: !!inp.lv120, quirks: inp.quirks ?? true });

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

// разница двух прогонов одних и тех же входов: сменился вердикт, лучший кандидат
function diffCases(was, now, D) {
  const show = (x) => `${x.v}${x.best ? ' · ' + x.best : ''}`;
  const changed = [];
  let skipped = 0;
  let total = 0;
  for (const [k, x] of now.entries()) {
    const y = was[k];
    if (x.skip || y.skip || x.error || y.error) { skipped += x.skip || y.skip ? 1 : 0; continue; }
    total++;
    if (x.v !== y.v || x.best !== y.best) {
      changed.push({ item: describeCase(golden.cases[k].in, D), was: show(y), now: show(x), flip: x.v !== y.v });
    }
  }
  changed.sort((p, q) => q.flip - p.flip); // сначала сменившие вердикт, потом лучшего кандидата
  return { total, skipped, changed };
}

// каждый билд должен находить себя: Legendary-броня его основного сета с его же первыми сабстатами, ростер — только
// этот персонаж, — «Оставить». Не нашёл — значит, логика не понимает что-то в записи билда.
// A priority token («ATK») is the stat the build wants; the piece takes its % kind where one exists (ATK%, DEF%, HP%): the
// app never rates % below flat (owner rule), while flat ATK/HP on the hero's real base (with evolutions) counts half
function reachability(ogc) {
  const { idx, makeCtx, evaluate, D } = ogc;
  const keys = new Set(D.substats.map((s) => s.key));
  const settings = { rosterOnly: true, stage: 'grow', lv120: false, quirks: true };
  const miss = new Map();
  for (const c of D.chars) {
    for (const b of c.builds) {
      const setId = b.sets[0]?.[0]?.set;
      if (!setId) continue;
      const subs = {};
      for (const tok of b.subs.flat()) {
        const key = keys.has(tok + '%') ? tok + '%' : keys.has(tok) ? tok : null;
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

// Бонусы сетов числом (update.py bonus_of) — как на страницах сетов outerpedia (сверено владельцем 2026-09-29):
// сет → [T4 2P, T4 4P, T0 2P, T0 4P], null — строки нет. Разошлось — сборка билдов из вещей (features/gear/pool) считает бонус
// не так, как игра
const SET_BONUS = {
  Attack: [35, 25, 30, 20], Defense: [30, 20, 25, 15], Life: [35, 25, 30, 20], 'Critical Hit': [18, 12, 15, 10],
  Resilience: [22, 16, 18, 12], Effectiveness: [22, 16, 18, 12], Counterattack: [15, 10, 12, 8],
  Penetration: [11, 9, null, 20], Speed: [13, 12, null, 25], 'Critical Strike': [33, 22, 20, 15], Mitigation: [38, 27, 25, 20],
};

// «подписи» проблем в записи данных: сверяются старые с новыми, ошибка — только новая подпись
function problems(D) {
  const out = new Set();
  const sets = new Set(D.sets.map((s) => s.id));
  const items = { weapon: new Set(D.weapons.map((i) => i.key)), accessory: new Set(D.amulets.map((i) => i.key)) };
  const subKeys = new Set(D.substats.map((s) => s.key));
  const ids = new Set(D.chars.map((c) => c.id));
  for (const c of D.chars) {
    if (!c.name || !c.slug) out.add(`у персонажа ${c.id} нет имени или slug`);
    if (c.fusionOf && !ids.has(c.fusionOf)) out.add(`${c.name}: Core Fusion от персонажа ${c.fusionOf}, которого нет в данных`);
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
  for (const [name, want] of Object.entries(SET_BONUS)) {
    const s = D.sets.find((x) => x.short === name);
    const b = s?.bonus;
    const got = b ? [b.t4.p2, b.t4.p4, b.t0.p2, b.t0.p4].map((r) => r?.value ?? null) : null;
    if (!s) continue; // сет пропал — это видно и без этой проверки
    if (JSON.stringify(got) !== JSON.stringify(want)) out.add(`сет ${name}: бонус числом ${JSON.stringify(got)}, а на outerpedia ${JSON.stringify(want)}`);
  }
  for (const s of D.sets) {
    for (const r of Object.values(s.bonus ?? {}).flatMap((t) => [t.p2, t.p4])) if (r?.stat && !subKeys.has(r.stat)) out.add(`сет ${s.name}: бонус — сабстат ${r.stat}, которого нет`);
  }
  // the hero's crit (update.py crit_profile, main_values): a changed format zeroes the card line «Крит: 45%»
  const noChc = D.chars.filter((c) => !c.chc || ![c.chc.base, c.chc.cls, c.chc.quirk].every((v) => Number.isInteger(v) && v >= 0 && v <= 1000));
  if (noChc.length) out.add(`CHC героя (chc) нет или не число: ${noChc.slice(0, 5).map((c) => c.name).join(', ')}${noChc.length > 5 ? '…' : ''}`);
  // CHC of the transcend passive by ★1…6 (update.py crit_profile): a changed skill8 format drops it silently
  const badTrans = D.chars.filter((c) => c.chc?.trans && !(c.chc.trans.length === 6 && c.chc.trans.every((v, i) => Number.isInteger(v) && v >= 0 && v <= 1000 && (!i || v >= c.chc.trans[i - 1]))));
  if (badTrans.length) out.add(`CHC от звёзд (chc.trans) не 6 чисел 0…1000 по возрастанию: ${badTrans.slice(0, 5).map((c) => c.name).join(', ')}${badTrans.length > 5 ? '…' : ''}`);
  const withTrans = D.chars.filter((c) => c.chc?.trans).length;
  if (D.chars.length && withTrans < 10) out.add(`CHC от звёзд нашёлся у ${withTrans} героев (ждём ≥ 10) — формат skill8 изменился?`);
  if (D.chars.length && !D.chars.some((c) => (c.chc?.trans?.[4] ?? 0) >= 500)) out.add('CHC от звёзд: нет героя с ≥ 50 % на ★5 (Poolside Trickster Regina) — формат transcend изменился?');
  const cls = D.chars.filter((c) => c.class === 'striker' && c.chc?.cls > 0).length;
  if (D.chars.length && cls < 10) out.add(`CHC от класса (Striker +5 %) нашёлся у ${cls} героев (ждём ≥ 10) — формат class_passive изменился?`);
  for (const g of ['unique', 'rare']) {
    const row = D.mainValues?.accessory?.[g]?.CHC;
    if (!(row?.length === 5 && row.every((v, i) => v > 0 && (!i || v > row[i - 1])))) out.add(`нет значений main CHC аксессуара ${GRADE_EN[g]} на +10 по T0…T4 (mainValues)`);
  }
  // hero EFF (update.py eff_profile): white EFF is one of a few class values; a changed evolution format zeroes it
  const W = new Set([80, 120, 140, 160, 180]);
  const badW = D.chars.filter((c) => !c.eff || !(c.eff.w?.length === 2 && c.eff.w.every((v) => W.has(v)) && c.eff.w[0] <= c.eff.w[1]));
  if (badW.length) out.add(`EFF героя (eff.w) нет или не 80/120/140/160/180: ${badW.slice(0, 5).map((c) => c.name).join(', ')}${badW.length > 5 ? '…' : ''}`);
  // white EFF is the same for every hero of a subclass (base stat + evolution rewards): a mixed subclass means the
  // evolution rewards were read from the wrong hero or rung
  const wBySub = new Map();
  for (const c of D.chars) if (c.subClass && c.eff?.w) wBySub.set(c.subClass, new Set([...(wBySub.get(c.subClass) ?? []), c.eff.w.join('/')]));
  const mixedW = [...wBySub].filter(([, v]) => v.size > 1).map(([k]) => k).sort();
  if (mixedW.length) out.add(`EFF героя (eff.w) у героев одного подкласса разный: ${mixedW.join(', ')}`);
  const rangers = D.chars.filter((c) => c.class === 'ranger');
  if (rangers.length && !rangers.every((c) => c.eff?.r === 50)) out.add('EFF: не у всех Ranger узел квирков +50 (eff.r) — формат quirks изменился?');
  // EE premium (eff.ee, ‰) and rule R (eff.d): the 17 heroes whose Exclusive Equipment gives a permanent self EFF premium
  // (Tanya and Rico +50 %, the rest +100 %), and who needs EFF against a boss's RES (HISTORY.md 0200-boss RESEARCH §1.5)
  const EE_HEROES = ['Tanya', 'Rico', 'Alice', 'Beth', 'Eternal', 'Sterope', 'Tamara', 'Christina', 'Akari', 'Iota', 'Kuro',
    'Gnosis Nella', 'Ember', 'Omega Nadja', 'Core Fusion Snow', 'Resonance Eliza', 'Core Fusion Eternal'];
  const eeNow = D.chars.filter((c) => c.eff?.ee).map((c) => c.name);
  const eeLost = EE_HEROES.filter((n) => !eeNow.includes(n));
  const eeNew = eeNow.filter((n) => !EE_HEROES.includes(n));
  if (D.chars.length && (eeLost.length || eeNew.length)) out.add(`EFF от EE (eff.ee): не у тех героев — пропал: ${eeLost.join(', ') || '—'}; новый: ${eeNew.join(', ') || '—'} (формат ee.json или passives.json изменился? Или вышло новое EE — тогда обнови список здесь)`);
  const eeWrong = D.chars.filter((c) => c.eff?.ee && c.eff.ee !== (['Tanya', 'Rico'].includes(c.name) ? 500 : 1000)).map((c) => `${c.name} ${c.eff.ee}`);
  if (eeWrong.length) out.add(`EFF от EE (eff.ee): ждём Tanya и Rico 500, остальные 1000: ${eeWrong.join(', ')}`);
  const dOf = (n) => D.chars.find((c) => c.name === n)?.eff?.d === 1;
  // Demiurge Vlada (S1 cooldown up), Epsilon (S2 AP charge down) and Maxwell (S2 buff shortening) count since cooldown /
  // AP / buff-cut rows joined rule R; plain Vlada has none of them
  const dBad = [...['Tamara', 'Iota', 'Sigma', 'Ember', 'Gnosis Domine', 'Demiurge Vlada', 'Epsilon', 'Maxwell'].filter((n) => !dOf(n)).map((n) => `${n} без d`),
    ...['Francesca', 'Vlada', 'Eris', 'Eliza', 'Drakhan'].filter(dOf).map((n) => `${n} с d`)];
  if (D.chars.length && dBad.length) out.add(`EFF от RES босса (eff.d, правило R): ${dBad.join(', ')} — формат skills или buffs изменился?`);
  // transcend EFF premium that reaches the whole team (eff.tm: a MY_TEAM row of the passive) and the self-only ones
  const tmOf = (n) => D.chars.find((c) => c.name === n)?.eff?.tm === 1;
  const tmBad = [...['Iota', 'Dahlia', 'Gnosis Nella'].filter((n) => !tmOf(n)).map((n) => `${n} без tm`),
    ...['Gnosis Domine', 'Iris'].filter(tmOf).map((n) => `${n} с tm`)];
  if (D.chars.length && tmBad.length) out.add(`EFF трансценда на всю команду (eff.tm): ${tmBad.join(', ')} — формат skills или buffs изменился?`);
  // SPD from transcend (spdUp, HISTORY.md 0200-boss E4 Q6): Dianne, Mene, Liselotte, Viella reach the team (+5/+5/+10 at ★4–6), Claire
  // only herself; the turn-1 reasons (turn, E4 Q1): Akari S1 boss ATK down (from skill level 3, createRate 400, 400, 550 …: the
  // «@3» in the anchor is `lv`, E4-7), Veronica S1 taunt + S2 shield on the ally with the lowest HP (shield1, E4-6), Iota S1
  // priority down, Vlada S1 cooldown up (BT_COOL3_CHARGE); Ember has none — her S1 taunt needs a status her S3 gives (a
  // conditional row doesn't count)
  const upOf = (n) => D.chars.find((c) => c.name === n)?.spdUp;
  const upBad = [...['Dianne', 'Mene', 'Liselotte', 'Viella'].filter((n) => !(upOf(n)?.tm === 1 && upOf(n)?.t?.[5] === 10)).map((n) => `${n} без командного +10 на ★6`),
    ...(upOf('Claire') && !upOf('Claire').tm ? [] : ['Claire не своя строка'])];
  if (D.chars.length && upBad.length) out.add(`SPD трансценда (spdUp): ${upBad.join(', ')} — формат progression.skill8 или skills изменился?`);
  // base stats with the evolution rewards (update.py flat_profile reads damage/characters `evolution`): Mene = 96 SPD from
  // stats + 2+2+3+4 from evolutions 2–5 = 107 at Lv100 (in the game profile), DEF 510 + 244 = 754. Without the rewards
  // (outerpedia took `evoRewards` out of progression.json once) 122 of 128 heroes drifted silently: 96 and 510 here
  const mene = D.chars.find((c) => c.name === 'Mene');
  if (mene && (mene.spd?.[0] !== 107 || mene.flat?.DEF?.[0] !== 754)) out.add(`база героя без наград эволюций (Mene SPD ${mene.spd?.[0]}, DEF ${mene.flat?.DEF?.[0]}) — формат damage/characters evolution изменился?`);
  // a Core Fusion hero's own evolution list is empty: it takes the original's (flat_profile, like eff_profile). Core Fusion
  // Eternal Lv100 ★6 in the game: SPD 199 = 64 from gear + 135 = stats 124 + the original's evolutions 5 + quirk 6
  const cfEternal = D.chars.find((c) => c.name === 'Core Fusion Eternal');
  if (cfEternal && cfEternal.spd?.[0] !== 129) out.add(`база Core Fusion без эволюций оригинала (Core Fusion Eternal SPD ${cfEternal.spd?.[0]}, ждём 129) — Core Fusion — эволюции оригинала: damage/characters evolution или originalCharacter изменился?`);
  const turnOf = (n) => (D.chars.find((c) => c.name === n)?.turn ?? []).map((r) => `${r.s}:${r.k}${r.lv ? `@${r.lv}` : ''}`).join(',');
  const turnBad = [['Akari', 's1:atk@3'], ['Veronica', 's1:taunt,s2:shield1'], ['Iota', 's1:push'], ['Demiurge Vlada', 's1:cool'], ['Ember', ''], ['Maxie', '']].filter(([n, want]) => turnOf(n) !== want)
    .map(([n, want]) => `${n} «${turnOf(n)}» вместо «${want}»`);
  if (D.chars.length && turnBad.length) out.add(`причины ходить раньше босса (turn): ${turnBad.join(', ')} — формат damage/characters или buffs изменился?`);
  const dCount = D.chars.filter((c) => c.eff?.d).length;
  if (D.chars.length && (dCount < 40 || dCount > 60)) out.add(`EFF от RES босса (eff.d): отмечено ${dCount} героев (ждём 40…60) — правило R или данные damage/ изменились?`);
  if (D.mainValues?.gloves?.unique?.EFF?.[0] !== 50) out.add(`main EFF перчаток Legendary на +10 T0: ${D.mainValues?.gloves?.unique?.EFF?.[0]}, ждём 50 (mainValues)`);
  // main values (update.py main_values): the most common value of an item, not the smallest (Ether rows are lower)
  for (const [slot, stat, want] of [['armor', 'DEF', 500], ['weapon', 'ATK', 1000]]) {
    const got = D.mainValues?.[slot]?.unique?.[stat]?.[0];
    if (got !== want) out.add(`main ${stat} ${slot === 'armor' ? 'брони' : 'оружия'} Legendary на +10 T0: ${got}, ждём ${want} (mainValues)`);
  }
  // boss fights (update.py build_bosses): count, RES by stage, heroes of the guide teams, two known numbers
  const B = D.bosses;
  if (!B) out.add('нет боссов outerpedia (bosses): не получен список гайдов?');
  else {
    if (B.b.length < 55) out.add(`боссов всего ${B.b.length} (ждём ≥ 55) — формат гайдов или encounters изменился?`);
    for (const f of B.b) {
      const rows = B.t[f.table];
      if (!rows?.length) { out.add(`босс ${f.key}: нет таблицы этапов ${f.table}`); continue; }
      // RES grows by stage. World boss: within a league; a new league starts lower, and once per league the ladder may
      // drop where the second boss takes over (Harshna league 4: A 360 → S 350)
      const league = (r) => (r[3].includes(':') ? r[3].split(':')[0] : '');
      const drops = new Map();
      rows.forEach((r, i) => { if (i && league(r) === league(rows[i - 1]) && r[1] < rows[i - 1][1]) drops.set(league(r), (drops.get(league(r)) ?? 0) + 1); });
      if ([...drops].some(([lg, n]) => n > (lg ? 1 : 0))) out.add(`босс ${f.key}: RES падает от этапа к этапу`);
      if (!rows.every((r) => r.slice(0, 3).every((v) => Number.isInteger(v) && v > 0))) out.add(`босс ${f.key}: в таблице не числа`);
      // immunities by stage: runs [first row, ids] — the first at row 0, rows strictly rising and inside the table
      const imm = f.imm;
      if (!Array.isArray(imm) || !imm.length || imm[0]?.[0] !== 0
        || !imm.every((r, i) => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && r[0] < rows.length && (!i || r[0] > imm[i - 1][0])
          && Array.isArray(r[1]) && r[1].every((x) => typeof x === 'string'))) out.add(`босс ${f.key}: иммунитеты по этапам (imm) не по форме`);
      // the stage chips of a special request and a guild raid are the numbers 1…N in order (the sheet and «этап 13» rely on it)
      if ((f.mode === 'sr' || f.mode === 'gr') && !rows.every((r, i) => r[3] === String(i + 1))) out.add(`босс ${f.key}: этапы таблицы ${f.table} не «1»…«${rows.length}» по порядку`);
      // the latest season: start and end are ISO strings in UTC, the start before the end
      const iso = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(x) && !Number.isNaN(Date.parse(x));
      if (f.live !== undefined && !(Array.isArray(f.live) && f.live.length === 2 && f.live.every(iso) && Date.parse(f.live[0]) < Date.parse(f.live[1]))) {
        out.add(`босс ${f.key}: даты сезона (live) — не две ISO-строки с Z, начало раньше конца`);
      }
      for (const t of f.teams ?? []) {
        for (const h of [...t.s.flat(), ...(t.r ?? []).map((r) => r.h)]) if (!ids.has(h)) out.add(`босс ${f.key}: в команде гайда герой ${h}, которого нет в данных`);
      }
      // singularity: the guide's teams are pools (p: 1, 2+ groups) named by an element (e), an effect (x) or a hero (h)
      if (f.mode === 'ds') {
        const pools = (f.teams ?? []).filter((t) => t.p === 1);
        if (!pools.length) out.add(`босс ${f.key}: нет команд-пулов из content.json гайда (teams с p: 1)`);
        for (const t of pools) {
          const l = t.l;
          if (t.s.length < 2) out.add(`босс ${f.key}: в пуле меньше двух групп`);
          if (!l || [l.e, l.x, l.h].filter((v) => typeof v === 'string').length !== 1) out.add(`босс ${f.key}: у команды-пула нет подписи l (e, x или h)`);
          else if (l.x !== undefined && !STATUS_RU.has(l.x)) out.add(`босс ${f.key}: подпись команды — эффект ${l.x} без имени (team.status в src/i18n)`);
          else if (l.h !== undefined && !ids.has(l.h)) out.add(`босс ${f.key}: подпись команды — герой ${l.h}, которого нет в данных`);
        }
      }
    }
    const top = (key, label) => B.t[B.b.find((f) => f.key === key)?.table]?.find((r) => r[3] === label)?.[1];
    if (top('sr:meteos', '13') !== 360) out.add(`Meteos этап 13: RES ${top('sr:meteos', '13')}, ждём 360`);
    if (top('gr:frost-legion:main', '10') !== 335) out.add(`Frost Legion этап 10: RES ${top('gr:frost-legion:main', '10')}, ждём 335`);
    // world boss ladder of the right boss: league 4 is A 360, and the second boss takes over at S (350)
    if (top('wb:harshna', '4:A') !== 360) out.add(`Harshna лига 4 этап A: RES ${top('wb:harshna', '4:A')}, ждём 360`);
    if (top('wb:harshna', '4:S') !== 350) out.add(`Harshna лига 4 этап S: RES ${top('wb:harshna', '4:S')}, ждём 350 (второй босс)`);
    // portraits (update.py image_paths, BOSS_IMAGE_MODES): every fight the app lists has an icon and its image; a hero as a
    // boss (guild raid sub) has no boss portrait and takes the hero's face icon instead (image_fallback)
    const fightIcon = (key) => B.b.find((f) => f.key === key)?.icon;
    if (fightIcon('sr:meteos') !== '4076002' || !D.img?.['boss:4076002']) out.add(`Meteos: icon ${fightIcon('sr:meteos')} (ждём 4076002) или нет картинки boss:4076002`);
    if (fightIcon('gr:planetary-control-unit:subA') !== '2000099' || !D.img?.['boss:2000099']) {
      out.add(`Planetary Control Unit subA: icon ${fightIcon('gr:planetary-control-unit:subA')} (ждём 2000099) или нет запасной картинки boss:2000099 (faceicon героя-монстра)`);
    }
    for (const f of B.b.filter((x) => ['sr', 'ds', 'jc', 'gr'].includes(x.mode))) {
      if (!f.icon) out.add(`босс ${f.key}: нет icon (портрет)`);
      else if (!D.img?.[`boss:${f.icon}`]) out.add(`босс ${f.key}: нет картинки boss:${f.icon}`);
    }
    // Chimera's guide has one team, named by the element: fire, with Titia in it
    const titia = D.chars.find((c) => c.name === 'Titia')?.id;
    const chim = B.b.find((f) => f.key === 'ds:chimera')?.teams?.find((t) => t.l?.e === 'fire');
    if (!titia || !chim?.s.some((g) => g.includes(titia))) out.add('ds:chimera: нет команды {e: fire} с Титией (content.json гайда сингулярности)');
    if (B.q !== -200) out.add(`Challenge quirk на RES боссов ${B.q} ‰, ждём −200`);
    // the boss sheet names every immunity with the app's own strings (team.status in src/i18n)
    for (const id of new Set(B.b.flatMap((b) => b.imm.flatMap(([, ids]) => ids)))) {
      if (!STATUS_RU.has(id)) out.add(`боссы: новый иммунитет ${id} — нужно русское и английское имя (team.status в src/i18n)`);
    }
  }
  // team synergy (update.py build_synergy): a changed outerpedia format empties or breaks the block
  const syn = D.synergy;
  if (!syn) out.add('нет блока synergy (экран «Команда»)');
  else {
    const H = syn.heroes ?? {};
    const vero = H['2000037']?.need?.some((n) => n.st === '6' && n.on === 'self');
    if (!vero) out.add('synergy: у Veronica нет условия «Increased Defense на себе» — формат таблиц outerpedia изменился?');
    const def = Object.values(H).filter((h) => h.give?.some((g) => g.st === '6' && (g.to === 'team' || g.to === 'ally'))).length;
    if (def < 10) out.add(`synergy: Increased Defense союзникам дают ${def} героев (ждём ≥ 10)`);
    for (const [id, h] of Object.entries(H)) {
      for (const r of [...(h.need ?? []), ...(h.give ?? [])]) {
        if (!syn.statuses?.[r.st]?.en) out.add(`synergy: у героя ${id} статус ${r.st} без имени`);
      }
    }
    if (!D.teams) out.add('нет команд outerpedia (подсказки «кого добавить» на «Команде»): не получен список гайдов?');
    else if ((D.teams.list ?? []).length < 40) out.add(`команд outerpedia всего ${(D.teams.list ?? []).length} (ждём ≥ 40) — формат teams.json изменился?`);
    for (const st of Object.keys(syn.statuses ?? {})) {
      if (!STATUS_RU.has(st)) out.add(`synergy: новый статус ${st} «${syn.statuses[st].en}» — нужно русское и английское имя (team.status в src/i18n)`);
    }
  }
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
      d.changed.push({ name: c.name, lines: buildChanges(o.builds, c.builds, A, B) });
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
  d.mains = mainChanges(A, B);
  return d;
}

// Что именно поменялось в билдах героя — строки под «~ обновлены билды» в PR. Билды сопоставляются по имени; у
// нескольких билдов одна и та же правка (так у outerpedia часто) — одна строка «Speed, Swift Mix — …». «только порядок» —
// те же элементы в другом порядке. Порядок не пустой звук: первое комбо сетов — основное (evalArmor), подсказка обмена
// берёт первое подходящее оружие (trade/model/hint); ни на что не влияет только порядок сетов внутри комбо
function buildChanges(was, now, A, B) {
  const nameOf = (key, k) => (B[key].find((x) => x.key === k) ?? A[key].find((x) => x.key === k))?.name;
  const setName = (id) => { const s = B.sets.find((x) => x.id === id) ?? A.sets.find((x) => x.id === id); return s?.short || s?.name || `сет ${id}`; };
  const combo = (c) => c.map((p) => `${setName(p.set)} ${p.n}`).sort().join(' + ');
  const charm = (id) => (B.talismans[id] ?? A.talismans[id])?.name || id;
  const chain = (subs) => subs.map((g) => g.join(' = ')).join(' > ') || '—';
  const listDiff = (label, a, b, show) => {
    const plus = b.filter((x) => !a.includes(x)).map((x) => `+ ${show(x)}`);
    const minus = a.filter((x) => !b.includes(x)).map((x) => `− ${show(x)}`);
    if (plus.length || minus.length) return [`${label}: ${[...plus, ...minus].join(', ')}`];
    return same(a, b) ? [] : [`${label}: только порядок — ${a.map(show).join(', ')} → ${b.map(show).join(', ')}`];
  };
  const gearDiff = (label, key, a, b) => {
    const nm = (k) => nameOf(key, k) || k;
    const mains = (g) => `${g.mains.join('/') || '—'}${g.bad?.length ? ` (${g.bad.map((m) => m + '?').join(', ')})` : ''}`;
    const out = [];
    const old = new Map(a.map((g) => [g.key, g]));
    const fresh = new Map(b.map((g) => [g.key, g]));
    for (const g of b) if (!old.has(g.key)) out.push(`+ ${label} ${nm(g.key)} (${mains(g)})`);
    for (const g of a) if (!fresh.has(g.key)) out.push(`− ${label} ${nm(g.key)}`);
    for (const g of b) {
      const o = old.get(g.key);
      if (!o) continue;
      if (!same(o.mains, g.mains)) out.push(`${label} ${nm(g.key)}: main ${o.mains.join('/') || '—'} → ${g.mains.join('/') || '—'}`);
      const gone = (o.bad || []).filter((m) => !(g.bad || []).includes(m));
      const came = (g.bad || []).filter((m) => !(o.bad || []).includes(m));
      if (gone.length) out.push(`${label} ${nm(g.key)}: outerpedia убрала main ${gone.join(', ')}, которого у предмета не бывает`);
      if (came.length) out.push(`${label} ${nm(g.key)}: outerpedia советует main ${came.join(', ')}, которого у предмета не бывает`);
    }
    if (!out.length && !same(a.map((g) => g.key), b.map((g) => g.key))) {
      out.push(`${label}: только порядок — ${a.map((g) => nm(g.key)).join(', ')} → ${b.map((g) => nm(g.key)).join(', ')}`);
    }
    return out;
  };
  const one = (o, b) => {
    const sa = o.sets.map(combo);
    const sb = b.sets.map(combo);
    const out = [];
    if (!same(sa, sb)) out.push(...listDiff('сеты', sa, sb, (x) => x));
    else if (!same(o.sets, b.sets)) out.push('сеты: только порядок внутри комбо (ни на что не влияет)');
    out.push(...gearDiff('оружие', 'weapons', o.weapons, b.weapons), ...gearDiff('аксессуар', 'amulets', o.amulets, b.amulets));
    out.push(...listDiff('талисманы', o.talismans, b.talismans, charm));
    if (!same(o.subs, b.subs)) out.push(`сабстаты: ${chain(o.subs)} → ${chain(b.subs)}`);
    if (o.note !== b.note) out.push(o.note ? (b.note ? 'заметка изменена' : 'заметка убрана') : 'новая заметка');
    const known = new Set(['name', 'sets', 'weapons', 'amulets', 'talismans', 'subs', 'note']);
    for (const k of new Set([...Object.keys(o), ...Object.keys(b)])) if (!known.has(k) && !same(o[k], b[k])) out.push(`поле ${k} изменилось`);
    return out;
  };
  // одноимённые билды — по порядку среди одноимённых
  const keyed = (bs) => { const n = {}; return bs.map((b) => [`${b.name}#${(n[b.name] = (n[b.name] ?? 0) + 1)}`, b]); };
  const old = new Map(keyed(was));
  const fresh = new Map(keyed(now));
  const lines = [];
  const byChange = new Map(); // правка → билды с ней
  for (const [k, b] of fresh) {
    const o = old.get(k);
    if (!o) { lines.push(`+ билд ${b.name}`); continue; }
    for (const x of one(o, b)) byChange.set(x, [...(byChange.get(x) ?? []), b.name]);
  }
  for (const [k, o] of old) if (!fresh.has(k)) lines.push(`− билд ${o.name}`);
  for (const [x, names] of byChange) lines.push(`${names.join(', ')} — ${x}`);
  if (!lines.length && !same(was.map((b) => b.name), now.map((b) => b.name))) lines.push(`только порядок билдов: ${now.map((b) => b.name).join(', ')}`);
  return lines;
}

// Смена main у вещи, которая была и раньше, и новая вещь с main не как у остальных в слоте. Страница считает
// по данным и сама перейдёт на новые main — строка нужна, чтобы это было видно в PR. То же — main_changes в update.py.
const SLOT_RU = { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броня', gloves: 'перчатки', shoes: 'ботинки' };
const GRADE_EN = { unique: 'Legendary', rare: 'Epic' };
const joined = (ls) => ls.join(' + ') || '—';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mainsText(x) {
  let choice = (x.mains || []).join('/');
  if (x.extraMains?.length) choice += ` (у фиксированных копий ещё ${x.extraMains.join('/')})`;
  return [...(x.fixed || []), ...(choice ? [choice] : [])].join(' + ') || '—';
}

function mainChanges(A, B) {
  const out = [];
  const usual = B.fixedMains || {};
  for (const [key, kind] of [['weapons', 'weapon'], ['amulets', 'accessory']]) {
    const was = new Map(A[key].map((x) => [x.key, x]));
    for (const x of B[key]) {
      let o = was.get(x.key);
      if (!o) {
        const base = usual[kind]?.[x.grade];
        if (x.star === 6 && base && !same(x.fixed || [], base)) out.push(`+ main не как у остальных: ${SLOT_RU[kind]} ${x.name} — ${mainsText(x)}`);
        continue;
      }
      if (!('fixed' in o)) o = { ...o, fixed: x.fixed }; // данные до строк main: сравниваем только выбор
      if (mainsText(o) !== mainsText(x)) out.push(`~ main: ${SLOT_RU[kind]} ${x.name}: ${mainsText(o)} → ${mainsText(x)}`);
    }
  }
  const wasSets = new Map(A.sets.map((s) => [s.id, s]));
  for (const s of B.sets) {
    const o = wasSets.get(s.id);
    for (const [slot, byGrade] of Object.entries(s.fixed || {})) {
      for (const [grade, now] of Object.entries(byGrade)) {
        const where = `${s.name}, ${SLOT_RU[slot]} ${GRADE_EN[grade]}`;
        const then = o?.fixed?.[slot]?.[grade];
        const base = usual[slot]?.[grade];
        if (!then && base && !same(now, base) && (!o || 'fixed' in o)) out.push(`+ main не как у остальных: ${where} — ${joined(now)} (обычно ${joined(base)})`);
        else if (then && !same(then, now)) out.push(`~ main: ${where}: ${joined(then)} → ${joined(now)}`);
      }
    }
  }
  for (const [slot, byGrade] of Object.entries(A.fixedMains || {})) {
    for (const [grade, then] of Object.entries(byGrade)) {
      const now = usual[slot]?.[grade];
      if (now && !same(now, then)) out.push(`~ main у большинства вещей: ${SLOT_RU[slot]} ${GRADE_EN[grade]}: ${joined(then)} → ${joined(now)}`);
    }
  }
  return out;
}

// main из данных, с которыми страница не справится: код предмета не запишет новую метку, сетка аксессуара её
// не покажет, у строки брони или оружия не будет значка. Что страница знает — спрашиваем у неё (window.__ogc.known).
function unknownMains(D, known) {
  const out = new Set();
  const code = new Set(known.codeMains);
  const grid = new Set(known.gridMains);
  const icons = new Set(known.icons);
  for (const [kind, list] of [['weapon', D.weapons], ['accessory', D.amulets]]) {
    for (const i of list) {
      for (const m of [...i.mains, ...i.extraMains]) {
        if (!code.has(m)) out.add(`main «${m}» (${i.name}) не записать в код предмета — допиши его в MAINS в src/features/eval/code/codec.ts`);
        if (kind === 'accessory' && !grid.has(m)) out.add(`main «${m}» (${i.name}) нет в сетке аксессуара — MAIN_GRID в src/game/data/index.ts`);
      }
    }
  }
  const lines = [
    ...Object.values(D.fixedMains || {}).flatMap((g) => Object.values(g).flat()),
    ...D.sets.flatMap((s) => Object.values(s.fixed || {}).flatMap((g) => Object.values(g).flat())),
    ...[...D.weapons, ...D.amulets].flatMap((i) => i.fixed || []),
  ];
  const where = 'STAT_ICON в src/game/data/index.ts и STAT в src/game/icons/own.ts';
  for (const m of lines) if (!icons.has(m)) out.add(`строка main «${m}» странице незнакома — нет значка (${where})`);
  for (const m of Object.keys(D.mainBlocks || {})) if (!icons.has(m)) out.add(`main «${m}» странице незнаком — нет значка (${where})`);
  return out;
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
    return execFileSync('git', ['log', '--format=%h %s', `${from}..${to}`, '--', ...APP_PATHS], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// --------------------------------------------------------------------------- отчёт

function verdictTable(L, v) {
  if (!v.changed.length) return;
  L.push('| Предмет | Было | Стало |', '|---|---|---|');
  for (const x of v.changed.slice(0, LIMITS.examples)) L.push(`| ${x.item} | ${x.was} | ${x.now} |`);
  L.push('');
}
const share = (v) => `**${v.changed.length} из ${v.total}** (${v.total ? Math.round((100 * v.changed.length) / v.total) : 0}%)`;

function markdown({ ok, oldD, newD, diff, verdicts, byCode, src, code, report, publish }) {
  const L = [];
  const reasons = checks.filter((c) => c.ok === false).map((c) => c.name);
  // PR данных вливаешь ты; публикацию кода робот делает сам — заголовок говорит, что будет дальше
  const head = publish ? ['## ✅ Проверки пройдены — публикую', '## ⛔ Не публикую'] : ['## ✅ Проверки пройдены — можно вливать', '## ⛔ Не вливать'];
  L.push(ok ? head[0] : `${head[1]}: ${reasons.join('; ')}`, '');
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
    ...diff.changed.map((x) => [`~ обновлены билды: ${x.name}`, ...cap(x.lines).map((l) => `  - ${l}`)].join('\n')),
    ...diff.items.map((x) => `+ новый ${x}`),
    ...diff.lostItems.map((x) => `− пропал ${x.text}${x.used ? ' (был в билдах)' : ''}`),
    ...(diff.mains || []),
  ];
  L.push(...(items.length ? items.map((x) => `- ${x}`) : ['Персонажи, билды и предметы те же.']), '');
  if (code) {
    L.push('### Код приложения', '', `Страница собрана из кода новее опубликованного (${code.from || '?'} → ${code.to}) — в сборку входят эти правки:`, '');
    L.push(...(code.commits.length ? cap(code.commits).map((x) => `- ${x}`) : ['- (список коммитов недоступен)']), '');
  }

  L.push('### Проверки', '');
  for (const ch of checks) {
    L.push(`- ${ch.ok === true ? '✅' : ch.ok === false ? '⛔' : '⚠️'} **${ch.name}**`);
    for (const line of cap(ch.lines)) L.push(`  - ${line}`);
  }
  L.push('');

  if (byCode) {
    L.push('### Что изменил код', '', `Те же опубликованные данные, опубликованная страница против новой: изменилось ${share(byCode)} вердиктов, лучших кандидатов или плашек.`, '');
    verdictTable(L, byCode);
  }
  if (verdicts) {
    L.push(byCode ? '### Что изменили данные' : '### Вердикты на тестовых предметах', '');
    L.push(`${byCode ? 'Новый код, старые данные против новых' : 'Изменилось'}: ${share(verdicts)}` +
      (verdicts.skipped ? `; пропущено ${verdicts.skipped} — их сета или предмета нет в новых данных` : '') + '.', '');
    verdictTable(L, verdicts);
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

  // 1б. ложное обновление: коммит outerpedia другой, а данные те же — телефоны показали бы «Вышли новые данные» зря
  // (sw.js отдаёт meta.commit как версию данных). update.py в этом случае оставляет прежний снимок (snapshot_kind),
  // здесь — страховка. Как «Код закоммичен», в отчёте только когда сработала. При разном коде наборы и так
  // различаются — тогда она молчит: ловит дубли, а не правки кода
  await guarded('Ложное обновление данных', () => {
    const [oc, nc] = [oldD.meta.commit, newD.meta.commit];
    if (!oc || !nc || oc === nc || contentOf(oldD) !== contentOf(newD)) return;
    check('Ложное обновление данных', false, [
      `коммит outerpedia ${oc.slice(0, 7)} → ${nc.slice(0, 7)}, а данные на странице те же: у телефонов была бы плашка «Вышли новые данные» без новых данных`,
      'снимок должен был остаться прежним — update.py, snapshot_kind()',
    ]);
  });

  // 2. правдоподобие: ничего заметного не пропало
  let diff = { added: [], lost: [], lostBuilds: [], changed: [], items: [], lostItems: [], mains: [] };
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

  // crit from sets: the trade's quick crit bound (layout rowsMaxOf) and MODEL.md §12 are checked with one such set
  await guarded('Крит от сетов', () => {
    const chcSets = newD.sets.filter((s) => Object.values(s.bonus ?? {}).some((t) => t.p2?.stat === 'CHC' || t.p4?.stat === 'CHC'));
    if (chcSets.length > 1) check('Крит от сетов', 'warn', [`CHC в бонусе у ${chcSets.length} сетов (${chcSets.map((s) => s.name).join(', ')}) — проверь «Крит» в обмене и MODEL.md §12`]);
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
  let byCode = null;
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
    verdicts = diffCases(was, now, newD);
    const { total, changed } = verdicts;
    if (total && changed.length / total > LIMITS.verdictShare) {
      check('Доля изменённых вердиктов', 'warn', [`изменилось ${Math.round((100 * changed.length) / total)}% — посмотри примеры ниже внимательнее`]);
    }
    // код новее опубликованного: те же старые данные через опубликованную страницу и через новую
    const pOldCode = loadPage(oldHtml);
    if (pOldCode.w.__ogc?.makeCtx && buildOf(oldHtml, null)?.hash !== buildOf(newHtml, pNew.w)?.hash) {
      byCode = diffCases(runCases(pOldCode.w.__ogc), was, oldD);
    }
    pOldCode.w.close();
  });

  // 5б. новые main, с которыми страница не справится: новая метка, выбор вместо фиксированной строки брони
  // (последнее update.py пишет предупреждением — его ловит «Разбор данных outerpedia»)
  await guarded('Main stat знакомы странице', () => {
    const known = pNew.w.__ogc?.known;
    if (!known) {
      check('Main stat знакомы странице', false, ['в странице нет window.__ogc.known — приложение не запустилось, см. «Страница работает»']);
      return;
    }
    const bad = [...unknownMains(newD, known)];
    check('Main stat знакомы странице', !bad.length, bad);
    // новый сет без своего значка рисуется шестиугольником: не ошибка, но стоит дорисовать
    const own = new Set(known.setIcons || []);
    const noIcon = newD.sets.filter((st) => !own.has(st.short)).map((st) => `сет «${st.short}» без своего значка — допиши в SET_ICON (src/game/icons/own.ts), пока там шестиугольник`);
    check('Свои значки сетов', noIcon.length ? null : true, noIcon);
  });

  // 5в. обучение: элементы, на которые показывает главный тур, есть на стартовом экране на ПК и на телефоне.
  // Подсказки модулей зависят от состояния (4-й сабстат, окно замены) — их якоря проверяют юнит-тесты
  await guarded('Якоря обучения', async () => {
    const core = pNew.w.__ogc?.tour?.core;
    if (!core) return; // страница до обучения
    const missing = [];
    for (const [label, width] of [['ПК', 0], ['телефон 360px', 360]]) {
      const p = loadPage(newHtml, { welcomeHidden: true }, width);
      await tick(50);
      for (const a of core) if (!p.w.document.querySelector(`[data-tour="${a}"]`)) missing.push(`${label}: нет элемента с data-tour="${a}" — перенеси якорь (src/tour/anchors.ts)`);
      // на телефоне «Следующий» и вердикт — на нижней плашке; кнопка ПК под формой там есть в DOM, но скрыта CSS
      if (width) for (const a of ['next', 'verdict']) if (!p.w.document.querySelector(`#vbar [data-tour="${a}"]`)) missing.push(`${label}: на нижней плашке нет data-tour="${a}"`);
      p.w.close();
    }
    check('Якоря обучения', missing.length ? null : true, missing);
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
  // в Actions предупреждения видны в итоге прогона: при публикации кода отчёт иначе никто не читает
  if (process.env.GITHUB_ACTIONS) {
    for (const c of checks.filter((x) => x.ok === null || x.ok === 'warn')) console.log(`::warning title=${c.name}::${c.lines.join('; ').replace(/\n/g, ' ')}`);
  }
  const md = markdown({ ok, oldD, newD, diff, verdicts, byCode, src, code, report, publish: a.for === 'publish' });
  if (a.md) writeFileSync(a.md, md + '\n');
  console.log(md);
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code), (e) => {
  console.error('check-data: не удалось выполнить проверку —', e.stack || e);
  process.exit(2);
});
