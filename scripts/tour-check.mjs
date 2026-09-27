// Главный тур в настоящем браузере на пяти размерах экрана, в светлой и тёмной теме: тур проходится на примере до
// конца, и на каждом шаге полоса целиком в окне и не закрывает то, на что показывает рамка. Кадры — в
// build/tour-check/. jsdom раскладку не считает, поэтому это отдельно от тестов. Нужен Chrome (переменная CHROME).
// Запуск: task tour:check (страница — свежая сборка приложения с данными из docs/ или из SITE, как у скриншотов).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

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

mkdirSync(OUT, { recursive: true });
const problems = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const [w, h] of SIZES) for (const theme of ['light', 'dark']) await run(w, h, theme);
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  console.log(`\n⛔ Тур: ${problems.length} проблем(ы)`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`\n✅ Тур проходится на ${SIZES.length} размерах в двух темах; кадры — build/tour-check/`);

async function run(w, h, theme) {
  const tag = `${w}×${h} ${theme}`;
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 720, hasTouch: w < 720 });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('ogc.lang', '"en"');
    localStorage.setItem('ogc.welcomeHidden', 'true');
    localStorage.setItem('ogc.tour', JSON.stringify({ v: 1, first: 'done', invited: true, seen: {}, known: {}, since: '2099-01-01', tips: false }));
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (fn, ...args) => { await page.evaluate(fn, ...args); await pause(600); };
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((b) => b.textContent.includes(text))?.click();

  // запуск: на телефоне — из меню ☰, на ПК — кнопкой под формой
  if (w < 720) { await click(() => document.querySelector('.vb-tab').click()); await click(byText, '.menu button', 'Tutorial'); }
  else await click(byText, '.actions button', 'Tutorial');
  await click(byText, '.tour-strip button', 'Example');

  for (let guard = 0; guard < 12; guard++) {
    const st = await page.evaluate(inspect);
    for (const p of st.problems) problems.push(`${tag}, ${st.label}: ${p}`);
    await page.screenshot({ path: join(OUT, `${w}x${h}-${theme}-${String(guard).padStart(2, '0')}.png`) });
    if (st.end) { await click(byText, '.tour-strip button', 'Done'); break; }
    if (st.step === 0) { problems.push(`${tag}: не видно шага тура (${st.label})`); break; }
    const before = st.label;
    await page.evaluate(act, st.step, w < 720);
    await pause(700);
    const after = (await page.evaluate(inspect)).label;
    if (after === before && st.step !== 2) problems.push(`${tag}, ${before}: шаг не засчитался после действия`);
  }
  await page.close();
}

// что на экране: номер шага, полоса в окне, рамки не под полосой
function inspect() {
  const strip = document.querySelector('.tour-strip:not(.tour-invite)');
  const text = strip?.textContent ?? '';
  const m = /Step (\d) of 5/.exec(text);
  // открыто окно — узкая плашка без номера: на шаге 5 это шторка вердикта
  const n = m ? Number(m[1]) : text.includes('Close the window') ? 5 : 0;
  const out = { label: n ? `шаг ${n}` : text.slice(0, 40), step: n, end: text.includes("That's it"), problems: [] };
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
    if (step === 3) for (const k of ['SPD', 'CHC', 'CHD']) { pin('grid', k)?.click(); await wait(200); }
    if (step === 4) { if (narrow) $('.vcard').click(); else [...document.querySelectorAll('.tour-strip button')].find((b) => b.textContent === 'Continue').click(); }
    if (step === 5) {
      if ($('.drawer-x')) { $('.drawer-x').click(); await wait(400); }
      (narrow ? $('.vb-reset') : $('.actions .btn.primary')).click();
    }
  })();
}
