// Русские тексты: вердикты (logic/) и интерфейс (components/). en.ts — тот же набор ключей (тип Texts):
// TypeScript не даст пропустить перевод. **так** — жирным (components/Rich.tsx).
import type { GearKind } from '../data/types';

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

export const ru = {
  // общее для вердиктов и интерфейса
  persons,
  more: (n: number) => ` и ещё ${n}`,
  anyClass: 'любой класс',

  // --- вердикт: общее для брони и оружия
  verdict: {
    notInRoster: 'Не из ростера',
    suits: 'Кому подходит',
    tempFor: 'Кому пойдёт временно',
    markRest: (n: number, of: number) => `Отмечено ${n} из ${of} — отметь остальные`,
    soFar: (good: string, who: string) => `Пока полезных ${good}. Лучший кандидат: ${who}.`,
    topRoll: 'Топ-ролл',
    worthReforge: 'Стоит Reforge',
    flatHint: (key: string) => `Проверь ${key}: без знака % это flat, а билдам нужен ${key}% — flat им почти ничего не даёт. Если на предмете ${key}%, выбери ${key}%.`,
    roll: (good: string, n: number, yellow: number, max: number, orange: number, segments: number, level: 'high' | 'mid' | 'low', started: boolean) =>
      `Ролл: полезных ${good} из ${n}, жёлтых сегментов на них ${yellow} из ${max}${started ? ' (оранжевые — от уже сделанных Reforge — не отмечай)' : ''}; ${started ? `оставшиеся Reforge — до ${segments} — добавят` : 'Reforge добавит'} полезным в среднем ~${dec(orange)} оранжевых${started ? '' : ` из ${segments}`} — ${{ high: 'высокий, стоит вкладываться в Reforge', mid: 'средний', low: 'низкий' }[level]}.`,
  },

  // --- «Прокачка»: что вкладывать в предмет после вердикта
  plan: {
    title: 'Прокачка',
    enhance: '**Enhance** до +10 — сразу: растит main stat.',
    reforgeFirst: (stage: 'adds' | 'started' | null) =>
      stage === 'started'
        ? '**Reforge** — оставшиеся попытки, в первую очередь: ролл хороший. Одна из 6 уже ушла на 4-й сабстат.'
        : `**Reforge** — все 6 попыток, в первую очередь: ролл хороший${stage === 'adds' ? '. Первая добавит 4-й сабстат, остальные — сегменты' : ''}.`,
    reforgeLater: (stage: 'adds' | 'started' | null) =>
      stage === 'started'
        ? '**Reforge** — оставшиеся попытки — после вещей с хорошим роллом: полезным достанется меньше сегментов.'
        : `**Reforge** — после вещей с хорошим роллом: полезным достанется меньше сегментов${stage === 'adds' ? '. Первая попытка добавит 4-й сабстат' : ''}.`,
    reforgeAfterReroll: '**Reforge** — после реролла сабстатов (Precise Craft или Transistone): сейчас сегменты уйдут в ненужные статы.',
    reforgeUnknown: '**Reforge** — смотря по сабстатам: отметь их, и вердикт скажет, стоит ли.',
    btArmorLegend: (piece: string, set: string) =>
      `**Breakthrough** до T4: +5% к main stat за ступень и сильнее бонус сета. Материал — любой Legendary ${piece} ${set} Set (тот самый фоддер) или Armor Glunite; одна вещь — одна ступень.`,
    btArmorEpic: (piece: string, set: string) =>
      `**Breakthrough** до T4: +5% к main stat за ступень и сильнее бонус сета. Материал — такая же вещь: Epic ${piece} ${set} Set (сабстаты не важны) или Glunite. Пока эта не на T4, такие Epic из разбора не выбрасывай — нужно 4 штуки.`,
    btGear: (name: string) =>
      `**Breakthrough** до T4 — обязательно: к T4 усиливается пассивка, и +20% к main stat. Материал — копии ${name} (годятся и с другим main stat) или Refined Glunite.`,
    noTransistone: (has4th: boolean) =>
      `**Transistone** — не трать: по гайду outerpedia их тратят только на Irregular и красную броню.${has4th ? '' : ' Да и смена статов у Epic откроется, только когда первый Reforge добавит 4-й сабстат.'}`,
    tempNoInvest: '**Reforge** и **Breakthrough** — не вкладывай: вещь на замену, её сменит нужная.',
    gambleTemp: (keys: string[]) =>
      `**Reforge** — один раз можно попытать удачу: первый добавит 4-й сабстат, и с ${keys.join(', ')} (даже с 1 сегментом) вещь станет «Оставить» — отметь его. Выпал другой — дальше не вкладывай, **Breakthrough** тоже.`,
    gambleJunk: (keys: string[]) =>
      `Можно попытать удачу одним **Reforge**: он добавит 4-й сабстат, и с ${keys.join(', ')} (даже с 1 сегментом) вещь станет «Оставить» — отметь его. Выпал другой — в разбор.`,
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
    tempAdvice: (main: string) => `Носи, пока у персонажа нет рекомендованного Legendary. Держи 1–2 лучших экземпляра на main ${main}; остальные такие — в разбор.`,
    byMainWrongSubs: 'Подошёл бы по main stat, но сабстаты не те',
    weakTitle: 'Разбирай — слабый ролл',
    weakLine: (main: string, n: number, who: string, good: string) =>
      `Main ${main} подошёл бы ${personsDat(n)}, но сабстаты слабые: даже лучшему варианту (${who}) полезны только ${good}.`,
    markYellow: (yellow: number) => `Отметь жёлтые сегменты, если их больше одного: при ${yellow}+ на полезных статах такой предмет стоит оставить.`,
    epicWhichMain: (k: GearKind) => `Epic ${nom(k)}: какой main stat?`,
    epicNoPassive: (k: GearKind) =>
      `У Epic ${gen(k)} нет уникальной пассивки: это временная замена, пока нет Legendary. Решают main stat (цифры на кнопках — скольким персонажам он нужен) и ролл сабстатов.`,
    endEpicNote: 'Этап «Эндгейм»: Epic без пассивки идёт в разбор.',
    endEpicTitle: (k: GearKind) => `Разбирай — Epic ${nom(k)} без пассивки`,
    endEpicLine: 'Этап «Эндгейм»: в билдах outerpedia только Legendary с уникальной пассивкой. Если у кого-то слот пустой — переключи этап на «Развитие» в настройках.',
    epicWhat: (main: string, k: GearKind) => `Пассивки нет, но main ${main} — тот, что просят в слоте ${gen(k)}.`,
    mainNobodyTitle: (main: string, k: GearKind) => `Разбирай — ${main} на ${prep(k)} никому не нужен`,
    mainNobodyLine: (main: string, scoped: boolean) => `Ни один билд${scoped ? ' твоих персонажей' : ''} не просит main ${main} в этом слоте.`,
    unlistedWhichTitle: 'Нет в списке: какой main stat?',
    unlistedWhichLine: (k: GearKind) =>
      `Предмета нет в данных outerpedia, поэтому пассивку оценить нельзя. Выбери main stat — посчитаю, годится ли ${nom(k)} как временная замена (цифры на кнопках — скольким персонажам он нужен).`,
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
    // плашки
    updateNotice: 'Вышли новые данные outerpedia — обнови, чтобы видеть свежие билды.',
    updateAction: 'Обновить',
    desktopModeNotice: 'Браузер открыл страницу в режиме «Версия для ПК» — я подстроил масштаб. Если что-то выглядит странно, выключи этот режим: меню ⋮ → «Версия для ПК».',
    // подвал
    footData: 'Данные:',
    footGameVersion: 'версия игры',
    footSnapshot: 'снимок от',
    footCounts: (chars: number, withBuilds: number, builds: number) => `${persons(chars)}, с билдами ${withBuilds}, билдов ${builds}.`,
    footUpdatePwa: 'Когда выйдут новые данные, при открытии появится плашка «Обновить».',
    footUpdateSingle: 'Обновить данные:',
    footUpdateSingleWhere: 'в папке проекта.',
    footRights: 'Игровые данные и изображения принадлежат Major9 / VA Games, билды — авторам outerpedia. Неофициальный фанатский инструмент: не связан ни с издателем, ни с outerpedia.',
    licenses: 'Лицензии (MIT)',
    licenseWhat: { outerpedia: 'outerpedia — рекомендации по билдам, игровые таблицы, формула flat/%', react: 'React' },
    installApp: 'Установить как приложение',
    footBuild: (date: string, hash: string, dirty: boolean) => `Сборка приложения: ${date} · ${hash}${dirty ? ' + незакоммиченные правки' : ''}`,
    iosFooter: 'На iPhone и iPad: в Safari «Поделиться» → «На экран „Домой“» — будет работать как приложение и без сети.',
    language: 'Язык',
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
    subYellow: (k: string) => `Жёлтые сегменты ${k}`,
    yellow4: '4 жёлтых — только из спецмагазинов и Dimensional Supply',
    subRemove: (k: string) => `Убрать ${k}`,
    addSub: 'Добавить сабстат',
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
    tierLegend: 'Цепочка — приоритет сабстатов билда, слева важнее. Зелёный — есть на предмете и засчитан, жёлтый — за ½, серый — есть, но далеко в цепочке (мелкие места с 5-го не считаются), пунктир — нет на предмете, зачёркнут — билду не нужен.',
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
    inRosterBtn: '★ в ростере',
    addToRoster: '☆ добавить в ростер',
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
      '**Вердикт** — сразу, с объяснением. «Следующий» — к следующей вещи: слот, грейд и сет остаются.',
    ],
    markChars: 'Отметить персонажей',
    canInstall: 'Можно установить как приложение — работает и без сети.',
    install: 'Установить',
    iosInstall: '**iPhone и iPad:** Safari → «Поделиться» → «На экран „Домой“» — будет работать и без сети.',
    helpInput: 'Ввод вещи',
    helpInputItems: [
      '**Броня** — сет: он в названии после «of» (Etheric Gloves of Speed → Speed Set).',
      '**Legendary оружие и аксессуар** — найди предмет, потом выбери main stat. Совсем новый, которого нет в списке, — «нет в списке».',
      '**Epic оружие и аксессуар** (Steel…) — пассивки нет, сразу main stat.',
      '**Сабстаты** — нажми в сетке; ярче — статы, нужные билдам выбранного сета. %-статы стоят над своими flat-версиями.',
      '**4-й сабстат у Epic-брони** — Epic выпадает с тремя, четвёртый добавляет первый Reforge. Сделал Reforge — отметь его кнопкой «+ 4-й сабстат от Reforge»: он может вытянуть вещь. Какой именно вытянет, подскажет «Прокачка».',
      'Нажми на стат в строке, чтобы заменить его (жёлтые сегменты останутся) или убрать. Убрать можно и повторным нажатием в сетке. Код, справка и настройки — в меню ☰.',
    ],
    helpRoutine: 'Как быстро разбирать',
    helpRoutineItems: [
      'Всё ниже 6★ и ниже Epic — сразу в разбор.',
      'Иди по инвентарю по дате получения: подряд обычно дропы одного забега, и сет остаётся с прошлой вещи.',
      '**Epic-броня:** выбери слот и сет и посмотри на сетку. Ярких статов на вещи 0–1 — в разбор, ничего не вводя: «Оставить» и «Временно» так не бывает. У Speed, Immunity и Swiftness ярко почти всё — там вводи.',
      'У Epic после двух ненужных сабстатов вердикт появляется сразу — третий можно не вводить.',
      '«Оставить» — поставь замок, чтобы не разобрать случайно; «Временно» — носи, пока не найдёшь лучше.',
      '**Breakthrough у Epic** — только такой же вещью: Epic того же сета и слота, сабстаты не важны. Есть Epic-«Оставить» не на T4 — Epic того же сета и слота из разбора откладывай ему, нужно 4 штуки.',
      '**Epic оружие и аксессуар:** на «Эндгейме» — в разбор; на «Развитии» сначала main stat: 0 желающих в окне — в разбор.',
      '**Legendary** с «коплю фоддер»: вердикт покажет, какие прокачивать, а какие оставить на Breakthrough.',
    ],
    helpVerdicts: [
      '**Оставить** — вещь нужна: носи и прокачивай, что именно — в блоке «Прокачка» в подробностях. «Стоит Reforge» — ролл хороший: после Reforge на полезных статах будет много сегментов, вкладывать в первую очередь.',
      '**Временно** — носи, пока не найдёшь лучше: у оружия и аксессуара нет нужной пассивки, у Epic-брони только один главный стат.',
      '**Фоддер** — оставь на Breakthrough такой же вещи с правильным main stat.',
      '**Спорно** — решай сам: в подробностях написано, в чём сомнение (например, вещь хороша для персонажа не из твоего ростера).',
      '**Разобрать** — твоим персонажам не подходит или ролл слабый.',
    ],
    helpChars: [
      'Звёздочка отмечает персонажа в ростере; с галочкой «только мои персонажи» оценка учитывает только их. «Экспорт / импорт» переносит ростер кодом на другое устройство.',
      'Нажми на персонажа — откроются его билды: сеты, оружие, приоритет сабстатов.',
    ],
    helpCode: 'Код для гильдии',
    helpCodeText: (example: string) => `В подробностях вердикта есть код вещи, например ${example}. Скопируй его в чат игры; кто получил — нажимает «Ввести код» и перепечатывает. Оценка у каждого — по своему ростеру.`,
    helpInstall: 'Установка',
    helpInstallItems: [
      '**Android (Chrome):** меню ⋮ → «Установить приложение» или «Добавить на главный экран».',
      '**iPhone и iPad:** в Safari «Поделиться» → «На экран „Домой“».',
      'Установленное приложение работает без сети. Когда выйдут новые данные, появится плашка «Обновить».',
    ],
  },
};

export type Texts = typeof ru;
