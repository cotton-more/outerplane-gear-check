// Вердикт для оружия и аксессуаров: у Legendary решают пассивка и main stat,
// без нужной пассивки (любой Epic, Legendary не из билдов) — только временная замена с хорошим роллом.
import { CFG } from '../config';
import { SLOT } from '../data';
import type { GearKind } from '../data/types';
import { buildsOf, gearList, gearRef, slotMains, uniqChars, type BuildRef } from './builds';
import type { Ctx } from './context';
import { dedupe, rollInfo, rows, type Row } from './score';
import { maxSubs } from './subs';
import { fmtGood, namesLine, personsDat, personsGen } from './text';
import type { ItemInput, Verdict } from './verdict';

type Scored = Omit<Row, 'alt'>;

export function evalGear(ctx: Ctx, s: ItemInput, res: Verdict): Verdict {
  const { idx, settings } = ctx;
  const subs = s.subs;
  const kind = s.slot as GearKind;
  const sl = SLOT[kind];
  const epic = s.grade === 'rare';
  const nSubs = Object.keys(subs).length;
  const expected = maxSubs(s.grade);
  res.foot = `Оружие и аксессуары: ценность Legendary — в уникальной пассивке и правильном main stat; сабстаты правят Precise Craft и Transistone. Временная замена (без нужной пассивки) стоит места, только если ролл хороший: ${CFG.tempGood} полезных сабстата или ${CFG.tempGood2} полезных с ${CFG.tempYellow}+ жёлтыми сегментами на них.`;

  // кто взял бы предмет с таким main как временный: класс подходит, и билд просит этот main в этом слоте
  const stopgapFor = (main: string, classLimits: string[]) =>
    buildsOf(idx, (b, c) => (!classLimits.length || classLimits.includes(c.class)) && slotMains(b, kind).has(main));
  // «2 полезных + много жёлтых» — только для 3 сабстатов (Epic); Legendary с 4 сабстатами нужно 3 полезных.
  // Считаем по грейду, а не по числу отмеченных: иначе недовведённый Legendary проходил бы по правилу Epic.
  const tempNeed = Math.max(CFG.tempGood2, expected - 1);
  const tempOk = (m: Scored) => m.good != null && (m.good >= CFG.tempGood || (m.good >= tempNeed && m.yellow >= CFG.tempYellow));
  res.qualifies = tempOk;
  const tempRank = (r: Scored) => (tempOk(r) ? 100 : 0) + (r.good ?? 0) * 2 + (r.yellow ?? 0) * 0.1 + (r.ratio ?? 0) * 0.01;
  const stopgapRows = (list: BuildRef[], excluded: Set<string>) => dedupe(rows(ctx, s.grade, list, subs, excluded), tempRank);

  // общий вердикт для временной замены (Epic или Legendary с пассивкой не из билдов)
  const judgeStopgap = (cands: Row[], what: string): boolean => {
    if (!cands.length) return false;
    if (!nSubs) {
      res.title = `Как временная замена подойдёт ${personsDat(cands.length)} — отметь сабстаты`;
      res.lines.push(`${what} Держать стоит только с хорошим роллом: ${CFG.tempGood} полезных сабстата или ${CFG.tempGood2} полезных с ${CFG.tempYellow}+ жёлтыми сегментами на них.`);
      res.sections.push({ title: 'Кому подошёл бы по main stat', rows: cands, limit: 8, mainNote: s.main });
      return true;
    }
    const good = cands.filter(tempOk);
    const best = good[0] || cands[0];
    const bestGood = best.good ?? 0;
    const roll = rollInfo(best, nSubs);
    const who = `**${best.c.name}** — ${best.b.name}`;
    if (good.length) {
      res.v = 'temp';
      res.title = `Временно — хороший ролл для ${personsGen(good.length)}`;
      res.lines.push(`${what} Лучше всего: ${who}.`);
      if (roll) res.lines.push(roll.text);
      res.lines.push(`Носи, пока у персонажа нет рекомендованного Legendary. Держи 1–2 лучших экземпляра на main ${s.main}; остальные такие — в разбор.`);
      if (roll && roll.level === 'high') res.badge = 'Стоит прокачать';
      res.sections.push({ title: 'Кому пойдёт временно', rows: good, limit: 12, count: good.length, mainNote: s.main });
      const rest = cands.filter((m) => !tempOk(m));
      if (rest.length) res.sections.push({ title: 'Подошёл бы по main stat, но сабстаты не те', rows: rest, collapsed: true, mainNote: s.main });
    } else if (nSubs < expected && bestGood + (expected - nSubs) >= tempNeed) {
      res.title = `Отмечено ${nSubs} из ${expected} — отметь остальные`;
      res.lines.push(`Пока полезных ${fmtGood(bestGood)}. Лучший кандидат: ${who}.`);
      res.sections.push({ title: 'Кому подошёл бы по main stat', rows: cands, limit: 8, mainNote: s.main });
    } else {
      res.v = 'junk';
      res.title = 'Разбирай — слабый ролл';
      res.lines.push(`Main ${s.main} подошёл бы ${personsDat(cands.length)}, но сабстаты слабые: даже лучшему варианту (${who}) полезны только ${fmtGood(bestGood)}.`);
      if (roll) res.lines.push(roll.text);
      if (bestGood >= tempNeed) res.lines.push(`Отметь жёлтые сегменты, если их больше одного: при ${CFG.tempYellow}+ на полезных статах такой предмет стоит оставить.`);
      res.sections.push({ title: 'Кому подошёл бы по main stat', rows: cands, collapsed: true, mainNote: s.main });
    }
    return true;
  };

  if (epic) {
    // у Epic нет пассивки — важен main и ролл; Steel Sword/Necklace и [Settlement Support] равноценны
    if (!s.main) {
      res.title = `Epic ${sl.ru}: какой main stat?`;
      res.lines = [`У Epic ${sl.ruGen} нет уникальной пассивки: это временная замена, пока нет Legendary. Решают main stat (цифры на кнопках — скольким персонажам он нужен) и ролл сабстатов.`];
      if (settings.stage === 'end') res.lines.push('Этап «Эндгейм»: Epic без пассивки идёт в разбор.');
      return res;
    }
    if (settings.stage === 'end') {
      res.v = 'junk'; res.title = `Разбирай — Epic ${sl.ru} без пассивки`;
      res.lines = ['Этап «Эндгейм»: в билдах outerpedia только Legendary с уникальной пассивкой. Если у кого-то слот пустой — переключи этап на «Развитие» в настройках.'];
      return res;
    }
    const cands = stopgapRows(stopgapFor(s.main, []).filter((x) => ctx.inScope(x.c)), new Set([s.main]));
    if (!judgeStopgap(cands, `Пассивки нет, но main ${s.main} — тот, что просят в слоте ${sl.ruGen}.`)) {
      res.v = 'junk'; res.title = `Разбирай — ${s.main} на ${sl.ruPrep} никому не нужен`;
      res.lines = [`Ни один билд${ctx.scoped ? ' твоих персонажей' : ''} не просит main ${s.main} в этом слоте.`];
    }
    return res;
  }

  const item = s.itemKey ? idx.ITEM[kind][s.itemKey] : undefined;
  if (!item && s.unlisted) {
    // предмета нет в данных outerpedia: пассивку не оценить — тот же путь, что у Epic (main stat + ролл)
    if (!s.main) {
      res.title = `Нет в списке: какой main stat?`;
      res.lines = [`Предмета нет в данных outerpedia, поэтому пассивку оценить нельзя. Выбери main stat — посчитаю, годится ли ${sl.ru} как временная замена (цифры на кнопках — скольким персонажам он нужен).`];
      return res;
    }
    const unknownNote = 'Если предмет новый — сверься с outerpedia после обновления данных: его пассивку могут взять в билды.';
    if (settings.stage === 'end') {
      // «Эндгейм» держит только рекомендованное, но про новый предмет ещё неизвестно, рекомендуют ли его
      res.v = 'maybe'; res.title = 'Спорно — предмета ещё нет в данных outerpedia';
      res.lines = [`Этап «Эндгейм» держит только рекомендованное, а этого ${sl.ruGen} в билдах outerpedia пока нет — неизвестно, возьмут ли его пассивку. Не разбирай, пока не обновятся данные.`];
      return res;
    }
    const cands = stopgapRows(stopgapFor(s.main, []).filter((x) => ctx.inScope(x.c)), new Set([s.main]));
    if (!judgeStopgap(cands, `Предмета нет в данных outerpedia — оцениваю как временную замену: main ${s.main} просят в слоте ${sl.ruGen}.`)) {
      res.v = 'junk'; res.title = `Разбирай — ${s.main} на ${sl.ruPrep} никому не нужен`;
      res.lines = [`Ни один билд${ctx.scoped ? ' твоих персонажей' : ''} не просит main ${s.main} в этом слоте.`];
    }
    if (res.v === 'junk') res.lines.push(unknownNote);
    return res;
  }
  if (!item) {
    res.title = `Выбери ${sl.ru}`;
    res.lines = ['Найди по названию или пассивке — на английском, как в игре. Нет в списке — нажми «нет в списке», оценю по main stat.'];
    const low = idx.LOW_STAR_USED.filter((i) => i.kind === kind);
    for (const i of low) {
      const who = buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === i.key)).filter((x) => ctx.inScope(x.c));
      if (who.length) res.lines.push(`Всё ниже 6★ — в разбор, кроме **${i.name}** ${i.star}★: его носит ${namesLine(who, 3)}.`);
    }
    return res;
  }
  const noMainChoice = !item.mains.length && !item.extraMains.length;
  const all = buildsOf(idx, (b) => gearList(b, kind).some((g) => g.key === item.key));
  const scopedAll = all.filter((x) => ctx.inScope(x.c));
  const wanted = [...new Set(scopedAll.flatMap((x) => gearRef(x.b, kind, item.key).mains))];
  if (!s.main && !noMainChoice) {
    res.title = scopedAll.length ? `Нужен ${personsDat(uniqChars(scopedAll).length)} — какой main stat?` : 'Какой main stat?';
    res.lines = scopedAll.length
      ? [`Для этой пассивки билды просят main **${wanted.join(', ')}**.`]
      : ['Пассивка не из билдов твоих персонажей — по main stat и роллу посчитаю, годится ли предмет как временная замена.'];
    return res;
  }
  const main = s.main ?? '';
  const excluded = new Set(s.main ? [s.main] : []);
  const mainOkFor = (x: BuildRef) => { const m = gearRef(x.b, kind, item.key).mains; return noMainChoice || !m.length || m.includes(main); };
  const extra = (x: BuildRef) => ({ mains: gearRef(x.b, kind, item.key).mains, mainOk: mainOkFor(x) });
  const rank = (r: Scored) => (r.mainOk ? 100 : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0);
  const scoped = dedupe(rows(ctx, s.grade, scopedAll, subs, excluded, extra), rank);
  const others = dedupe(rows(ctx, s.grade, all.filter((x) => !ctx.inScope(x.c)), subs, excluded, extra), rank);
  const ok = scoped.filter((r) => r.mainOk);
  const temp = s.main && settings.stage === 'grow'
    ? stopgapRows(stopgapFor(s.main, item.classLimits).filter((x) => ctx.inScope(x.c) && !ok.some((o) => o.c.id === x.c.id)), excluded)
    : [];

  if (ok.length) {
    res.v = 'keep';
    res.qualifies = null;
    res.title = noMainChoice ? `Оставляй — нужен ${personsDat(ok.length)}` : `Оставляй — ${s.main} подходит ${personsDat(ok.length)}`;
    res.lines.push(`Уникальная пассивка + правильный main stat — это главное. ${nSubs ? 'Сабстаты правятся Precise Craft и Transistone.' : 'Отметь сабстаты, чтобы увидеть качество ролла.'}`);
    if (item.irregular) res.lines.push('Irregular-предмет — первый кандидат на Transistone.');
    const roll = nSubs ? rollInfo(ok[0], nSubs) : null;
    if (roll) {
      res.lines.push(roll.text);
      if (roll.level === 'high') res.badge = 'Стоит прокачать';
      else if ((ok[0].good ?? 0) < 2) res.lines.push('Сабстаты слабые — кандидат на реролл, если под эту пассивку нет экземпляра лучше.');
    }
    res.sections.push({ title: 'Кому подходит', rows: ok, limit: 12, count: ok.length });
    const wrong = scoped.filter((r) => !r.mainOk);
    if (wrong.length) res.sections.push({ title: 'Нужен, но с другим main stat', rows: wrong, collapsed: true });
  } else if (scoped.length) {
    // предмет в билдах, но main не тот
    res.v = 'fodder'; res.qualifies = null;
    res.title = `Фоддер — ${s.main} для этой пассивки не берут`;
    res.lines.push(`Билды просят main **${wanted.join(' / ')}**, а main stat не перебрасывается. Гайд outerpedia советует такие не разбирать: это фоддер для Breakthrough такого же предмета с правильным main (до T4 — 4 копии).`);
    const goodTemp = temp.filter(tempOk);
    if (goodTemp.length) res.lines.push(`А пока — хорошая временная замена для ${personsGen(goodTemp.length)} (список ниже).`);
    res.sections.push({ title: 'Кому нужен (с другим main)', rows: scoped, collapsed: !!goodTemp.length });
    if (goodTemp.length) res.sections.push({ title: 'Кому пойдёт временно', rows: goodTemp, limit: 8, mainNote: s.main });
  } else if (!judgeStopgap(temp, `**${item.name}** ${all.length ? 'не стоит в билдах твоих персонажей' : 'не стоит ни в одном билде outerpedia'}, но main ${main} — тот, что просят в слоте ${sl.ruGen}${item.classLimits.length ? ` у класса ${item.classLimits.map((c) => idx.D.classes[c]).join('/')}` : ''}.`)) {
    res.v = 'junk';
    res.title = all.length ? 'Разбирай — не нужен твоим персонажам' : 'Разбирай — предмет никому не нужен';
    res.lines.push(all.length
      ? `Рекомендуют только тем, кого нет в ростере: ${namesLine(all.filter((x) => !ctx.inScope(x.c)))}.`
      : `**${item.name}** не стоит ни в одном билде outerpedia${settings.stage === 'grow' && s.main ? `, а main ${s.main} в этом слоте никому из подходящего класса не нужен` : ''}.`);
    if (settings.stage === 'end' && s.main) res.lines.push('Этап «Эндгейм»: временные замены не учитываются.');
  }
  if (res.v !== 'keep' && res.v !== 'fodder' && others.some((r) => r.mainOk)) {
    if (res.v === 'junk') { res.v = 'maybe'; res.title = 'Твоим не нужен, но предмет хороший'; }
    res.lines.unshift(`С этим main stat его берут персонажи не из ростера: ${namesLine(others.filter((r) => r.mainOk), 4)}.`);
  }
  if (others.length) res.sections.push({ title: 'Не из ростера', rows: others, dim: true, limit: 6 });
  return res;
}
