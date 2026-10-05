// Оба тура («Оценка вещи» и «Экипировка») в настоящем браузере на пяти размерах экрана, в светлой и тёмной теме:
// тур проходится на примере до конца, и на каждом шаге полоса целиком в окне и не закрывает то, на что показывает
// рамка. Ещё — полоса «Только для» с самым длинным именем героя из данных не раздвигает страницу вбок, а на ПК
// сообщение после «Надеть» не ложится на колонку вердикта.
// Кадры — в build/tour-check/. jsdom раскладку не считает, поэтому это отдельно от тестов. Нужен Chrome (переменная CHROME).
// Запуск: task tour:check (страница — свежая сборка приложения с данными из docs/ или из SITE, как у скриншотов).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { doneTour } from './known-tips.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = join(ROOT, process.env.SITE || 'docs');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = join(ROOT, 'build/tour-check');
// телефон узкий и обычный, полоска разделённого экрана, ландшафт, ПК
const SIZES = [[280, 640], [360, 740], [420, 390], [812, 375], [1280, 800]];

const app = join(ROOT, 'build/app/index.html');
if (!existsSync(app)) throw new Error('нет build/app/index.html — сначала task build:app');
if (!existsSync(CHROME)) { console.log(`⚠️  нет Chrome (${CHROME}) — проверка тура пропущена`); process.exit(0); }
const data = /<script>window\.OGC_DATA = (\{.*?\});<\/script>/s.exec(readFileSync(join(SITE, 'index.html'), 'utf8'))?.[1];
if (!data) throw new Error(`в ${SITE}/index.html нет данных — сначала task build:pwa`);
const html = readFileSync(app, 'utf8').replace('/*__OGC_DATA__*/null', data);
const server = createServer((_, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }).listen(0);
const url = `http://localhost:${server.address().port}/`;
const TOUR = doneTour(); // обучение пройдено, все подсказки знакомы

mkdirSync(OUT, { recursive: true });
const problems = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const tour of ['core', 'gear']) for (const [w, h] of SIZES) for (const theme of ['light', 'dark']) await run(w, h, theme, tour);
  for (const [w, h] of SIZES) await tryonWidth(w, h);
  for (const [w, h] of SIZES.filter(([w]) => w >= 720)) await toastPlace(w, h);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.log(`\n⛔ Тур: ${problems.length} проблем(ы)`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`\n✅ Оба тура проходятся на ${SIZES.length} размерах в двух темах, полоса «Только для» влезает, сообщение не на вердикте; кадры — build/tour-check/`);

async function run(w, h, theme, tour) {
  const tag = `${tour} ${w}×${h} ${theme}`;
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]); // анимации включены: шаги ждут дольше, чем длится появление
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 720, hasTouch: w < 720 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((tour) => {
    localStorage.clear();
    localStorage.setItem('ogc.lang', '"en"');
    localStorage.setItem('ogc.welcomeHidden', 'true');
    localStorage.setItem('ogc.tour', tour);
  }, TOUR);
  await page.goto(url, { waitUntil: 'networkidle0' });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (fn, ...args) => { await page.evaluate(fn, ...args); await pause(600); };
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.includes(text))?.click();

  // запуск: на телефоне — из меню ☰, на ПК — кнопкой под формой; затем «Какое обучение?»
  if (w < 720) { await click(() => document.querySelector('.vb-tab').click()); await click(byText, '.menu button', 'Tutorial'); }
  else await click(byText, '.actions button', 'Tutorial');
  if (tour === 'core') { await click(byText, '.tour-strip button', 'Checking a piece'); await click(byText, '.tour-strip button', 'Example'); }
  else await click(byText, '.tour-strip button', 'Gear · 1 min');

  for (let guard = 0; guard < 12; guard++) {
    const st = await page.evaluate(inspect);
    for (const p of st.problems) problems.push(`${tag}, ${st.label}: ${p}`);
    await page.screenshot({ path: join(OUT, `${tour}-${w}x${h}-${theme}-${String(guard).padStart(2, '0')}.png`) });
    if (st.end) { await click(byText, '.tour-strip button', 'Done'); break; }
    if (st.step === 0) { problems.push(`${tag}: не видно шага тура (${st.label})`); break; }
    const before = st.label;
    await page.evaluate(tour === 'core' ? act : actGear, st.step, w < 720);
    await pause(700);
    const after = (await page.evaluate(inspect)).label;
    // «Дальше» без действия: у главного тура шаг 2 на широком, у «Экипировки» — шаг 3
    if (after === before && !(tour === 'core' && st.step === 2)) problems.push(`${tag}, ${before}: шаг не засчитался после действия`);
  }
  await page.close();
}

