// Разовый снимок поведения СТАРОЙ страницы (template.html до переезда на React) — исходный test/golden.json.
// Грузит старую страницу в jsdom, прогоняет детерминированный набор случаев через window.__ogc и пишет эталон,
// с которым сверялась перенесённая логика. Дальше эталон обновляет уже новая логика (task golden:update).
// Повторить сверку со старой страницей:
//   git show 6d76b1f:docs/index.html > /tmp/old.html && node scripts/golden-old.mjs /tmp/old.html
import { readFileSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { compactVerdict, internFeet, stringifyGolden } from '../test/golden-format.mjs';

const PAGE = process.argv[2] || new URL('../docs/index.html', import.meta.url);
const OUT = new URL('../test/golden.json', import.meta.url);
const SEED = 20260925;
const N_CASES = 800;

const html = readFileSync(PAGE, 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  },
});
const { window } = dom;
const ogc = window.__ogc;
if (!ogc) throw new Error('window.__ogc не появился — страница не запустилась в jsdom');
const { D, CFG, state, roster } = ogc;
const doc = window.document;

// --- детерминированный генератор
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const chance = (p) => rnd() < p;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const sample = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
};

const SLOTS = ['weapon', 'accessory', 'helmet', 'armor', 'gloves', 'shoes'];
const isArmor = (slot) => !['weapon', 'accessory'].includes(slot);
const ITEMS = { weapon: D.weapons, accessory: D.amulets };
const SUB_KEYS = D.substats.map((s) => s.key);
const withBuilds = D.chars.filter((c) => c.builds.length);
const rosters = {
  none: [],
  small: sample(withBuilds, 20).map((c) => c.id),
  big: sample(D.chars, 70).map((c) => c.id),
};
const epicMains = (kind) => {
  const out = [];
  for (const i of ITEMS[kind]) if (i.grade === 'rare' && i.star === 6) for (const m of [...i.mains, ...i.extraMains]) if (!out.includes(m)) out.push(m);
  return out;
};
const pool6 = (kind) => ITEMS[kind].filter((i) => i.star === 6 && i.grade === 'unique');

// сабстаты «как у билда»: половина случаев берёт статы из приоритета случайного билда, чтобы чаще доходить до «Оставить»
function buildishSubs() {
  const b = pick(pick(withBuilds).builds);
  const out = [];
  for (const tok of b.subs.slice(0, 4).flat()) {
    const axis = tok.replace(/%$/, '');
    const key = ['ATK', 'DEF', 'HP'].includes(axis) ? (chance(0.7) ? axis + '%' : axis) : tok;
    if (SUB_KEYS.includes(key) && !out.includes(key)) out.push(key);
  }
  return out;
}
const ROLLS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4];

function makeCase() {
  const slot = pick(SLOTS);
  const grade = chance(0.6) ? 'unique' : 'rare';
  const c = {
    slot, grade, setId: null, itemKey: null, main: null, subs: [],
    rosterOnly: chance(0.6), roster: pick(Object.keys(rosters)),
    fodder: chance(0.4), stage: chance(0.75) ? 'grow' : 'end', lv120: chance(0.3), quirks: chance(0.7),
  };
  if (isArmor(slot)) {
    const live = D.sets.filter((s) => s.users > 0);
    c.setId = chance(0.06) ? null : (chance(0.88) ? pick(live) : pick(D.sets)).id;
  } else if (grade === 'unique') {
    const item = chance(0.05) ? null : pick(pool6(slot));
    if (item) {
      c.itemKey = item.key;
      const mains = [...item.mains, ...item.extraMains];
      c.main = mains.length && !chance(0.1) ? pick(mains) : null;
    }
  } else {
    c.main = chance(0.05) ? null : pick(epicMains(slot));
  }
  // у Epic сабстатов три, у Legendary — четыре: невозможных предметов в эталон не кладём
  const max = grade === 'unique' ? 4 : 3;
  const count = chance(0.1) ? 0 : 1 + Math.floor(rnd() * max);
  const allowed = SUB_KEYS.filter((k) => k !== c.main);
  const preferred = chance(0.55) ? buildishSubs().filter((k) => allowed.includes(k)) : [];
  const keys = sample(preferred, count);
  for (const k of sample(allowed.filter((x) => !keys.includes(x)), count - keys.length)) keys.push(k);
  c.subs = sample(keys, keys.length).map((k) => [k, pick(ROLLS)]);
  return c;
}

