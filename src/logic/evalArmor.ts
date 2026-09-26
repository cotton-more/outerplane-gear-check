// Вердикт для брони: сет из билдов + полезные сабстаты под лучший билд. Фразы — ctx.t.armor (src/i18n).
import { CFG } from '../config';
import { FLAT, GRADE_NAME, GRADE_PREFIX, SLOT } from '../data';
import { buildsOf, combosWith } from './builds';
import type { Ctx } from './context';
import { dedupe, flatMisses, rollInfo, rows, topTokens, type Part, type Row } from './score';
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
  const yellowOf = (parts: Part[]) => parts.reduce((a, p) => a + (subs[p.key] || 1), 0);
  const full = (m: Scored) => m.parts.filter((p) => p.ok && !p.half);
  // главные статы — засчитаны целиком (не ½ и не слабый flat) и стоят на 1–2 ступени приоритета билда
  const mains = (m: Scored) => full(m).filter((p) => (p.tier ?? Infinity) < CFG.epicTopTiers);
  // Epic не исправить камнями, поэтому решают главные статы и ролл на них:
  //   три полезных — если среди них SPD или главный стат, либо ролл хороший;
  //   или два главных стата с хорошим роллом — тогда третий может быть любым
  const topTier = (m: Scored) => m.parts.some((p) => p.ok && (p.key === 'SPD' || (p.tier ?? Infinity) < CFG.epicTopTiers));
  const strong = (m: Scored) => legend || topTier(m) || m.yellow >= CFG.epicYellow;
  const twoMain = (m: Scored) => !legend && mains(m).length >= 2 && yellowOf(mains(m)) >= CFG.epicYellow;
  const qualifies = (m: Scored) => m.good != null && ((m.good >= CFG.keepCount && strong(m)) || (m.spd && m.good >= CFG.spdKeep && spdRoll >= CFG.spdRoll) || twoMain(m));
  // «Временно» у Epic: главный стат с хорошим роллом и ещё полезный, вместе 5+ жёлтых — носить, пока не выпадет вещь с недостающим
  const tempOk = (m: Scored) => !legend && mains(m).some((p) => (subs[p.key] || 1) >= CFG.epicTempRoll) && full(m).length >= 2 && yellowOf(full(m)) >= CFG.tempYellow;
  res.qualifies = qualifies;
  // сет основной, если он в первой связке билда, — дальше идут запасные варианты
  const primary = (r: Scored) => r.b.sets[0]?.some((p) => p.set === set.id) ?? false;
  // среди подходящих первыми — те, у кого сет основной; неподходящие — по совпадению статов (от лучшего зависят тексты)
  const rank = (r: Scored) => (qualifies(r) ? 100 + (primary(r) ? 10 : 0) : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0) + (r.combos!.some((cb) => cb.some((p) => p.n >= 4)) ? 0.001 : 0);
  // главные статы билда, которых на предмете нет (ось ATK/DEF/HP закрывает %-версия или сильный flat)
  const missingMains = (m: Scored) => [...new Set(topTokens(m.b, CFG.epicTopTiers)
    .map((k) => (FLAT.has(k.replace(/%$/, '')) ? k.replace(/%$/, '') + '%' : k)))]
    .filter((k) => idx.SUB[k] && !full(m).some((p) => p.key === k || p.key + '%' === k));
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
    if (bestGood < CFG.keepCount) res.lines.push(twoMain(best) ? A.twoMainCarries(mains(best).map((p) => p.key), yellowOf(mains(best))) : A.spdCarries(fmtGood(bestGood), spdRoll));
    const roll = rollInfo(t, best, nSubs);
    if (roll) res.lines.push(roll.text);
    if (best.yellow >= CFG.godYellow || (best.spd && spdRoll >= 3)) res.badge = t.verdict.topRoll;
    else if (roll && roll.level === 'high') res.badge = t.verdict.worthUpgrading;
    if (legend && nSubs === 4 && Object.values(subs).every((r) => r >= 3)) res.lines.push(A.eventQuality);
    // Legendary с одним лишним сабстатом: Transistone (Individual) меняет только его, остальные закрепляются
    const extra = best.parts.filter((p) => !p.ok);
    if (legend && nSubs === 4 && extra.length === 1) res.lines.push(A.rerollOne(extra[0].key));
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
  const tempers = scoped.filter(tempOk).sort((a, b) => Number(primary(b)) - Number(primary(a)));
  if (!legend && !partial && tempers.length) {
    // один главный стат с хорошим роллом: носить можно, но это замена до вещи с недостающим главным статом
    const tb = tempers[0];
    res.v = 'temp';
    res.qualifies = tempOk;
    res.title = A.tempTitle(tempers.length);
    res.lines.push(A.tempWhy(`**${tb.c.name}** — ${tb.b.name}`, mains(tb).map((p) => p.key), missingMains(tb)));
    const roll = rollInfo(t, tb, nSubs);
    if (roll) res.lines.push(roll.text);
    res.lines.push(A.tempFew);
    for (const k of flatMisses(tb)) res.lines.push(t.verdict.flatHint(k));
    res.sections.push({ title: t.verdict.tempFor, rows: tempers, limit: 12, count: tempers.length });
    const rest = scoped.filter((m) => !tempOk(m));
    if (rest.length) res.sections.push({ title: A.wrongSubs(set.short), rows: rest, collapsed: true });
    othersSection();
    return res;
  }
  if (!legend && !partial && bestGood >= CFG.keepCount) {
    // все сабстаты Epic полезны, но слабые: ни SPD, ни стата с верхних ступеней, ролл ниже порога
    const top = [...new Set(['SPD', ...topTokens(best.b, CFG.epicTopTiers)])];
    res.v = 'junk';
    res.title = A.weakEpicTitle;
    res.lines.push(A.weakEpic(who, nSubs, top, best.yellow, 3 * nSubs), A.weakEpicKeepIf(top, CFG.epicYellow));
  } else if (legend && settings.fodder && !partial) {
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
  for (const k of flatMisses(best)) res.lines.push(t.verdict.flatHint(k));
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
