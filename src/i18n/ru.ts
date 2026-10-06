// Русские тексты: вердикты (logic/) и интерфейс (components/). en.ts — тот же набор ключей (тип Texts):
// TypeScript не даст пропустить перевод. **так** — жирным (shared/ui/Rich.tsx).
import type { GearKind } from '@/game/data/types';
import type { StepText } from '@/tour/types';

const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const persons = (n: number) => `${n} ${plural(n, 'персонаж', 'персонажа', 'персонажей')}`;
const personsGen = (n: number) => `${n} ${plural(n, 'персонажа', 'персонажей', 'персонажей')}`;
const personsDat = (n: number) => `${n} ${plural(n, 'персонажу', 'персонажам', 'персонажам')}`;

// оружие и аксессуар в падежах: именительный, родительный, предложный
const NOUN: Record<GearKind, [string, string, string]> = { weapon: ['оружие', 'оружия', 'оружии'], accessory: ['аксессуар', 'аксессуара', 'аксессуаре'] };
const nom = (k: GearKind) => NOUN[k][0];
const gen = (k: GearKind) => NOUN[k][1];
const prep = (k: GearKind) => NOUN[k][2];
const Gear = (k: GearKind) => (k === 'weapon' ? 'Оружие' : 'Аксессуар');
// дробь для среднего: одна цифра после запятой, без «,0»
const dec = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
// слот в нужной форме (GEARPOOL): шлем — м. р., броня — ж. р., оружие — ср. р., перчатки и ботинки — мн. ч.
type G = 'm' | 'f' | 'n' | 'p';
const GENUS: Record<string, G> = { weapon: 'n', accessory: 'm', helmet: 'm', armor: 'f', gloves: 'p', shoes: 'p' };
const by = (slot: string, m: string, f: string, n: string, p: string) => ({ m, f, n, p })[GENUS[slot] ?? 'm'];
const NOM: Record<string, string> = { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броня', gloves: 'перчатки', shoes: 'ботинки' };
const GEN: Record<string, string> = { weapon: 'оружия', accessory: 'аксессуара', helmet: 'шлема', armor: 'брони', gloves: 'перчаток', shoes: 'ботинок' };
const ACC: Record<string, string> = { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броню', gloves: 'перчатки', shoes: 'ботинки' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// «A и B», «A, B и C»
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}` : xs.join(''));
// вещь по имени: броня — «Speed-ботинки», оружие и аксессуар — «Оружие Caracal»
const named = (slot: string, what: string) => (slot === 'weapon' || slot === 'accessory' ? `${cap(NOM[slot])} ${what}` : `${what}-${NOM[slot]}`);
// «в броню, перчатки или ботинки»
const inSlots = (slots: string[]) => (slots.length ? 'в ' + (slots.length > 1 ? `${slots.slice(0, -1).map((x) => ACC[x]).join(', ')} или ${ACC[slots[slots.length - 1]]}` : ACC[slots[0]]) : '');

export const ru = {
  // общее для вердиктов и интерфейса
  persons,
  more: (n: number) => ` и ещё ${n}`,
  // «A, B или C»; длиннее max — «A, B, C или ещё 2»
  orList: (xs: string[], max: number) =>
    xs.length <= 1 ? xs.join('') : xs.length <= max ? `${xs.slice(0, -1).join(', ')} или ${xs[xs.length - 1]}` : `${xs.slice(0, max).join(', ')} или ещё ${xs.length - max}`,
  anyClass: 'любой класс',

  // --- вердикт: общее для брони и оружия
  verdict: {
    notInRoster: 'Не из ростера',
    suits: 'Кому подходит',
    tempFor: 'Кому пойдёт временно',
    markRest: (n: number, of: number) => `Отмечено ${n} из ${of} — отметь остальные`,
    soFar: (good: string, who: string) => `Пока полезных ${good}. Лучший кандидат: ${who}.`,
    flatHint: (key: string) => `Проверь ${key}: без знака % это flat, а билдам нужен ${key}% — flat им почти ничего не даёт. Если на предмете ${key}%, выбери ${key}%.`,
  },

  // --- «Прокачка»: что вкладывать в предмет после вердикта
  plan: {
    title: 'Прокачка',
    enhance: '**Enhance** до +10 — сразу: растит main stat.',
    btArmorLegend: (piece: string, set: string) =>
      `**Breakthrough** до T4: +5% к main stat за ступень и сильнее бонус сета. Материал — любой Legendary ${piece} ${set} Set (тот самый фоддер) или Armor Glunite; одна вещь — одна ступень.`,
    btArmorEpic: (piece: string, set: string) =>
      `**Breakthrough** до T4: +5% к main stat за ступень и сильнее бонус сета. Материал — такая же вещь: Epic ${piece} ${set} Set (сабстаты не важны) или Glunite. Пока эта не на T4, такие Epic из разбора не выбрасывай — нужно 4 штуки.`,
    btGear: (name: string) =>
      `**Breakthrough** до T4 — обязательно: к T4 усиливается пассивка, и +20% к main stat. Материал — копии ${name} (годятся и с другим main stat) или Refined Glunite.`,
    noTransistone: '**Transistone** — не трать: по гайду outerpedia их тратят только на Irregular и красную броню.',
    tempNoInvest: '**Breakthrough** — не вкладывай: вещь на замену, её сменит нужная.',
    // Epic оружие и аксессуар «Временно» (.x/0060 SPEC 4.3): name — Steel Sword или Steel Necklace
    btTempEpic: (name: string) => `**Breakthrough** — только вещами из разбора: любой ${name} с любым main — ступень. Glunite не трать: вещь на замену.`,
    fodderArmor: (piece: string, set: string) =>
      `**Не прокачивай** — это материал: одна вещь — одна ступень Breakthrough для Legendary ${piece} ${set} Set, которую оставляешь. Исключение — если перебросишь ей сабстаты Transistone (Total).`,
    fodderGear: (name: string) =>
      `**Не прокачивай** — это материал: одна копия — одна ступень Breakthrough для ${name} с нужным main stat.`,
    junkEpicArmor: (piece: string, set: string) =>
      `Есть Epic ${piece} ${set} Set с вердиктом «Оставить», ещё не на T4? Эта вещь — ступень его Breakthrough: годится такая же вещь (Epic, тот же сет и слот) с любыми сабстатами. Нет — в разбор.`,
  },

  // --- вердикт: броня
  armor: {
    foot: (keep: number, spdKeep: number, spdRoll: number) =>
      `Броня: полезный сабстат — из 1–3 ступени приоритета билда (4-я — за ½, SPD — на любой; слабый flat — за ½ или не считается). Оставить — ${keep}+ полезных под лучший билд или ${spdKeep} с SPD от ${spdRoll} сегментов.`,
    pickSet: 'Выбери сет',
    pickSetHint: (prefix: string, piece: string, grade: string) => `Сет написан в названии после «of»: **${prefix} ${piece} of Speed** → ${grade}, Speed Set.`,
    deadTitle: (set: string) => `Скорее разбирай — ${set} Set нет ни в одном билде`,
    pieces: (n: number, effect: string) => `${n} шт.: ${effect}`,
    deadLine: (setName: string, withBuilds: number, effect: string) =>
      `outerpedia не ставит **${setName}** ни одному из ${withBuilds} персонажей с билдами${effect ? ` (на T4 — ${effect})` : ''}.`,
    // почему сет не берут — только там, где причина проверена; остальным хватает общего текста
    deadWhy: {
      'Critical Hit': 'Шанс крита набирают и без сета — quirks, сабстаты CHC, аксессуары с main CHC, — а выше 100% он сгорает; у части DPS в заметках outerpedia прямо сказано «CHC до 50%». Поэтому место под сет отдают Critical Strike (CHD), Penetration или Speed. Разработчики сами называют Critical Hit сетом для начала игры.',
      'Lifesteal': 'Вампиризм 7–12% слабее того, что дают Swiftness, Immunity или Life — их и берут сустейн-билды outerpedia.',
    } as Record<string, string>,
    deadWhyDefault: 'Эффект ситуативный: в каждом билде есть сет, который даёт больше.',
    deadPvp: 'Если сам играешь от этого сета (например, в PvP) — оставь экземпляры с хорошими сабстатами. Список обновится сам, когда сет появится в билдах outerpedia.',
    whoWears: (set: string) => `Кто носит ${set} Set`,
    notForRosterTitle: (set: string) => `Разбирай — ${set} Set не нужен твоим персонажам`,
    onlyOthers: (names: string) => `Сет стоит только в билдах тех, кого нет в ростере: ${names}.`,
    goodForOthersTitle: 'Не для твоего ростера — но предмет хороший',
    goodForOthers: (names: string) => `Для ${names} это «Оставить». Если планируешь их качать — не разбирай.`,
    setNeeded: (set: string, n: number) => `${set} Set нужен ${personsDat(n)}`,
    markSubs: 'Отметь сабстаты предмета — посчитаю, кому он подходит.',
    keepTitle: (n: number) => `Оставляй — подходит ${personsDat(n)}`,
    best: (who: string, good: string, n: number, list: string) => `Лучше всего: ${who}. Полезны ${good} из ${n}: ${list}.`,
    spdCarries: (good: string, roll: number) => `Полезных всего ${good}, но SPD с ${roll} сегментами вытягивает.`,
    twoMainCarries: (keys: string[], yellow: number) =>
      `Полезных меньше трёх, но оба главных стата — ${keys.join(' и ')} — с ${yellow} сегментами: такой Epic стоит держать.`,
    tempTitle: (n: number) => `Временно — пойдёт ${personsDat(n)}, пока нет лучше`,
    tempWhy: (who: string, has: string[], missing: string[]) =>
      `Лучше всего: ${who}. Главный стат есть (${has.join(', ')}), ${missing.length ? `но нет ${missing.join(' / ')}: носи, пока не выпадет вещь с ${missing.join(' / ')}` : 'но второго главного нет: носи, пока не выпадет вещь лучше'}.`,
    tempFew: 'Держи 1–2 такие вещи на сет и слот, остальные — в разбор.',
    rerollOne: (key: string) =>
      `Лишний сабстат — ${key}: его одного можно перебросить Transistone (Individual), остальные три закрепятся. По гайду outerpedia Transistone тратят на Irregular-предметы и красную броню.`,
    weakEpicTitle: 'Разбирай — полезные, но слабые',
    weakEpic: (who: string, n: number, top: string[], yellow: number, max: number) =>
      `Все ${n} сабстата полезны для ${who}, но это нижние ступени приоритета: главного (${top.join(', ')}) нет, сегментов — ${yellow} из ${max}. Вкладываться в такой Epic невыгодно: Transistone на Epic не тратят (гайд outerpedia), а в Breakthrough для Legendary он не годится.`,
    weakEpicKeepIf: (top: string[], yellow: number) => `Оставить стоило бы с ${top.join(' или ')} либо с ${yellow}+ сегментами на полезных статах.`,
    wrongSubs: (set: string) => `Носят ${set} Set, но сабстаты не те`,
    noneNeeded: (set: string) => `Ни один сабстат не нужен билдам с ${set} Set.`,
    junkPartialTitle: 'Разбирай — даже с последним сабстатом не вытянет',
    junkTitle: 'Разбирай — сабстаты мимо',
    junkBest: (who: string, good: string, list: string) => `Даже лучшему варианту (${who}) полезны только ${good}: ${list}.`,
    epicTwo: 'Для Epic двух полезных мало, если это не два главных стата с хорошим роллом: Transistone на Epic не тратят, а в Breakthrough для Legendary он не годится.',
    checkSpd: (roll: number) => `Проверь SPD: если у него ${roll}+ сегмента — отметь, это уже «Оставить».`,
    maybeTitle: 'Твоим не подходит, но предмет хороший',
    maybeOthers: (names: string) => `Для персонажей не из ростера это «Оставить»: ${names}. Если планируешь их качать — не разбирай.`,
  },

  // --- вердикт: оружие и аксессуары
  gear: {
    foot: (good: number, good2: number, yellow: number) =>
      `Оружие и аксессуары: ценность Legendary — в уникальной пассивке и правильном main stat; сабстаты правят Precise Craft и Transistone. Временная замена (без нужной пассивки) стоит места, только если ролл хороший: ${good} полезных сабстата или ${good2} полезных с ${yellow}+ сегментами на них.`,
    stopgapMarkTitle: (n: number) => `Как временная замена подойдёт ${personsDat(n)} — отметь сабстаты`,
    stopgapMarkLine: (what: string, good: number, good2: number, yellow: number) =>
      `${what} Держать стоит только с хорошим роллом: ${good} полезных сабстата или ${good2} полезных с ${yellow}+ сегментами на них.`,
    byMain: 'Кому подошёл бы по main stat',
    tempTitle: (n: number) => `Временно — хороший ролл для ${personsGen(n)}`,
    tempBest: (what: string, who: string) => `${what} Лучше всего: ${who}.`,
    tempAdvice: (main: string, who: string, items: string) =>
      `Носи, пока у ${who} нет рекомендованного Legendary${items ? ` — ${items}` : ''}. Держи 1–2 лучших экземпляра на main ${main}; остальные такие — в разбор.`,
    byMainWrongSubs: 'Подошёл бы по main stat, но сабстаты не те',
    weakTitle: 'Разбирай — слабый ролл',
    weakLine: (main: string, n: number, who: string, good: string) =>
      `Main ${main} подошёл бы ${personsDat(n)}, но сабстаты слабые: даже лучшему варианту (${who}) полезны только ${good}.`,
    markYellow: (yellow: number) => `Отметь сегменты, если их больше одного: при ${yellow}+ на полезных статах такой предмет стоит оставить.`,
    epicWhichMain: (k: GearKind) => `Epic ${nom(k)}: какой main stat?`,
    epicNoPassive: (k: GearKind) =>
      `У Epic ${gen(k)} нет уникальной пассивки: это временная замена, пока нет Legendary. Решают main stat (ярче — тот, что кому-то нужен в этом слоте) и ролл сабстатов.`,
    endEpicNote: 'Этап «Эндгейм»: Epic без пассивки идёт в разбор.',
    endEpicTitle: (k: GearKind) => `Разбирай — Epic ${nom(k)} без пассивки`,
    endEpicLine: 'Этап «Эндгейм»: в билдах outerpedia только Legendary с уникальной пассивкой. Если у кого-то слот пустой — переключи этап на «Развитие» в настройках.',
    epicWhat: (main: string, k: GearKind) => `Пассивки нет, но main ${main} — тот, что просят в слоте ${gen(k)}.`,
    mainNobodyTitle: (main: string, k: GearKind) => `Разбирай — ${main} на ${prep(k)} никому не нужен`,
    mainNobodyLine: (main: string, scoped: boolean) => `Ни один билд${scoped ? ' твоих персонажей' : ''} не просит main ${main} в этом слоте.`,
    unlistedWhichTitle: 'Нет в списке: какой main stat?',
    unlistedWhichLine: (k: GearKind) =>
      `Предмета нет в данных outerpedia, поэтому пассивку оценить нельзя. Отметь main stat — посчитаю, годится ли ${nom(k)} как временная замена (ярче — тот, что кому-то нужен в этом слоте).`,
    unknownNote: 'Если предмет новый — сверься с outerpedia после обновления данных: его пассивку могут взять в билды.',
    unlistedEndTitle: 'Спорно — предмета ещё нет в данных outerpedia',
    unlistedEndLine: (k: GearKind) =>
      `Этап «Эндгейм» держит только рекомендованное, а этого ${gen(k)} в билдах outerpedia пока нет — неизвестно, возьмут ли его пассивку. Не разбирай, пока не обновятся данные.`,
    unlistedWhat: (main: string, k: GearKind) => `Предмета нет в данных outerpedia — оцениваю как временную замену: main ${main} просят в слоте ${gen(k)}.`,
    pickItem: (k: GearKind) => `Выбери ${nom(k)}`,
    pickItemLine: 'Найди по названию или пассивке — на английском, как в игре. Нет в списке — нажми «нет в списке», оценю по main stat.',
    lowStar: (name: string, star: number, names: string) => `Всё ниже 6★ — в разбор, кроме **${name}** ${star}★: его носит ${names}.`,
    neededWhichMain: (n: number) => `Нужен ${personsDat(n)} — какой main stat?`,
    whichMain: 'Какой main stat?',
    wantMains: (mains: string[]) => `Для этой пассивки билды просят main **${mains.join(', ')}**.`,
    notYourBuilds: 'Пассивка не из билдов твоих персонажей — по main stat и роллу посчитаю, годится ли предмет как временная замена.',
    keepNeeded: (n: number) => `Оставляй — нужен ${personsDat(n)}`,
    keepMain: (main: string, n: number) => `Оставляй — ${main} подходит ${personsDat(n)}`,
    keepLine: (hasSubs: boolean) =>
      `Уникальная пассивка + правильный main stat — это главное. ${hasSubs ? 'Сабстаты правятся Precise Craft и Transistone.' : 'Отметь сабстаты, чтобы увидеть качество ролла.'}`,
    irregular: 'Irregular-предмет — первый кандидат на Transistone.',
    weakReroll: 'Сабстаты слабые — кандидат на реролл, если под эту пассивку нет экземпляра лучше.',
    otherMain: 'Нужен, но с другим main stat',
    fodderTitle: (main: string) => `Фоддер — ${main} для этой пассивки не берут`,
    fodderLine: (mains: string[]) =>
      `Билды просят main **${mains.join(' / ')}**, а main stat не перебрасывается. Гайд outerpedia советует такие не разбирать: это фоддер для Breakthrough такого же предмета с правильным main (до T4 — 4 копии).`,
    tempMeanwhile: (n: number) => `А пока — хорошая временная замена для ${personsGen(n)} (список ниже).`,
    neededOtherMain: 'Кому нужен (с другим main)',
    itemWhat: (name: string, inBuilds: boolean, main: string, k: GearKind, classes: string) =>
      `**${name}** ${inBuilds ? 'не стоит в билдах твоих персонажей' : 'не стоит ни в одном билде outerpedia'}, но main ${main} — тот, что просят в слоте ${gen(k)}${classes ? ` у класса ${classes}` : ''}.`,
    junkRosterTitle: 'Разбирай — не нужен твоим персонажам',
    junkNobodyTitle: 'Разбирай — предмет никому не нужен',
    onlyOthers: (names: string) => `Рекомендуют только тем, кого нет в ростере: ${names}.`,
    nobody: (name: string, main: string | null) =>
      `**${name}** не стоит ни в одном билде outerpedia${main ? `, а main ${main} в этом слоте никому из подходящего класса не нужен` : ''}.`,
    endNoTemp: 'Этап «Эндгейм»: временные замены не учитываются.',
    maybeTitle: 'Твоим не нужен, но предмет хороший',
    othersMain: (names: string) => `С этим main stat его берут персонажи не из ростера: ${names}.`,
  },

  // --- вердикт по «статам + сетам» (.x/0085 TEXTS.md, согласовано 2026-10-06): штамп — про оцениваемую вещь, причина —
  // раньше имени (на 280px длинное имя режется, а не причина). pts — очки формулы («2,5»), part — «Speed ×2»
  fit: {
    pts: (x: number) => String(Math.round(x * 100) / 100).replace('.', ','),
    // вещь во фразе: «Speed-ботинки»
    piece: (set: string, slot: string) => `${set}-${NOM[slot]}`,
    wearEmpty: (name: string) => `Оставляй — надень на ${name}`,
    wearBetter: (name: string) => `Оставляй — лучше, чем на ${name}`,
    tempEmpty: (name: string) => `Временно — надень на ${name}, пока нет лучше`,
    tempBetter: (name: string) => `Временно — лучше, чем на ${name}, пока нет лучше`,
    gain: (name: string, pts: string) => `${name} станет сильнее на ${pts} очк.`,
    parts: (on: string[], off: string[]) => [on.length ? `включится: ${on.join(', ')}` : '', off.length ? `выключится: ${off.join(', ')}` : ''].filter(Boolean).join(' · '),
    alsoWear: (name: string, pieces: string[]) => `Вместе с ней надень из вещей ${name}: ${pieces.join(', ')}.`,
    keepBest: (set: string, slot: string, name: string, temp = false) => `${temp ? 'Временно' : 'Оставляй'} — ${by(slot, 'лучший', 'лучшая', 'лучшее', 'лучшие')} ${set}-${NOM[slot]} у ${name}`,
    keepWait: (name: string, set: string) => `Пока не надевай: держи для ${name} — подойдёт, когда соберётся ${set}.`,
    keepT4: (part: string) => `Сделай Breakthrough до T4 — без него ${part} не включится.`,
    keepStats: (name: string, temp = false) => `${temp ? 'Временно' : 'Оставляй'} — по статам сильнее всего у ${name}`,
    keepStatsWhy: (set: string, name: string) => `${set} не из билдов ${name}, но в этом слоте ничего сильнее нет.`,
    btNow: (slot: string, name: string) => `Фоддер — Breakthrough для ${GEN[slot]} ${name}`,
    btNowWhy: (slot: string, name: string) => `Сделай сейчас: ${NOM[slot]} ${name} ещё не на T4. Одна вещь — одна ступень.`,
    reserve: (set: string, slot: string, name: string) => `Фоддер — запас для ${set}-${GEN[slot]} ${name}`,
    reserveWhy: (name: string, set: string, slot: string) =>
      `У ${name} начат ${set}, а ${set}-${GEN[slot]} нет. ${by(slot, 'Придёт сильный — этот пойдёт ему', 'Придёт сильная — эта пойдёт ей', 'Придёт сильное — это пойдёт ему', 'Придут сильные — эти пойдут им')} в Breakthrough.`,
    reserveItem: (item: string, name: string) => `Фоддер — запас для ${item} ${name}`,
    reserveItemWhy: (name: string, item: string, mains: string) => `Билды ${name} просят ${item} с ${mains}, а у ${name} его нет. Придёт такой — эта пойдёт ему в Breakthrough.`,
    feed: (set: string, slot: string, name: string) => `${by(slot, 'Слабый', 'Слабая', 'Слабое', 'Слабые')} ${set}-${NOM[slot]} из запаса ${name} — в Breakthrough этой.`,
    feedItem: (item: string, name: string) => `Слабый ${item} из запаса ${name} — в Breakthrough этой.`,
    quietBetter: (name: string, pts: string, stats: string[]) => `На ${name} сейчас хуже (+${pts} очк.), но и эта слабая — годная будет с ${andList(stats)}.`,
    quietEmpty: (name: string, slot: string, stats: string[]) => `У ${name} нет ${GEN[slot]} — эта слабая, годная будет с ${andList(stats)}.`,
    junkBy: (names: string[]) => `Разбирай — уже не хуже у ${names.length > 2 ? `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}` : names.join(' и ')}`,
    // чип героя в «Сейчас на персонажах» и на карточке
    chipGain: (pts: string) => `+${pts} очк.`,
    chipKeep: 'держи',
    chipRank: (slot: string) => by(slot, 'рекомендованный', 'рекомендованная', 'рекомендованное', 'рекомендованные'),
    // «Надень» по рангу: пассивка важнее сабстатов (§3 п. 3)
    rankUp: (name: string) => `Этот предмет рекомендуют билды ${name}, надетый — нет: пассивка важнее сабстатов.`,
    // «Кому надеть?»: строка героя (pts null — прироста нет: герой найден по имени)
    rowEquip: (pts: string | null) => (pts ? `Надеть — +${pts} очк.` : 'Надеть'),
    rowReplace: (slot: string, pts: string | null) => (pts ? `Заменить ${slot} — +${pts} очк.` : `Заменить ${slot}`),
    rowOn: (part: string) => ` · включит ${part}`,
    rowNote: 'Здесь — кому вещь сейчас даст больше всего. Другого героя найди по имени: «Надеть» запишет её на нём.',
    // тост после «Надеть»: лишнее в пуле убрано (PLAN Д7)
    pruned: (name: string) => `Лишнее убрано — ${name} это больше не нужно.`,
    // почему пул держит вещь (список вещей героя)
    why: { worn: 'надета', best: (set: string) => `лучший ${set}`, bestT4: (set: string) => `лучший ${set} на T4`, stats: 'по статам', reserve: 'в запасе' },
    unneeded: 'больше не нужна',
    // «Отложить для X» (решение владельца 2026-10-06): вещь в пул героя без отметки «надета»
    stash: (name: string) => `Отложить для ${name}`,
    stashed: (name: string, slot: string) => `Отложено для ${name}: ${NOM[slot]}.`,
    chipReserve: 'запас',
    date: (at: string) => (at ? `${at.slice(8, 10)}.${at.slice(5, 7)}` : ''),
    // отложенная вещь, которую называет вердикт: как найти её в игре
    stashedOne: (slot: string, piece: string, subs: string, date: string) =>
      `Это ${piece} · ${subs}, ${by(slot, 'отложен', 'отложена', 'отложено', 'отложены')}${date ? ' ' + date : ''}.`,
    // похоже, оценивают ту же отложенную вещь ещё раз
    same: (slot: string, piece: string, name: string, date: string) =>
      `Похоже, это ${piece}, ${by(slot, 'отложенный', 'отложенная', 'отложенное', 'отложенные')} для ${name}${date ? ' ' + date : ''}. Если это ${by(slot, 'он', 'она', 'оно', 'они')} — ничего не делай.`,
  },

  // --- интерфейс
  ui: {
    noData: 'Нет данных. Собери страницу:',
    close: 'Закрыть',
    gotIt: 'Понятно',
    copy: 'Скопировать',
    copied: 'Скопировано',
    // шапка и вкладки
    tagline: 'Outerplane · что оставить, что разобрать',
    sections: 'Разделы',
    tabEval: 'Оценка предмета',
    tabChars: 'Персонажи',
    // плашки; updateNotice — только когда вышли новые данные, не на каждую правку приложения (app/usePwa)
    updateNotice: 'Вышли новые данные outerpedia — обнови, чтобы видеть свежие билды.',
    updateAction: 'Обновить',
    desktopModeNotice: 'Браузер открыл страницу в режиме «Версия для ПК» — я подстроил масштаб. Если что-то выглядит странно, выключи этот режим: меню ⋮ → «Версия для ПК».',
    // «Ещё» (app/shell/More): переходы (на узком экране), действия, настройки, данные; последней строкой — фраза VA Games
    more: 'Ещё',
    moreSettings: 'Настройки',
    moreEval: 'Оценка',
    moreData: 'Данные',
    backup: 'Резервная копия',
    about: 'О приложении',
    // «О приложении»: откуда данные, их версия, как обновить, сборка, лицензии
    aboutData: 'Данные:',
    aboutGameVersion: 'версия игры',
    aboutSnapshot: 'снимок от',
    aboutCounts: (chars: number, withBuilds: number, builds: number) => `${persons(chars)}, с билдами ${withBuilds}, билдов ${builds}.`,
    aboutUpdatePwa: 'Новые данные outerpedia — плашка «Обновить»; улучшения приложения ставятся сами при следующем запуске.',
    // пока ждёт обновление только приложения — вместо aboutUpdatePwa, с кнопкой updateAction
    updateReady: 'Готова новая версия.',
    aboutUpdateSingle: 'Обновить данные:',
    aboutUpdateSingleWhere: 'в папке проекта.',
    rights: 'This content is an unofficial fan creation. All related IP rights belong to VA Games Co., Ltd. Неофициальный фан-проект: все права на игру принадлежат VA Games Co., Ltd., билды — работа авторов outerpedia. Инструмент не связан ни с издателем, ни с outerpedia.',
    licenses: 'Лицензии (MIT)',
    licenseWhat: { outerpedia: 'outerpedia — рекомендации по билдам, игровые таблицы, формула flat/%', react: 'React', tabler: 'Tabler Icons — значки статов, слотов, сетов, стихий и классов' },
    installApp: 'Установить как приложение',
    aboutBuild: (date: string, hash: string, dirty: boolean) => `Сборка приложения: ${date} · ${hash}${dirty ? ' + незакоммиченные правки' : ''}`,
    iosMore: 'На iPhone и iPad: в Safari «Поделиться» → «На экран „Домой“» — будет работать как приложение и без сети.',
    language: 'Язык',
    icons: 'Значки',
    iconsOwn: 'свои',
    iconsGame: 'из игры',
    // панель ввода
    slot: 'Слот',
    gradeGroup: 'Грейд: Etheric — Legendary, Steel — Epic',
    pickSet: 'Выбрать сет',
    unlisted: 'Нет в списке',
    findGear: (k: GearKind) => `${Gear(k)} — найти`,
    resetItem: 'Следующий предмет',
    enterCode: 'Ввести код',
    help: 'Справка',
    rosterOnly: 'только мои персонажи',
    rosterOnlyEmpty: ' — отметь их во вкладке «Персонажи»',
    hkSlot: 'слот',
    hkGrade: 'грейд',
    hkReset: 'следующий',
    setSheet: 'Сет — в названии после «of»',
    legendaryGear: (k: GearKind) => `Legendary ${nom(k)}`,
    mainEpic: (k: GearKind) => `Main stat · Epic ${nom(k)}`,
    mainUnlisted: 'Main stat · нет в списке',
    codeSheet: 'Код предмета',
    replaceSub: (k: string) => `Заменить ${k}`,
    addFourth: '4-й сабстат',
    fourthSheet: 'Какой 4-й сабстат?',
    levelSheet: (k: string) => `${k} — сколько сегментов?`, // окно уровня после нажатия в сетке
    // настройки оценки
    settingsNow: (end: boolean, lv120: boolean, quirks: boolean) =>
      [end ? 'эндгейм' : 'развитие', lv120 ? 'lv 120' : 'lv 100', quirks ? 'Quirks' : 'без Quirks'],
    stageGroup: 'Этап аккаунта',
    stage: 'Этап:',
    stageGrow: 'Развитие — держу временные замены',
    stageEnd: 'Эндгейм — только рекомендованное',
    levelGroup: 'Уровень персонажей',
    level: 'Уровень персонажей:',
    quirks: 'Quirks прокачаны',
    quirksNote: '(Base → Quirk: бонусы статов по элементу и классу)',
    flatNote: 'Уровень и Quirks влияют только на сравнение flat и % у ATK/DEF/HP: %-сабстат умножает собственную базу персонажа (уровень + эволюции + flat-бонусы Quirks), а flat прибавляет фиксированное число. Чем выше база, тем выгоднее %.',
    // окна выбора
    itemSearch: 'Название или пассивка: Caracal…',
    unlistedLink: 'нет в списке →',
    noPassive: 'без пассивки',
    inRoster: (n: number) => `${n} из ростера`,
    inBuilds: (n: number) => `в билдах у ${n}`,
    notInBuilds: 'нет в билдах',
    nothingFound: (cls: boolean) => `Ничего не нашлось. Проверь написание${cls ? ' или сними фильтр класса' : ''}.`,
    unlistedButton: 'Нет в списке — оценить по main stat',
    classVersions: 'У классовых версий одно имя — класс видно по суффиксу пассивки: Aggression — Striker, Determination — Defender, Precision — Ranger, Mystery — Mage, Blessing — Healer.',
    fixedOnly: 'Только у фиксированных копий (ивенты, Dimensional Supply)',
    wanted: 'нужен',
    wantedNote: (scoped: boolean, fixed: boolean) => `«нужен» — что просят билды${scoped ? ' твоих персонажей' : ''} для этой пассивки${fixed ? '; пунктиром — только у фиксированных копий' : ''}.`,
    demandNote: (scoped: boolean, k: GearKind) => `Цифра — скольким${scoped ? ' твоим' : ''} персонажам этот main нужен в слоте ${gen(k)}.`,
    setDemandNote: (scoped: boolean, withBuilds: number) => `Цифра — скольким${scoped ? ' твоим' : ''} персонажам нужен сет${scoped ? '' : ` (из ${persons(withBuilds)} с билдами)`}.`,
    deadSets: 'Нет ни в одном билде outerpedia — обычно в разбор:',
    perSegment: (step: string) => ` · +${step} за сегмент`,
    subNote: 'Flat ATK/DEF/HP подписаны тоньше: их ценность зависит от базы персонажа. Сегменты — в строке стата: все, что горят в игре, 1–6.',
    // строки сабстатов
    subReplace: (k: string) => `${k} — заменить`,
    subMoveTitle: (k: string, row: number) => `${k} стоит в строке ${row}: переедет сюда, а та строка освободится`,
    subMoveNote: 'Цифра у стата — строка, где он уже стоит: выберешь его — переедет сюда, а та строка освободится.',
    subYellow: (k: string) => `Сегменты ${k}`,
    segAfter: '5–6 — после Reforge',
    segCap: (max: number) => `Больше ${max} сегментов на вещи не бывает — проверь сабстаты.`,
    subRemove: (k: string) => `Убрать ${k}`,
    chainTail: (k: string) => `${k} есть на вещи, но в приоритете дальше четвёртого места — в счёт не идёт`,
    // экипировка: что надето в билдах (features/gear/model/gear, features/gear/model/vs; features/gear/ui/VsSection, EquipSheet, chars/BuildGear)
    slotNames: { weapon: 'Оружие', accessory: 'Аксессуар', helmet: 'Шлем', armor: 'Броня', gloves: 'Перчатки', shoes: 'Ботинки' } as Record<string, string>,
    slotAcc: { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броню', gloves: 'перчатки', shoes: 'ботинки' } as Record<string, string>,
    slotNom: { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броня', gloves: 'перчатки', shoes: 'ботинки' } as Record<string, string>,
    vsTitle: 'Сейчас на персонажах',
    vsWorn: (grade: string, bt: number | null) => `сейчас: ${grade}, Breakthrough ${bt === null ? 'не указан' : bt === 0 ? 'T0–T3' : 'T' + bt}`,
    equipTo: (name: string) => `Надеть на ${name}`,
    replaceOn: (slot: string, name: string) => `Заменить ${slot} ${name}`,
    // режим героя: кнопка есть только чтобы записать надетое (вещь сама ему ничего не даёт)
    equipAsWorn: 'Носит в игре — нажми, запишем как надетое',
    // над «Следующий» при вводе надетого: после «Надеть» форма — на этом слоте (slotNames)
    nextWear: (slot: string) => `Дальше: ${slot}`,
    equipPick: 'Надеть на…',
    equipSheet: 'Кому надеть?',
    equipSearch: 'Имя персонажа',
    equipNone: 'Ни одному билду она ничего не даст. Найди персонажа по имени — «Надеть» запишет её как надетую.',
    equipNoneQ: 'Никому с таким именем она ничего не даст.',
    orOther: (name: string, build: string) => `или — ${name} · ${build} ▸`,
    // вторая кнопка заменяет вещь героя (Р7): slot — в винительном («шлем», «броню», «перчатки»)
    orReplace: (slot: string, name: string, build: string) => `или — заменить ${slot} ${name} · ${build} ▸`,
    removedFrom: (name: string) => `Убрано у ${name}.`,
    // карточка персонажа (GEARPOOL)
    byStats: 'По статам',
    // то же имя внутри фразы («Идёт в …», «в …») — в кавычках, как в остальных строках
    byStatsQ: '«По статам»',
    cdBest: (build: string, n: number, m: number) => `Лучше всего собран: ${build} · сет ${n} из ${m}`,
    cdClosest: (build: string, n: number, m: number) => `Ближе всех к сборке: ${build} · сет ${n} из ${m}`,
    cdAlso: (list: string) => `Собраны ещё: ${list}`,
    cdStats: (name: string) => `По статам — ни один билд пока не начат: вещи разложены по цепочке ${name}.`,
    slotOffSet: 'не из сетов билда',
    slotAlsoIn: (builds: string) => `и в ${builds}`,
    incidental: (name: string) => `этого сета нет в билдах ${name}, но бонус считается`,
    bonusRow: (set: string, n: number, tier: string, bonus: string) => `${set} ×${n} · ${tier} — ${bonus}`,
    markBt: ' · отметь Breakthrough',
    partT4: (set: string, k: number, n: number) => `${set} — ${k} из ${n} · бонус ×2 только на T4`,
    missing: (set: string, k: number, slots: string[], t4: boolean) => `Не хватает: ${set} — ещё ${k}, ${inSlots(slots)}${t4 ? ', на T4' : ''}.`,
    missingStats: (set: string, build: string) => `Не хватает: вещи ${set} Set — первая же начнёт билд ${build}, а эти встанут в него статами.`,
    poolTitle: (name: string, n: number) => `Вещи ${name} · ${n}`,
    poolNotInRoster: (name: string, n: number) => `Вещи ${name} · ${n} — ${name} не в ростере.`,
    poolIn: (builds: string) => `в ${builds}`,
    poolEverywhere: 'во всех билдах',
    poolUnused: (name: string) => `${name} больше не нужна: в билдах стоят лучше.`,
    filling: 'Собираю',
    fillingWhy: { done: '— собран', closest: '— ближе всех к сборке', prev: '— отмечен в прошлой версии', want: '', tryon: '', stats: '' } as Record<string, string>,
    fillingHalf: (part: string) => `— готова ${part}`,
    // часть собирается из пула (достижимая сборка), а показанная раскладка ради статов её не взяла (Р1)
    fillingReach: (part: string, name: string) => `— ${part} собирается из вещей ${name}, но сейчас выгоднее без неё`,
    fillingOff: 'не собираю — вещи для него не держат вердикт',
    chipsMore: (n: number) => `ещё ${n} ▾`,
    variantsTitle: (build: string, n: number) => `${build} · ${n} ${plural(n, 'связка', 'связки', 'связок')}`,
    variantsNote: (set: string) => `Везде ${set} ×2, вторая половина — своя. Каждая связка собирается как отдельный билд.`,
    variantsNoteAny: 'Каждая связка собирается как отдельный билд.',
    dupOf: (build: string) => `= ${build}`,
    autoNew: (build: string, name: string) => `${build} теперь собирается сам из вещей ${name}. Не собираешь его — выключи «Собираю».`,
    pieceRemoveNote: (name: string) => `Разобрал её, пустил на Breakthrough или она не нужна ${name} — убери: билды соберутся заново.`,
    pieceNowhere: 'Ни в одном билде: в каждом стоит лучше.',
    gearNewerCode: 'Код сохранила более новая версия страницы — обнови страницу.',
    fusionGear: (base: string, fusion: string) => `Вещи ${base} перешли к ${fusion}.`,
    // Core Fusion X заменил X или X заменил Core Fusion X (features/gear/model/fusion): пометка в списке, строка карточки, окна перехода
    fusionOffMark: (name: string, isFusion?: boolean) => (isFusion ? `заменён ${name}` : `заменён Core Fusion ${name}`),
    fusionOffCard: (name: string, activeName?: string) =>
      activeName
        ? `${name} заменён ${activeName}: в ростере и с вещами — ${activeName}.`
        : `${name} заменён Core Fusion ${name}: в ростере и с вещами — Core Fusion ${name}.`,
    fuseAskTitle: (base: string) => `Отметить Core Fusion ${base}?`,
    fuseAskText: (base: string, n: number) => (n
      ? `Все вещи ${base} (${n}) перейдут к Core Fusion ${base}, а ${base} станет неактивным: в ростере — только Core Fusion ${base}.`
      : `${base} станет неактивным: в ростере — только Core Fusion ${base}.`),
    fuseAskYes: (base: string) => `Да, Core Fusion ${base}`,
    unfuseAskTitle: (base: string) => `Вернуться к ${base}?`,
    unfuseAskText: (base: string, n: number) => (n
      ? `Все вещи Core Fusion ${base} (${n}) перейдут к ${base}, а Core Fusion ${base} станет неактивным: в ростере — только ${base}.`
      : `Core Fusion ${base} станет неактивным: в ростере — только ${base}.`),
    unfuseAskYes: (base: string) => `Да, ${base}`,
    cancel: 'Отмена',
    // сняли звезду с героя, у которого есть вещи (Р16: вещи только у героев ростера), — окно RosterRemoveAsk
    rosterRemoveTitle: (name: string) => `Убрать ${name} из ростера?`,
    rosterRemoveText: (name: string, n: number) => `Вещи ${name} (${n}) уберутся из приложения.`,
    rosterRemoveYes: 'Да, убрать',
    // тост после «Да, убрать»: только о герое — вещи, что есть у других, просто не используются здесь
    rosterRemoved: (name: string) => `${name} — не в ростере.`,
    equipped: (name: string, slot: string, t4 = '') => `Надето на ${name}: ${NOM[slot]}${t4}.`,
    replaced: (name: string, slot: string, t4 = '') => `Заменено: ${NOM[slot]} ${name}${t4}.`,
    // убраны 2+ вещи её слота: olds — имя сета у брони, предмета у оружия и аксессуара
    replacedMany: (name: string, slot: string, olds: string[], t4 = '') => `Заменено: ${NOM[slot]} ${name}${t4} — убраны прежние: ${andList(olds)}.`,
    // what — имя сета или предмета, когда убраны 2+ (replacedMany): вместо «Старые»
    oldMaterial: (slot: string, what?: string) => `${what ? named(slot, what) : `${cap(by(slot, 'старый', 'старая', 'старое', 'старые'))} ${NOM[slot]}`} — материал для Breakthrough ${by(slot, 'нового', 'новой', 'нового', 'новых')}.`,
    // снята такая же Legendary (.x/0060 SPEC 4.5): не материал — может быть лучшей для другого героя
    oldEvaluate: (slot: string, what?: string) => `${what ? named(slot, what) : `${cap(by(slot, 'старый', 'старая', 'старое', 'старые'))} ${NOM[slot]}`} — сначала оцени ${by(slot, 'его', 'её', 'его', 'их')}: может подойти другому герою.`,
    gearTitle: (n: number) => `Собрано · ${n} из 6`,
    // вкладка «Надето» (шаг 6): «Билд — Speed · сет 3 из 4», блок слотов, совет «из своих»
    tabWorn: 'Надето',
    wornBuild: (build: string, k: number, n: number) => `Билд — **${build}** · сет ${k} из ${n}`,
    wornBuildPlain: (build: string) => `Билд — **${build}**`,
    wornChangeAria: (name: string) => `Сменить билд ${name}`,
    wornTitle: (k: number) => `Надето · ${k} из 6`,
    wornEnter: 'Ввести',
    wornEmpty: (name: string) => `Отметь, что надето на ${name} сейчас в игре.`,
    wornAllAsk: (name: string, k: number) => `Вещи ${name} — ${k} шт., не больше одной на слот. Всё это сейчас надето?`,
    wornAllYes: 'Да, всё надето',
    wornBetter: (piece: string, delta: string) => `Лучше из своих: ${piece}${delta ? ` ${delta}` : ''}`,
    wornFrom: (piece: string) => `Из своих: ${piece}`,
    wornWear: 'Надеть',
    wornWearAria: (piece: string) => `Надеть ${piece}`,
    wornToast: (name: string, slot: string) => `Надето на ${name}: ${slot}`,
    wornAllToast: (name: string, n: number) => `Надето на ${name}: ${n} ${plural(n, 'вещь', 'вещи', 'вещей')}`,
    // шторка «Билд для X», «Переодеть», «Билды героев» (шаг 7)
    aimTitle: (name: string) => `Билд для ${name}`,
    aimPartWorn: (part: string, k: number, n: number) => `${part} · надето ${k} из ${n}`,
    aimPartHave: (part: string, k: number, n: number) => `${part} · в вещах ${k} из ${n}`,
    aimPartMissing: (part: string, m: number) => `${part} — не хватает ${m}`,
    aimNow: 'сейчас',
    aimTab: (build: string) => `${build} — билд героя: под него он одет`,
    aimCan: 'можно переодеть',
    aimMissing: (m: number) => `не хватает ${m}`,
    aimStatsLine: (name: string) => `лучшее по цепочке из вещей ${name}`,
    aimRedress: (build: string) => `Переодеть в ${build} ▸`,
    redressTitle: (name: string, build: string) => `${name} → ${build}`,
    redressBack: (name: string) => `← ${name}`,
    redressOn: (part: string) => `включится: ${part}`,
    redressOff: (part: string) => `выключится: ${part}`,
    redressWear: (n: number) => `Надень из своих · ${n}`,
    redressWearAll: (n: number) => `Надеть все ${n}`,
    redressTake: (n: number) => `Снимешь · ${n}`,
    redressFooter: 'Сделай то же в игре.',
    aimsNotice: (n: number) => `Выбрал билды по твоим вещам у ${n} ${plural(n, 'героя', 'героев', 'героев')} — проверь.`,
    aimsCheck: 'Проверить',
    aimsTitle: 'Билды героев',
    aimsOk: 'Всё верно',
    aimToast: (name: string, build: string) => `Билд ${name}: ${build}`,
    aimsSaved: 'Билды героев сохранены',
    aimWhy: {
      only: 'единственный',
      want: '«Собираю»',
      on: (part: string) => `${part} включён`,
      more: (set: string) => `больше вещей ${set}`,
      first: 'вещей билдов нет — первый',
      tie: 'поровну — первый',
      stats: 'билды выключены — По статам',
    },
    poolWorn: 'надета',
    // «Ещё» и список персонажей: кого доодеть (надето меньше 6 из 6)
    menuBare: (n: number) => `Доодеть · ${n}`,
    allDressed: 'Все одеты полностью — у каждого 6/6.',
    gearTile: (n: number) => `надето ${n} из 6`,
    // «Слабее всех» — самая слабая вещь брони в билде и что искать ей на замену
    weakest: (slot: string, grade: string, bt: number | null) => `Слабее всех — ${slot} (${grade}, Breakthrough ${bt === null ? 'не указан' : bt === 0 ? 'T0–T3' : 'T' + bt}).`,
    weakestLook: (piece: string, stats: string[]) => `Ищи ${piece} с ${stats.join(' и ')}: «Примерить вещи» — и вердикт покажет, лучше ли она надетой.`,
    weakestTry: 'Примерить вещи',
    pieceTitle: (slot: string, name: string) => `${slot} · ${name}`,
    btChip: 'T4',
    btAria: 'Вещь на Breakthrough T4',
    btTitle: 'Вещь уже на T4 — бонус сета посчитается как у T4',
    // у Legendary оружия и аксессуара сета нет — «T4» только про материал такого же предмета (вопрос 7 ревью eval-only)
    btTitleItem: 'Вещь уже на T4 — такие же ей в Breakthrough больше не нужны',
    btBelow: 'T0–T3',
    withT4: ' · T4',
    pieceEditNote: (name: string) => `Сделал в игре Reforge или Breakthrough — поправь сегменты и «T4»: билды соберутся заново. Transistone сменил стат — введи вещь заново и «Надеть», а эту — «Убрать у ${name}».`,
    // кнопка уровня в карточке вещи — для диктора: «5 сегментов» (жёлтых и оранжевых больше нет, Н1)
    segLabel: (n: number) => `${n} ${plural(n, 'сегмент', 'сегмента', 'сегментов')}`,
    pieceRemove: (name: string) => `Убрать у ${name}`,
    pieceDone: 'Готово',
    // во время обучения на странице пример, а не вещи игрока: код показал бы и заменил бы пример
    gearCodeTour: 'Резервная копия — после обучения: пока оно идёт, на странице пример, а не твои вещи.',
    gearApplied: (n: number) => `Экипировка загружена: вещей ${n}.`,
    gearRosterAdded: (names: string) => `В ростер добавлены: ${names}.`,
    rosterKeptGear: (names: string) => `Оставлены в ростере — у них есть вещи: ${names}.`,
    // окно перехода Core Fusion (App): кто кого заменил в ростере; «Вещи … перешли к …» — fusionGear
    fusionReplaces: (fusion: string, base: string) => `${fusion} заменяет ${base} в ростере.`,
    // после загрузки, импорта и пакетного добавления: есть оба — остаётся Core Fusion (features/gear/model/fusion normalizeFusion)
    fusionFixed: (base: string, how: 'moved' | 'removed' | 'none') =>
      `В ростере оставлен Core Fusion ${base}: ${base} заменён${how === 'moved' ? `, его вещи перешли к Core Fusion ${base}` : how === 'removed' ? ', его вещи убраны' : ''}.`,
    // поле «Резервная копия» (.x/0060 SPEC 2.3–2.4)
    // «Показать героя» (.x/0060 SPEC 3, 6)
    share: 'Поделиться',
    linkCopied: 'Ссылка скопирована',
    shownStrip: 'Показ · только просмотр',
    shownNoHero: 'Этого героя нет в твоих данных — обнови страницу.',
    shownLost: 'Билд отправителя не найден — выбран сам.',
    shownBroken: 'Ссылка повреждена — попроси прислать её ещё раз.',
    shownNewer: 'Ссылку сделала более новая версия — обнови страницу.',
    notInData: 'нет в твоих данных',
    codeBackup: 'Это резервная копия — загрузи её в «Ещё» → «Резервная копия».',
    backupLabel: 'Резервная копия — ростер и вещи одним кодом',
    backupApplied: (pieces: number, heroes: number) => `Загружено из копии: вещей ${pieces}, героев в ростере ${heroes}.`,
    backupBroken: 'Код повреждён или обрезан — скопируй его целиком.',
    backupHero: 'Это код героя — открой его через «Ввести код».',
    backupNoHeroes: 'Не нашёл ни одного героя.',
    backupBad: 'Код не читается.',
    gearNewer: 'Экипировку сохранила более новая версия страницы — обнови страницу, чтобы её видеть и менять.',
    addSub: 'Добавить сабстат',
    mainGroup: 'Main stat',
    mainInGrid: 'Main ↓',
    mainFirst: 'Сначала main stat — он в игре сверху предмета, потом сабстаты по порядку. Серые — такой main никому не нужен.',
    mainCell: (k: string) => `Main stat ${k} — нажми, чтобы убрать`,
    fixedMainCell: (k: string) => `${k} — main этого слота: сабстатом здесь не бывает`,
    usefulTitle: (k: string, credit: number) => `${k}${credit >= 1 ? ' — нужен билдам этого сета' : credit > 0 ? ' — нужен, но далеко в приоритете (за ½)' : ' — билдам этого сета не нужен'}`,
    triageHint: 'Ярких статов на вещи 0–1 — сразу в разбор',
    // код предмета
    codeForChat: 'Код для чата',
    codeSelected: 'Выделено — скопируй',
    codeErrors: {
      empty: 'Введи код из чата.',
      chars: 'В коде только латинские буквы — проверь, нет ли цифр или лишних знаков.',
      check: 'Код не сходится — где-то опечатка. Сверь ещё раз.',
      format: 'Это не код предмета.',
      data: 'Такого предмета нет в твоих данных — обнови приложение (или устарело оно у отправителя).',
    },
    codeOpen: 'Открыть',
    codeHint: 'Код из чата гильдии. Регистр, пробелы и дефисы не важны. Текущий предмет заменится, оценка — по твоему ростеру и настройкам.',
    // вердикт
    verdictLabel: { keep: 'Оставить', temp: 'Временно', maybe: 'Спорно', fodder: 'Фоддер', junk: 'Разобрать', idle: '…' },
    verdict: 'Вердикт',
    tierLegend: 'Цепочка — приоритет сабстатов билда, слева важнее. Зелёный — есть на предмете и засчитан, жёлтый — за ½, серый — есть, но далеко в цепочке (места с 5-го не считаются, кроме SPD) или это flat, который персонажу почти ничего не даёт, пунктир — нет на предмете. Flat и % — разные статы одного параметра: % засчитывается целиком, flat — по своей ценности для персонажа, но не выше %. С пометкой main — параметр есть в main предмета (растёт от Enhance, а не от Reforge); если сабстатом ещё бывает второй стат пары (flat ATK при main ATK%, EFF% при flat EFF) — он рядом через «/», а пунктиром, если его нет: в счёт идёт только сабстат. Зачёркнут — билду не нужен.',
    altGroup: 'Дальше — у кого сет только в запасной связке билда',
    showAll: (n: number) => `показать всех (${n})`,
    scoreTitle: (good: string, n: number, pct: number) => `Полезных сабстатов ${good} из ${n}; взвешенно по приоритету — ${pct}%`,
    openBuilds: 'Открыть билды',
    alsoBuilds: (list: string) => ` · ещё: ${list}`,
    anyMain: 'любой',
    toEval: '← Оценка',
    verdictDetails: 'Вердикт — показать подробности',
    backToEval: 'Вернуться к оценке',
    reset: 'Следующий',
    undoText: 'Предмет убран',
    undoAction: 'Вернуть',
    details: 'подробнее',
    // персонажи
    charsHint: '☆ — отметь своих: оценка будет учитывать только их',
    charSearch: 'Имя: Stella, Demiurge, Gnosis…',
    // кого показывать: свои / свои, кого есть кому доодеть / все с билдами
    modeGroup: 'Кого показывать',
    modeMine: 'Мои',
    modeToDress: 'Доодеть',
    modeAll: 'Все',
    filter: 'Фильтр',
    filterReset: 'Сбросить',
    filterOff: (name: string) => `${name} — снять фильтр`,
    tradeBtn: 'Обмен',
    nobodyFound: 'Никого не нашлось.',
    rosterToggle: (name: string, own: boolean) => `${name} — ${own ? 'убрать из ростера' : 'добавить в ростер'}`,
    rosterSelected: 'Выделено — нажми Ctrl/Cmd+C',
    rosterApplied: (replace: boolean, n: number, missed: string) => `${replace ? 'Заменено' : 'Добавлено'}: ${n}${missed ? `; не распознано: ${missed}` : ''}`,
    replace: 'Заменить',
    // билды персонажа
    charBuilds: 'Билды персонажа',
    pickChar: 'Выбери персонажа — покажу рекомендованные сеты, оружие, аксессуары и приоритет сабстатов по билдам outerpedia.',
    toList: '← к списку',
    opedia: 'outerpedia',
    opediaAria: (name: string) => `${name} на outerpedia (откроется в новой вкладке)`,
    builds: 'Билды',
    noBuilds: 'У outerpedia пока нет рекомендаций по шмоту для этого персонажа.',
    gameSets: (sets: string) => `Сама игра советует сеты: ${sets}.`,
    armorSets: 'Сеты брони',
    or: 'или',
    weapon: 'Оружие',
    accessory: 'Аксессуар',
    subPriority: 'Приоритет сабстатов',
    notSub: 'не выпадает сабстатом на 6★ снаряжении',
    prioGap: 'разрыв в приоритете',
    talismans: 'Талисманы',
    buildNote: 'Заметка outerpedia',
    badMain: 'у этого предмета не бывает такого main stat — вероятно, опечатка в outerpedia',
    flatEqual: (ax: string) => ` — flat и ${ax}% примерно равны, бери любой.`,
    flatBetter: (ax: string, pct: number) => ` — выгоднее flat: сегмент flat ${ax} даёт ≈${pct}% от сегмента ${ax}% (то есть больше).`,
    pctBetter: (ax: string, pct: number) => ` — выгоднее ${ax}%: сегмент flat ${ax} даёт только ≈${pct}% от сегмента ${ax}%.`,
    flatFor: (lv: number, quirks: boolean) => `Для lv ${lv}${quirks ? ' с прокачанными Quirks' : ' без Quirks'} — меняется в «Настройках оценки».`,
    // справка и первый запуск
    howTo: 'Как пользоваться',
    steps: [
      '**Отметь своих персонажей** — пока их нет, оценка идёт по всем персонажам игры.',
      '**Вбей вещь:** слот, грейд (L — Etheric, E — Steel), сет или предмет; сабстаты — сеткой, по порядку, как в игре: нажал стат — в окне выбери, сколько сегментов горит.',
      '**Вердикт** — сразу, с объяснением. «Следующий» — к следующей вещи: слот, грейд, сет и main остаются, сабстаты очищаются.',
    ],
    markChars: 'Отметить персонажей',
    canInstall: 'Можно установить как приложение — работает и без сети.',
    install: 'Установить',
    iosInstall: '**iPhone и iPad:** Safari → «Поделиться» → «На экран „Домой“» — будет работать и без сети.',
    helpInput: 'Ввод вещи',
    helpInputItems: [
      '**Броня** — сет: он в названии после «of» (Etheric Gloves of Speed → Speed Set).',
      '**T4** рядом с сетом, предметом или main (у Epic оружия и аксессуара) — вещь уже на Breakthrough T4. У брони бонус сета (Speed ×2 и другие) считается на T4; у любой вещи такие же ей в Breakthrough больше не нужны. Свежий дроп — T0, не отмечай. «T?» у старой записи — Breakthrough не указан: считается ниже T4.',
      '**Legendary оружие и аксессуар** — найди предмет и отметь main stat. Совсем новый, которого нет в списке, — «нет в списке».',
      '**Epic оружие и аксессуар** (Steel…) — пассивки нет, сразу main stat.',
      '**Main stat** у оружия — кнопки ATK% / DEF% / HP% рядом с грейдом; у аксессуара — первое нажатие в сетке, дальше сетка отмечает сабстаты. Ярче — main, который кому-то нужен. Нажми выбранный ещё раз, чтобы убрать.',
      '**Сабстаты** — нажми в сетке; ярче — статы, нужные билдам выбранного сета. Статы стоят парами по параметру, один над другим: ATK% над ATK, HP% над HP, DEF% над DEF, CHC над CHD, DMG UP% над DMG RED%, EFF% над RES%. Клетка с пометкой main — такого сабстата на этой вещи не бывает: он уже в main (HP% у шлема и ботинок, flat DEF у брони и перчаток, flat ATK у оружия). Flat EFF и flat RES в main сабстатам EFF% и RES% не мешают — в игре это разные статы. В сетке все 13 сабстатов игры; PEN%, CDMG RED%, flat EFF и flat RES сабстатами не бывают — только main.',
      '**Сегменты** — сколько горит у сабстата в игре, 1–6 (жёлтые и оранжевые вместе). Их выбираешь в окне сразу после нажатия в сетке; нажал мимо окна — стат не добавится. Поправить — кнопками в строке. Свежий дроп — до 4. Вердикт — по вещи как есть: Reforge, которые впереди, не считаются.',
      '**4-й сабстат у Epic** — обычно Epic выпадает с тремя, четвёртый добавляет первый Reforge; бывает и сразу с четырьмя. Есть он на вещи — «+ 4-й сабстат» под строками.',
      'Нажми на стат в строке, чтобы заменить его (сегменты останутся) или убрать. При замене можно выбрать и стат из другой строки: он переедет сюда, а та строка освободится — так удобно вводить следующую вещь поверх прошлой. Убрать можно и повторным нажатием в сетке. Код, справка, обучение и настройки — в «Ещё»: ☰ на плашке внизу, на компьютере — «⋯» в шапке.',
    ],
    helpRoutine: 'Как быстро разбирать',
    helpRoutineItems: [
      'Всё ниже 6★ и ниже Epic — сразу в разбор.',
      'Иди по инвентарю по дате получения: подряд обычно дропы одного забега, и сет остаётся с прошлой вещи.',
      '**Epic-броня:** выбери слот и сет и посмотри на сетку. Ярких статов на вещи 0–1 — в разбор, ничего не вводя: «Оставить» и «Временно» так не бывает. У Speed, Immunity и Swiftness ярко почти всё — там вводи.',
      'У Epic после двух ненужных сабстатов вердикт появляется сразу — третий можно не вводить.',
      '«Оставить» — поставь замок, чтобы не разобрать случайно; «Временно» — носи, пока не найдёшь лучше.',
      '**Breakthrough у Epic** — только такой же вещью, сабстаты не важны: броня — Epic того же сета и слота, оружие — любой Steel Sword, аксессуар — любой Steel Necklace, с любым main. Есть Epic-«Оставить» не на T4 — такие Epic из разбора откладывай ему, нужно 4 штуки. Epic оружию и аксессуару «Временно» — только вещами из разбора, Glunite не трать.',
      '**Epic оружие и аксессуар:** на «Эндгейме» — в разбор; на «Развитии» сначала main stat: серый — он никому не нужен, в разбор.',
      '**Legendary:** вердикт покажет, какие прокачивать; со слабыми сабстатами — в разбор.',
    ],
    helpVerdicts: [
      '**Оставить** — вещь нужна: носи и прокачивай, что именно — в блоке «Прокачка» в подробностях.',
      '**Временно** — носи, пока не найдёшь лучше: у оружия и аксессуара нет нужной пассивки, у Epic-брони только один главный стат.',
      '**Фоддер** — оставь на Breakthrough такой же вещи с правильным main stat — или такой же вещи персонажа не на T4 (см. «Экипировка»). Так же — у Legendary, которая никого не улучшит: всем, кому подходит, она ничего не даёт. Снятую при замене Legendary в Breakthrough не отдавай: сначала оцени её — может подойти другому герою.',
      '**Спорно** — решай сам: в подробностях написано, в чём сомнение (например, вещь хороша для персонажа не из твоего ростера).',
      '**Разобрать** — твоим персонажам не подходит, ролл слабый или всем, кому она подходит, она ничего не даёт (см. «Экипировка»).',
    ],
    helpChars: [
      'Звёздочка отмечает персонажа в ростере; с галочкой «только мои персонажи» («Ещё» → «Настройки») оценка учитывает только их. Список показывает «Мои» (все твои, с билдами и без), «Доодеть» (твои, у кого надето меньше 6 из 6) или «Все» (с билдами; героя без билдов найдёшь по имени); стихия и класс — под кнопкой фильтра, выбранные видны чипами над списком. «Ещё» → «Резервная копия» — ростер и вещи одним кодом, для переноса на другое устройство; «Заменить» понимает и прежние коды ростера и экипировки. Вещи бывают только у персонажей ростера: «Надеть» добавляет в ростер, загрузка копии — всех, у кого есть вещи; снимешь звезду с персонажа с вещами — приложение спросит, убрать ли их. Core Fusion заменяет героя: отметишь Core Fusion Eternal — вещи Eternal перейдут к Core Fusion Eternal, а Eternal станет неактивным (в списке пара на прежнем месте: Core Fusion Eternal сразу за Eternal); звезда на Eternal вернёт всё назад.',
      'Нажми на персонажа — откроются его билды: сеты, оружие, приоритет сабстатов. Звёздочка есть и в карточке, рядом с именем; стихия и класс — значками на портрете, «outerpedia ↗» открывает страницу персонажа на outerpedia. У героя ростера первая вкладка — «Надето»: что на нём в игре; билд, в который он одет, обведён; на вкладке другого билда — «Переодеть в … ▸».',
      '**Экипировка** — вещи у персонажа, а билды собираются из них сами: один Speed-шлем идёт и в Speed, и в Speed/Immu. У билда с несколькими связками сетов каждая связка — отдельный вариант: показан самый собранный, остальные — в чипах и «ещё N». Вещь к персонажу кладёт «Надеть» — в подробностях вердикта, на телефоне ещё и кнопка под карточкой: вещь записывается надетой в своём слоте. Вердикт предлагает её тем, кому она встанет в билд. Вещь не по билду сама не предлагается — найди персонажа по имени в «Надеть на…» или нажми «Оценить вещь для Caren»: там «Надеть» есть у любой вещи, чтобы записать, что носит герой. «Надеть» пересобирает билды; прежняя вещь слота уходит, если её не держит ни один билд, и что не надето и не вошло ни в один билд — убирается. Вещь персонажа правится только в сегментах, «T4» и 4-м сабстате у Epic: сделал Reforge или Breakthrough — нажми её в «Вещи Caren» и поправь. Transistone сменил стат — введи вещь заново и «Надеть», а эту — «Убрать у Caren». Enhance не отмечается: считаем, что вещь на +10. Бонус сета — по Breakthrough вещей: ×2 на T4, если хотя бы две вещи сета на T4; ×4 на T4 — если все четыре. Разобрал вещь или пустил на Breakthrough — «Убрать у Caren» в карточке вещи. Кого доодеть — «Доодеть» над списком (на телефоне ещё «Ещё» → «Доодеть · N»). «Поделиться» во вкладке «Надето» даёт ссылку: друг увидит, что на герое надето и под какой билд, — только просмотр, у него ничего не изменится. Во время обучения резервной копии нет: на странице пример.',
      '**Собираю** — какие билды ждут вещи: отмеченные «Собираю» и все начатые — где стоит хоть одна вещь из сетов билда или оружие либо аксессуар из его списка с нужным main, при любом Breakthrough. По ним — штамп и «Сейчас на персонажах». Не собираешь — выключи «Собираю»: вещи для него перестанут держать штамп, но не уйдут — у персонажа остаются вещи лучшей раскладки каждого билда и надетое. «По статам» — отдельный билд у каждого персонажа: все его вещи по цепочке, без сетов. Штамп он держит, пока ни один билд не начат; потом его строка — тихая. Сам вещи он не держит: вещь, которая нужна только ему, «больше не нужна», если она не надета.',
      '**Оценить вещь для Caren** — в карточке персонажа: над формой «Только для · Caren». Строка карточки, «Сейчас на персонажах» и «Надеть» — только про Caren, по всем билдам; «Надеть» есть и у вещи без пользы — записать, что носит герой; штамп — общий. «Следующий» режим не сбрасывает, ✕ — снова для всех. «Примерить» у пустого слота сразу ставит на форму слот и сет. «Примерить замену» у вещи — «Заменить» уберёт именно её, лучше новая или хуже.',
      '**Сейчас на персонажах** — в подробностях вердикта, строка на персонажа ростера: что с вещью станет с его билдами — «соберёт», «сет 3 из 4», «пустой слот», ▲ лучше или ▼ хуже того, что стоит в билде, или такой же вещи её сета у персонажа (две цепочки рядом и на сколько по полезным сегментам), «ломает сет», «только статы»; остальные билды — строкой «Ещё». Сет можно сломать, только если в итоге выгоднее; сет с бонусом-эффектом (Immunity, Penetration) ради статов не ломается. «Заменить» вместо «Надеть» — в слоте уже есть вещь; она уйдёт, если её не держит ни один билд. Штамп: «Разобрать» → «Фоддер», если такая же вещь (тот же слот, сет и грейд; у оружия и аксессуара — тот же предмет и грейд) стоит в собираемом билде персонажа ниже T4 — эта ей материал; а если эта лучше — «Оставить»: надень её. «Оставить» и «Временно» → «Разобрать», если введены все сабстаты и никому из тех, кому вещь подходит, она ничего не даёт (Legendary «Оставить» — «Фоддер», броня — если копишь фоддер). Штамп держат: персонаж без вещей, вещь начнёт ему билд, «соберёт», «сет 3 из 4», пустой слот, «лучше», «ломает сет» и «на уровне из-за T4», когда по сегментам лучше, другая рекомендованная пассивка; у оружия и аксессуара — ещё и вещь не по билду в слоте. Резервная копия — код OGC-GEAR2 в «Ещё» → «Резервная копия».',
    ],
    helpTrade: 'Обмен вещами',
    helpTradeItems: [
      'Считает, как переодеть героя (или команду из четырёх) вещами, что уже есть в ростере и инвентаре. Вход — «К обмену ▸» на карточке героя (план для него) или «Обмен» над списком персонажей и «Обмен для команды» в «Ещё» на телефоне (сразу команда). В игре всё делаешь сам — приложение только считает.',
      '**Герой** — кого переодеть; **Команда** — четыре места ромбом: они меняются вещами между собой и берут у остальных. Член — плитка с булавкой в углу; нажми — поставить другого или «Убрать из команды». Под плиткой — мерило («Имя ▾» — билд или «по статам»), нажми — сменить.',
      '**Булавка «Не отдавать надетое»** — у карточки героя и плитки: надетое на нём другие не берут (запас берут). Члены команды между собой меняться могут.',
      'План: у каждого получателя — выигрыш в очках билда («▲ +13%», у героя без надетого — «▲ +41 очк.»), что надеть, откуда вещь (у кого или в инвентаре) и как её найти в игре — источник мелко под вещью, у оружия и аксессуара ещё Secondary ↓. «Не брать» — искать другую вещь. У пустого слота — «Искать:» с подсказкой. В плане — только те, кого переодеваешь (герой или члены команды); у кого забираешь, не показываем.',
      '**Дыры не закрываются:** снятая вещь остаётся снятой, пока не введёшь новую через оценку.',
      '**Сделал** — в игре всё сделано: план сохраняется (после него «После обмена не отдавать надетое» у получателя, по умолчанию вкл.). **Отмена** — ничего не менялось. Сразу после «Сделал» — «Вернуть». Копия, которой нет ни в одном пуле, из приложения уйдёт, в инвентаре игры останется.',
      '**«Лучше из своих»** на вкладке «Надето» — тот же порог, что и в обмене: своя запасная вещь лучше надетой хотя бы на 1 очко по билду, либо включает сет, либо даёт рекомендованное оружие.',
    ],
    helpCode: 'Код для гильдии',
    helpCodeText: (example: string) => `В подробностях вердикта и в карточке вещи персонажа есть код вещи, например ${example}. Скопируй его в чат игры; кто получил — нажимает «Ввести код» и перепечатывает. Оценка у каждого — по своему ростеру. У вещи с 5–6 сегментами кода нет.`,
    helpInstall: 'Установка',
    helpInstallItems: [
      '**Android (Chrome):** меню ⋮ → «Установить приложение» или «Добавить на главный экран».',
      '**iPhone и iPad:** в Safari «Поделиться» → «На экран „Домой“».',
      'Установленное приложение работает без сети. Когда выйдут новые данные outerpedia, появится плашка «Обновить»; улучшения приложения ставятся сами при следующем запуске.',
    ],
    wikiLink: 'Подробное руководство — в Wiki ↗',
    wikiUrl: 'https://github.com/cotton-more/outerplane-gear-check/wiki/Начало-работы',
  },

  // --- штамп по надетому (features/gear/model/stamp): всем, кому подходит, уже надето не хуже; вещь уже в билде
  worn: {
    line: '**Никого не улучшит**: всем, кому она подходит, уже надето не хуже. Сама по себе вещь неплохая.',
    stale: 'Разобрал вещь в игре — убери её в карточке персонажа, и вердикт пересчитается.',
  },

  // --- режим «для героя»: оценка для одного персонажа по всем его билдам (features/tryon/tryon, features/tryon/TryOnStrip)
  tryon: {
    label: 'Только для',
    end: 'Оценивать для всех',
    rateFor: (name: string) => `Оценить вещь для ${name}`,
    // заголовок вердикта после « — »: исход героя (features/tryon/tryon heroTitle; temp — вердикт «Временно»)
    clause: (kind: string, name: string, temp = false): string => ({
      wearEmpty: temp ? `${name}: пустой слот — пока сойдёт` : `надень на ${name}`,
      wear: `лучше, чем на ${name}`,
      keep: `держи для ${name}`,
      none: `на ${name} уже не хуже`,
      weak: `для ${name} слабая`,
    } as Record<string, string>)[kind] ?? '',
    // «Разобрать», а ей вещь лучше надетого или слот пуст
    butWear: (kind: string, name: string) => `но ${kind === 'fill' ? `у ${name} слот пуст` : `лучше, чем на ${name}`}: надень, пока нет лучше`,
    // оценка для героя (features/tryon/tryon heroNote): сета вещи нет ни в одном билде героя, по статам не подходит
    offHero: (name: string, set: string) => `${name} она не нужна: ${set} нет в билдах ${name}.`,
    // режим героя: вещь не по билду, но по статам полезна (Р11)
    offStats: (name: string) => `${name} она подходит по статам, не по билду.`,
    // режим героя: у вещи нет полезных ему статов (Р13)
    noStats: (name: string) => `${name} эта вещь ничего не даст: полезных статов нет.`,
    // оружие или аксессуар не для класса героя (classLimits): дело не в статах
    noClass: (name: string) => `${name} не носит этот предмет: он для другого класса.`,
    slot: 'Примерить',
    replace: 'Примерить замену',
    build: 'Собрать билд',
    empty: (build: string, name: string) => `Собери билд ${build}: вводи вещи ${name} из инвентаря — и вердикт начнёт сравнивать новые вещи с ними.`,
    emptyOr: 'Или жми «Надеть» в вердикте — вещь сама добавится к вещам персонажа.',
    emptyStats: (name: string) => `«По статам» — вещи ${name} по цепочке, без сетов. Что ${name} носит в игре не по билду, отметь на вкладке «Надето».`,
  },

  // «Обмен вещами» (.x/0040-trade/SPEC.md R10): шторка обмена, план, закрепление героя
  trade: {
    title: 'Обмен вещами',
    open: 'К обмену ▸',
    teamOpen: 'Обмен для команды',
    pin: 'Не отдавать надетое',
    pinTile: (name: string) => `${name}: надетое не отдаёт`,
    pinned: 'Закреплены:',
    unpin: (name: string) => `Снять закрепление: ${name}`,
    modeHero: 'Герой',
    modeTeam: 'Команда',
    pickHero: 'Кого переодеть?',
    noHeroes: 'В ростере нет героев с билдами — отметь их звездой на «Персонажах».',
    teamHint: 'Четыре героя, как команда в игре: меняются вещами между собой и берут у остальных.',
    pickMember: 'Кого поставить на это место?',
    addMember: 'Место в команде',
    removeMember: (name: string) => `Убрать из команды: ${name}`,
    count: 'Посчитать',
    counting: 'Считаю…',
    cancel: 'Отмена',
    done: 'Сделал',
    ok: 'Ок',
    nothing: 'Менять нечего',
    pinAfter: 'После обмена не отдавать надетое',
    gainPct: (n: number) => (n > 0 ? `▲ +${n}%` : n < 0 ? `▼ −${-n}%` : '0%'),
    gainPts: (n: number) => (n > 0 ? `▲ +${dec(n)} очк.` : n < 0 ? `▼ −${dec(-n)} очк.` : '0 очк.'),
    setOn: (set: string, n: number) => `включится ${set} ×${n}`,
    setOff: (set: string, n: number) => `выключится ${set} ×${n}`,
    fromWorn: (name: string) => `у ${name}`,
    fromStock: (name: string) => `в инвентаре · запас ${name}`,
    fromInventory: 'в инвентаре',
    skip: 'Не брать',
    search: 'Искать:',
    anyGrade: '6★',
    sortTitle: 'Secondary Stat — сортировка по нему',
    keySub: (sub: string) => `${sub} ↓`, // Secondary и сортировка по нему
    emptySlot: (slot: string) => `${cap(NOM[slot] ?? slot)}: пусто`,
    gone: (what: string) => `Старая копия ${what} останется в инвентаре, из приложения уйдёт.`,
    pinnedBetter: (names: string, pts: number) => `У ${names} (закреплены) лучше: +${dec(pts)} очк.`,
    take: 'Взять',
    stale: 'Вещи поменялись — план пересчитан. Проверь и нажми «Сделал» ещё раз.',
    savedHero: (name: string) => `Обмен для ${name} сохранён.`,
    savedTeam: 'Обмен команды сохранён.',
    savedPin: (name: string, on: boolean) => (on ? `${name}: надетое не отдаёт.` : `${name}: надетое можно брать.`),
  },
  tour: {
    start: 'Обучение',
    startLong: 'Пройти обучение',
    welcomeCta: 'Пройти · 1 мин',
    next: 'Дальше',
    done: 'Готово',
    close: 'Закрыть обучение',
    stepOf: (n: number, m: number) => `Шаг ${n} из ${m}`,
    choose: 'Пройдём ввод одной вещи — около минуты. Возьмём пример или вещь из игры?',
    demo: 'На примере',
    own: 'На своей вещи',
    inSheet: 'Выбери в окне — обучение подождёт.',
    closeSheet: 'Закрой окно ✕, затем нажми «Следующий».',
    backToEval: '← К обучению',
    endText: (roster: boolean) => `Вот и всё: так оценивается каждая вещь.${roster
      ? ' Пройти снова — в «Ещё» или в «Справке».'
      : ' Отметь своих персонажей — оценка будет по ним, а не по всем героям игры.'}`,
    choice: 'До обучения на форме была другая вещь. Какую оставить?',
    keepItem: 'Оставить эту',
    restoreItem: 'Вернуть прежнюю',
    invite: 'Появилось обучение: ввод одной вещи, около минуты.',
    // выбор тура (tours.ts) и тур «Экипировка» (gear.ts)
    pick: 'Какое обучение?',
    tours: { core: 'Оценка вещи · 1 мин', gear: 'Экипировка · 1 мин' },
    gearStepOf: (n: number, m: number) => `Экипировка · ${n} из ${m}`,
    gearEnd: (narrow: boolean) => `Готово. Это был пример — твоя экипировка не тронута. Кого доодеть — ${narrow ? 'в «Ещё», «Доодеть»' : 'в «Персонажах», переключатель «Доодеть»'}.`,
    // на примере на форме не то, что в примере
    off: {
      item: 'Для примера нужна броня Epic: значок футболки и E.',
      set: 'Для примера нужен Speed Set — поменяй его в поле сета.',
      subs: 'Для примера нужны только SPD, CHC и CHD: нажми лишний стат в строке и замени его или убери.',
    },
    tips: {
      more: 'Настройки оценки, резервная копия, язык и справка — в «Ещё».',
      star: 'Отметь звёздочкой своих персонажей — оценка будет по ним, а не по всем героям игры.',
      accMain: 'У аксессуара первое нажатие в сетке — это main stat, как сверху на вещи в игре. Дальше идут сабстаты.',
      mainCell: 'Клетка «main» — стат из main вещи: сабстатом такой не выпадает.',
      fourth: 'У Epic бывает 4-й сабстат — от первого Reforge или сразу с дропа. Есть — отметь его, он может вытянуть вещь.',
      replace: 'Нажми на стат в строке, чтобы заменить его или убрать. Так удобно вводить следующую вещь поверх прошлой.',
      move: 'Можно выбрать и стат из другой строки: он переедет сюда, а та строка освободится.',
      chain: 'Цепочка — приоритет статов билда: зелёные есть на вещи, пунктирные — нет. Первые места важнее.',
      code: 'Код вещи — для чата гильдии: там его вводят через «Ввести код» и видят оценку по своему ростеру.',
      temp: '«Временно» — вещь пойдёт, пока не найдёшь лучше. В разбор её не торопись.',
      prio: 'Приоритет сабстатов: › — по порядку, = — одно место, зачёркнутые на 6★ сабстатом не выпадают. По этой строке считается цепочка в вердикте.',
      builds: 'Билды собираются из вещей персонажа сами — каждый из всего пула. Штамп держат начатые (начинает одна вещь сета или оружие из списка) и отмеченные «Собираю».',
      gear: 'Вещи — у персонажа, а билды собираются из них сами: один Speed-шлем идёт и в Speed, и в Speed/Immu.',
      tryOn: '«Примерить» — оценка только для этого персонажа, слот и сет уже на форме. «Надеть» — сразу этому персонажу.',
      piece: 'Сделал в игре Reforge или Breakthrough — поправь здесь сегменты и «T4», как на вещи в игре: сравнение идёт по тому, что есть.',
      tryStrip: 'Оценка только для этого персонажа: строка карточки и «Надеть» — про этого персонажа, штамп — общий. ✕ — снова для всех.',
      vs: '▲ — лучше того, что стоит в билде, ▼ — хуже; «сет 3 из 4» — билд станет ближе к сборке. Кнопка — надеть или заменить.',
      stash: 'Оставляй, но пока не надевать? Нажми «Отложить» — вещь запишется герою, и следующие вещи будут сравниваться с ней.',
      cardEquip: 'Надень одной кнопкой под карточкой: вещь запишется надетой. Что не надето и не вошло ни в один билд, уйдёт из вещей персонажа.',
      equipAll: 'Здесь — те, кому вещь встанет в билд. Не по билду — найди персонажа по имени: «Надеть» запишет её как надетую.',
      material: 'Фоддер, а не разбор: такая же вещь стоит в собираемом билде не на T4 — эта пойдёт ей в Breakthrough.',
      worn: 'Вещь неплохая, но всем, кому она подходит, уже надето не хуже — поэтому «Разобрать». Разобрал вещь в игре — убери её в карточке персонажа.',
      pool: 'Все вещи персонажа по слотам. Разобрал вещь или пустил на Breakthrough — нажми на неё и «Убрать»: билды соберутся заново.',
      want: 'Не собираешь этот билд — выключи «Собираю»: вещи для него перестанут держать вердикт.',
      variants: 'У билда несколько связок сетов — показываю самую собранную. Другие — в чипах, «ещё N» — весь список.',
      stats: '«По статам» — все вещи по цепочке, без сетов. Вещей не держит. Вещь не по билду: «Надеть на…» → поиск по имени.',
      fusion: 'Отметишь Core Fusion Eternal — Eternal станет неактивным, а его вещи перейдут к Core Fusion Eternal. Звезда на Eternal вернёт всё назад.',
      bt: 'Вещь уже на Breakthrough T4 — нажми «T4»: бонус сета и материал для Breakthrough посчитаются как в игре. Свежий дроп — T0, отмечать не нужно.',
      wornTab: 'Здесь — что на герое сейчас в игре. Пустой слот — «Ввести»: откроется оценка для этого слота.',
      trade: 'Обмен вещами: кто что наденет из всех вещей — у других, запасных, из инвентаря. «Сделал» — когда переоделся в игре. Булавка — вещи героя другим не отдаём.',
      aimChange: 'Переодеть в … — покажу, что надеть из своих. Билд, в который герой одет, обведён.',
      share: 'Поделись героем: по ссылке друг увидит, что на нём надето и под какой билд. Только просмотр — у друга ничего не изменится.',
    },
    // строка «Что нового» — у подсказок с news
    news: {
      more: 'настройки, резервная копия, язык и справка — в «Ещё»',
      wornTab: 'вкладка «Надето»: отметь, что сейчас на героях',
      trade: 'Обмен вещами — переодеть героя или команду из всех вещей',
      move: 'при замене стат из другой строки переезжает',
      gear: 'вещи персонажа — билды собираются сами',
      bt: 'отметка «T4» на форме',
      share: '«Поделиться» героем — ссылка только для просмотра',
    },
    newsStrip: (first: string, more: number) => `Новое: ${first}${more ? ` и ещё ${more}` : ''}.`,
    newsShow: 'Показать',
    newsLater: 'Позже',
    tipsTitle: 'Подсказки',
    tipsOn: 'вкл',
    tipsOff: 'выкл',
    tipsReset: 'Показать подсказки заново',
    newBadge: 'новое',
    steps: {
      slot: (x: StepText): string => x.demo
        ? `Для примера возьмём броню Epic: нажми ${x.narrow ? 'значок брони (футболка)' : '**Armor**'} и **E**.${x.keys ? ' Или клавиши 4 и E.' : ''}`
        : `Выбери слот и грейд — как у вещи в игре. **E** — Epic (Steel), **L** — Legendary (Etheric).${x.keys ? ' Клавиши: 1–6, L и E.' : ''}`,
      // на примере — всегда про Speed Set: если на форме не броня, поправку даст строка tour.off
      pick: (x: StepText): string => x.demo ? 'Нажми на поле сета и выбери **Speed Set**.' : x.kind === 'armor'
        ? 'Выбери сет — он в названии вещи после «of».'
        : x.kind === 'weapon'
          ? `Main stat — одной из кнопок рядом с грейдом${x.legend ? ', а ниже найди оружие по названию: от него зависит пассивка' : ''}.`
          : x.legend
            ? 'Найди аксессуар по названию — от него зависят пассивка и то, какие main бывают.'
            : 'Отметь main stat: первое нажатие в сетке — это main, дальше идут сабстаты.',
      grid: (x: StepText): string => `${x.demo ? 'Отметь **SPD**, **CHC** и **CHD** по порядку, как в игре' : 'Отметь сабстаты по порядку, как в игре'}, а в окне — сколько сегментов горит.${
        x.kind === 'armor' ? ' Яркие клетки нужны билдам этого сета.' : ''} Отмечено ${x.n} из ${x.of}.`,
      verdict: (x: StepText): string => x.narrow
        ? 'Вердикт готов. Нажми на карточку: кому вещь подходит, что качать и код для гильдии.'
        : 'Справа — вердикт: кому вещь подходит, что качать и код для гильдии. Посмотри и нажми «Дальше».',
      // тур «Экипировка» (gear.ts): на примере — Caren · Speed
      gBuild: (): string => 'Это Caren · Speed: билд собран из вещей Caren сам. У пустого слота — «Примерить». Нажми на **шлем**.',
      gPiece: (): string => 'Прокачал вещь в игре — поправь сегменты и «T4» здесь. А новую на её место ищут так: нажми **Примерить замену**.',
      gCard: (x: StepText): string => `Оценка только для Caren: карточка сравнивает вещь с формы с билдами Caren. ${x.narrow
        ? 'На карточке — насколько она лучше надетого шлема. Посмотри и нажми «Дальше».'
        : 'В вердикте справа — насколько она лучше надетого шлема. Посмотри и нажми «Дальше».'}`,
      gEquip: (): string => 'Лучше, чем на Caren, — нажми **Заменить шлем Caren**: новый встанет в билд, а старый — такой же Speed-шлем — пойдёт ему на Breakthrough.',
      gNext: (): string => '«Следующий» оценку для Caren не сбрасывает — вводи вещи для Caren подряд. Закончил — ✕ на полосе «Только для», и оценка снова для всех.',
      next: (x: StepText): string => `«Следующий» — к новой вещи: слот, грейд, сет и main останутся, сабстаты очистятся. Нажатый случайно «Следующий» несколько секунд можно отменить кнопкой «Вернуть» — кроме обучения.${
        x.keys ? ' Клавиша — Esc.' : ''}`,
    },
  },
};

export type Texts = typeof ru;
