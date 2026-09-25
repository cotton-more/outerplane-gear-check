// Вердикт для брони: сет из билдов + полезные сабстаты под лучший билд.
import { CFG } from '../config';
import { DEAD_SET_WHY, GRADE_NAME, GRADE_PREFIX, SLOT } from '../data';
import { buildsOf, combosWith } from './builds';
import type { Ctx } from './context';
import { dedupe, rollInfo, rows, type Row } from './score';
import { maxSubs } from './subs';
import { fmtGood, namesLine, personsDat } from './text';
import type { ItemInput, Verdict } from './verdict';

type Scored = Omit<Row, 'alt'>;

export function evalArmor(ctx: Ctx, s: ItemInput, res: Verdict): Verdict {
  const { idx, settings } = ctx;
  const subs = s.subs;
  const legend = s.grade === 'unique';
  const nSubs = Object.keys(subs).length;
  const expected = maxSubs(s.grade);
  res.foot = `Броня: полезный сабстат — из 1–3 ступени приоритета билда (4-я — за ½, SPD — на любой; слабый flat — за ½ или не считается). Оставить — ${CFG.keepCount}+ полезных под лучший билд или ${CFG.spdKeep} с SPD от ${CFG.spdRoll} жёлтых сегментов.`;
  const set = s.setId ? idx.SET[s.setId] : undefined;
  if (!set) {
    res.title = 'Выбери сет';
    res.lines = [`Сет написан в названии после «of»: **${GRADE_PREFIX[s.grade]} ${SLOT[s.slot].game} of Speed** → ${GRADE_NAME[s.grade]}, Speed Set.`];
    return res;
  }
  const all = buildsOf(idx, (b) => combosWith(b, set.id).length);
  if (!all.length) {
    res.v = 'junk';
    res.title = `Скорее разбирай — ${set.short} Set нет ни в одном билде`;
    const eff = [set.p2 && `2 шт.: ${set.p2}`, set.p4 && `4 шт.: ${set.p4}`].filter(Boolean).join('; ');
    res.lines = [
      `outerpedia не ставит **${set.name}** ни одному из ${idx.D.meta.counts.withBuilds} персонажей с билдами${eff ? ` (на T4 — ${eff})` : ''}.`,
      DEAD_SET_WHY[set.short] || 'Эффект ситуативный: в каждом билде есть сет, который даёт больше.',
      'Если сам играешь от этого сета (например, в PvP) — оставь экземпляры с хорошими сабстатами. Список обновится сам, когда сет появится в билдах outerpedia.',
    ];
    return res;
  }
  const judged = all.filter((x) => x.b.subs.some((t) => t.length));
  const spdRoll = subs.SPD || 0;
  const qualifies = (m: Scored) => m.good != null && (m.good >= CFG.keepCount || (m.spd && m.good >= CFG.spdKeep && spdRoll >= CFG.spdRoll));
  res.qualifies = qualifies;
  const rank = (r: Scored) => (qualifies(r) ? 100 : 0) + (r.good ?? 0) * 2 + (r.ratio ?? 0) + (r.combos!.some((cb) => cb.some((p) => p.n >= 4)) ? 0.001 : 0);
  const score = (list: typeof judged) => dedupe(rows(ctx, s.grade, list, subs, new Set(), (x) => ({ combos: combosWith(x.b, set.id) })), rank);
  const scoped = score(judged.filter((x) => ctx.inScope(x.c)));
  const others = score(judged.filter((x) => !ctx.inScope(x.c)));
  const whoWears = `Кто носит ${set.short} Set`;
  const othersSection = () => { if (others.length) res.sections.push({ title: 'Не из ростера', rows: others, dim: true, limit: 6 }); };

  if (!scoped.length) {
    res.v = 'junk';
    res.title = `Разбирай — ${set.short} Set не нужен твоим персонажам`;
    res.lines = [`Сет стоит только в билдах тех, кого нет в ростере: ${namesLine(others)}.`];
    const good = others.filter(qualifies);
    if (good.length) {
      res.v = 'maybe'; res.title = 'Не для твоего ростера — но предмет хороший';
      res.lines.push(`Для ${namesLine(good, 4)} это «Оставить». Если планируешь их качать — не разбирай.`);
    }
    othersSection();
    return res;
  }
  if (!nSubs) {
    res.title = `${set.short} Set нужен ${personsDat(scoped.length)}`;
    res.lines = ['Отметь сабстаты предмета — посчитаю, кому он подходит.'];
    res.sections.push({ title: whoWears, rows: scoped, limit: 12 });
    othersSection();
    return res;
  }

  const keepers = scoped.filter(qualifies);
  const best = keepers[0] || scoped[0];
  const bestGood = best.good ?? 0;
  const okList = best.parts.filter((p) => p.ok).map((p) => p.key + (p.half ? ' (½)' : ''));
  const who = `**${best.c.name}** — ${best.b.name}`;
  const partial = nSubs < expected;
  const canStillKeep = bestGood + (expected - nSubs) >= CFG.spdKeep;
  // SPD уже среди полезных, но выпало мало сегментов: если на самом деле их больше — это «Оставить»
  const spdHint = spdRoll < CFG.spdRoll && scoped.some((m) => m.spd && (m.good ?? 0) >= CFG.spdKeep);

  if (keepers.length) {
    res.v = 'keep';
    res.title = `Оставляй — подходит ${personsDat(keepers.length)}`;
    res.lines.push(`Лучше всего: ${who}. Полезны ${fmtGood(bestGood)} из ${nSubs}: ${okList.join(', ')}.`);
    if (bestGood < CFG.keepCount) res.lines.push(`Полезных всего ${fmtGood(bestGood)}, но SPD с ${spdRoll} жёлтыми сегментами вытягивает.`);
    const roll = rollInfo(best, nSubs);
    if (roll) res.lines.push(roll.text);
    if (best.yellow >= CFG.godYellow || (best.spd && spdRoll >= 3)) res.badge = 'Топ-ролл';
    else if (roll && roll.level === 'high') res.badge = 'Стоит прокачать';
    if (legend && nSubs === 4 && Object.values(subs).every((r) => r >= 3)) res.lines.push('Все 4 сабстата с 3 жёлтыми сегментами (3×4) — ивентовое качество.');
    res.sections.push({ title: 'Кому подходит', rows: keepers, limit: 12, count: keepers.length });
    const rest = scoped.filter((m) => !qualifies(m));
    if (rest.length) res.sections.push({ title: `Носят ${set.short} Set, но сабстаты не те`, rows: rest, collapsed: true });
    othersSection();
    return res;
  }
  if (partial && canStillKeep) {
    res.title = `Отмечено ${nSubs} из ${expected} — отметь остальные`;
    res.lines.push(`Пока полезных ${fmtGood(bestGood)}. Лучший кандидат: ${who}.`);
    res.sections.push({ title: whoWears, rows: scoped, limit: 12 });
    othersSection();
    return res;
  }
  if (legend && settings.fodder && !partial) {
    res.v = 'fodder';
    res.title = 'Фоддер — сабстаты не дотянули';
    res.lines.push(bestGood ? `Лучший вариант: ${who}, полезны только ${fmtGood(bestGood)}: ${okList.join(', ')}.` : `Ни один сабстат не нужен билдам с ${set.short} Set.`);
    res.lines.push(`Для Breakthrough и реролла Transistone (Total) сабстаты не важны — годится любой Legendary ${SLOT[s.slot].game} ${set.short} Set. Держи не больше 4 на сет и слот: столько нужно, чтобы довести один предмет до T4.`);
  } else {
    res.v = 'junk';
    res.title = partial ? 'Разбирай — даже с последним сабстатом не вытянет' : 'Разбирай — сабстаты мимо';
    res.lines.push(bestGood ? `Даже лучшему варианту (${who}) полезны только ${fmtGood(bestGood)}: ${okList.join(', ')}.` : `Ни один сабстат не нужен билдам с ${set.short} Set.`);
    if (!legend && bestGood >= 2) res.lines.push('Для Epic двух полезных без хорошего SPD мало: Transistone на Epic не тратят, а в Breakthrough для Legendary он не годится.');
    if (legend && !partial) res.lines.push(`Копишь фоддер для T4 ${set.short} Set? Включи это в «Настройках оценки» — такие предметы станут «Фоддер».`);
  }
  if (spdHint) res.lines.push(`Проверь SPD: если у него ${CFG.spdRoll}+ жёлтых сегмента — отметь, это уже «Оставить».`);
  res.sections.push({ title: whoWears, rows: scoped, collapsed: true });
  // предмет хорош для тех, кого нет в ростере — не даём разобрать молча
  if (others.some(qualifies)) {
    res.v = 'maybe';
    res.title = 'Твоим не подходит, но предмет хороший';
    res.lines.unshift(`Для персонажей не из ростера это «Оставить»: ${namesLine(others.filter(qualifies), 4)}. Если планируешь их качать — не разбирай.`);
  }
  othersSection();
  return res;
}
