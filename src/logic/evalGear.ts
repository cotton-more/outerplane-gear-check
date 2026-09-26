// Вердикт для оружия и аксессуаров: у Legendary решают пассивка и main stat,
// без нужной пассивки (любой Epic, Legendary не из билдов) — только временная замена с хорошим роллом.
// Фразы — ctx.t.gear (src/i18n).
import { CFG } from '../config';
import type { GearKind } from '../data/types';
import { buildsOf, gearList, gearRef, slotMains, uniqChars, type BuildRef } from './builds';
import type { Ctx } from './context';
import { dedupe, flatMisses, rollInfo, rows, type Row } from './score';
import { dropSubs } from './subs';
import { fmtGood, namesLine } from './text';
import type { ItemInput, Verdict } from './verdict';

type Scored = Omit<Row, 'alt'>;

export function evalGear(ctx: Ctx, s: ItemInput, res: Verdict): Verdict {
  const { idx, settings, t } = ctx;
  const G = t.gear;
  const names = (list: { c: Row['c'] }[], max?: number) => namesLine(list, t.more, max);
  const subs = s.subs;
  const kind = s.slot as GearKind;
  const epic = s.grade === 'rare';
  const nSubs = Object.keys(subs).length;
  const expected = dropSubs(s.grade);
  res.foot = G.foot(CFG.tempGood, CFG.tempGood2, CFG.tempYellow);

  // кто взял бы предмет с таким main как временный: класс подходит, и билд просит этот main в этом слоте
  const stopgapFor = (main: string, classLimits: string[]) =>
    buildsOf(idx, (b, c) => (!classLimits.length || classLimits.includes(c.class)) && slotMains(b, kind).has(main));
  // «2 полезных + много жёлтых» — только для 3 сабстатов (Epic); Legendary с 4 сабстатами нужно 3 полезных.
  // Считаем по грейду, а не по числу отмеченных: иначе недовведённый Legendary проходил бы по правилу Epic.
  const tempNeed = Math.max(CFG.tempGood2, expected - 1);
  const tempOk = (m: Scored) => m.good != null && (m.good >= CFG.tempGood || (m.good >= tempNeed && m.yellow >= CFG.tempYellow));
  res.qualifies = tempOk;
  const tempRank = (r: Scored) => (tempOk(r) ? 100 : 0) + (r.good ?? 0) * 2 + (r.yellow ?? 0) * 0.1 + (r.ratio ?? 0) * 0.01;
  const stopgapRows = (list: BuildRef[]) => dedupe(rows(ctx, s.grade, list, subs, s.main), tempRank);

  // общий вердикт для временной замены (Epic или Legendary с пассивкой не из билдов)
  const judgeStopgap = (cands: Row[], what: string): boolean => {
    if (!cands.length) return false;
    if (!nSubs) {
      res.title = G.stopgapMarkTitle(cands.length);
      res.lines.push(G.stopgapMarkLine(what, CFG.tempGood, CFG.tempGood2, CFG.tempYellow));
      res.sections.push({ title: G.byMain, rows: cands, limit: 8, mainNote: s.main });
      return true;
    }
    const good = cands.filter(tempOk);
    const best = good[0] || cands[0];
    const bestGood = best.good ?? 0;
    const roll = rollInfo(t, best, nSubs, s.grade);
    const who = `**${best.c.name}** — ${best.b.name}`;
    if (good.length) {
      res.v = 'temp';
      res.title = G.tempTitle(good.length);
      res.lines.push(G.tempBest(what, who));
      if (roll) { res.lines.push(roll.text); res.roll = roll.level; }
      res.lines.push(G.tempAdvice(s.main ?? ''));
      res.sections.push({ title: t.verdict.tempFor, rows: good, limit: 12, count: good.length, mainNote: s.main });
      const rest = cands.filter((m) => !tempOk(m));
      if (rest.length) res.sections.push({ title: G.byMainWrongSubs, rows: rest, collapsed: true, mainNote: s.main });
    } else if (nSubs < expected && bestGood + (expected - nSubs) >= tempNeed) {
      res.title = t.verdict.markRest(nSubs, expected);
      res.lines.push(t.verdict.soFar(fmtGood(bestGood), who));
      res.sections.push({ title: G.byMain, rows: cands, limit: 8, mainNote: s.main });
    } else {
      res.v = 'junk';
      res.title = G.weakTitle;
      res.lines.push(G.weakLine(s.main ?? '', cands.length, who, fmtGood(bestGood)));
      if (roll) res.lines.push(roll.text);
      if (bestGood >= tempNeed) res.lines.push(G.markYellow(CFG.tempYellow));
      for (const k of flatMisses(best)) res.lines.push(t.verdict.flatHint(k));
      res.sections.push({ title: G.byMain, rows: cands, collapsed: true, mainNote: s.main });
    }
    return true;
  };

  if (epic) {
    // у Epic нет пассивки — важен main и ролл; Steel Sword/Necklace и [Settlement Support] равноценны
    if (!s.main) {
      res.title = G.epicWhichMain(kind);
      res.lines = [G.epicNoPassive(kind)];
      if (settings.stage === 'end') res.lines.push(G.endEpicNote);
      return res;
    }
    if (settings.stage === 'end') {
      res.v = 'junk'; res.title = G.endEpicTitle(kind);
      res.lines = [G.endEpicLine];
      return res;
    }
    const cands = stopgapRows(stopgapFor(s.main, []).filter((x) => ctx.inScope(x.c)));
    if (!judgeStopgap(cands, G.epicWhat(s.main, kind))) {
      res.v = 'junk'; res.title = G.mainNobodyTitle(s.main, kind);
      res.lines = [G.mainNobodyLine(s.main, ctx.scoped)];
    }
    return res;
  }

  const item = s.itemKey ? idx.ITEM[kind][s.itemKey] : undefined;
  if (!item && s.unlisted) {
    // предмета нет в данных outerpedia: пассивку не оценить — тот же путь, что у Epic (main stat + ролл)
    if (!s.main) {
      res.title = G.unlistedWhichTitle;
      res.lines = [G.unlistedWhichLine(kind)];
      return res;
    }
    if (settings.stage === 'end') {
      // «Эндгейм» держит только рекомендованное, но про новый предмет ещё неизвестно, рекомендуют ли его
      res.v = 'maybe'; res.title = G.unlistedEndTitle;
      res.lines = [G.unlistedEndLine(kind)];
      return res;
    }
    const cands = stopgapRows(stopgapFor(s.main, []).filter((x) => ctx.inScope(x.c)));
    if (!judgeStopgap(cands, G.unlistedWhat(s.main, kind))) {
      res.v = 'junk'; res.title = G.mainNobodyTitle(s.main, kind);
      res.lines = [G.mainNobodyLine(s.main, ctx.scoped)];
    }
    if (res.v === 'junk') res.lines.push(G.unknownNote);
    return res;
  }
  if (!item) {
    res.title = G.pickItem(kind);
    res.lines = [G.pickItemLine];
    const low = idx.LOW_STAR_USED.filter((i) => i.kind === kind);
    for (const i of low) {
      const who = buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === i.key)).filter((x) => ctx.inScope(x.c));
      if (who.length) res.lines.push(G.lowStar(i.name, i.star, names(who, 3)));
    }
    return res;
  }
  const noMainChoice = !item.mains.length && !item.extraMains.length;
  const all = buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === item.key));
  const scopedAll = all.filter((x) => ctx.inScope(x.c));
  const wanted = [...new Set(scopedAll.flatMap((x) => gearRef(x.b, kind, item.key).mains))];
  if (!s.main && !noMainChoice) {
    res.title = scopedAll.length ? G.neededWhichMain(uniqChars(scopedAll).length) : G.whichMain;
    res.lines = [scopedAll.length ? G.wantMains(wanted) : G.notYourBuilds];
    return res;
  }
  const main = s.main ?? '';
  const mainOkFor = (x: BuildRef) => { const m = gearRef(x.b, kind, item.key).mains; return noMainChoice || !m.length || m.includes(main); };
  const extra = (x: BuildRef) => ({ mains: gearRef(x.b, kind, item.key).mains, mainOk: mainOkFor(x) });
  const rank = (r: Scored) => (r.mainOk ? 100 : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0);
  const scoped = dedupe(rows(ctx, s.grade, scopedAll, subs, s.main, extra), rank);
  const others = dedupe(rows(ctx, s.grade, all.filter((x) => !ctx.inScope(x.c)), subs, s.main, extra), rank);
  const ok = scoped.filter((r) => r.mainOk);
  const temp = s.main && settings.stage === 'grow'
    ? stopgapRows(stopgapFor(s.main, item.classLimits).filter((x) => ctx.inScope(x.c) && !ok.some((o) => o.c.id === x.c.id)))
    : [];

  if (ok.length) {
    res.v = 'keep';
    res.qualifies = null;
    res.title = noMainChoice ? G.keepNeeded(ok.length) : G.keepMain(main, ok.length);
    res.lines.push(G.keepLine(nSubs > 0));
    if (item.irregular) res.lines.push(G.irregular);
    const roll = nSubs ? rollInfo(t, ok[0], nSubs, s.grade) : null;
    if (roll) {
      res.lines.push(roll.text);
      res.roll = roll.level;
      if (roll.level === 'high') res.badge = t.verdict.worthReforge;
      else if ((ok[0].good ?? 0) < 2) res.lines.push(G.weakReroll);
    }
    res.sections.push({ title: t.verdict.suits, rows: ok, limit: 12, count: ok.length });
    const wrong = scoped.filter((r) => !r.mainOk);
    if (wrong.length) res.sections.push({ title: G.otherMain, rows: wrong, collapsed: true });
  } else if (scoped.length) {
    // предмет в билдах, но main не тот
    res.v = 'fodder'; res.qualifies = null;
    res.title = G.fodderTitle(main);
    res.lines.push(G.fodderLine(wanted));
    const goodTemp = temp.filter(tempOk);
    if (goodTemp.length) res.lines.push(G.tempMeanwhile(goodTemp.length));
    res.sections.push({ title: G.neededOtherMain, rows: scoped, collapsed: !!goodTemp.length });
    if (goodTemp.length) res.sections.push({ title: t.verdict.tempFor, rows: goodTemp, limit: 8, mainNote: s.main });
  } else if (!judgeStopgap(temp, G.itemWhat(item.name, all.length > 0, main, kind, item.classLimits.map((c) => idx.D.classes[c]).join('/')))) {
    res.v = 'junk';
    res.title = all.length ? G.junkRosterTitle : G.junkNobodyTitle;
    res.lines.push(all.length
      ? G.onlyOthers(names(all.filter((x) => !ctx.inScope(x.c))))
      : G.nobody(item.name, settings.stage === 'grow' && s.main ? s.main : null));
    if (settings.stage === 'end' && s.main) res.lines.push(G.endNoTemp);
  }
  if (res.v !== 'keep' && res.v !== 'fodder' && others.some((r) => r.mainOk)) {
    if (res.v === 'junk') { res.v = 'maybe'; res.title = G.maybeTitle; }
    res.lines.unshift(G.othersMain(names(others.filter((r) => r.mainOk), 4)));
  }
  if (others.length) res.sections.push({ title: t.verdict.notInRoster, rows: others, dim: true, limit: 6 });
  return res;
}