function applyCase(c) {
  Object.assign(state, {
    tab: 'eval', slot: c.slot, grade: c.grade, setId: c.setId, itemKey: c.itemKey, main: c.main,
    subs: Object.fromEntries(c.subs), q: '', cls: '', expand: {},
    rosterOnly: c.rosterOnly, fodder: c.fodder, stage: c.stage, lv120: c.lv120, quirks: c.quirks,
  });
  roster.clear();
  for (const id of rosters[c.roster]) roster.add(id);
}

// HTML строк вердикта → формат новой логики: <b>…</b> → **…**, сущности раскрыты
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
function text(s) {
  const out = String(s ?? '').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENT[e]);
  if (/<\/?[a-z]/i.test(out)) throw new Error('В строке вердикта осталась разметка: ' + out);
  return out;
}

const cases = [];
for (let i = 0; i < N_CASES; i++) {
  const c = makeCase();
  applyCase(c);
  cases.push({ in: c, out: compactVerdict(ogc.evaluate(), { text, keepCount: CFG.keepCount }) });
}

// --- списки на панелях ввода: снимаем из DOM старой отрисовки
const num = (s) => { const m = /(\d+)/.exec(s || ''); return m ? Number(m[1]) : 0; };
const itemCount = (s) => { const tail = (s || '').split('·').pop(); const m = /(\d+) из ростера|в билдах у (\d+)/.exec(tail); return m ? Number(m[1] ?? m[2]) : 0; };
const lists = [];
function listCase(inp) {
  applyCase({ slot: inp.slot || 'gloves', grade: inp.grade || 'unique', setId: null, itemKey: null, main: null, subs: [],
    rosterOnly: inp.rosterOnly, roster: inp.roster, fodder: false, stage: 'grow', lv120: false, quirks: true });
  Object.assign(state, { q: inp.q || '', cls: inp.cls || '', tab: inp.kind === 'chars' ? 'chars' : 'eval',
    cq: inp.cq || '', cel: inp.cel || '', ccl: inp.ccl || '', cOwned: !!inp.cOwned, cAll: !!inp.cAll, charId: null });
  ogc.renderAll();
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  let out;
  if (inp.kind === 'sets') out = { live: $$('.sets .set').map((b) => [b.dataset.set, num(b.querySelector('b + span').textContent)]), dead: $$('.dead .deadchip').map((b) => b.dataset.set) };
  else if (inp.kind === 'items') out = $$('.items .item').map((b) => [b.dataset.item, itemCount(b.querySelector('div > span').textContent)]);
  else if (inp.kind === 'mains') out = $$('.chips .chip').map((b) => [b.dataset.main, num((b.querySelector('.want') || {}).textContent)]);
  else out = $$('.cgrid .ctile').map((b) => b.dataset.char);
  lists.push({ in: inp, out });
}
const scopes = [[false, 'none'], [true, 'none'], [true, 'small'], [true, 'big'], [false, 'big']];
for (const [rosterOnly, r] of scopes) for (const slot of ['helmet', 'shoes']) listCase({ kind: 'sets', slot, rosterOnly, roster: r });
const words = ['', '', 'a', 'crit', 'speed', 'caracal', 'destruction', 'zzz', 'dmg', 'heal'];
for (let i = 0; i < 30; i++) {
  const [rosterOnly, r] = pick(scopes);
  listCase({ kind: 'items', slot: pick(['weapon', 'accessory']), rosterOnly, roster: r, q: pick(words), cls: chance(0.4) ? pick(Object.keys(D.classes)) : '' });
}
for (const [rosterOnly, r] of scopes) for (const slot of ['weapon', 'accessory']) listCase({ kind: 'mains', slot, grade: 'rare', rosterOnly, roster: r });
const cwords = ['', '', '', 'stella', 'de', 'zz', 'demiurge', 'snow', 'a'];
for (let i = 0; i < 30; i++) {
  const [rosterOnly, r] = pick(scopes);
  listCase({ kind: 'chars', rosterOnly, roster: r, cq: pick(cwords), cel: chance(0.3) ? pick(Object.keys(D.elements)) : '',
    ccl: chance(0.3) ? pick(Object.keys(D.classes)) : '', cOwned: chance(0.25), cAll: chance(0.3) });
}

const dist = {};
for (const c of cases) dist[c.out.v] = (dist[c.out.v] || 0) + 1;
const feet = internFeet(cases);
const golden = { meta: { seed: SEED, source: 'template.html (до переезда на React)', dataCommit: D.meta.commit, rosters, feet }, cases, lists };
writeFileSync(OUT, stringifyGolden(golden));

console.log(`golden: ${cases.length} случаев, ${lists.length} списков →`, OUT.pathname);
console.log('вердикты:', dist);
window.close();
