// Русские тексты: вердикты (logic/) и интерфейс (components/). en.ts — тот же набор ключей (тип Texts):
// TypeScript не даст пропустить перевод. **так** — жирным (components/Rich.tsx).
import type { GearKind } from '../data/types';
import type { StepText } from '../tour/types';

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
// «сегмент» к числу dec: 1 сегмент, 2–4 сегмента, 5+ сегментов; дробное — «1,5 сегмента»
const segWord = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? plural(r, 'сегмент', 'сегмента', 'сегментов') : 'сегмента';
};
// то же после «около» — родительный: около 1 сегмента, 4 сегментов, 21 сегмента; дробное — «1,5 сегмента»
const segWordGen = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? plural(r, 'сегмента', 'сегментов', 'сегментов') : 'сегмента';
};
// слот в нужной форме (GEARPOOL): шлем — м. р., броня — ж. р., оружие — ср. р., перчатки и ботинки — мн. ч.
type G = 'm' | 'f' | 'n' | 'p';
const GENUS: Record<string, G> = { weapon: 'n', accessory: 'm', helmet: 'm', armor: 'f', gloves: 'p', shoes: 'p' };
const by = (slot: string, m: string, f: string, n: string, p: string) => ({ m, f, n, p })[GENUS[slot] ?? 'm'];
const NOM: Record<string, string> = { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броня', gloves: 'перчатки', shoes: 'ботинки' };
const GEN: Record<string, string> = { weapon: 'оружия', accessory: 'аксессуара', helmet: 'шлема', armor: 'брони', gloves: 'перчаток', shoes: 'ботинок' };
const ACC: Record<string, string> = { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броню', gloves: 'перчатки', shoes: 'ботинки' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const inBr = (s?: string) => (s ? ` (${s})` : '');
// «A и B», «A, B и C»
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} и ${xs[xs.length - 1]}` : xs.join(''));
// вещь по имени: броня — «Speed-ботинки», оружие и аксессуар — «Оружие Caracal»
const named = (slot: string, what: string) => (slot === 'weapon' || slot === 'accessory' ? `${cap(NOM[slot])} ${what}` : `${what}-${NOM[slot]}`);
// «в броню, перчатки или ботинки»
const inSlots = (slots: string[]) => (slots.length ? 'в ' + (slots.length > 1 ? `${slots.slice(0, -1).map((x) => ACC[x]).join(', ')} или ${ACC[slots[slots.length - 1]]}` : ACC[slots[0]]) : '');
const orSlots = (slots: string[]) => (slots.length > 1 ? `${slots.slice(0, -1).map((x) => ACC[x]).join(', ')} или ${ACC[slots[slots.length - 1]]}` : ACC[slots[0]] ?? '');

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
    noTransistone: (has4th: boolean) =>
      `**Transistone** — не трать: по гайду outerpedia их тратят только на Irregular и красную броню.${has4th ? '' : ' Да и смена статов у Epic откроется, только когда первый Reforge добавит 4-й сабстат.'}`,
    tempNoInvest: '**Reforge** и **Breakthrough** — не вкладывай: вещь на замену, её сменит нужная.',
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
      `Броня: полезный сабстат — из 1–3 ступени приоритета билда (4-я — за ½, SPD — на любой; слабый flat — за ½ или не считается). Оставить — ${keep}+ полезных под лучший билд или ${spdKeep} с SPD от ${spdRoll} жёлтых сегментов.`,
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
    spdCarries: (good: string, roll: number) => `Полезных всего ${good}, но SPD с ${roll} жёлтыми сегментами вытягивает.`,
    twoMainCarries: (keys: string[], yellow: number) =>
      `Полезных меньше трёх, но оба главных стата — ${keys.join(' и ')} — с ${yellow} жёлтыми сегментами из 6: такой Epic стоит держать.`,
    tempTitle: (n: number) => `Временно — пойдёт ${personsDat(n)}, пока нет лучше`,
    tempWhy: (who: string, has: string[], missing: string[]) =>
      `Лучше всего: ${who}. Главный стат есть (${has.join(', ')}), ${missing.length ? `но нет ${missing.join(' / ')}: носи, пока не выпадет вещь с ${missing.join(' / ')}` : 'но второго главного нет: носи, пока не выпадет вещь лучше'}.`,
    tempFew: 'Держи 1–2 такие вещи на сет и слот, остальные — в разбор.',
    eventQuality: 'Все 4 сабстата с 3 жёлтыми сегментами (3×4) — ивентовое качество.',
    rerollOne: (key: string) =>
      `Лишний сабстат — ${key}: его одного можно перебросить Transistone (Individual), остальные три закрепятся. По гайду outerpedia Transistone тратят на Irregular-предметы и красную броню.`,
    weakEpicTitle: 'Разбирай — полезные, но слабые',
    weakEpic: (who: string, n: number, top: string[], yellow: number, max: number) =>
      `Все ${n} сабстата полезны для ${who}, но это нижние ступени приоритета: главного (${top.join(', ')}) нет, жёлтых сегментов — ${yellow} из ${max}. Вкладываться в такой Epic невыгодно: Transistone на Epic не тратят (гайд outerpedia), а в Breakthrough для Legendary он не годится.`,
    weakEpicKeepIf: (top: string[], yellow: number) => `Оставить стоило бы с ${top.join(' или ')} либо с ${yellow}+ жёлтыми сегментами на полезных статах.`,
    wrongSubs: (set: string) => `Носят ${set} Set, но сабстаты не те`,
    fodderTitle: 'Фоддер — сабстаты не дотянули',
    fodderBest: (who: string, good: string, list: string) => `Лучший вариант: ${who}, полезны только ${good}: ${list}.`,
    noneNeeded: (set: string) => `Ни один сабстат не нужен билдам с ${set} Set.`,
    fodderWhy: (piece: string, set: string) =>
      `Для Breakthrough и реролла Transistone (Total) сабстаты не важны — годится любой Legendary ${piece} ${set} Set. Держи не больше 4 на сет и слот: столько нужно, чтобы довести один предмет до T4.`,
    junkPartialTitle: 'Разбирай — даже с последним сабстатом не вытянет',
    junkTitle: 'Разбирай — сабстаты мимо',
    junkBest: (who: string, good: string, list: string) => `Даже лучшему варианту (${who}) полезны только ${good}: ${list}.`,
    epicTwo: 'Для Epic двух полезных мало, если это не два главных стата с хорошим роллом: Transistone на Epic не тратят, а в Breakthrough для Legendary он не годится.',
    enableFodder: (set: string) => `Копишь фоддер для T4 ${set} Set? Включи это в «Настройках оценки» — такие предметы станут «Фоддер».`,
    checkSpd: (roll: number) => `Проверь SPD: если у него ${roll}+ жёлтых сегмента — отметь, это уже «Оставить».`,
    maybeTitle: 'Твоим не подходит, но предмет хороший',
    maybeOthers: (names: string) => `Для персонажей не из ростера это «Оставить»: ${names}. Если планируешь их качать — не разбирай.`,
  },

  // --- вердикт: оружие и аксессуары
  gear: {
    foot: (good: number, good2: number, yellow: number) =>
      `Оружие и аксессуары: ценность Legendary — в уникальной пассивке и правильном main stat; сабстаты правят Precise Craft и Transistone. Временная замена (без нужной пассивки) стоит места, только если ролл хороший: ${good} полезных сабстата или ${good2} полезных с ${yellow}+ жёлтыми сегментами на них.`,
    stopgapMarkTitle: (n: number) => `Как временная замена подойдёт ${personsDat(n)} — отметь сабстаты`,
    stopgapMarkLine: (what: string, good: number, good2: number, yellow: number) =>
      `${what} Держать стоит только с хорошим роллом: ${good} полезных сабстата или ${good2} полезных с ${yellow}+ жёлтыми сегментами на них.`,
    byMain: 'Кому подошёл бы по main stat',
    tempTitle: (n: number) => `Временно — хороший ролл для ${personsGen(n)}`,
    tempBest: (what: string, who: string) => `${what} Лучше всего: ${who}.`,
    tempAdvice: (main: string, who: string, items: string) =>
      `Носи, пока у ${who} нет рекомендованного Legendary${items ? ` — ${items}` : ''}. Держи 1–2 лучших экземпляра на main ${main}; остальные такие — в разбор.`,
    byMainWrongSubs: 'Подошёл бы по main stat, но сабстаты не те',
    weakTitle: 'Разбирай — слабый ролл',
    weakLine: (main: string, n: number, who: string, good: string) =>
      `Main ${main} подошёл бы ${personsDat(n)}, но сабстаты слабые: даже лучшему варианту (${who}) полезны только ${good}.`,
    markYellow: (yellow: number) => `Отметь жёлтые сегменты, если их больше одного: при ${yellow}+ на полезных статах такой предмет стоит оставить.`,
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
    // плашки; updateNotice — только когда вышли новые данные, не на каждую правку приложения (hooks/usePwa)
    updateNotice: 'Вышли новые данные outerpedia — обнови, чтобы видеть свежие билды.',
    updateAction: 'Обновить',
    desktopModeNotice: 'Браузер открыл страницу в режиме «Версия для ПК» — я подстроил масштаб. Если что-то выглядит странно, выключи этот режим: меню ⋮ → «Версия для ПК».',
    // подвал
    footData: 'Данные:',
    footGameVersion: 'версия игры',
    footSnapshot: 'снимок от',
    footCounts: (chars: number, withBuilds: number, builds: number) => `${persons(chars)}, с билдами ${withBuilds}, билдов ${builds}.`,
    footUpdatePwa: 'Новые данные outerpedia — плашка «Обновить»; улучшения приложения ставятся сами при следующем запуске.',
    // пока ждёт обновление только приложения — вместо footUpdatePwa, с кнопкой updateAction
    footUpdateReady: 'Готова новая версия.',
    footUpdateSingle: 'Обновить данные:',
    footUpdateSingleWhere: 'в папке проекта.',
    footRights: 'This content is an unofficial fan creation. All related IP rights belong to VA Games Co., Ltd. Неофициальный фан-проект: все права на игру принадлежат VA Games Co., Ltd., билды — работа авторов outerpedia. Инструмент не связан ни с издателем, ни с outerpedia.',
    licenses: 'Лицензии (MIT)',
    licenseWhat: { outerpedia: 'outerpedia — рекомендации по билдам, игровые таблицы, формула flat/%', react: 'React', tabler: 'Tabler Icons — значки статов, слотов, сетов, стихий и классов' },
    installApp: 'Установить как приложение',
    footBuild: (date: string, hash: string, dirty: boolean) => `Сборка приложения: ${date} · ${hash}${dirty ? ' + незакоммиченные правки' : ''}`,
    iosFooter: 'На iPhone и iPad: в Safari «Поделиться» → «На экран „Домой“» — будет работать как приложение и без сети.',
    language: 'Язык',
    icons: 'Иконки',
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
    addFourth: '4-й сабстат от Reforge',
    fourthSheet: 'Какой 4-й сабстат добавил Reforge?',
    // настройки оценки
    settings: 'Настройки оценки',
    settingsNow: (end: boolean, fodder: boolean, lv120: boolean, quirks: boolean) =>
      [end ? 'эндгейм' : 'развитие', fodder ? 'коплю фоддер' : 'без фоддера брони', lv120 ? 'lv 120' : 'lv 100', quirks ? 'Quirks' : 'без Quirks'],
    stageGroup: 'Этап аккаунта',
    stage: 'Этап:',
    stageGrow: 'Развитие — держу временные замены',
    stageEnd: 'Эндгейм — только рекомендованное',
    fodder: 'коплю Legendary броню для Breakthrough',
    fodderNote: '(не дотянувшие по сабстатам станут «Фоддер», а не «Разобрать»)',
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
    subNote: 'Flat ATK/DEF/HP подписаны тоньше: их ценность зависит от базы персонажа. Жёлтые сегменты отмечаются в строке стата: по умолчанию 1; 4 — только из спецмагазинов и Dimensional Supply. Оранжевые (от Reforge) не считай.',
    // строки сабстатов
    subReplace: (k: string) => `${k} — заменить`,
    subMoveTitle: (k: string, row: number) => `${k} стоит в строке ${row}: переедет сюда, а та строка освободится`,
    subMoveNote: 'Цифра у стата — строка, где он уже стоит: выберешь его — переедет сюда, а та строка освободится.',
    subYellow: (k: string) => `Жёлтые сегменты ${k}`,
    yellow4: '4 жёлтых — только из спецмагазинов и Dimensional Supply',
    subRemove: (k: string) => `Убрать ${k}`,
    chainTail: (k: string) => `${k} есть на вещи, но в приоритете дальше четвёртого места — в счёт не идёт`,
    // экипировка: что надето в билдах (logic/gear, logic/vs; components/eval/VsSection, EquipSheet, chars/BuildGear)
    slotNames: { weapon: 'Оружие', accessory: 'Аксессуар', helmet: 'Шлем', armor: 'Броня', gloves: 'Перчатки', shoes: 'Ботинки' } as Record<string, string>,
    slotAcc: { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броню', gloves: 'перчатки', shoes: 'ботинки' } as Record<string, string>,
    slotNom: { weapon: 'оружие', accessory: 'аксессуар', helmet: 'шлем', armor: 'броня', gloves: 'перчатки', shoes: 'ботинки' } as Record<string, string>,
    vsTitle: 'Сейчас на персонажах',
    vsNow: 'сейчас',
    vsNew: 'новая',
    vsWorn: (grade: string, bt: number | null, done: number, max: number) => `сейчас: ${grade}, Breakthrough ${bt === null ? 'не указан' : 'T' + bt}, Reforge ${done} из ${max}`,
    vsKind: { fill: 'пустой слот', eq: 'на уровне', capped: 'на уровне', worn: 'уже есть', breaks: 'ломает сет', completes: 'соберёт', stats: 'только статы', starts: 'начнёт', off: 'не по билду', rec: 'рекомендованная', stopgap: 'временная', better: 'лучше' } as Record<string, string>,
    vsSr: { up: 'лучше надетой: ', down: 'хуже надетой: ' } as Record<string, string>,
    vsPlaces: (gained: { key: string; place: number }[], lost: { key: string; place: number }[]) =>
      [...gained.map((x) => `+${x.key} (${x.place}-е)`), ...lost.map((x) => `−${x.key} (${x.place}-е)`)].join(' · '),
    vsDelta: (pct: number) => `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}% полезных сегментов.`,
    vsTimes: (n: number) => `Полезных сегментов в ${n} ${plural(n, 'раз', 'раза', 'раз')} больше.`,
    vsEmpty: 'У надетой полезных нет: ни один её сабстат этому билду не засчитывается.',
    vsAhead: (k: string, worn: number, next: number) => `На надетой больше сегментов: ${k} — ${dec(worn)} против ${dec(next)} у новой.`,
    // оружие и аксессуар: решила пассивка, а не сегменты (logic/vs, Vs.why)
    vsWhy: {
      rec: 'Эта вещь — из рекомендованных билду, надетая — нет: пассивка важнее сабстатов.',
      stopgap: 'Надета рекомендованная, а эта — временная: пассивка важнее сабстатов, менять не нужно.',
    } as Record<string, string>,
    vsBt: (bt: number) => `Сейчас надетая — на Breakthrough T${bt}: новой до T${bt} нужно ${bt} ${plural(bt, 'материал', 'материала', 'материалов')}.`,
    vsMaterial: (bt: number) => `Та же вещь, что надета (T${bt}): эта — ступень её Breakthrough, T${bt} → T${bt + 1}.`,
    vsPassive: 'Другая пассивка: сравниваю только сабстаты, а какая пассивка лучше — решает билд.',
    // Speed ×2 и Penetration ×2 дают бонус только на T4 (logic/builds t4Only)
    vsT4: (set: string, n: number, capped: boolean) => `${set} ×${n} даёт бонус только на T4: пока новая не на T4, бонуса не будет${capped ? ' — поэтому не выше «на уровне»' : ''}.`,
    equipTo: (name: string) => `Надеть на ${name}`,
    replaceOn: (slot: string, name: string) => `Заменить ${slot} ${name}`,
    equipPick: 'Надеть на…',
    equipSheet: 'Кому надеть?',
    equipSearch: 'Имя персонажа',
    equipNone: 'Ни одному билду она ничего не даст. Найди персонажа по имени — с полезными статами она встанет в его «По статам».',
    equipNoneQ: 'Никому с таким именем она ничего не даст.',
    // «Кому надеть?» (GEARPOOL): строка на персонажа
    equipRowCompletes: (build: string) => `Надеть — соберёт ${build}`,
    equipRowCloser: (build: string, n: number, m: number) => `Надеть — ${build}: сет ${n} из ${m}`,
    equipRowStarts: (builds: string) => `Надеть — начнёт ${builds}`,
    equipRowEq: (build: string) => `Надеть — ${build}`,
    // исходы вещи по пулу (logic/pool): чип, строки «Сейчас на персонажах» и карточки
    vsCloser: (n: number, m: number) => `сет ${n} из ${m}`,
    vsProgress: (build: string, n: number, m: number, set: string, k: number, of: number) => `${build}: будет ${n} из ${m} — ${set} ${k} из ${of}.`,
    vsNeed: (set: string, slots: string[]) => `Ещё одна ${set} — ${inSlots(slots)} — соберёт его.`,
    vsHalf: (part: string) => `Соберёт половину: ${part}.`,
    vsStays: (set: string, slot: string, build: string) => `${set}-${NOM[slot]} ${by(slot, 'остаётся', 'остаётся', 'остаётся', 'остаются')} в ${build}.`,
    vsShuffle: (slot: string, a: string, b: string) => `Переставит: ${NOM[slot]} — ${a} вместо ${b}.`,
    vsSurplus: (part: string) => `Сверх ${part}: займёт пустой слот, сет не продвинет.`,
    vsSafe: (build: string) => `${build} она не тронет.`,
    vsBreaksBy: (set: string, slot: string, pct: number, part: string) => `Лучше ${set}-${GEN[slot]} на ${pct}%, но встанет только вместо ${by(slot, 'него', 'неё', 'него', 'них')} — ${part} распадётся.`,
    vsBreaksFix: (set: string, t4: boolean, slots: string[]) => `Встанет, если найдёшь ещё ${set}-вещь${t4 ? ' на T4' : ''}: ${orSlots(slots)}.`,
    // отметить одну: другая вещь сета уже на T4. subs — сабстаты вещи («DEF% 2, CHC 2»), когда в слоте их несколько (П6)
    vsBreaksMarkOne: (set: string, slot: string, subs?: string) => `Встанет, если отметить Breakthrough T4 у ${set}-${GEN[slot]}${inBr(subs)}.`,
    vsBreaksMarkTwo: (set: string, a: string, b: string, subsA?: string, subsB?: string) => `Встанет, если отметить Breakthrough T4 у ${set}-${GEN[a]}${inBr(subsA)} и -${GEN[b]}${inBr(subsB)}.`,
    // Breakthrough у вещей известен (0–3; любой сет — Р20 (б), Pen mix — П5): «сделать», не «отметить»
    vsBreaksMakeOne: (set: string, slot: string, subs?: string) => `Встанет, если сделать Breakthrough T4 у ${set}-${GEN[slot]}${inBr(subs)}.`,
    vsBreaksMakeTwo: (set: string, a: string, b: string, subsA?: string, subsB?: string) => `Встанет, если сделать Breakthrough T4 у ${set}-${GEN[a]}${inBr(subsA)} и -${GEN[b]}${inBr(subsB)}.`,
    vsNoTrade: (set: string) => `Бонус ${set} в статах не выразить — ради статов его не ломаю.`,
    vsNetGain: (part: string, segs: number, stat: string, slot: string) => `${part} распадётся (−${dec(segs)} ${segWord(segs)} ${stat}), но ${NOM[slot]} ${by(slot, 'даёт', 'даёт', 'даёт', 'дают')} больше — в итоге выгоднее.`,
    vsStatsOnly: (pct: number, slot: string, part: string) => `По статам лучше ${GEN[slot]} на ${pct}%, но сломает ${part} — не надевай.`,
    // «только статы», а у надетой полезных нет: процента нет — одна строка вместо vsEmpty и vsStatsOnly
    vsStatsEmpty: (slot: string, part: string) => `По статам лучше: у ${by(slot, 'надетого', 'надетой', 'надетого', 'надетых')} ${GEN[slot]} полезных нет. Но сломает ${part} — не надевай.`,
    // bonus — текст сета из данных («Speed +13%»), segs — числом: запятую ставит dec
    vsSetCost: (part: string, tier: string, bonus: string, segs: number, stat: string, slot: string) => `${part} на ${tier} — это ${bonus}, около ${dec(segs)} ${segWordGen(segs)} ${stat}. ${cap(NOM[slot])} ${by(slot, 'даёт', 'даёт', 'даёт', 'дают')} меньше.`,
    vsBonusGain: (part: string, bonus: string) => `С ней: + ${part} — ${bonus}.`,
    vsBonusLost: (part: string, tier: string, bonus: string) => `Пропадёт: ${part} (${tier}) — ${bonus}.`,
    vsAlso: (builds: string, n: number) => `Пойдёт и в: ${builds} — ${n > 1 ? 'их' : 'его'} ты не собираешь.`,
    vsStarts: (builds: string) => `Пойдёт и в: ${builds} — начнёт собираться.`,
    vsMore: (list: string) => `Ещё: ${list}`,
    orOther: (name: string, build: string) => `или — ${name} · ${build} ▸`,
    // вторая кнопка заменяет вещь героя (Р7): slot — в винительном («шлем», «броню», «перчатки»)
    orReplace: (slot: string, name: string, build: string) => `или — заменить ${slot} ${name} · ${build} ▸`,
    // тосты «Надеть» / «Заменить» / «Убрать»
    countsIn: (builds: string) => `Идёт в ${builds}.`,
    startedFilling: (build: string) => `Начал собирать ${build}.`,
    removedFrom: (name: string) => `Убрано у ${name}.`,
    stillWith: (names: string) => `У ${names} она осталась.`,
    // «Это шлем Caren?»
    twinShare: (name: string) => `Она же — и у ${name}`,
    twinShareNote: 'Одна вещь: Reforge и Breakthrough — общие, правка видна у обоих.',
    twinOtherNote: (name: string) => `Вторая копия в инвентаре: у ${name} будет отдельная вещь.`,
    twinFoot: 'В игре вещь носит кто-то один. Здесь — просто видно, что она нужна обоим.',
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
    slotAlsoWith: (names: string) => `и у ${names}`,
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
    poolWith: (names: string) => `и у ${names}`,
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
    pieceRemoveAll: 'Разобрал — убрать у всех',
    pieceRemoveNote: (name: string) => `Разобрал её, пустил на Breakthrough или она не нужна ${name} — убери: билды соберутся заново.`,
    pieceNowhere: 'Ни в одном билде: в каждом стоит лучше.',
    gearNewerCode: 'Код сохранила более новая версия страницы — обнови страницу.',
    fusionGear: (base: string, fusion: string) => `Вещи ${base} перешли к ${fusion}.`,
    // Core Fusion X заменил X (logic/fusion): пометка в списке, строка карточки X, окна перехода
    fusionOffMark: (base: string) => `заменён Core Fusion ${base}`,
    fusionOffCard: (base: string) => `${base} заменён Core Fusion ${base}: в ростере и с вещами — Core Fusion ${base}.`,
    fuseAskTitle: (base: string) => `Отметить Core Fusion ${base}?`,
    fuseAskText: (base: string, n: number) => (n
      ? `Все вещи ${base} (${n}) перейдут к Core Fusion ${base}, а ${base} станет неактивным: в ростере — только Core Fusion ${base}.`
      : `${base} станет неактивным: в ростере — только Core Fusion ${base}.`),
    fuseAskYes: (base: string) => `Да, Core Fusion ${base}`,
    unfuseAskTitle: (base: string) => `Вернуться к ${base}?`,
    unfuseAskText: (base: string, n: number) => (n ? `Core Fusion ${base} уйдёт из ростера, его вещи (${n}) перейдут к ${base}.` : `Core Fusion ${base} уйдёт из ростера.`),
    unfuseAskYes: (base: string) => `Да, ${base}`,
    cancel: 'Отмена',
    // сняли звезду с героя, у которого есть вещи (Р16: вещи только у героев ростера), — окно RosterRemoveAsk
    rosterRemoveTitle: (name: string) => `Убрать ${name} из ростера?`,
    rosterRemoveText: (name: string, n: number) => `Вещи ${name} (${n}) уберутся из приложения.`,
    rosterRemoveYes: 'Да, убрать',
    // тост после «Да, убрать»: только о герое — вещи, что есть у других, просто не используются здесь
    rosterRemoved: (name: string) => `${name} — не в ростере.`,
    // строка окна «Кому надеть?»: что будет по нажатию
    slotGen: { weapon: 'оружия', accessory: 'аксессуара', helmet: 'шлема', armor: 'брони', gloves: 'перчаток', shoes: 'ботинок' } as Record<string, string>,
    equipRowFill: (build: string) => `Надеть — пустой слот · ${build}`,
    equipRowReplace: (acc: string, build: string) => `Заменить ${acc} — новая лучше · ${build}`,
    // «Надеть» заменит вещь её слота (poolVs replaces): подпись — действие
    equipRowReplaceCompletes: (acc: string, build: string) => `Заменить ${acc} — соберёт ${build}`,
    equipRowReplaceCloser: (acc: string, build: string, n: number, m: number) => `Заменить ${acc} — ${build}: сет ${n} из ${m}`,
    equipRowReplaceStarts: (acc: string, builds: string) => `Заменить ${acc} — начнёт ${builds}`,
    equipRowWorn: (build: string) => `Уже есть — та же вещь в ${build}`,
    equipNote: 'Здесь — те, кому вещь встанет в билд. Не по билду — найди персонажа по имени: она встанет в «По статам».',
    equipped: (name: string, slot: string) => `Надето на ${name}: ${NOM[slot]}.`,
    replaced: (name: string, slot: string) => `Заменено: ${NOM[slot]} ${name}.`,
    // убраны 2+ вещи её слота: olds — имя сета у брони, предмета у оружия и аксессуара
    replacedMany: (name: string, slot: string, olds: string[]) => `Заменено: ${NOM[slot]} ${name} — убраны прежние: ${andList(olds)}.`,
    // what — как в oldStill: убраны 2+ — имя вместо «Старые»
    oldMaterial: (slot: string, what?: string) => `${what ? named(slot, what) : `${cap(by(slot, 'старый', 'старая', 'старое', 'старые'))} ${NOM[slot]}`} — материал для Breakthrough ${by(slot, 'нового', 'новой', 'нового', 'новых')}.`,
    // what — имя сета или предмета, когда убраны 2+ (replacedMany): «Speed-ботинки остались…» вместо «Старые…»
    oldStill: (slot: string, name: string, build: string, what?: string) => `${what ? named(slot, what) : cap(by(slot, 'старый', 'старая', 'старое', 'старые'))} ${by(slot, 'остался', 'осталась', 'осталось', 'остались')} у ${name} (в ${build}).`,
    sameAs: (name: string) => `Та же вещь, что у ${name}: Reforge и Breakthrough общие.`,
    // та же вещь уже на другом персонаже (logic/gear twinElsewhere): переносим, только если игрок подтвердил
    twinTitle: (slot: string, name: string) => `Это ${NOM[slot]} ${name}?`,
    twinNote: (name: string, build: string) => `Такая же вещь уже у ${name} (в ${build}): совпадают слот, сет, main и жёлтые сегменты.`,
    twinOther: 'Другая — своя',
    gearTitle: (n: number) => `Собрано · ${n} из 6`,
    gearShared: (where: string) => `Стоит ${where} — правка изменит везде.`,
    pieceWhere: (builds: string, names: string) => [builds && `в ${builds}`, names && `и у ${names}`].filter(Boolean).join(' '),
    // меню ☰ и список персонажей: у кого что надето
    menuGear: (n: number) => `Экипировка · ${n}`,
    withGear: 'с экипировкой',
    gearCount: (n: number) => `экипировка у ${n}`,
    // видны с фильтром «с экипировкой», а он этих персонажей прячет — сначала снять его
    gearRest: (n: number) => `У ${personsGen(n)} из ростера ещё нет вещей — сними «с экипировкой», открой персонажа и нажми «Собрать билд».`,
    gearNobody: 'Пока ни у кого нет вещей. Сними «с экипировкой», открой персонажа и нажми «Собрать билд» — или «Надеть» в вердикте.',
    gearTile: (n: number) => `надето ${n} из 6`,
    // «Слабее всех» — самая слабая вещь брони в билде и что искать ей на замену
    weakest: (slot: string, grade: string, bt: number | null) => `Слабее всех — ${slot} (${grade}, Breakthrough ${bt === null ? 'не указан' : 'T' + bt}).`,
    weakestLook: (piece: string, stats: string[]) => `Ищи ${piece} с ${stats.join(' и ')} — в примерке вердикт покажет, лучше ли она надетой.`,
    weakestTry: 'Примерить вещи',
    pieceTitle: (slot: string, name: string) => `${slot} · ${name}`,
    pieceSegHint: 'Жёлтые — из оценки. Сделал Reforge — нажми дальше: добавятся оранжевые. Нажми на жёлтую — жёлтых станет меньше; больше — через название стата.',
    pieceReforge: (done: number, max: number) => `Reforge: ${done} из ${max} — считаю по оранжевым сегментам`,
    pieceNoFourth: 'У Epic первый Reforge добавляет 4-й сабстат — сначала «+ 4-й сабстат от Reforge», потом оранжевые.',
    pieceBtUnknown: 'не указан',
    // сегмент в карточке вещи — для диктора: жёлтый от ролла или оранжевый от Reforge (иначе различие только цветом)
    segLabel: (n: number, kind: string) => (kind === 'y' ? `${n}, жёлтый` : kind === 'o' ? `${n}, Reforge` : String(n)),
    pieceStatHint: 'Transistone сменил стат или жёлтые отмечены не так — нажми на название стата: выбери стат и сколько у него жёлтых. Оранжевые останутся.',
    yellowSheet: (k: string) => `Сколько жёлтых у ${k}?`,
    yellowNote: (orange: number) => orange ? `Как сейчас в игре. Оранжевые (Reforge: ${orange}) останутся.` : 'Как сейчас в игре.',
    pieceRemove: (name: string) => `Убрать у ${name}`,
    pieceDone: 'Готово',
    gearCodeLabel: 'Экипировка — код для резервной копии и переноса на другое устройство',
    // во время обучения на странице пример, а не вещи игрока: код показал бы и заменил бы пример
    gearCodeTour: 'Код экипировки — после обучения: пока оно идёт, на странице пример, а не твои вещи.',
    gearApplied: (n: number) => `Экипировка загружена: вещей ${n}.`,
    gearRosterAdded: (names: string) => `В ростер добавлены: ${names}.`,
    rosterKeptGear: (names: string) => `Оставлены в ростере — у них есть вещи: ${names}.`,
    // окно перехода Core Fusion (App): кто кого заменил в ростере; «Вещи … перешли к …» — fusionGear
    fusionReplaces: (fusion: string, base: string) => `${fusion} заменяет ${base} в ростере.`,
    // после загрузки, импорта и пакетного добавления: есть оба — остаётся Core Fusion (logic/fusion normalizeFusion)
    fusionFixed: (base: string, how: 'moved' | 'removed' | 'none') =>
      `В ростере оставлен Core Fusion ${base}: ${base} заменён${how === 'moved' ? `, его вещи перешли к Core Fusion ${base}` : how === 'removed' ? ', его вещи убраны' : ''}.`,
    gearBad: 'Код не читается — скопируй его целиком, с OGC-GEAR в начале.',
    gearNewer: 'Экипировку сохранила более новая версия страницы — обнови страницу, чтобы её видеть и менять.',
    addSub: 'Добавить сабстат',
    mainGroup: 'Main stat',
    mainInGrid: 'Main ↓',
    mainFirst: 'Сначала main stat — он в игре сверху предмета, потом сабстаты по порядку. Бледные — такой main никому не нужен.',
    mainCell: (k: string) => `Main stat ${k} — нажми, чтобы убрать`,
    fixedMainCell: (k: string) => `${k} — main этого слота: сабстатом здесь не бывает`,
    usefulTitle: (k: string, credit: number) => `${k}${credit >= 1 ? ' — нужен билдам этого сета' : credit > 0 ? ' — нужен, но далеко в приоритете (за ½)' : ' — билдам этого сета не нужен'}`,
    triageHint: (legend: boolean, fodder: boolean) => (legend
      ? `Ярких статов на вещи 0–1 — ${fodder ? 'в фоддер, не прокачивай' : 'в разбор'}`
      : 'Ярких статов на вещи 0–1 — сразу в разбор'),
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
    menu: 'Меню',
    details: 'подробнее',
    // персонажи
    charsHint: '☆ — отметь своих: оценка будет учитывать только их',
    charSearch: 'Имя: Stella, Demiurge, Gnosis…',
    onlyMine: 'только мои',
    withoutBuilds: 'показать и без билдов',
    rosterCount: 'В ростере:',
    markShown: 'отметить всех показанных',
    exportImport: 'экспорт / импорт',
    nobodyFound: 'Никого не нашлось.',
    rosterToggle: (name: string, own: boolean) => `${name} — ${own ? 'убрать из ростера' : 'добавить в ростер'}`,
    clearRoster: 'очистить ростер',
    clearConfirm: 'точно очистить? нажми ещё раз',
    rosterSelected: 'Выделено — нажми Ctrl/Cmd+C',
    rosterApplied: (replace: boolean, n: number, missed: string) => `${replace ? 'Заменено' : 'Добавлено'}: ${n}${missed ? `; не распознано: ${missed}` : ''}`,
    rosterCodeLabel: 'Код ростера (slug через запятую). Скопируй, чтобы перенести в другой браузер, или вставь свой: «Заменить» заменит текущий ростер, «Добавить» — допишет.',
    replace: 'Заменить',
    add: 'Добавить',
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
      '**Вбей вещь:** слот, грейд (L — Etheric, E — Steel), сет или предмет; сабстаты — сеткой, по порядку, как в игре, жёлтые сегменты — в строках.',
      '**Вердикт** — сразу, с объяснением. «Следующий» — к следующей вещи: слот, грейд, сет и main остаются, сабстаты очищаются.',
    ],
    markChars: 'Отметить персонажей',
    canInstall: 'Можно установить как приложение — работает и без сети.',
    install: 'Установить',
    iosInstall: '**iPhone и iPad:** Safari → «Поделиться» → «На экран „Домой“» — будет работать и без сети.',
    helpInput: 'Ввод вещи',
    helpInputItems: [
      '**Броня** — сет: он в названии после «of» (Etheric Gloves of Speed → Speed Set).',
      '**Legendary оружие и аксессуар** — найди предмет и отметь main stat. Совсем новый, которого нет в списке, — «нет в списке».',
      '**Epic оружие и аксессуар** (Steel…) — пассивки нет, сразу main stat.',
      '**Main stat** у оружия — кнопки ATK% / DEF% / HP% рядом с грейдом; у аксессуара — первое нажатие в сетке, дальше сетка отмечает сабстаты. Ярче — main, который кому-то нужен. Нажми выбранный ещё раз, чтобы убрать.',
      '**Сабстаты** — нажми в сетке; ярче — статы, нужные билдам выбранного сета. Статы стоят парами по параметру, один над другим: ATK% над ATK, HP% над HP, DEF% над DEF, CHC над CHD, DMG UP% над DMG RED%, EFF% над RES%. Клетка с пометкой main — такого сабстата на этой вещи не бывает: он уже в main (HP% у шлема и ботинок, flat DEF у брони и перчаток, flat ATK у оружия). Flat EFF и flat RES в main сабстатам EFF% и RES% не мешают — в игре это разные статы. В сетке все 13 сабстатов игры; PEN%, CDMG RED%, flat EFF и flat RES сабстатами не бывают — только main.',
      '**4-й сабстат у Epic** — Epic выпадает с тремя, четвёртый добавляет первый Reforge: один из статов, которых на вещи нет, с равными шансами. **Кубик** у штампа — «3/9»: столько из возможных вытянут вещь, даже с одним сегментом; какие и кому — в подробностях, в окне «+ 4-й сабстат от Reforge» они с точкой. Сделал Reforge — отметь выпавший.',
      'Нажми на стат в строке, чтобы заменить его (жёлтые сегменты останутся) или убрать. При замене можно выбрать и стат из другой строки: он переедет сюда, а та строка освободится — так удобно вводить следующую вещь поверх прошлой. Убрать можно и повторным нажатием в сетке. Код, справка и настройки — в меню ☰.',
    ],
    helpRoutine: 'Как быстро разбирать',
    helpRoutineItems: [
      'Всё ниже 6★ и ниже Epic — сразу в разбор.',
      'Иди по инвентарю по дате получения: подряд обычно дропы одного забега, и сет остаётся с прошлой вещи.',
      '**Epic-броня:** выбери слот и сет и посмотри на сетку. Ярких статов на вещи 0–1 — в разбор, ничего не вводя: «Оставить» и «Временно» так не бывает. У Speed, Immunity и Swiftness ярко почти всё — там вводи.',
      'У Epic после двух ненужных сабстатов вердикт появляется сразу — третий можно не вводить.',
      '**Кубик у «Разобрать»** — вещь может вытянуть один Reforge. Не разбирай её сразу: отложи, сделай Reforge и отметь 4-й сабстат. Не повезло — в разбор, дальше не вкладывай.',
      '«Оставить» — поставь замок, чтобы не разобрать случайно; «Временно» — носи, пока не найдёшь лучше.',
      '**Breakthrough у Epic** — только такой же вещью: Epic того же сета и слота, сабстаты не важны. Есть Epic-«Оставить» не на T4 — Epic того же сета и слота из разбора откладывай ему, нужно 4 штуки.',
      '**Epic оружие и аксессуар:** на «Эндгейме» — в разбор; на «Развитии» сначала main stat: бледный — он никому не нужен, в разбор.',
      '**Legendary** с «коплю фоддер»: вердикт покажет, какие прокачивать, а какие оставить на Breakthrough.',
    ],
    helpVerdicts: [
      '**Оставить** — вещь нужна: носи и прокачивай, что именно — в блоке «Прокачка» в подробностях. «Стоит Reforge» — ролл хороший: после Reforge на полезных статах будет много сегментов, вкладывать в первую очередь. Такая же вещь уже у персонажа — тоже «Оставить», без «Прокачки»: она у тебя в деле.',
      '**Временно** — носи, пока не найдёшь лучше: у оружия и аксессуара нет нужной пассивки, у Epic-брони только один главный стат. Кубик рядом — один Reforge может сделать её «Оставить».',
      '**Фоддер** — оставь на Breakthrough такой же вещи с правильным main stat — или такой же вещи персонажа не на T4 (см. «Экипировка»). Так же — у Legendary, которая никого не улучшит: всем, кому подходит, она ничего не даёт.',
      '**Спорно** — решай сам: в подробностях написано, в чём сомнение (например, вещь хороша для персонажа не из твоего ростера). Кубик рядом — один Reforge может сделать её нужной твоим персонажам.',
      '**Разобрать** — твоим персонажам не подходит, ролл слабый или всем, кому она подходит, она ничего не даёт (см. «Экипировка»). Кубик рядом — шанс, что вещь вытянет один Reforge: сколько статов из возможных, написано на нём.',
    ],
    helpChars: [
      'Звёздочка отмечает персонажа в ростере; с галочкой «только мои персонажи» оценка учитывает только их. «Экспорт / импорт» переносит ростер кодом на другое устройство. Вещи бывают только у персонажей ростера: «Надеть» добавляет в ростер, импорт кода экипировки — всех, у кого есть вещи; снимешь звезду с персонажа с вещами — приложение спросит, убрать ли их. Core Fusion заменяет героя: отметишь Core Fusion Eternal — вещи Eternal перейдут к Core Fusion Eternal, а Eternal станет неактивным и встанет в списке сразу за Core Fusion Eternal; звезда на Eternal вернёт всё назад.',
      'Нажми на персонажа — откроются его билды: сеты, оружие, приоритет сабстатов. Звёздочка есть и в карточке, рядом с именем; стихия и класс — значками на портрете, «outerpedia ↗» открывает страницу персонажа на outerpedia.',
      '**Экипировка** — вещи у персонажа, а билды собираются из них сами: один Speed-шлем идёт и в Speed, и в Speed/Immu. У билда с несколькими связками сетов каждая связка — отдельный вариант: показан самый собранный, остальные — в чипах и «ещё N». Вещь к персонажу кладёт вердикт — «Надеть на…» в подробностях, на телефоне ещё и кнопка под карточкой, — и только ту, что встанет в билд или в «По статам»: вещь без полезных статов к персонажу не попадает. Вещь не по билду сама не предлагается — найди персонажа по имени в «Надеть на…» или начни примерку. В карточке персонажа нажми на вещь — отметь оранжевые сегменты после Reforge и Breakthrough; сколько Reforge сделано, приложение считает само. Enhance не отмечается: считаем, что вещь на +10. Бонус сета — по Breakthrough вещей: ×2 на T4, если хотя бы две вещи сета на T4; ×4 на T4 — если все четыре. Разобрал вещь или пустил на Breakthrough — «Убрать у…» в карточке вещи или в «Вещи X · N». Кто с вещами — ☰ → «Экипировка», на компьютере — фильтр «с экипировкой». Во время обучения кода экипировки нет: на странице пример.',
      '**Собираю** — какие билды ждут вещи: отмеченные «Собираю», примерка и все начатые — где стоит хоть одна вещь из сетов билда или оружие либо аксессуар из его списка с нужным main, при любом Breakthrough. Не собираешь — выключи «Собираю». «По статам» — отдельный билд у каждого персонажа: все его вещи по цепочке, без сетов. Штамп он держит, пока ни один билд не начат; потом его строка — тихая.',
      '**Примерка** — оценка для одного билда (варианта связки): «Собрать билд», «Примерить» у пустого слота или «Примерить замену» у вещи в карточке персонажа. Сравнение — только с ним, «Надеть» — сразу ему, «Следующий» примерку не сбрасывает, ✕ — снова для всех. Вещь не по билду, но с полезными статами — «Надеть» положит её в «По статам».',
      '**Сейчас на персонажах** — в подробностях вердикта, строка на персонажа ростера: что с вещью станет с его билдами — «соберёт», «сет 3 из 4», «пустой слот», ▲ лучше или ▼ хуже того, что стоит в билде, или такой же вещи её сета у персонажа (две цепочки рядом и на сколько по полезным сегментам с учётом Reforge впереди), «ломает сет», «только статы»; остальные билды — строкой «Ещё». Сет можно сломать, только если в итоге выгоднее; сет с бонусом-эффектом (Immunity, Penetration) ради статов не ломается. Такая же вещь у другого — «Это шлем Rin?»: «Она же — и у…» (одна вещь, Reforge и Breakthrough общие) или «Другая — своя». «Заменить» вместо «Надеть» — прежняя вещь этого слота больше ни в одном билде (и в «По статам») не нужна: она уберётся. Штамп: «Разобрать» → «Фоддер», если такая же вещь (тот же слот, сет и грейд; у оружия и аксессуара — тот же предмет и грейд) стоит в собираемом билде персонажа, её Breakthrough отмечен и не T4 — эта ей материал. «Оставить» и «Временно» → «Разобрать», если введены все сабстаты и никому из тех, кому вещь подходит, она ничего не даёт (Legendary «Оставить» — «Фоддер», броня — если копишь фоддер). Штамп держат: персонаж без вещей, вещь начнёт ему билд, «соберёт», «сет 3 из 4», пустой слот, «лучше», «ломает сет» и «на уровне из-за T4», когда по сегментам лучше, другая рекомендованная пассивка; у оружия и аксессуара — ещё и вещь не по билду в слоте. Такая же вещь у персонажа — «Оставить». Резервная копия — код OGC-GEAR2 в «Экспорт / импорт».',
    ],
    helpCode: 'Код для гильдии',
    helpCodeText: (example: string) => `В подробностях вердикта есть код вещи, например ${example}. Скопируй его в чат игры; кто получил — нажимает «Ввести код» и перепечатывает. Оценка у каждого — по своему ростеру.`,
    helpInstall: 'Установка',
    helpInstallItems: [
      '**Android (Chrome):** меню ⋮ → «Установить приложение» или «Добавить на главный экран».',
      '**iPhone и iPad:** в Safari «Поделиться» → «На экран „Домой“».',
      'Установленное приложение работает без сети. Когда выйдут новые данные outerpedia, появится плашка «Обновить»; улучшения приложения ставятся сами при следующем запуске.',
    ],
    wikiLink: 'Подробное руководство — в Wiki ↗',
    wikiUrl: 'https://github.com/cotton-more/outerplane-gear-check/wiki/Начало-работы',
  },
  // --- обучение (src/tour): кнопки, полосы и шаги главного тура; шаг — функция от StepText (src/tour/types.ts)
  // --- материал Breakthrough для надетой вещи (logic/material): «Разобрать» → «Фоддер»
  material: {
    title: (slotGen: string, who: string) => `Фоддер — материал Breakthrough для ${slotGen} ${who}`,
    need: (slot: string, who: string, bt: number, left: number) => `${slot} ${who} — T${bt}, ещё ${left} шт. до T4`,
    line: (list: string) => `**Материал**: такая же вещь надета не на T4 — ${list}. Одна вещь — одна ступень Breakthrough, сабстаты не важны.`,
    plan: '**Не прокачивай и не разбирай** — отдай в Breakthrough надетой: одна вещь — одна ступень.',
    // вещь лучше надетой, для которой она материал: надеть её, старую — ей в Breakthrough. Штамп — про неё: «Оставляй»
    // (решение владельца). slot — id слота: «надетого шлема», «надетой брони», «надетых перчаток»
    titleWear: (slot: string, who: string) => `Оставляй — лучше ${by(slot, 'надетого', 'надетой', 'надетого', 'надетых')} ${GEN[slot]} ${who}: надень её, а старую — ей в Breakthrough`,
    lineWear: (list: string) => `**Лучше надетой**: такая же вещь надета не на T4, но слабее этой — ${list}. Надень эту, а старую отдай ей в Breakthrough`,
    // новая уже на T4: старую ей в Breakthrough не отдать — только надеть
    titleWearT4: (slot: string, who: string) => `Оставляй — лучше ${by(slot, 'надетого', 'надетой', 'надетого', 'надетых')} ${GEN[slot]} ${who}: надень её`,
    lineWearT4: (list: string) => `**Лучше надетой**: такая же вещь надета не на T4 и слабее этой — ${list}. Надень эту.`,
    planReplace: (who: string) => `**Надень её** на ${who}: она лучше надетой, а старая — такая же вещь: отдай её новой в Breakthrough, одна вещь — одна ступень.`,
    // в примерке у цели слот пуст или вещь лучше надетой
    planWear: (who: string) => `**Надень её** на ${who}, пока нет лучше, — в Breakthrough надетой не отдавай.`,
  },

  // --- штамп по надетому (logic/worn): всем, кому подходит, уже надето не хуже; вещь уже в билде
  worn: {
    // eq — у кого-то «на уровне»: «не хуже», а не «лучше». Причина — первой: на карточке (280px) заголовок в одну
    // строку, длинное имя («Kitsune of Eternity Tamamo-no-Mae») съело бы «уже лучше»
    title: (v: 'junk' | 'fodder', names: string[], eq: boolean) =>
      `${v === 'fodder' ? 'Фоддер' : 'Разбирай'} — уже ${eq ? 'не хуже' : 'лучше'} у ${names.length > 2 ? `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}` : names.join(' и ')}`,
    line: '**Никого не улучшит**: всем, кому она подходит, уже надето не хуже. Сама по себе вещь неплохая.',
    stale: 'Разобрал вещь в игре — убери её в карточке персонажа, и вердикт пересчитается.',
    keptTitle: (who: string) => `Оставляй — она уже у ${who}`,
    kept: (who: string) => `**Уже есть**: у ${who}. Не нужна — убери её в карточке персонажа.`,
  },

  // --- примерка: оценка для одного персонажа и билда (logic/tryon, components/eval/TryOnStrip)
  tryon: {
    label: 'Примерка',
    end: 'Закончить примерку',
    // заголовок вердикта после « — »: кому ещё нужна и что с ней у этого персонажа (temp — вердикт «Временно»)
    others: (names: string[], armor = true) => `${armor ? 'нужна' : 'нужен'} ${names.length > 2 ? `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}` : names.join(' и ')}`,
    clause: (kind: string, name: string, build: string, temp: boolean, x: { n?: number; m?: number; part?: string } = {}): string => ({
      fill: temp ? `${name}: пустой слот — пока сойдёт` : `у ${name} слот пуст`,
      up: `лучше, чем на ${name}`,
      eq: `на ${name} — на уровне`,
      down: `на ${name} уже лучше`,
      breaks: `на ${name} сломает сет`,
      worn: `уже у ${name}`,
      off: `${name} · ${build} — не по билду`,
      completes: `у ${name} соберёт ${build}`,
      closer: `${name} · ${build}: сет ${x.n} из ${x.m}`,
      capped: `на ${name} — на уровне: ${x.part} на T4`,
      surplus: `у ${name} — сверх ${x.part}`,
      nothing: `${name} · ${build} — ничего не даст`,
    } as Record<string, string>)[kind] ?? '',
    // «Разобрать», а ей вещь лучше надетого или слот пуст
    butWear: (kind: string, name: string) => `но ${kind === 'fill' ? `у ${name} слот пуст` : `лучше, чем на ${name}`}: надень, пока нет лучше`,
    offBuild: (build: string, set: string | null, combos: string) => (set ? `Не по билду ${build}: ${set} в его связках нет.` : `Не по билду ${build}: ему нужны ${combos}.`),
    // примерка настоящего билда, а вещь не по нему, но с полезными статами — «Надеть» положит её в «По статам» (Р11)
    offStats: (name: string) => `${name} она подходит по статам — «Надеть» положит её в «По статам».`,
    // примерка «По статам», а у вещи нет полезных статов (Р13)
    noStats: (name: string) => `${name} эта вещь ничего не даст: полезных статов нет.`,
    // оружие или аксессуар не для класса героя (classLimits): дело не в статах
    noClass: (name: string) => `${name} не носит этот предмет: он для другого класса.`,
    slot: 'Примерить',
    replace: 'Примерить замену',
    build: 'Собрать билд',
    empty: (build: string, name: string) => `Собери билд ${build}: вводи вещи ${name} из инвентаря — и вердикт начнёт сравнивать новые вещи с ними.`,
    emptyOr: 'Или жми «Надеть» в вердикте — вещь сама добавится к вещам персонажа.',
    emptyStats: (name: string) => `«По статам» — вещи ${name} по цепочке, без сетов. Сюда встаёт и то, что ${name} носит в игре не по билду: жми «Собрать билд» и вводи вещи.`,
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
    endText: (roster: boolean, narrow: boolean) => `Вот и всё: так оценивается каждая вещь.${roster
      ? ` Пройти снова — ${narrow ? 'в меню ☰ или ' : ''}в «Справке».`
      : ' Отметь своих персонажей — оценка будет по ним, а не по всем героям игры.'}`,
    choice: 'До обучения на форме была другая вещь. Какую оставить?',
    keepItem: 'Оставить эту',
    restoreItem: 'Вернуть прежнюю',
    invite: 'Появилось обучение: ввод одной вещи, около минуты.',
    // выбор тура (tours.ts) и тур «Экипировка» (gear.ts)
    pick: 'Какое обучение?',
    tours: { core: 'Оценка вещи · 1 мин', gear: 'Экипировка · 1 мин' },
    gearStepOf: (n: number, m: number) => `Экипировка · ${n} из ${m}`,
    gearEnd: (narrow: boolean) => `Готово. Это был пример — твоя экипировка не тронута. Кто что носит — ${narrow ? 'в меню ☰, «Экипировка»' : 'в «Персонажах», фильтр «с экипировкой»'}.`,
    // на примере на форме не то, что в примере
    off: {
      item: 'Для примера нужна броня Epic: значок футболки и E.',
      set: 'Для примера нужен Speed Set — поменяй его в поле сета.',
      subs: 'Для примера нужны только SPD, CHC и CHD: нажми лишний стат в строке и замени его или убери.',
    },
    tips: {
      star: 'Отметь звёздочкой своих персонажей — оценка будет по ним, а не по всем героям игры.',
      accMain: 'У аксессуара первое нажатие в сетке — это main stat, как сверху на вещи в игре. Дальше идут сабстаты.',
      mainCell: 'Клетка «main» — стат из main вещи: сабстатом такой не выпадает.',
      fourth: 'После первого Reforge у Epic появляется 4-й сабстат — отметь его, он может вытянуть вещь.',
      replace: 'Нажми на стат в строке, чтобы заменить его или убрать. Так удобно вводить следующую вещь поверх прошлой.',
      move: 'Можно выбрать и стат из другой строки: он переедет сюда, а та строка освободится.',
      chain: 'Цепочка — приоритет статов билда: зелёные есть на вещи, пунктирные — нет. Первые места важнее.',
      code: 'Код вещи — для чата гильдии: там его вводят через «Ввести код» и видят оценку по своему ростеру.',
      temp: '«Временно» — вещь пойдёт, пока не найдёшь лучше. В разбор её не торопись.',
      prio: 'Приоритет сабстатов: › — по порядку, = — одно место, зачёркнутые на 6★ сабстатом не выпадают. По этой строке считается цепочка в вердикте.',
      builds: 'Билды собираются из вещей персонажа сами. Вещи идут во все начатые (начинает одна вещь сета или оружие из списка) и в отмеченные «Собираю».',
      gear: 'Вещи — у персонажа, а билды собираются из них сами: один Speed-шлем идёт и в Speed, и в Speed/Immu.',
      tryOn: '«Примерить» — оценка только для этого персонажа и билда, слот и сет уже выбраны. «Надеть» — сразу ему.',
      piece: 'Сделал в игре Reforge или Breakthrough — отметь здесь, иначе сравнение считает вещь непрокачанной.',
      tryStrip: 'Идёт примерка: сравниваю только с этим билдом, «Надеть» — сразу ему. «Следующий» её не сбрасывает, ✕ — снова для всех.',
      vs: '▲ — лучше того, что стоит в билде, ▼ — хуже; «сет 3 из 4» — билд станет ближе к сборке. Кнопка — надеть или заменить.',
      cardEquip: 'Слот пуст, новая лучше или билд станет ближе к сборке — надень одной кнопкой под карточкой. «или — Rin» — отдать другому.',
      equipAll: 'Здесь — те, кому вещь встанет в билд. Не по билду, но с полезными статами — найди персонажа по имени: она встанет в его «По статам».',
      material: 'Фоддер, а не разбор: такая же вещь стоит в собираемом билде не на T4 — эта пойдёт ей в Breakthrough.',
      worn: 'Вещь неплохая, но всем, кому она подходит, уже надето не хуже — поэтому «Разобрать». Разобрал вещь в игре — убери её в карточке персонажа.',
      pool: 'Все вещи персонажа — надетые на этого персонажа, на других или ни на ком. Билды берут из них сами. Разобрал вещь или пустил на Breakthrough — убери её здесь.',
      want: 'Не собираешь этот билд — выключи «Собираю»: вещи для него перестанут держать вердикт.',
      variants: 'У билда несколько связок сетов — показываю самую собранную. Другие — в чипах, «ещё N» — весь список.',
      stats: '«По статам» — все вещи персонажа по цепочке, без сетов. Вещь не по билду встаёт сюда: «Надеть на…» → поиск по имени или примерка.',
      fusion: 'Отметишь Core Fusion Eternal — Eternal станет неактивным и встанет за ним, а его вещи перейдут к Core Fusion Eternal. Звезда на Eternal вернёт всё назад.',
    },
    // строка «Что нового» — у подсказок с news
    news: {
      move: 'при замене стат из другой строки переезжает',
      gear: 'вещи персонажа — билды собираются сами',
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
      grid: (x: StepText): string => `${x.demo ? 'Отметь **SPD**, **CHC** и **CHD** — по порядку, как в игре.' : 'Отметь сабстаты по порядку, как в игре.'}${
        x.kind === 'armor' ? ' Яркие клетки нужны билдам этого сета.' : ''} Отмечено ${x.n} из ${x.of}.`,
      verdict: (x: StepText): string => x.narrow
        ? 'Вердикт готов. Нажми на карточку: кому вещь подходит, что качать и код для гильдии.'
        : 'Справа — вердикт: кому вещь подходит, что качать и код для гильдии. Посмотри и нажми «Дальше».',
      // тур «Экипировка» (gear.ts): на примере — Caren · Speed
      gBuild: (): string => 'Это Caren · Speed: билд собран из вещей Caren сам. У пустого слота — «Примерить». Нажми на **шлем**.',
      gPiece: (): string => 'Прокачал вещь в игре — отметь здесь оранжевые сегменты после Reforge и Breakthrough: сравнение их учтёт. Теперь нажми **Примерить замену**.',
      gCard: (x: StepText): string => `Идёт примерка: вещь с формы сравнивается только с Caren · Speed. ${x.narrow
        ? 'На карточке — насколько она лучше надетого шлема. Посмотри и нажми «Дальше».'
        : 'В вердикте справа — насколько она лучше надетого шлема. Посмотри и нажми «Дальше».'}`,
      gEquip: (): string => 'Лучше, чем на Caren, — нажми **Заменить шлем Caren**: новый встанет в билд, а старый — такой же Speed-шлем — пойдёт ему на Breakthrough.',
      gNext: (): string => '«Следующий» примерку не сбрасывает — вводи вещи для Caren подряд. Закончил — ✕ на полосе «Примерка», и оценка снова для всех.',
      next: (x: StepText): string => `«Следующий» — к новой вещи: слот, грейд, сет и main останутся, сабстаты очистятся. Нажатый случайно «Следующий» несколько секунд можно отменить кнопкой «Вернуть» — кроме обучения.${
        x.keys ? ' Клавиша — Esc.' : ''}`,
    },
  },
};

export type Texts = typeof ru;
