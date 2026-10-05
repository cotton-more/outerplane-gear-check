// Скриншоты для README (английские) и Wiki (на языке страницы): телефон в разделённом экране (412×430, тёмная тема),
// сценарий оценки шлема. Снимает оба языка в screenshots/en/ и screenshots/ru/; только один — LANGS=en.
// Страница — свежая сборка приложения (build/app/index.html) с данными и картинками из docs/ (или из SITE — например,
// SITE=build/preview после task preview, если в данных новые поля, а сайт ещё не пересобран).
// Нужен установленный Chrome; путь меняется переменной CHROME. Запуск: task screenshots.
import { readFileSync, existsSync, createReadStream, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { doneTour } from './known-tips.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = join(ROOT, process.env.SITE || 'docs');
const LANGS = (process.env.LANGS || 'en,ru').split(',');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = { '.webp': 'image/webp', '.png': 'image/png' };

const app = join(ROOT, 'build/app/index.html');
if (!existsSync(app)) throw new Error('нет build/app/index.html — сначала task build:app');
const data = /<script>window\.OGC_DATA = (\{.*?\});<\/script>/s.exec(readFileSync(join(SITE, 'index.html'), 'utf8'))?.[1];
if (!data) throw new Error(`в ${SITE}/index.html нет данных — сначала task build:pwa`);
const html = readFileSync(app, 'utf8').replace('/*__OGC_DATA__*/null', data);

// страница — из памяти, картинки — из SITE/img
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  const file = join(SITE, path);
  if (!path.startsWith('/img/') || !existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

// ростер примера: атакеры с Attack Set и часть остальных — чтобы в «Кому подходит» были обе группы
const ROSTER = ['Lambda', 'Eris', 'Titia', 'Core Fusion Lisha', 'Demiurge Saeran', 'Demiurge Luna', 'Heatwave Cop Delta',
  'Mystic Sage Ame', 'Vlada', 'Kappa', 'Sterope', 'Gnosis Viella', 'Liselotte', 'Omega Nadja', 'Ryu Lion'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const lang of LANGS) await shoot(lang);
} finally {
  await browser.close();
  server.close();
}

async function shoot(lang) {
  const OUT = join(ROOT, 'screenshots', lang);
  const page = await browser.newPage();
  // без анимаций: кадр снимается, когда всё уже на месте
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 412, height: 430, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate((names, lang, tour) => {
    localStorage.clear();
    localStorage.setItem('ogc.lang', JSON.stringify(lang));
    localStorage.setItem('ogc.welcomeHidden', 'true');
    localStorage.setItem('ogc.fitnoteHidden', 'true');
    // значки: без выбора приложение показывает значки из игры; в README и Wiki — свои контуры, как до «Ещё» (Д7 решает для игроков, не для витрины)
    localStorage.setItem('ogc.gameIcons', 'false');
    // обучение пройдено и все подсказки знакомы: иначе на каждом кадре была бы полоса «Появилось обучение» или «Новое»
    localStorage.setItem('ogc.tour', tour);
    localStorage.setItem('ogc.roster', JSON.stringify(window.OGC_DATA.chars.filter((c) => names.includes(c.name)).map((c) => c.id)));
  }, ROSTER, lang, doneTour());
  await page.goto(url, { waitUntil: 'networkidle0' }); // не reload: адрес мог сохранить #персонажа с прошлого прогона
  // вспышка плашки вердикта гаснет анимацией, а «уменьшить движение» её выключает — без этого плашка осталась бы залитой
  await page.addStyleTag({ content: '.vb-flash { display: none; }' });

  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = (fn) => page.evaluate(async (src) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const tap = async (el) => { el.click(); await wait(200); };
    // по подписи клетки: в тексте кнопки есть ещё пометка «%» со значка
    const stat = (label) => [...document.querySelectorAll('.sg')].find((b) => b.querySelector(':scope > span:not(.ico):not(.noimg)')?.textContent === label);
    await eval(src)({ wait, tap, stat }); // eslint-disable-line no-eval
  }, fn.toString());
  mkdirSync(OUT, { recursive: true });
  const shot = async (name) => { await pause(400); await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log(`screenshots/${lang}/${name}.png`); };

  // 1. Epic-шлем, Attack Set: подсвечены нужные статы, на плашке — «ярких 0–1 — в разбор»
  await step(async ({ tap }) => {
    await tap(document.querySelectorAll('.slot')[2]);
    await tap(document.querySelector('.grade.rare'));
    await tap(document.querySelector('.formrow .pick'));
    await tap([...document.querySelectorAll('.drawer .set')].find((b) => b.textContent.startsWith('Attack')));
  });
  await shot('1-grid');
  // 2. CHC, ATK%, DMG UP% по 3 жёлтых — карточка «Оставить» с цепочкой лучшего кандидата
  await step(async ({ tap, stat }) => {
    // клетка сетки, затем уровень 3 в окне (LevelAsk)
    for (const l of ['CHC', 'ATK%', 'DMG↑%']) { await tap(stat(l)); await tap(document.querySelectorAll('.drawer.lvl .roll-b button')[2]); }
  });
  await shot('2-verdict');
  // 3. подробности: блок «Прокачка» — Enhance, Breakthrough, Transistone
  await step(async ({ tap, wait }) => {
    await tap(document.querySelector('.vcard'));
    await wait(200);
    const body = document.querySelector('.drawer-b');
    const plan = body.querySelector('.v-plan');
    body.scrollTop += plan.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
  });
  await shot('3-upgrade');
  // 4. подробности: «Кому подходит» с цепочками и разделителем «запасная связка»
  await step(async () => {
    const body = document.querySelector('.drawer-b');
    const div = body.querySelector('.match-div');
    body.scrollTop = div ? div.offsetTop - 250 : body.querySelector('.v-sec').offsetTop;
  });
  await shot('4-who-fits');
  // 5. «Следующий» и два ненужных сабстата — «Разобрать» сразу, третий можно не вводить
  await step(async ({ tap, stat }) => {
    await tap(document.querySelector('.drawer-x'));
    await tap(document.querySelector('.vb-reset'));
    // клетка сетки, затем уровень 1 в окне (LevelAsk)
    for (const l of ['RES%', 'DMG↓%']) { await tap(stat(l)); await tap(document.querySelectorAll('.drawer.lvl .roll-b button')[0]); }
  });
  await pause(6500); // плашка «Вернуть» гаснет
  await shot('5-early-junk');
  // 6. персонаж: билды outerpedia — сеты, оружие, приоритет сабстатов (предмет сброшен, чтобы внизу не висел вердикт)
  const slug = await page.evaluate(() => { localStorage.setItem('ogc.item', 'null'); return window.OGC_DATA.chars.find((c) => c.name === 'Lambda').slug; });
  await page.goto('about:blank'); // переход, отличающийся только #, страницу не перезагружает — предмет остался бы в памяти
  await page.goto(`${url}#${slug}`, { waitUntil: 'networkidle0' });
  await shot('6-character');
  await page.close();
}
