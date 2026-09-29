// Скорость пула экипировки (logic/pool, GEARPOOL): не в CI — цифры для решения, считать ли на телефоне сразу.
//   node scripts/bench-pool.mjs
// Ростер 60 персонажей с билдами, у каждого пул по 1–3 вещи на слот (броня — в основном сеты его связок);
// замеры: один вердикт (исходы у всех 60), путь кубика (ещё 10 вердиктов), «Кому надеть?» по всем 95 с билдами.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const load = (p) => server.ssrLoadModule(p);
const { createIndex } = await load('/src/data/index.ts');
const { makeCtx } = await load('/src/logic/context.ts');
const { poolView, outcomeFor } = await load('/src/logic/pool.ts');
const { variantsOf } = await load('/src/logic/variants.ts');

const D = JSON.parse(readFileSync(new URL('../test/fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
let x = 7;
const rnd = () => (x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const STATS = ['DEF%', 'ATK%', 'HP%', 'CHC', 'CHD', 'SPD', 'EFF', 'RES', 'ATK', 'DEF', 'HP'];
const subs = () => { const s = {}; while (Object.keys(s).length < 4) s[pick(STATS)] = 1 + Math.floor(rnd() * 4); return s; };

const withBuilds = D.chars.filter((c) => c.builds.length);
const roster = withBuilds.slice(0, 60);
const pieces = {}, pools = {};
let seq = 0;
for (const c of roster) {
  const sets = [...new Set(variantsOf(idx, c).flatMap((v) => v.b.sets[0].map((p) => p.set)))];
  const ids = [];
  for (const slot of ['weapon', 'accessory', 'helmet', 'armor', 'gloves', 'shoes']) {
    for (let k = 1 + Math.floor(rnd() * 3); k > 0; k--) {
      const id = 'p' + ++seq;
      const armor = slot !== 'weapon' && slot !== 'accessory';
      const ref = armor ? null : pick(slot === 'weapon' ? c.builds[0].weapons : c.builds[0].amulets);
      const lit = subs();
      pieces[id] = {
        id, slot, grade: 'unique', setId: armor ? (rnd() < 0.8 ? pick(sets) : pick(D.sets).id) : null,
        itemKey: ref?.key ?? null, main: armor ? null : ref?.mains[0] ?? 'ATK%', yellow: lit, lit, bt: pick([null, 0, 4]), at: '',
      };
      ids.push(id);
    }
  }
  pools[c.id] = ids;
}
const ctx = makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((c) => c.id)));
const speed = D.sets.find((s) => s.short === 'Speed').id;
const item = (i) => ({ slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, subs: { 'DEF%': 2, CHC: 2, SPD: 1 + (i % 3), CHD: 1 } });

const time = (label, f, runs = 5) => {
  f(); // прогрев
  const ms = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); f(); ms.push(performance.now() - t); }
  ms.sort((a, z) => a - z);
  console.log(`${label}: медиана ${ms[Math.floor(runs / 2)].toFixed(1)} мс (мин ${ms[0].toFixed(1)}, макс ${ms[runs - 1].toFixed(1)})`);
};

console.log(`ростер ${roster.length}, вещей ${seq}, вариантов у ростера ${roster.reduce((n, c) => n + variantsOf(idx, c).length, 0)}`);
// новый вид пула на каждый вердикт — как после любой правки хранилища; ценности вещей запоминаются на ctx
time('вид пула: все 60 персонажей', () => { const v = poolView(ctx, { pieces, pools }); for (const c of roster) v.of(c.id); });
time('один вердикт: исходы у всех 60', () => { const v = poolView(ctx, { pieces, pools }); for (const c of roster) outcomeFor(ctx, v, c.id, item(0)); });
time('кубик: ещё 10 вердиктов', () => { const v = poolView(ctx, { pieces, pools }); for (let i = 1; i <= 10; i++) for (const c of roster) outcomeFor(ctx, v, c.id, item(i)); }, 3);
time(`«Кому надеть?»: все ${withBuilds.length} с билдами`, () => { const v = poolView(ctx, { pieces, pools }); for (const c of withBuilds) outcomeFor(ctx, v, c.id, item(0)); });
await server.close();
