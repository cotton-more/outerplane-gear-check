// Вердикт для брони: сет из билдов + полезные сабстаты под лучший билд. Фразы — ctx.t.armor (src/i18n).
import { CFG } from '@/game/config';
import { GRADE_NAME, GRADE_PREFIX, SLOT, subLabel } from '@/game/data';
import { buildsOf, combosWith } from '@/game/build/builds';
import type { Ctx } from '@/game/context';
import { itemMains, subForms } from '@/game/item/mains';
import { dedupe, flatMisses, rows, topTokens, type Row } from '@/game/build/score';
import { dropSubs } from '@/game/item/subs';
import { fmtGood, namesLine } from '@/game/text';
import { armorBar, type Scored } from './bar';
import type { Verdict } from './verdict';
import type { ItemInput } from '@/game/item/item';

export function evalArmor(ctx: Ctx, s: ItemInput, res: Verdict): Verdict {
  const { idx, t } = ctx;
  const A = t.armor;
  const names = (list: { c: Row['c'] }[], max?: number) => namesLine(list, t.more, max);
  const subs = s.subs;
  const legend = s.grade === 'unique';
  const nSubs = Object.keys(subs).length;
  const expected = dropSubs(s.grade);
  res.foot = A.foot(CFG.keepCount, CFG.spdKeep, CFG.spdRoll);
  const set = s.setId ? idx.SET[s.setId] : undefined;
  const im = itemMains(idx, s); // main брони фиксирован сетом, слотом и грейдом
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
  const { yellowOf, full, mains, twoMain, qualifies, tempOk } = armorBar(ctx, s);
  res.qualifies = qualifies;
  // сет основной, если он в первой связке билда, — дальше идут запасные варианты
  const primary = (r: Scored) => r.b.sets[0]?.some((p) => p.set === set.id) ?? false;
  // среди подходящих первыми — те, у кого сет основной; неподходящие — по совпадению статов (от лучшего зависят тексты)
  const rank = (r: Scored) => (qualifies(r) ? 100 + (primary(r) ? 10 : 0) : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0) + (r.combos!.some((cb) => cb.some((p) => p.n >= 4)) ? 0.001 : 0);
  // главные статы билда, которых на предмете нет, — тем сабстатом, что ещё может выпасть (как пунктир в цепочке):
  // у ATK/DEF/HP — %-версия, а если её на этом слоте не бывает (HP% у шлема — это его main), — flat, если он персонажу
  // что-то даёт. Параметр закрыт, если на нём уже есть засчитанный целиком сабстат любого вида
  const missingMains = (m: Scored) => [...new Set(topTokens(m.b, CFG.epicTopTiers, im, m.useless).flatMap((tok) => {
    const forms = subForms(tok);
    const open = forms.filter((k) => idx.SUB[k] && !im.blocked.has(k) && !m.useless.includes(k));
    if (!open.length || full(m).some((p) => forms.includes(p.key))) return [];
    const pct = tok.replace(/%$/, '') + '%';
    return [open.includes(pct) ? pct : open[0]];
  }))];
  const score = (list: typeof judged) => dedupe(rows(ctx, s.grade, list, subs, im, (x) => ({ combos: combosWith(x.b, set.id) })), rank);
  const scoped = score(judged.filter((x) => ctx.inScope(x.c)));
  const others = score(judged.filter((x) => ctx.outScope(x.c)));
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
  const okList = best.parts.filter((p) => p.ok).map((p) => subLabel(p.key) + (p.half ? ' (½)' : '')).join(', ');
  const who = `**${best.c.name}** — ${best.b.name}`;
  const partial = nSubs < expected;
  const canStillKeep = bestGood + (expected - nSubs) >= CFG.spdKeep;
  // SPD уже среди полезных, но выпало мало сегментов: если на самом деле их больше — это «Оставить»
  const spdHint = spdRoll < CFG.spdRoll && scoped.some((m) => m.spd && (m.good ?? 0) >= CFG.spdKeep);

  if (keepers.length) {
    res.v = 'keep';
    res.title = A.keepTitle(keepers.length);
    res.lines.push(A.best(who, fmtGood(bestGood), nSubs, okList));
    if (bestGood < CFG.keepCount) res.lines.push(twoMain(best) ? A.twoMainCarries(mains(best).map((p) => subLabel(p.key)), yellowOf(mains(best))) : A.spdCarries(fmtGood(bestGood), spdRoll));
    // Legendary с одним лишним сабстатом: Transistone (Individual) меняет только его, остальные закрепляются
    const extra = best.parts.filter((p) => !p.ok);
    if (legend && nSubs === 4 && extra.length === 1) res.lines.push(A.rerollOne(subLabel(extra[0].key)));
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
    res.lines.push(A.tempWhy(`**${tb.c.name}** — ${tb.b.name}`, mains(tb).map((p) => subLabel(p.key)), missingMains(tb).map(subLabel)));
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
    const top = [...new Set(['SPD', ...topTokens(best.b, CFG.epicTopTiers, im, best.useless)])].map(subLabel);
    res.v = 'junk';
    res.title = A.weakEpicTitle;
    res.lines.push(A.weakEpic(who, nSubs, top, best.yellow, 3 * nSubs), A.weakEpicKeepIf(top, CFG.epicYellow));
  } else {
    res.v = 'junk';
    res.title = partial ? A.junkPartialTitle : A.junkTitle;
    res.lines.push(bestGood ? A.junkBest(who, fmtGood(bestGood), okList) : A.noneNeeded(set.short));
    if (!legend && bestGood >= 2) res.lines.push(A.epicTwo);
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
