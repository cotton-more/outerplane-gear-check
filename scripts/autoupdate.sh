#!/usr/bin/env bash
# Ночной прогон автообновления данных — его запускает .github/workflows/data.yml. Схема — в AUTOUPDATE.md.
# Не публикует: собирает docs/ на свежем outerpedia, проверяет (scripts/check-data.mjs) и предлагает PR из ветки data/auto.
# Локально не запускать — пушит ветку и открывает PR/issue через gh.
set -euo pipefail

BRANCH=data/auto
LABEL=autoupdate
TMP=${RUNNER_TEMP:-$(mktemp -d)}
RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"
BOT=(-c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com')

# коммит outerpedia и версия кода приложения, из которых собрана страница
page_info() {
  node -e '
    const t = require("fs").readFileSync(process.argv[1], "utf8");
    const data = /<script>window\.OGC_DATA = (\{.*?\});<\/script>/s.exec(t);
    const build = /hash:[`"]([0-9a-f]*)[`"],date:/.exec(t);
    const v = process.argv[2] === "commit" ? data && JSON.parse(data[1]).meta.commit : build && build[1];
    process.stdout.write(v || "");
  ' "$1" "$2"
}

issue_number() { gh issue list --label "$LABEL" --state open --json number -q '.[0].number // empty'; }

# сборка не получилась — PR сделать нельзя, поэтому причина уходит в issue (одно открытое, обновляется)
fail() {
  local title=$1 log=$2
  {
    echo "Прогон автообновления не смог собрать сайт: **$title**."
    echo
    echo "Прогон: $RUN_URL · опубликованы данные outerpedia \`${published:-?}\`"
    echo
    echo '```'
    tail -n 60 "$log"
    echo '```'
    echo
    echo "Воспроизвести у себя: \`task build:pwa\`. Сайт не тронут — на нём прежняя версия."
  } > "$TMP/issue.md"
  gh label create "$LABEL" --color d93f0b --description 'Автообновление данных' --force >/dev/null
  local n; n=$(issue_number)
  if [ -n "$n" ]; then gh issue edit "$n" --title "Автообновление: $title" --body-file "$TMP/issue.md" >/dev/null
  else gh issue create --title "Автообновление: $title" --label "$LABEL" --body-file "$TMP/issue.md" >/dev/null; fi
  echo "::error::$title — подробности в issue"
  exit 1
}

pr_number() { gh pr list --head "$BRANCH" --state open --json number -q '.[0].number // empty'; }

git show HEAD:docs/index.html > "$TMP/old.html"
published=$(page_info "$TMP/old.html" commit)
old_build=$(page_info "$TMP/old.html" build)
new_build=$(page_info build/app/index.html build)
[ -n "$published" ] || fail "в опубликованной странице нет коммита outerpedia" /dev/null

# 1. Опубликованные данные тем же кодом: эталон предупреждений update.py и проверка, что сборка на GitHub
#    побайтово та же, что на Mac (иначе каждую ночь был бы ложный PR). Если код в main новее опубликованного,
#    страница законно отличается — тогда сверять нечего.
python3 update.py --pwa docs --ref "$published" --report-json "$TMP/base.json" 2> "$TMP/base.log" \
  || fail "не собрались опубликованные данные ($published)" "$TMP/base.log"
if [ "$old_build" = "$new_build" ] && [ -n "$(git status --porcelain -- docs)" ]; then
  git status --porcelain -- docs > "$TMP/repro.log"
  git diff --stat -- docs >> "$TMP/repro.log"
  fail "сборка на GitHub не совпадает с опубликованной на тех же данных и том же коде" "$TMP/repro.log"
fi
git checkout -q -- docs
git clean -fdq -- docs

# 2. Свежие данные
python3 update.py --pwa docs --report-json "$TMP/new.json" 2> "$TMP/new.log" || fail "сборка на свежих данных упала" "$TMP/new.log"
cat "$TMP/new.log" >&2
n=$(issue_number)
[ -z "$n" ] || gh issue close "$n" --comment "Сборка снова проходит: $RUN_URL" >/dev/null

pr=$(pr_number)
if [ -z "$(git status --porcelain -- docs)" ]; then
  echo "Данные совпадают с опубликованными — предлагать нечего."
  [ -z "$pr" ] || gh pr close "$pr" --delete-branch --comment "Данные совпадают с опубликованными (влиты или outerpedia откатила правку): $RUN_URL" >/dev/null
  exit 0
fi

# 3. Проверки: отчёт — описание PR; ошибки — PR в черновике, влить нельзя, пока сам не снимешь
set +e
node scripts/check-data.mjs --old "$TMP/old.html" --report "$TMP/new.json" --base-report "$TMP/base.json" --md "$TMP/report.md"
rc=$?
set -e
if [ ! -s "$TMP/report.md" ] || [ "$rc" -gt 1 ]; then
  { echo "## ⛔ Не вливать: скрипт проверок не отработал"; echo; echo "Лог — в прогоне: $RUN_URL"; } > "$TMP/report.md"
  rc=1
fi
{ echo; echo "Прогон: $RUN_URL"; } >> "$TMP/report.md"

# 4. Ветка data/auto — всегда от свежего main, один коммит с docs/. Тот же результат, что уже в PR, не перепушиваем
new_commit=$(python3 -c 'import json,sys; print((json.load(open(sys.argv[1]))["fetched"]["commit"] or "")[:7])' "$TMP/new.json")
git switch -q -C "$BRANCH"
git add -A docs
git "${BOT[@]}" commit -qm "Данные outerpedia $new_commit"
if git fetch -q origin "$BRANCH" 2>/dev/null \
   && [ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse FETCH_HEAD^{tree})" ] \
   && [ "$(git rev-parse HEAD~1)" = "$(git rev-parse FETCH_HEAD~1)" ]; then
  echo "В ветке $BRANCH уже этот результат — ветку не трогаю, обновляю описание."
else
  git push -q -f origin "$BRANCH"
fi

# 5. PR: один на все пропущенные обновления, описание всегда против опубликованного
title="Данные outerpedia $(date -u +%Y-%m-%d) ($new_commit)"
[ "$rc" = 0 ] || title="⛔ $title"
if [ -z "$pr" ]; then
  draft=(); [ "$rc" = 0 ] || draft=(--draft)
  gh pr create --head "$BRANCH" --base main --title "$title" --body-file "$TMP/report.md" "${draft[@]}"
else
  gh pr edit "$pr" --title "$title" --body-file "$TMP/report.md" >/dev/null
  if [ "$rc" = 0 ]; then gh pr ready "$pr" >/dev/null 2>&1 || true
  else gh pr ready "$pr" --undo >/dev/null 2>&1 || true; fi
fi
[ "$rc" = 0 ] || { echo "::error::Проверки не прошли — PR в черновике, причины в описании"; exit 1; }