// Режим героя с самым длинным именем из данных: страница не шире окна, ✕ полосы — в окне и в колонке формы
async function tryonWidth(w, h) {
  const tag = `«Только для» ${w}×${h}`;
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 720, hasTouch: w < 720 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  const who = await page.evaluate((tour) => {
    // герой без билдов в режим не входит (heroTarget), поэтому берём только тех, у кого они есть
    const top = window.OGC_DATA.chars.filter((c) => c.builds.length).sort((a, z) => z.name.length - a.name.length)[0];
    localStorage.clear();
    localStorage.setItem('ogc.lang', '"en"');
    localStorage.setItem('ogc.welcomeHidden', 'true');
    localStorage.setItem('ogc.tour', tour);
    localStorage.setItem('ogc.tryon', JSON.stringify({ charId: top.id }));
    return top.name;
  }, TOUR);
  await page.goto(url, { waitUntil: 'networkidle0' });
  const m = await page.evaluate(() => {
    const x = document.querySelector('.tryon-x')?.getBoundingClientRect();
    const form = document.querySelector('#eval-in')?.getBoundingClientRect();
    return { doc: document.documentElement.scrollWidth, vw: innerWidth, x: x && x.right, form: form && form.right };
  });
  await page.screenshot({ path: join(OUT, `tryon-${w}x${h}.png`) });
  if (m.x == null) problems.push(`${tag}: нет полосы «Только для» (${who})`);
  else {
    if (m.doc > m.vw + 1) problems.push(`${tag}: страница шире окна — ${m.doc} из ${m.vw} (${who})`);
    if (m.x > Math.min(m.vw, m.form) + 1) problems.push(`${tag}: ✕ полосы за краем (${Math.round(m.x)} при ${Math.round(Math.min(m.vw, m.form))}, ${who})`);
  }
  await page.close();
}

