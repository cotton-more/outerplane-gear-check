// Вердикт для брони: сет из билдов + полезные сабстаты под лучший билд. Фразы — ctx.t.armor (src/i18n).
import { CFG } from '../config';
import { GRADE_NAME, GRADE_PREFIX, SLOT } from '../data';
import { buildsOf, combosWith } from './builds';
import type { Ctx } from './context';
import { dedupe, rollInfo, rows, type Row } from './score';
import { maxSubs } from './subs';
import { fmtGood, namesLine } from './text';
import type { ItemInput, Verdict } from './verdict';

type Scored = Omit<Row, 'alt'>;

export function evalArmor(ctx: Ctx, s: ItemInput, res: Verdict): Verdict {
  const { idx, settings, t } = ctx;
  const A = t.armor;
  const names = (list: { c: Row['c'] }[], max?: number) => namesLine(list, t.more, max);
  const subs = s.subs;
  const legend = s.grade === 'unique';
  const nSubs = Object.keys(subs).length;
  const expected = maxSubs(s.grade);
  res.foot = A.foot(CFG.keepCount, CFG.spdKeep, CFG.spdRoll);
  const set = s.setId ? idx.SET[s.setId] : undefined;
  if (!set) {
    res.title = A.pickSet;
    res.lines = [A.pickSetHint(GRADE_PREFIX[s.grade], SLOT[s.slot].game ?? '', GRADE_NAME[s.grade])];
    return res;
  }
  const all = buildsOf(idx, (b) => combosWith(b, set.id).length);
  if (!all.length) {
    res.v = 'junk';
    res.title = A.deadTitle(set.short);
    const eff = [set.p2 && A.pieces(2, set.p2), set.p4 && A.pieces(4, set.p4)].filter(Boolean).join('; ');
    res.lines = [A.deadLine(set.name, idx.D.meta.counts.withBuilds, eff), A.deadWhy[set.short] || A.deadWhyDefault, A.deadPvp];
    return res;
  }
  const judged = all.filter((x) => x.b.subs.some((tier) => tier.length));
  const spdRoll = subs.SPD || 0;
  const qualifies = (m: Scored) => m.good != null && (m.good >= CFG.keepCount || (m.spd && m.good >= CFG.spdKeep && spdRoll >= CFG.spdRoll));
  res.qualifies = qualifies;
  const rank = (r: Scored) => (qualifies(r) ? 100 : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0) + (r.combos!.some((cb) => cb.some((p) => p.n >= 4)) ? 0.001 : 0);
  const score = (list: typeof judged) => dedupe(rows(ctx, s.grade, list, subs, new Set(), (x) => ({ combos: combosWith(x.b, set.id) })), rank);
  const scoped = score(judged.filter((x) => ctx.inScope(x.c)));
  const others = score(judged.filter((x) => !ctx.inScope(x.c)));
  const whoWears = A.whoWears(set.short);
  const othersSection = () => { if (others.length) res.sections.push({ title: t.verdict.notInRoster, rows: others, dim: true, limit: 6 }); };

  if (!scoped.length) {
    res.v = 'junk';
    res.title = A.notForRosterTitle(set.short);
    res.lines = [A.onlyOthers(names(others))];
    const good = others.filter(qualifies);
    if (good.length) {
      res.v = 'maybe'; res.title = A.goodForOthersTitle;
      res.lines.push(A.goodForOthers(names(good, 4)));
    }
    othersSection();
    return res;
  }
  if (!nSubs) {
    res.title = A.setNeeded(set.short, scoped.length);
    res.lines = [A.markSubs];
    res.sections.push({ title: whoWears, rows: scoped, limit: 12 });
    othersSection();
    return res;
  }

  const keepers = scoped.filter(qualifies);
  const best = keepers[0] || scoped[0];
  const bestGood = best.good ?? 0;
  const okList = best.parts.filter((p) => p.ok).map((p) => p.key + (p.half ? ' (½)' : '')).join(', ');
  const who = `**${best.c.name}** — ${best.b.name}`;
  const partial = nSubs < expected;
  const canStillKeep = bestGood + (expected - nSubs) >= CFG.spdKeep;
  // SPD уже среди полезных, но выпало мало сегментов: если на самом деле их больше — это «Оставить»
  const spdHint = spdRoll < CFG.spdRoll && scoped.some((m) => m.spd && (m.good ?? 0) >= CFG.spdKeep);

  if (keepers.length) {
    res.v = 'keep';
    res.title = A.keepTitle(keepers.length);
    res.lines.push(A.best(who, fmtGood(bestGood), nSubs, okList));
    if (bestGood < CFG.keepCount) res.lines.push(A.spdCarries(fmtGood(bestGood), spdRoll));
    const roll = rollInfo(t, best, nSubs);
    if (roll) res.lines.push(roll.text);
    if (best.yellow >= CFG.godYellow || (best.spd && spdRoll >= 3)) res.badge = t.verdict.topRoll;
    else if (roll && roll.level === 'high') res.badge = t.verdict.worthUpgrading;
    if (legend && nSubs === 4 && Object.values(subs).every((r) => r >= 3)) res.lines.push(A.eventQuality);
    res.sections.push({ title: t.verdict.suits, rows: keepers, limit: 12, count: keepers.length });
    const rest = scoped.filter((m) => !qualifies(m));
    if (rest.length) res.sections.push({ title: A.wrongSubs(set.short), rows: rest, collapsed: true });
    othersSection();
    return res;
  }
  if (partial && canStillKeep) {
    res.title = t.verdict.markRest(nSubs, expected);
    res.lines.push(t.verdict.soFar(fmtGood(bestGood), who));
    res.sections.push({ title: whoWears, rows: scoped, limit: 12 });
    othersSection();
    return res;
  }
  if (legend && settings.fodder && !partial) {
    res.v = 'fodder';
    res.title = A.fodderTitle;
    res.lines.push(bestGood ? A.fodderBest(who, fmtGood(bestGood), okList) : A.noneNeeded(set.short));
    res.lines.push(A.fodderWhy(SLOT[s.slot].game ?? '', set.short));
  } else {
    res.v = 'junk';
    res.title = partial ? A.junkPartialTitle : A.junkTitle;
    res.lines.push(bestGood ? A.junkBest(who, fmtGood(bestGood), okList) : A.noneNeeded(set.short));
    if (!legend && bestGood >= 2) res.lines.push(A.epicTwo);
    if (legend && !partial) res.lines.push(A.enableFodder(set.short));
  }
  if (spdHint) res.lines.push(A.checkSpd(CFG.spdRoll));
  res.sections.push({ title: whoWears, rows: scoped, collapsed: true });
  // предмет хорош для тех, кого нет в ростере — не даём разобрать молча
  if (others.some(qualifies)) {
    res.v = 'maybe';
    res.title = A.maybeTitle;
    res.lines.unshift(A.maybeOthers(names(others.filter(qualifies), 4)));
  }
  othersSection();
  return res;
}