// ПК: «Надеть» в «Сейчас на персонажах» — сообщение с «Вернуть» над колонкой формы, а не на колонке вердикта
async function toastPlace(w, h) {
  const tag = `сообщение ${w}×${h}`;
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((tour) => {
    const D = window.OGC_DATA;
    const caren = D.chars.find((c) => c.name === 'Caren');
    const speed = D.sets.find((s) => s.short === 'Speed').id;
    const P = (id, slot) => ({ id, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { HP: 1, DEF: 1, ATK: 1, RES: 1 }, lit: { HP: 1, DEF: 1, ATK: 1, RES: 1 }, bt: 0, at: '' });
    localStorage.clear();
    localStorage.setItem('ogc.lang', '"en"');
    localStorage.setItem('ogc.welcomeHidden', 'true');
    localStorage.setItem('ogc.tour', tour);
    localStorage.setItem('ogc.roster', JSON.stringify([caren.id]));
    localStorage.setItem('ogc.gear', JSON.stringify({ v: 1, seq: 2, pieces: { p1: P('p1', 'helmet'), p2: P('p2', 'armor') },
      builds: { [caren.id + '/Speed']: { slots: { helmet: 'p1', armor: 'p2' }, at: '' }, [caren.id + '/Speed/Immu']: { slots: { armor: 'p2' }, at: '' } } }));
    localStorage.setItem('ogc.state', JSON.stringify({ tab: 'eval', slot: 'helmet', grade: 'unique' }));
    localStorage.setItem('ogc.item', JSON.stringify({ setId: speed, subs: { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 } }));
  }, TOUR);
  await page.goto(url, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  const m = await page.evaluate(async () => {
    document.querySelector('.v-vs .vs-act')?.click();
    await new Promise((r) => setTimeout(r, 400));
    const t = document.querySelector('.gear-toast')?.getBoundingClientRect();
    const col = document.querySelector('.eval-out')?.getBoundingClientRect();
    return t && col ? { right: t.right, left: t.left, col: col.left } : null;
  });
  await page.screenshot({ path: join(OUT, `toast-${w}x${h}.png`) });
  if (!m) problems.push(`${tag}: нет сообщения после «Надеть» или колонки вердикта`);
  else if (m.right > m.col + 1 || m.left < 0) problems.push(`${tag}: сообщение на колонке вердикта (${Math.round(m.left)}…${Math.round(m.right)}, вердикт с ${Math.round(m.col)})`);
  await page.close();
}

// что на экране: номер шага, полоса в окне, рамки не под полосой
function inspect() {
  const strip = document.querySelector('.tour-strip:not(.tour-invite)');
  const text = strip?.textContent ?? '';
  const m = /(?:Step|Gear ·) (\d) of \d/.exec(text);
  // открыто окно — узкая плашка без номера: на шаге 5 главного тура это шторка вердикта
  const n = m ? Number(m[1]) : text.includes('Close the window') ? 5 : 0;
  const out = { label: n ? `шаг ${n}` : text.slice(0, 40), step: n, end: text.includes("That's it") || text.includes('That was an example'), problems: [] };
  if (!strip) { out.problems.push('нет полосы'); return out; }
  const r = strip.getBoundingClientRect();
  if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) out.problems.push(`полоса за краем окна (${Math.round(r.top)}…${Math.round(r.bottom)} из ${innerHeight})`);
  for (const ring of document.querySelectorAll('.tour-ring')) {
    const b = ring.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (y < 0 || y > innerHeight) { out.problems.push('рамка за краем окна'); continue; }
    if (document.elementFromPoint(x, y)?.closest('.tour-strip')) out.problems.push('полоса закрывает то, на что показывает рамка');
  }
  return out;
}

// действие шага на примере
function act(step, narrow) {
  const $ = (s) => document.querySelector(s);
  const pin = (a, k) => $(`[data-tour="${a}"] [data-tour-item="${k}"]`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return (async () => {
    if (step === 1) { pin('slot', 'armor')?.click(); await wait(200); pin('grade', 'rare')?.click(); }
    if (step === 2) { $('[data-tour="pick"]').click(); await wait(500); pin('sets', 'Speed')?.click(); }
    // клетка сетки, затем уровень в окне (LevelAsk)
    if (step === 3) for (const k of ['SPD', 'CHC', 'CHD']) { pin('grid', k)?.click(); await wait(200); $('.drawer.lvl .roll-b button')?.click(); await wait(200); }
    if (step === 4) { if (narrow) $('.vcard').click(); else [...document.querySelectorAll('.tour-strip button')].find((b) => b.textContent === 'Continue').click(); }
    if (step === 5) {
      if ($('.drawer-x')) { $('.drawer-x').click(); await wait(400); }
      (narrow ? $('.vb-reset') : $('.actions .btn.primary')).click();
    }
  })();
}

// действие шага тура «Экипировка»: шлем → «Примерить замену» → «Дальше» → «Заменить шлем Caren» → ✕ полосы «Только для»
function actGear(step, narrow) {
  const $ = (s) => document.querySelector(s);
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.includes(text));
  const visible = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length > 0);
  if (step === 1) $('[data-tour="gslots"] [data-tour-item="helmet"]').click();
  if (step === 2) byText('.piece-act button', 'Try a replacement').click();
  if (step === 3) byText('.tour-strip button', 'Continue').click();
  if (step === 4) (narrow ? $('.vc-equip') : visible('[data-tour="gequip"]')).click();
  if (step === 5) $('.tryon-x').click();
}
