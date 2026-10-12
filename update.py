#!/usr/bin/env python3
"""
Outerplane Gear Check — обновление данных страницы.

Берёт свежие данные из репозитория outerpedia (https://github.com/Sevih/outerpedia),
собирает компактный датасет (персонажи, билды, сеты, оружие, аксессуары, талисманы, база статов)
и подставляет его в собранное приложение (build/app/index.html — результат `npm run build`).

Обычно запускается через Taskfile (task build:single / task build:pwa), который сначала собирает приложение.
Напрямую (нужен Python 3.9+, без внешних пакетов; build/app/index.html должен уже быть):

    python3 update.py                        # скачать последнюю версию с GitHub
    python3 update.py --pwa docs             # PWA-сайт для GitHub Pages
    python3 update.py --source ~/outerpedia  # взять данные из локального клона
    python3 update.py --no-embed             # не встраивать иконки (файл меньше, нужен интернет)
    python3 update.py --refresh-images       # перекачать иконки, не глядя в кэш
    python3 update.py --ref <sha|branch>     # зафиксировать конкретный коммит
    python3 update.py --dump-json data.json  # дополнительно сохранить датасет

Результат:
    outerplane-gear.html   — страница для локального открытия (двойной клик)
    build/artifact.html    — та же страница без <html>/<head>-обёртки (для публикации)
    При своём --out вариант для публикации пишется рядом: <имя>.artifact.html.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import datetime as dt
import hashlib
import http.client
import json
import math
import shutil
import struct
import zlib
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

if sys.version_info < (3, 9):
    raise SystemExit("Нужен Python 3.9 или новее")

REPO = "Sevih/outerpedia"
DEFAULT_REF = "main"
IMG_BASE = "https://img.outerpedia.com"
USER_AGENT = "outerplane-gear-check/1.0 (+personal inventory tool)"

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "build" / "app" / "index.html"  # собранное приложение (npm run build)
SW_TEMPLATE = HERE / "pwa" / "sw.template.js"
OUT_LOCAL = HERE / "outerplane-gear.html"
OUT_ARTIFACT = HERE / "build" / "artifact.html"
OLD_CACHE_DIR = HERE / ".cache"  # старое место кэша иконок — переносим в системный кэш
DATA_MARKER = "/*__OGC_DATA__*/null"
# точки разреза в index.html приложения: сюда — теги PWA; отсюда начинается фрагмент для Artifact
HEAD_MARKER = "<!--ogc:head-->"
CUT_MARKERS = (HEAD_MARKER, "<!--ogc:data-->", "<!--ogc:app-->")
APP_NAME = "Outerplane Gear Check"
APP_SHORT = "Gear Check"


def default_cache_dir() -> Path:
    """Кэш скачанных иконок — вне папки проекта: ~/Library/Caches (macOS) или ~/.cache (Linux)."""
    if os.environ.get("OGC_CACHE_DIR"):
        return Path(os.environ["OGC_CACHE_DIR"]).expanduser()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Caches" / "outerplane-gear"
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "outerplane-gear"

SOURCE_FILES = {
    "reco": "data/curated/gear-reco.json",
    "presets": "data/curated/gear-presets.json",
    "charsCurated": "data/curated/characters.json",
    "chars": "data/generated/characters.json",
    "slugs": "data/generated/characters-slug-to-id.json",
    "glossaries": "data/generated/glossaries.json",
    "gameVersion": "data/generated/game-version.json",
    "weapon": "data/generated/equipment/weapon.json",
    "accessory": "data/generated/equipment/accessory.json",
    "helmet": "data/generated/equipment/helmet.json",
    "armor": "data/generated/equipment/armor.json",
    "gloves": "data/generated/equipment/gloves.json",
    "shoes": "data/generated/equipment/shoes.json",
    "sets": "data/generated/equipment/sets.json",
    "talisman": "data/generated/equipment/talisman.json",
    "passives": "data/generated/equipment/passives.json",
    "pools": "data/generated/equipment/pools.json",
    "enhance": "data/generated/equipment/enhance.json",
    "breakLimits": "data/generated/equipment/breakLimits.json",
    "families": "data/generated/equipment/families.json",
    "sources": "data/generated/equipment/sources.json",
    "bosses": "data/generated/equipment/bosses.json",
    "equipCurated": "data/curated/equipment.json",
    "ee": "data/generated/equipment/ee.json",
    "progression": "data/generated/progression.json",
    # team synergy (build_synergy): raw game tables, only a small extract goes into the page
    "skills": "data/generated/skills.json",
    "transcend": "data/generated/transcend.json",
    "dmgBuffs": "data/generated/damage/buffs.json",
    "dmgChars": "data/generated/damage/characters.json",
    # boss fights (build_bosses): monster stats by level, the stages of each fight, the season calendar
    "monsters": "data/generated/monsters.json",
    "encounters": "data/generated/encounters.json",
    "schedule": "data/generated/content-schedule.json",
    "singularity": "data/generated/singularity.json",
}

# Аббревиатуры статов — та же таблица, что на outerpedia (src/lib/stats.ts, STAT_ABBR).
STAT_ABBR = {
    "hp": "HP", "atk": "ATK", "def": "DEF", "speed": "SPD",
    "critical_rate": "CHC", "critical_dmg": "CHD", "critical_dmg_rate": "CHD",
    "buff_chance": "EFF", "effectiveness": "EFF",
    "buff_resist": "RES", "resilience": "RES",
    "dmg_reduce": "DMG RED%", "dmg_reduce_rate": "DMG RED%",
    "damage_boost": "DMG UP%", "dmg_boost": "DMG UP%",
    "vampiric": "LS", "pierce_power": "PEN", "pierce_power_rate": "PEN%",
    "enemy_critical_dmg_reduce": "CDMG RED%", "e_cri_dmg_reduce": "CDMG RED%",
    "counter_rate": "Counter", "enter_ap": "AP", "kill_ap": "AP", "hit_ap": "AP",
}
# EFF/RES бывают flat и rate, но в игре и в билдах это одна стата — сводим к одной метке.
# Метка — ключ; на вещи страница подписывает сабстаты EFF% и RES%, как в игре (subLabel в src/data/index.ts).
LABEL_ALIASES = {"EFF%": "EFF", "RES%": "RES"}
STAT_ICON = {
    "ATK": "CM_Stat_Icon_ATK", "ATK%": "CM_Stat_Icon_ATK",
    "DEF": "CM_Stat_Icon_DEF", "DEF%": "CM_Stat_Icon_DEF",
    "HP": "CM_Stat_Icon_HP", "HP%": "CM_Stat_Icon_HP",
    "SPD": "CM_Stat_Icon_SPEED", "CHC": "CM_Stat_Icon_CRITICAL", "CHD": "CM_Stat_Icon_CRITICAL_DMG",
    "EFF": "CM_Stat_Icon_CHANCE", "RES": "CM_Stat_Icon_RESIST", "PEN%": "CM_Stat_Icon_PIERCE_POWER",
    "DMG UP%": "CM_Stat_Icon_DMG_INCREASE", "DMG RED%": "CM_Stat_Icon_ENEMY_DMG_REDUCE",
    "CDMG RED%": "CM_Stat_Icon_ENEMY_CRITICAL_DMG_REDUCE", "LS": "CM_Stat_Icon_VAMPIRIC",
}
ARMOR_SLOTS = ("helmet", "armor", "gloves", "shoes")
GRADE_RANK = {"normal": 1, "magic": 2, "rare": 3, "unique": 4}
APP_GRADES = ("unique", "rare")  # грейды 6★, которые оценивает страница
GRADE_EN = {"unique": "Legendary", "rare": "Epic"}
SLOT_RU = {"weapon": "оружие", "accessory": "аксессуар", "helmet": "шлем", "armor": "броня", "gloves": "перчатки", "shoes": "ботинки"}
CLASS_ORDER = ["striker", "defender", "ranger", "healer", "mage"]
ELEMENT_ORDER = ["fire", "water", "earth", "light", "dark"]


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


DROPPED: list[str] = []  # рекомендации outerpedia, которые не удалось сопоставить с предметом


class Warnings:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, msg: str) -> None:
        if msg not in self.items:
            self.items.append(msg)


# --------------------------------------------------------------------------- загрузка


def http_get(url: str, timeout: int = 60, headers: dict[str, str] | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


# сетевые сбои, которые стоит повторить (на Python 3.9 socket.timeout — не TimeoutError, поэтому OSError)
RETRYABLE = (urllib.error.URLError, OSError, http.client.HTTPException)


def fetch_retry(url: str, what: str, timeout: int = 60, attempts: int = 3) -> bytes:
    for attempt in range(attempts):
        try:
            return http_get(url, timeout=timeout)
        except urllib.error.HTTPError as exc:
            if 400 <= exc.code < 500:  # 404 и т.п. повторять бессмысленно
                raise SystemExit(f"{what}: сервер ответил {exc.code} ({url})")
            err = exc
        except RETRYABLE as exc:
            err = exc
        if attempt < attempts - 1:
            time.sleep(1.5 * (attempt + 1))
    raise SystemExit(f"Не удалось скачать {what}: {err}")


def parse_json(blob: bytes | str, what: str):
    try:
        return json.loads(blob)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise SystemExit(f"{what}: файл не похож на JSON ({exc}) — повреждён или сервер вернул страницу ошибки")


def resolve_ref(ref: str) -> tuple[str, str | None]:
    """(sha, дата коммита) для ветки/sha. Если API недоступен — качаем по имени ветки."""
    url = f"https://api.github.com/repos/{REPO}/commits/{ref}"
    headers = {}
    if os.environ.get("GITHUB_TOKEN"):  # в GitHub Actions: лимит 1000 запросов в час вместо 60 на IP
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    try:
        info = json.loads(http_get(url, timeout=20, headers=headers))
        return info["sha"], info["commit"]["committer"]["date"]
    except urllib.error.HTTPError as exc:
        if exc.code in (404, 422):
            raise SystemExit(f"Ветка или коммит «{ref}» не найдены в {REPO}")
        if exc.code == 403:
            log("  ! лимит GitHub API исчерпан (60 запросов в час) — качаю по имени ветки, sha в странице не будет")
        else:
            log(f"  ! GitHub API ответил {exc.code} — качаю по имени ветки")
    except Exception as exc:  # noqa: BLE001 — без API всё равно можно скачать файлы
        log(f"  ! GitHub API недоступен ({exc}) — качаю по имени ветки")
    return ref, None


def load_sources(source: Path | None, ref: str) -> tuple[dict, dict]:
    data: dict = {}
    if source:
        source = source.expanduser().resolve()
        log(f"Источник: локальный клон {source}")
        for key, rel in SOURCE_FILES.items():
            path = source / rel
            if not path.exists():
                raise SystemExit(f"Нет файла {path} — это точно клон outerpedia?")
            data[key] = parse_json(path.read_text(encoding="utf-8"), rel)
        data["guides"] = load_guides(source, ref)
        sha, date = git_info(source)
        # путь к клону в страницу не пишем: он попадёт в публикуемый файл
        return data, {"source": f"github.com/{REPO} (локальный клон)", "commit": sha, "commitDate": date}

    sha, date = resolve_ref(ref)
    log(f"Источник: github.com/{REPO} @ {sha[:10] if date else sha}{' (' + date + ')' if date else ''}")
    return fetch_sources(sha), {"source": f"github.com/{REPO}", "commit": sha if date else None, "commitDate": date}


# outerpedia's guides: recommended teams (teams.json) and titles (meta.json) — one folder per guide, no index file.
# Rotating boss guides keep one folder per season under versions/: config.json names the fight's encounter groups,
# guild raid teams are in main.json (with stat requirements) and subA/subB.json
GUIDES_DIR = "src/app/[lang]/guides/_contents"
GUIDE_FILES = ("teams.json", "meta.json")
SEASON_FILES = ("config.json", "main.json", "subA.json", "subB.json")
SEASON_MODES = ("guild-raid", "world-boss", "joint-challenge")


def guide_file(rel: str) -> bool:
    """rel — a path under GUIDES_DIR: one of the files build_teams and build_bosses read."""
    name = rel.rsplit("/", 1)[-1]
    return name in GUIDE_FILES or (name in SEASON_FILES and rel.split("/", 1)[0] in SEASON_MODES)


def guide_paths_api(ref: str) -> list[str] | None:
    """Guide file paths at ref (guide_file) — one GitHub tree request; None if the API is unavailable."""
    url = f"https://api.github.com/repos/{REPO}/git/trees/{ref}?recursive=1"
    headers = {"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}"} if os.environ.get("GITHUB_TOKEN") else {}
    try:
        tree = json.loads(http_get(url, timeout=30, headers=headers))
    except Exception as exc:  # noqa: BLE001 — without the list there are no guide teams; the caller decides
        log(f"  ! список гайдов outerpedia не получен ({exc})")
        return None
    if tree.get("truncated"):
        log("  ! дерево outerpedia обрезано GitHub — список гайдов неполный")
        return None
    return [e["path"] for e in tree.get("tree", []) if e.get("type") == "blob" and e["path"].startswith(GUIDES_DIR + "/")
            and guide_file(e["path"][len(GUIDES_DIR) + 1:])]


def load_guides(source: Path | None, ref: str) -> dict | None:
    """{path under GUIDES_DIR: json} of the guide files build_teams and build_bosses read; None — the list is unavailable."""
    if source:
        base = source / GUIDES_DIR
        return {rel: parse_json(p.read_text(encoding="utf-8"), str(p))
                for p in sorted(base.rglob("*.json")) if guide_file(rel := str(p.relative_to(base)))}
    paths = guide_paths_api(ref)
    if paths is None:
        return None

    def fetch(rel: str) -> tuple[str, object]:
        url = f"https://raw.githubusercontent.com/{REPO}/{ref}/{urllib.parse.quote(rel)}"
        return rel[len(GUIDES_DIR) + 1:], parse_json(fetch_retry(url, rel), rel)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        return dict(pool.map(fetch, sorted(paths)))


def fetch_sources(ref: str) -> dict:
    """Наши файлы outerpedia (SOURCE_FILES) с raw.githubusercontent.com по sha или ветке — без GitHub API."""
    def fetch(item: tuple[str, str]) -> tuple[str, object]:
        key, rel = item
        url = f"https://raw.githubusercontent.com/{REPO}/{ref}/{rel}"
        return key, parse_json(fetch_retry(url, rel), rel)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        data = dict(pool.map(fetch, SOURCE_FILES.items()))
    data["guides"] = load_guides(None, ref)
    return data


def git_info(path: Path) -> tuple[str | None, str | None]:
    """sha и дата последнего коммита локального клона (git не обязателен)."""
    try:
        out = subprocess.run(["git", "-C", str(path), "log", "-1", "--format=%H%n%cI"],
                             capture_output=True, text=True, timeout=10)
        lines = out.stdout.split()
        if len(lines) == 2:
            return lines[0], lines[1]
    except Exception:  # noqa: BLE001
        pass
    head = path / ".git" / "HEAD"
    try:
        ref = head.read_text().strip()
        if not ref.startswith("ref:"):
            return ref, None
        name = ref[5:].strip()
        loose = path / ".git" / name
        if loose.exists():
            return loose.read_text().strip(), None
        for line in (path / ".git" / "packed-refs").read_text().splitlines():
            if line.endswith(" " + name):
                return line.split()[0], None
    except OSError:
        pass
    return None, None


# --------------------------------------------------------------------------- хелперы


def en(d) -> str:
    if isinstance(d, dict):
        return d.get("en") or next(iter(d.values()), "")
    return d or ""


def option_label(opt: dict) -> str | None:
    stat = opt.get("stat")
    if not stat or stat == "none":
        return None
    abbr = STAT_ABBR.get(stat, stat.upper())
    label = f"{abbr}%" if opt.get("mode") == "rate" and not abbr.endswith("%") else abbr
    return LABEL_ALIASES.get(label, label)


def live_options(pools: dict, group: str) -> list[dict]:
    """Варианты строки main: пул с одним вариантом — строка фиксирована, с несколькими — выпадает один из них."""
    return [o for o in pools.get(group, []) if o.get("weight", 1)]


def base_lines(groups: list[str], pools: dict) -> list[str]:
    """Строки main оружия, которые есть всегда, а не на выбор: базовый flat ATK (flat ATK/DEF/HP в своём пуле)."""
    out: list[str] = []
    for g in groups:
        opts = live_options(pools, g)
        if len(opts) == 1 and opts[0].get("mode") == "flat" and opts[0].get("stat") in ("atk", "def", "hp"):
            lab = option_label(opts[0])
            if lab and lab not in out:
                out.append(lab)
    return out


def fill_passive(p: dict) -> str:
    """Подставляет значения пассивки: «[Value]» → «1%→2%» (T0→T4)."""
    text = en(p.get("desc")).replace("\\n", " ").replace("\n", " ")
    values = p.get("values") or []

    def repl(m: re.Match) -> str:
        raw = m.group(1)
        plus = raw.startswith("+")
        key = raw.lstrip("+").lower()
        seq = [v.get(key) for v in values if v.get(key) not in (None, "")]
        if not seq:
            return m.group(0)
        first, last = seq[0], seq[-1]
        val = first if first == last else f"{first}→{last}"
        return f"+{val}" if plus else val

    text = re.sub(r"\[([+\w]+)\]", repl, text)
    return re.sub(r"<[^>]+>", "", text).strip()


KNOWN_TAGS = {"B", "D", "S", "C", "E", "P", "L", "EE", "AS", "SKB", "SK", "I-W", "I-A", "I-T", "I-I"}


def clean_markup(text: str, ee_names: dict | None = None, warn: "Warnings | None" = None, label: str = "") -> str:
    """Инлайн-разметка outerpedia → текст (как plainInlineText сайта: первый сегмент до «|»).

    {I-T/Assassin's Charm} → Assassin's Charm; {EE/Lisha} → имя EE-предмета Лизы;
    {AS/Immunity} → Immunity Set; {SK/Name|S1} → Name.
    """
    if not text:
        return ""
    text = text.replace("\\n", "\n")

    def repl(m: re.Match) -> str:
        tag, payload = m.group(1), m.group(2)
        first = payload.split("|", 1)[0].strip()
        if tag not in KNOWN_TAGS:
            if warn:
                warn.add(f"{label + ': ' if label else ''}неизвестный тег разметки в заметке {{{tag}/…}} — показан как текст")
            return first
        if tag == "EE" and ee_names:
            return ee_names.get(first.lower(), first)
        if tag == "AS" and not first.lower().endswith("set"):
            return f"{first} Set"
        return first

    text = re.sub(r"\{([A-Z]+(?:-[A-Z])?)/([^}]+)\}", repl, text)
    return re.sub(r"<[^>]+>", "", text).strip()


def parse_priority(raw: str) -> list[list[str]]:
    """«SPD>>CHC>ATK=CHD» → [[SPD], [], [CHC], [ATK, CHD]]: пустая ступень = разрыв в приоритете."""
    tiers = [[t.strip() for t in part.split("=") if t.strip()] for part in (raw or "").split(">")]
    while tiers and not tiers[-1]:
        tiers.pop()
    return tiers


def flat_profile(c: dict, prog: dict) -> dict:
    """База персонажа для сравнения flat и % сабстатов ATK/DEF/HP.

    Порт getSubstatFlatProfile() + whiteStatsAt() из outerpedia (src/lib/data/char-progression.ts):
    %-сабстат шмота умножает только собственную базу персонажа (уровень + эволюции + flat-quirks),
    поэтому один сегмент ATK% стоит база×4%, а flat ATK — ровно +40.
    Возвращает {"ATK": [база@100, база@макс.LB, quirks], "DEF": [...], "HP": [...], "SPD": [...]}. SPD — та же база
    для бонуса Speed Set (он в % от базы персонажа); у SPD нет роста по уровню, поэтому проверка базы — только min > 0.
    """
    rarity = str(c.get("rarity"))
    rungs = prog.get("evolutions", {}).get(rarity, [])
    lb = prog.get("limitBreak", {}).get(f"{rarity}_{c.get('element')}", [])
    base_cap = min(x["requireLevel"] for x in lb) if lb else max([1] + [r["level"] for r in rungs if r["level"] <= 100])
    levels = sorted({base_cap, *[x["maxLevel"] for x in lb]})
    rewards = prog.get("evoRewards", {}).get(c["id"], {})
    axes = (("ATK", "atk"), ("DEF", "def"), ("HP", "hp"), ("SPD", "speed"))
    at: dict[str, dict[int, int]] = {ax: {} for ax, _ in axes}
    for level in levels:
        cum: dict[str, int] = {}
        for r in rungs:
            if r["level"] <= level:
                for slug, v in rewards.get(str(r["ev"]), {}).items():
                    cum[slug] = cum.get(slug, 0) + v
        modifier = 0 if level <= 100 else next((x.get("statModifier", 0) for x in lb if x["maxLevel"] >= level), 0)
        for axis, slug in axes:
            st = (c.get("stats") or {}).get(slug) or {}
            mn = st.get("min", 0)
            rng = st.get("max", 0) - mn
            growth = (rng * (level - 1)) // 99 if rng > 0 else 0
            above = (rng * (level - 100) * modifier) // 99000 if rng > 0 and level > 100 else 0
            at[axis][level] = mn + growth + above + cum.get(slug, 0)
    quirk = {ax: 0 for ax, _ in axes}
    q = prog.get("quirks", {})
    blocks = [q.get("elemental", {}).get(c.get("element")), q.get("class", {}).get(c.get("class")),
              q.get("subclass", {}).get(c.get("subClass")) if c.get("subClass") else None]
    for bl in blocks:
        for b in (bl or {}).get("stat", []):
            axis = {"atk": "ATK", "def": "DEF", "hp": "HP", "speed": "SPD"}.get(b.get("stat"))
            if axis and b.get("applying") != "rate":
                quirk[axis] += b.get("value", 0)
    lo, hi = levels[0], levels[-1]
    out: dict = {"levels": [lo, hi]}
    for axis, slug in axes:
        st = (c.get("stats") or {}).get(slug) or {}
        # без собственной базы сравнение flat/% бессмысленно (иначе база = одни quirks) — пусть страница берёт средние
        ok = st.get("min", 0) > 0 if axis == "SPD" else st.get("max", 0) > st.get("min", 0) > 0
        out[axis] = [at[axis][lo], at[axis][hi], quirk[axis]] if ok else None
    return out


def trans_steps(src: dict, cid: str) -> list[dict]:
    """The hero's transcend ladder: its own override, else the ladder of its base rarity."""
    trans = src["transcend"]
    return trans.get("overrides", {}).get(cid) or trans["byStar"].get(str(src["chars"][cid].get("rarity")), [])


def trans_level(src: dict, cid: str, show: int) -> int:
    """Transcend passive level at the in-game ★ `show` (the plain step, no "+"); 0 = nothing unlocked yet."""
    return next((s.get("skillLevel", 0) for s in trans_steps(src, cid) if s.get("showStar") == show and s.get("starPlus", 0) == 0), 0)


def unique_passive(src: dict, cid: str) -> str | None:
    """The hero's transcend passive skill id ("skill 8"); Luna and Saeran have two kits with identical rows — the first."""
    ch = src["dmgChars"]["characters"].get(cid) or {}
    for ent in ch.get("skills", []):
        sid = ent["id"] if isinstance(ent, dict) else str(ent)
        if (src["skills"].get(sid) or {}).get("type") == "unique_passive":
            return sid
    return None


def crit_profile(src: dict, cid: str, c: dict) -> dict:
    """CHC of the hero from sources that are always on, in ‰ (1000 = 100 %): {"base", "cls", "quirk", "trans"?}.

    base — stats.critical_rate (no growth); cls — the class passive (class_passive skill): BT_STAT_PREMIUM on the hero
    with ST_CRITICAL_RATE, OAT_ADD, PASSIVE (Striker: ATTACKER_PASSIVE_2 = 50); quirk — awakening quirk nodes with
    critical_rate "add" (element nodes 30 + 30 + 40), counted like flat_profile counts its quirks. The game sums these
    with gear and clamps CHC at 1000 (CStatValue_SetFinalValue.cs); trans — see below.
    """
    skills, buffs, prog = src["skills"], src["dmgBuffs"]["buffs"], src["progression"]
    st = (c.get("stats") or {}).get("critical_rate") or {}
    cls = 0
    for sid in c.get("skills") or []:
        sk = skills.get(sid) or {}
        if sk.get("type") != "class_passive":
            continue
        for e in sk.get("effects") or []:
            if e.get("type") != "BT_STAT_PREMIUM" or e.get("stat") != "critical_rate" or e.get("target") != "me":
                continue
            for b in buffs.get(e.get("buff"), [])[:1]:
                if b.get("applyingType") == "OAT_ADD" and b.get("createType") in ("PASSIVE", "PASSIVE2"):
                    cls += b.get("value", 0)
    q = prog.get("quirks", {})
    blocks = [q.get("elemental", {}).get(c.get("element")), q.get("class", {}).get(c.get("class")),
              q.get("subclass", {}).get(c.get("subClass")) if c.get("subClass") else None]
    quirk = sum(b.get("value", 0) for bl in blocks for b in (bl or {}).get("stat", [])
                if b.get("stat") == "critical_rate" and b.get("applying") != "rate")
    out = {"base": st.get("min", 0), "cls": cls, "quirk": quirk}
    # transcend passive (skill 8) CHC by the in-game ★1…6, ‰ — ME and MY_TEAM rows both land on the bearer's own
    # sheet; passive, so before the 100 % clamp
    sid = unique_passive(src, cid)
    rows = (src["progression"].get("skill8") or {}).get(sid or "", {})
    trans = [sum(r.get("value", 0) for r in rows.get(str(trans_level(src, cid, star)), [])
                 if r.get("stat") == "critical_rate" and r.get("applying") == "add") for star in range(1, 7)]
    if any(trans):
        out["trans"] = trans
    return out


EFF_LEVELS = (100, 120)  # white EFF at Lv100 and Lv120 — the `lv120` setting picks one


def eff_profile(src: dict, cid: str, c: dict) -> dict:
    """EFF of the hero from sources that are always on: {"w", "r"?, "p"?, "t"?}.

    The game: EFF = ⌊(⌊W·(1000 + gear rate)/1000⌋ + gear flat + r)·(1000 + premium)/1000⌋ (CalcFinalStat.cs).
    w — white EFF [Lv100, Lv120]: base stat + evolution rewards up to that level (Core Fusion: the original's
    evolutions); r — flat "buff" rows of the awakening quirk tree (Ranger node +50, by the `quirks` setting);
    p — permanent self premium of a passive in ‰ (Core Fusion Notia +500, which exists only at Core Fusion level 5 =
    fusion passive level 2; the data assumes it maxed); t — transcend passive by the in-game ★1…6: r premium ‰, f flat.
    The EE (+50…100 %) is not here: the app can't know whether the player has it.
    """
    dchars = src["dmgChars"]["characters"]
    evo = (dchars.get(cid) or {}).get("evolution") or (dchars.get(str(c.get("originalCharacter") or "")) or {}).get("evolution") or []
    rungs = {r["ev"]: r["level"] for r in src["progression"].get("evolutions", {}).get(str(c.get("rarity")), [])}
    st = (c.get("stats") or {}).get("buff_chance") or {}
    w = [st.get("min", 0) + sum(x["value"] for e in evo if rungs.get(e["level"], 999) <= lv
                                for x in e.get("rewards", []) if x.get("stat") == "ST_BUFF_CHANCE") for lv in EFF_LEVELS]
    out: dict = {"w": w}
    q = src["progression"].get("quirks", {})
    blocks = [q.get("elemental", {}).get(c.get("element")), q.get("class", {}).get(c.get("class")),
              q.get("subclass", {}).get(c.get("subClass")) if c.get("subClass") else None]
    r = sum(b.get("value", 0) for bl in blocks for b in (bl or {}).get("buff", [])
            if b.get("stat") == "buff_chance" and b.get("applying") == "add")
    if r:
        out["r"] = r
    skills, buffs = src["skills"], src["dmgBuffs"]["buffs"]
    p = 0
    for sid in c.get("skills") or []:
        sk = skills.get(sid) or {}
        if sk.get("type") != "fusion_passive":
            continue
        for e in sk.get("effects") or []:
            if e.get("type") == "BT_STAT_PREMIUM" and e.get("stat") == "buff_chance" and e.get("target") == "me":
                for b in buffs.get(e.get("buff"), [])[:1]:
                    if b.get("applyingType") == "OAT_RATE" and b.get("createType") in ("PASSIVE", "PASSIVE2"):
                        p += b.get("value", 0)
    if p:
        out["p"] = p
    rows = (src["progression"].get("skill8") or {}).get(unique_passive(src, cid) or "", {})
    by_star = [rows.get(str(trans_level(src, cid, star)), []) for star in range(1, 7)]
    t = {k: [sum(x.get("value", 0) for x in lv if x.get("stat") == "buff_chance" and x.get("applying") == mode) for lv in by_star]
         for k, mode in (("r", "rate"), ("f", "add"))}
    if any(t["r"]) or any(t["f"]):
        out["t"] = {k: v for k, v in t.items() if any(v)}
    return out


def main_values(src: dict, pools: dict) -> dict:
    """Main line values of 6★ gear at +10 by Breakthrough tier: slot → grade → label → [T0, T1, T2, T3, T4].

    Game units: ‰ for percent stats (CHC 400 = 40 %), points for flat ones. Value = (int)(base × (1 + Σ enhance) ×
    (1 + Σ tier factors)) (CItemMainOption_get_OptionValue.cs); the app assumes every main is +10. Items of one slot
    and grade may differ: the "Ether" set (Etheric Gloves of Attack: EFF 45 instead of 50, Ether Blade ATK 950
    instead of 1000) is one weaker item per slot, so the value most items carry is taken; on a tie, the smaller.
    """
    enh = src.get("enhance") or {}
    ench = enh.get("enhanceFactor", 0.4) * enh.get("maxEnhance", 10)
    limits = src.get("breakLimits") or {}
    rows: dict = {}  # (slot, grade, label) → {row: items}
    for slot in ("weapon", "accessory", *ARMOR_SLOTS):
        for it in src[slot].values():
            if it.get("star") != 6 or it.get("grade") not in APP_GRADES:
                continue
            factors = (limits.get(it.get("breakLimit") or "") or {}).get("factors") or [0.05] * 4
            for g in (it.get("options") if "options" in it else it.get("main", [])):
                for o in live_options(pools, g):
                    lab = option_label(o)
                    if not lab:
                        continue
                    row = tuple(int(o["value"] * (1 + ench) * (1 + sum(factors[:bt])) + 1e-6) for bt in range(5))
                    seen = rows.setdefault((slot, it["grade"], lab), {})
                    seen[row] = seen.get(row, 0) + 1
    out: dict = {}
    for (slot, grade, lab), seen in rows.items():
        row = max(seen, key=lambda r: (seen[r], [-v for v in r]))
        out.setdefault(slot, {}).setdefault(grade, {})[lab] = list(row)
    return out


# --------------------------------------------------------------------------- снаряжение


def build_families(kind: str, table: dict, families: list, pools: dict, passives: dict,
                   sources: dict, bosses: dict, curated: dict, class_names: dict,
                   exclude_flat_base: bool) -> tuple[list[dict], dict]:
    """Повторяет materializeFamilies() outerpedia: одна запись на предмет, различимый в игре.

    Возвращает (items, member_to_key), где member_to_key переводит id любого члена
    семейства в ключ записи (семейство или его классовый вариант).
    """
    items: list[dict] = []
    member_key: dict[str, str] = {}

    def mains_of(groups: list[str]) -> list[str]:
        out: list[str] = []
        for g in groups:
            for o in pools.get(g, []):
                if exclude_flat_base and o.get("mode") == "flat" and o.get("stat") in ("atk", "def", "hp"):
                    continue
                lab = option_label(o)
                if lab and lab not in out:
                    out.append(lab)
        return out

    def rolled(groups_list: list[list[str]]) -> list[list[str]]:
        return [gs for gs in groups_list if any(len(pools.get(g, [])) > 1 for g in gs)]

    def fixed_of(groups_list: list[list[str]]) -> list[str]:
        # строки main, которые есть у каждой копии (у оружия — базовый flat ATK); у аксессуаров таких нет
        if not exclude_flat_base or not groups_list:
            return []
        each = [base_lines(gs, pools) for gs in groups_list]
        return [lab for lab in each[0] if all(lab in e for e in each[1:])]

    def passive_view(refs: list[dict]) -> list[dict]:
        out = []
        for ref in refs or []:
            p = passives.get(ref.get("id"))
            if p:
                out.append({"name": en(p.get("name")), "desc": fill_passive(p), "icon": p.get("icon")})
        return out

    def source_of(ids: list[str]) -> str | None:
        boss_names, shops = [], []
        for i in ids:
            s = sources.get(i) or {}
            for b in s.get("bosses", []):
                name = en((bosses.get(b) or {}).get("name"))
                if name and name not in boss_names:
                    boss_names.append(name)
            for sh in s.get("shops", []):
                if sh not in shops:
                    shops.append(sh)
        cur = (curated.get(ids[0]) or {}).get("source") or {}
        for sh in cur.get("shops", []):
            if sh not in shops:
                shops.append(sh)
        parts = boss_names[:4] + [sh.replace("_", " ").title() for sh in shops]
        return ", ".join(parts) or None

    for fam in families:
        if not fam.get("wiki"):
            continue
        top = table.get(fam["topId"])
        if not top:
            continue
        top_ids = [i for i in fam["ids"] if i in table and table[i]["star"] == top["star"]]

        def groups_of(item: dict) -> list[str]:
            return item.get("options") if "options" in item else item.get("main", [])

        member_groups = [groups_of(table[i]) for i in top_ids]
        r = rolled(member_groups)
        mains = mains_of([g for gs in (r or member_groups) for g in gs])

        def extra_mains(ids: list[str], rolled_mains: list[str]) -> list[str]:
            # у пре-ролл копий (одинаковое имя в игре) main бывает вне обычного пула — его тоже можно встретить
            every = mains_of([g for i in ids for g in groups_of(table[i])])
            return [m for m in every if m not in rolled_mains]

        by_class: dict[str, dict] = {}
        for i in top_ids:
            m = table[i]
            cl = m.get("classLimit") or ""
            if not cl:
                continue
            e = by_class.get(cl)
            if e:
                e["groups"].append(groups_of(m))
                if int(i) < int(e["id"]):
                    e["id"] = i
            else:
                by_class[cl] = {"id": i, "icon": m["icon"], "passives": m.get("passives", []), "groups": [groups_of(m)]}
        sigs = {",".join(p["id"] for p in v["passives"]) for v in by_class.values()}
        split = len(by_class) > 1 and len(sigs) > 1

        irregular = any(
            "irregular" in en((bosses.get(b) or {}).get("source")).lower()
            for i in fam["ids"] for b in (sources.get(i) or {}).get("bosses", []))
        base = {
            "family": fam["id"],
            "irregular": irregular,
            "kind": kind,
            "grade": top["grade"],
            "star": top["star"],
            "stars": fam.get("stars", []),
            "src": source_of(fam["ids"]),
        }
        if split:
            for cl, v in by_class.items():
                rc = rolled(v["groups"])
                key = f"{fam['id']}:{cl}"
                cls_name = en(class_names.get(cl, {})) or cl.title()
                items.append({
                    **base,
                    "key": key,
                    "name": f"{en(top['name'])} [{cls_name}]",
                    "baseName": en(top["name"]),
                    "icon": v["icon"],
                    "classLimits": [cl],
                    "mains": (cm := mains_of([g for gs in (rc or v["groups"]) for g in gs])),
                    "extraMains": extra_mains([i for i in top_ids if (table[i].get("classLimit") or "") == cl], cm),
                    "fixed": fixed_of(v["groups"]),
                    "passives": passive_view(v["passives"]),
                })
            for i in fam["ids"]:
                cl = (table.get(i) or {}).get("classLimit")
                if cl in by_class:
                    member_key[i] = f"{fam['id']}:{cl}"
        else:
            items.append({
                **base,
                "key": fam["id"],
                "name": en(top["name"]),
                "baseName": en(top["name"]),
                "icon": top["icon"],
                "classLimits": fam.get("classLimits", []),
                "mains": mains,
                "extraMains": extra_mains(top_ids, mains),
                "fixed": fixed_of(member_groups),
                "passives": passive_view(top.get("passives", [])),
            })
            for i in fam["ids"]:
                member_key[i] = fam["id"]
        for i in fam["ids"]:
            member_key.setdefault(i, fam["id"])
    items.sort(key=lambda x: x["name"].lower())
    return items, member_key


def substat_pool(pools: dict, key: str = "106") -> list[dict]:
    """Пул сабстатов 6★: метка, значение за сегмент, максимум (6 сегментов)."""
    out = []
    for o in pools.get(key, []):
        if not o.get("weight"):
            continue  # нулевой вес — дубли, которые не выпадают
        lab = option_label(o)
        if not lab:
            continue
        pct = o.get("mode") == "rate" or o.get("stat") in (
            "critical_rate", "critical_dmg_rate", "dmg_boost", "dmg_reduce_rate", "pierce_power_rate", "e_cri_dmg_reduce")
        step = o["value"] / 10 if pct else o["value"]
        out.append({"key": lab, "step": step, "pct": pct, "stat": o["stat"], "mode": o.get("mode")})
    return out


def main_lines(src: dict, pools: dict, substats: list[dict], sets: list[dict], warn: Warnings) -> tuple[dict, dict]:
    """Строки main 6★ вещей и сабстаты, которых из-за них не бывает.

    Игра не даёт сабстату повторить строку main, но сравнивает стат вместе с видом: flat EFF в main
    и EFF% сабстатом — разные статы, на одной вещи бывают оба (проверено в игре, как flat DEF и DEF%).
    Поэтому совпадение ищем по паре (стат, вид), а не по метке.

    Возвращает (mainBlocks, fixedMains):
      mainBlocks — метка main → сабстат, который из-за неё не выпадает (None — такого сабстата нет);
      fixedMains — слот → грейд → строки main, обычные для слота (у брони — все, у оружия — базовый flat ATK).
    Каждому сету дописывает fixed: слот брони → грейд → строки main его вещей.
    """
    sub_of = {(o["stat"], o["mode"]): o["key"] for o in substats}
    kind_of: dict[str, tuple] = {}
    blocks: dict[str, str | None] = {}

    def label(o: dict) -> str | None:
        lab = option_label(o)
        if not lab:
            return None
        sm = (o.get("stat"), o.get("mode"))
        was = kind_of.setdefault(lab, sm)
        if was != sm:
            warn.add(f"main «{lab}» бывает и {was[1]}, и {sm[1]} — страница не отличит, какой сабстат он запрещает")
        blocks[lab] = sub_of.get(sm)
        return lab

    def groups_of(item: dict) -> list[str]:
        return item.get("options") if "options" in item else item.get("main", [])

    def usual(counts: dict[str, Counter]) -> dict[str, list[str]]:
        return {g: list(counts[g].most_common(1)[0][0]) for g in APP_GRADES if counts.get(g)}

    fixed_mains: dict[str, dict[str, list[str]]] = {}
    # оружие и аксессуары: main на выбор — только метки для mainBlocks; у оружия ещё базовый flat ATK
    for kind in ("weapon", "accessory"):
        counts: dict[str, Counter] = {}
        for it in src[kind].values():
            if it.get("star") != 6 or it.get("grade") not in APP_GRADES:
                continue
            for g in groups_of(it):
                for o in live_options(pools, g):
                    label(o)
            fixed = tuple(base_lines(groups_of(it), pools)) if kind == "weapon" else ()
            counts.setdefault(it["grade"], Counter())[fixed] += 1
        fixed_mains[kind] = usual(counts)
    # броня: main не выбирают — строки фиксированы у слота, но берём их по сету и грейду, а не одной таблицей:
    # новый сет может принести другой main, и тогда он должен работать сразу
    by_id = {s["id"]: s for s in sets}
    fixed_by_set: dict[str, dict[str, dict[str, list[str]]]] = {}
    for slot in ARMOR_SLOTS:
        seen: dict[tuple[str, str], list[tuple]] = {}
        for piece in src[slot].values():
            if piece.get("star") != 6 or piece.get("grade") not in APP_GRADES or piece.get("set") not in by_id:
                continue
            where = f"{by_id[piece['set']]['name']}, {SLOT_RU[slot]} {GRADE_EN[piece['grade']]}"
            lines = []
            for g in groups_of(piece):
                labs = [lab for lab in (label(o) for o in live_options(pools, g)) if lab]
                if len(labs) == 1:
                    lines.append(labs[0])
                elif labs:
                    warn.add(f"{where}: main — случайный выбор из {'/'.join(labs)}, а страница считает main брони фиксированным")
            seen.setdefault((piece["set"], piece["grade"]), []).append(tuple(lines))
        counts = {}
        for (sid, grade), variants in seen.items():
            common = [lab for lab in variants[0] if all(lab in v for v in variants)]
            if len(set(variants)) > 1:
                warn.add(f"{by_id[sid]['name']}, {SLOT_RU[slot]} {GRADE_EN[grade]}: у вещей разные main — "
                         f"{' | '.join(' + '.join(v) for v in sorted(set(variants)))}; страница берёт только общие строки")
            fixed_by_set.setdefault(sid, {}).setdefault(slot, {})[grade] = common
            counts.setdefault(grade, Counter())[tuple(common)] += 1
        fixed_mains[slot] = usual(counts)
    for s in sets:
        got = fixed_by_set.get(s["id"], {})
        s["fixed"] = {slot: {g: got[slot][g] for g in APP_GRADES if g in got[slot]} for slot in ARMOR_SLOTS if slot in got}
    return dict(sorted(blocks.items())), fixed_mains


# --------------------------------------------------------------------------- сборка

# Бонус сета, который выражается сабстатом (его можно перевести в сегменты): стат игры → ключ сабстата страницы и вид.
# rate — % от базы персонажа (ATK%, DEF%, HP% — как сабстат; SPD — от базы SPD), add — прибавка в пунктах, как сабстат.
# Прочие (Penetration, Counterattack, Mitigation, Lifesteal, Bursting, сеты-эффекты) — stat None: в статах не выразить.
SET_BONUS_STAT = {
    "atk": ("ATK%", "rate"), "def": ("DEF%", "rate"), "hp": ("HP%", "rate"), "speed": ("SPD", "rate"),
    "critical_rate": ("CHC", "add"), "critical_dmg_rate": ("CHD", "add"),
    "buff_chance": ("EFF", "add"), "buff_resist": ("RES", "add"),
}


def bonus_of(e: dict | None) -> dict | None:
    """Строка бонуса сета числом: {stat, value, mode} в единицах сабстата (Attack 2P T4 → ATK% 35).

    Значения — только у бонусов-статов (у сетов-эффектов в effects[] на T4 лежат значения эффекта 1-го уровня,
    а не бонус): у эффекта value 0, stat None.
    """
    if not e:
        return None
    if not e.get("stat"):
        return {"stat": None, "value": 0, "mode": "add"}
    m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*%?\s*", str(e.get("value", "")))
    value = float(m.group(1)) if m else 0
    value = int(value) if value == int(value) else value
    stat, mode = SET_BONUS_STAT.get(e["stat"], (None, "add"))
    return {"stat": stat, "value": value, "mode": mode}


def build_dataset(src: dict, prov: dict, warn: Warnings) -> dict:
    gl = src["glossaries"]
    class_names = gl.get("classes", {})
    element_names = gl.get("elements", {})
    stat_names = gl.get("statNames", {})
    fusion_title = en(gl.get("fusionTitle")) or "Core Fusion"
    pools = src["pools"]
    passives = src["passives"]
    fams = src["families"]
    curated_eq = src["equipCurated"]

    weapons, weapon_key = build_families("weapon", src["weapon"], fams["weapon"], pools, passives,
                                         src["sources"], src["bosses"], curated_eq.get("weapons", {}),
                                         class_names, exclude_flat_base=True)
    amulets, amulet_key = build_families("accessory", src["accessory"], fams["accessory"], pools, passives,
                                         src["sources"], src["bosses"], curated_eq.get("amulets", {}),
                                         class_names, exclude_flat_base=False)

    # --- сеты
    sets = []
    for sid, s in src["sets"].items():
        tiers = s.get("tiers") or [{}]
        tier, tier0 = tiers[-1], tiers[0]

        def eff(e):
            if not e:
                return None
            if e.get("stat"):
                name = en(stat_names.get(e["stat"])) or STAT_ABBR.get(e["stat"], e["stat"])
                return f"{name} +{e.get('value')}"
            return clean_markup(en(e.get("desc"))).replace("\n", " ")

        piece_icons = {}
        for slot in ARMOR_SLOTS:
            best = None
            for piece in src[slot].values():
                if piece.get("set") != sid:
                    continue
                rank = GRADE_RANK.get(piece["grade"], 0) * 10 + piece["star"]
                if not best or rank > best[0]:
                    best = (rank, piece["icon"])
            if best:
                piece_icons[slot] = best[1]
        name = en(s.get("name"))
        sets.append({
            "id": sid,
            "name": name,
            "short": re.sub(r"\s+set$", "", name, flags=re.I),
            "icon": s.get("icon"),
            "p2": eff(tier.get("2p")),
            "p4": eff(tier.get("4p")),
            "p2base": eff(tier0.get("2p")),
            "p4base": eff(tier0.get("4p")),
            "pieces": piece_icons,
            "bonus": {"t0": {"p2": bonus_of(tier0.get("2p")), "p4": bonus_of(tier0.get("4p"))},
                      "t4": {"p2": bonus_of(tier.get("2p")), "p4": bonus_of(tier.get("4p"))}},
        })

    # --- талисманы
    talismans = {}
    for tid, t in src["talisman"].items():
        talismans[tid] = {"name": en(t.get("name")), "icon": t.get("icon"), "mode": t.get("mode")}

    sub_keys = {o["key"] for o in substat_pool(pools)}
    for s in sets:
        for row in (r for t in s["bonus"].values() for r in t.values() if r and r["stat"]):
            if row["stat"] not in sub_keys:
                warn.add(f"{s['name']}: бонус сета — стат {row['stat']}, которого нет среди сабстатов; считаю его эффектом")
                row["stat"] = None

    item_index = {("weapon", w["key"]): w for w in weapons} | {("accessory", a["key"]): a for a in amulets}
    substats = substat_pool(pools)
    main_blocks, fixed_mains = main_lines(src, pools, substats, sets, warn)
    ctx = {
        "presets": src["presets"], "weapon_key": weapon_key, "amulet_key": amulet_key, "talismans": talismans,
        "items": item_index, "tables": {"weapon": src["weapon"], "accessory": src["accessory"]},
        "set_ids": {x["id"] for x in sets}, "sub_keys": {o["key"] for o in substats},
    }

    # --- персонажи
    slug_of = {v: k for k, v in src["slugs"].items()}
    presets = src["presets"]

    def prefix_of(c: dict) -> str | None:
        # то же правило, что characterNamePrefix() на outerpedia
        if c.get("originalCharacter"):
            return fusion_title
        if c.get("showNickName") and c.get("nickname"):
            return en(c["nickname"])
        return None

    # {EE/<имя персонажа>} в заметках → название его EE-предмета
    ee_names = {}
    for cid, c in src["chars"].items():
        item = src["ee"].get(c.get("ee") or cid)
        if item:
            pre = prefix_of(c)
            ee_names[(f"{pre} {en(c.get('name'))}" if pre else en(c.get("name"))).lower()] = en(item.get("name"))

    chars = []
    names_seen: dict[str, list[dict]] = {}
    for cid, c in src["chars"].items():
        base = en(c.get("name"))
        prefix = prefix_of(c)
        cur = src["charsCurated"].get(cid, {})
        entry = {
            "id": cid,
            "slug": slug_of.get(cid, cid),
            "name": f"{prefix} {base}" if prefix else base,
            "base": base,
            "prefix": prefix,
            "nick": en(c.get("nickname")),
            "rarity": c.get("rarity"),
            "element": c.get("element"),
            "class": c.get("class"),
            "subClass": c.get("subClass"),
            "icon": c.get("icon") or cid,
            "rank": cur.get("rank"),
            "role": cur.get("role"),
            "free": "free" in (cur.get("tags") or []),
            "builds": [],
        }
        if c.get("originalCharacter"):
            entry["fusionOf"] = str(c["originalCharacter"])  # Core Fusion X заменяет X: id обычного героя
        names_seen.setdefault(entry["name"].lower(), []).append(entry)
        who = entry["name"] or entry["slug"]
        for b in src["reco"].get(cid, []) or []:
            entry["builds"].append(build_view(f"{who} / {b.get('name') or 'build'}", b, ctx, ee_names, warn))
        if not entry["builds"]:
            # у outerpedia билда нет — покажем хотя бы сеты, которые советует сама игра
            entry["gameSets"] = [str(x) for x in (c.get("recommendedSets") or [])]
        entry["rankPvp"] = cur.get("rankPvp")
        entry["flat"] = flat_profile({**c, "id": cid}, src["progression"])
        entry["spd"] = entry["flat"].pop("SPD")  # база SPD для бонуса Speed Set: [lv100, макс. Limit Break, quirks]
        entry["chc"] = crit_profile(src, cid, c)
        entry["eff"] = eff_profile(src, cid, c)
        if not all(entry["flat"].get(ax) for ax in ("ATK", "DEF", "HP")):
            warn.add(f"{who}: нет базовых статов — flat/% для него оценивается по средним")
        chars.append(entry)

    # одноимённые после префиксов: уточняем стихией/классом, потом прозвищем, потом id — пока не разойдутся
    def clash(group_key):
        groups: dict[str, list[dict]] = {}
        for e in chars:
            groups.setdefault(group_key(e).lower(), []).append(e)
        return [g for g in groups.values() if len(g) > 1]

    refiners = [
        lambda e: f"{en(element_names.get(e['element'], {})) or e['element']} {en(class_names.get(e['class'], {})) or e['class']}",
        lambda e: e.get("nick") or "",
        lambda e: f"#{e['id']}",
    ]
    for refine in refiners:
        groups = clash(lambda e: e["name"])
        if not groups:
            break
        for same in groups:
            for e in same:
                extra = refine(e)
                if extra:
                    e["name"] = f"{e['name']} ({extra})"
            warn.add("Одинаковые имена, добавлено уточнение: " + ", ".join(f"{e['name']} [id {e['id']}]" for e in same))

    for cid in src["reco"]:
        if cid not in src["chars"]:
            warn.add(f"В gear-reco есть персонаж {cid}, которого нет в characters.json — пропущен")

    chars.sort(key=lambda e: (-(e["rarity"] or 0), e["name"].lower()))

    # --- статистика использования (для сортировки и «мусорных» пометок)
    use_set: dict[str, set] = {}
    use_w: dict[str, set] = {}
    use_a: dict[str, set] = {}
    for ch in chars:
        for b in ch["builds"]:
            for combo in b["sets"]:
                for p in combo:
                    use_set.setdefault(p["set"], set()).add(ch["id"])
            for w in b["weapons"]:
                use_w.setdefault(w["key"], set()).add(ch["id"])
            for a in b["amulets"]:
                use_a.setdefault(a["key"], set()).add(ch["id"])
    for s in sets:
        s["users"] = len(use_set.get(s["id"], ()))
    for w in weapons:
        w["users"] = len(use_w.get(w["key"], ()))
    for a in amulets:
        a["users"] = len(use_a.get(a["key"], ()))

    # иконки кнопок слотов: оружие/аксессуар — «типовые» 6★, броня — пьесы Speed Set (самый частый)
    slot_icons = {"weapon": "TI_Equipment_Weapon_06", "accessory": "TI_Equipment_Accessary_06"}
    speed = next((s for s in sets if s["id"] == "13"), sets[0] if sets else {"pieces": {}})
    for slot in ARMOR_SLOTS:
        slot_icons[slot] = speed["pieces"].get(slot)

    main_labels = sorted({m for it in weapons + amulets for m in it["mains"]})

    return {
        "meta": {
            "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": prov["source"],
            "commit": prov.get("commit"),
            "commitDate": prov.get("commitDate"),
            "gameVersion": (src.get("gameVersion") or {}).get("resVersion"),
            "counts": {
                "characters": len(chars),
                "withBuilds": sum(1 for c in chars if c["builds"]),
                "builds": sum(len(c["builds"]) for c in chars),
                "weapons": len(weapons),
                "accessories": len(amulets),
            },
        },
        "classes": {k: en(class_names.get(k, {})) or k.title() for k in CLASS_ORDER},
        "elements": {k: en(element_names.get(k, {})) or k.title() for k in ELEMENT_ORDER},
        "statNames": {lab: en(stat_names.get(o["stat"], {})) for o in substats for lab in [o["key"]]},
        "substats": substats,
        "slotIcons": slot_icons,
        "mainLabels": main_labels,
        "mainBlocks": main_blocks,
        "fixedMains": fixed_mains,
        "mainValues": main_values(src, pools),
        "sets": sets,
        "weapons": weapons,
        "amulets": amulets,
        "talismans": talismans,
        "chars": chars,
        "synergy": build_synergy(src, warn),
        **({"teams": teams} if (teams := build_teams(src, chars, warn)) else {}),
        **({"bosses": bosses} if (bosses := build_bosses_safe(src, chars, warn)) else {}),
    }


# --------------------------------------------------------------------------- синергия команды

# Skill type -> slot. Chain/dual attacks, class passives and the rest are not counted: a chain proc is not reliable
# (owner, .x/0170 Q2), class passives give no status (owner's in-game check, decision 6).
SYN_SLOT = {"first": "s1", "second": "s2", "ultimate": "s3", "burst_1": "burst", "burst_2": "burst", "burst_3": "burst",
            "unique_passive": "passive", "fusion_passive": "passive"}
SYN_CALLER = {"SKT_FIRST": "s1", "SKT_SECOND": "s2", "SKT_ULTIMATE": "s3", "SKT_BURST_1": "burst", "SKT_BURST_2": "burst",
              "SKT_BURST_3": "burst"}
# Row target -> who gets the status. "team" includes the caster; "ally" is another hero (single-target ones too).
SYN_TO = {"ME": "self", "MY_TEAM": "team", "MY_TEAM_WITHOUT_ME": "ally", "MY_TEAM_ONE": "ally",
          "MY_TEAM_LOWEST_HP_RATE": "ally", "MY_TEAM_HIGHEST_ATK": "ally", "MY_TEAM_HIGHEST_MAXHP": "ally"}
# How a give fires: a skill use, each turn, battle start, a passive. Not events (on death, on break, when hit, chain).
SYN_CREATE = {None, "SKILL_FINISH", "SKILL_START", "SKILL_FINISH_IMMEDIATELY", "DAMAGE", "ON_TURN", "ON_SPAWN",
              "ON_SPAWN2", "PASSIVE", "PASSIVE2", "ON_TURN_END_ATTACKER"}
# What a condition switches on — a short key the app names (team.fx in src/i18n): BT_* type, for stat rows by stat and side
SYN_FX = {"BT_CALL_BACKUP": "dual", "BT_CALL_BACKUP_2": "dual", "BT_DMG": "dmg", "BT_ADDITIVE_ATTACK_ON_EVENT": "extra",
          "BT_RUN_ACTIVE_SKILL_ON_TURN_END": "extra", "BT_SKILL_RANGE_ALL": "aoe", "BT_SKILL_RANGE_SINGLE": "single",
          "BT_COOL_CHARGE": "cd", "BT_COOL2_CHARGE": "cd", "BT_COOL3_CHARGE": "cd", "BT_STUN": "stun", "BT_FREEZE": "freeze",
          "BT_DOT_BLEED": "bleed", "BT_DOT_LIGHTNING": "shock", "BT_DOT_BURN": "burn", "BT_DOT_POISON": "poison",
          "BT_REVERSE_HEAL_BASED_TARGET": "maxhp", "BT_SEALED_RESURRECTION": "norevive"}
SYN_FX_STAT = {"ST_DMG_BOOST": "dmg", "ST_ATK": "dmg", "ST_CRITICAL_RATE": "dmg", "ST_CRITICAL_DMG_RATE": "dmg",
               "ST_PIERCE_POWER_RATE": "pen"}
SYN_FX_DOWN = {"ST_ATK": "atkDown", "ST_DEF": "defDown", "ST_SPEED": "slow"}


# most telling first: Francesca S2 «доп. атака, больше урона, приоритет»
SYN_FX_ORDER = ["dual", "extra", "aoe", "single", "stun", "freeze", "bleed", "shock", "burn", "poison", "norevive", "maxhp",
                "dmg", "pen", "cd", "prio", "prioDown", "atkDown", "defDown", "slow", "other"]


def syn_fx(r: dict) -> str:
    t, enemy = r.get("type"), (r.get("targetType") or "").startswith("ENEMY")
    if t == "BT_ACTION_GAUGE":
        return "prioDown" if enemy or (r.get("value") or 0) < 0 else "prio"
    if t == "BT_STAT":
        return SYN_FX_DOWN.get(r.get("stat"), "other") if enemy else SYN_FX_STAT.get(r.get("stat"), "other")
    return SYN_FX.get(t, "other")


# conditionValue 9996..9999 = "any buff / any debuff" (outerpedia gear.ts conditionBuffRef), not a status
SYN_ANY = range(9996, 10000)


def build_synergy(src: dict, warn: Warnings, debug: bool = False) -> dict:
    """Which status each hero's skills need (on self or on the enemy) and which statuses heroes give.

    Only real status applications count: a row needs a tooltip id (or a BT_STAT key the glossary maps to one).
    Passive "+N% DEF" rows without a status icon (class passives, BT_STAT_PREMIUM) are not the status — owner's
    in-game check (.x/0170 decision 6). Transcend gating: unique_passive level L -> the first transcend step with
    skillLevel >= L; burst_2/burst_3 -> the first step that unlocks them. Stars are the in-game ★ (showStar)."""
    gl = src["glossaries"]
    effects, by_tip, by_key = gl.get("effects", {}), gl.get("effectByTooltip", {}), gl.get("effectByKey", {})
    buffs = src["dmgBuffs"]["buffs"]
    dchars, dskills = src["dmgChars"]["characters"], src["dmgChars"]["skills"]
    skills = src["skills"]

    def norm(tip) -> str | None:
        if tip is None:
            return None
        t = str(tip)
        return str(by_tip.get(t, t))

    # outerpedia's own digest names a status on rows without a tooltip ("SYS_BUFF_ATTACK_UP"); unnamed ones are
    # in-skill tweaks (S3 "+30% PEN while attacking"), not a status the hero holds
    labelled = {e["buff"] for sk in skills.values() for e in sk.get("effects", []) if e.get("buff") and e.get("label")}

    def status_of(r: dict, b: str) -> str | None:
        if r.get("tooltipId"):
            return norm(r["tooltipId"])
        if r.get("type") == "BT_STAT" and r.get("stat") and b in labelled:
            kind = "buff" if r.get("buffDebuffType", "").startswith("BUFF") else "debuff"
            return norm(by_key.get(kind, {}).get(f"BT_STAT|{r['stat']}"))
        return None

    def star_of(cid: str, typ: str, level: int) -> int | None:
        """In-game ★ a skill row needs; None = never reachable."""
        if typ == "unique_passive":
            return next((s["showStar"] for s in trans_steps(src, cid) if s.get("skillLevel", 0) >= level), None)
        if typ in ("burst_2", "burst_3"):
            flag = "burst" + typ[-1]
            return next((s["showStar"] for s in trans_steps(src, cid) if s.get(flag)), None)
        return 1

    gives: dict[str, dict] = {}
    needs: dict[str, dict] = {}
    slot_cd: dict[str, dict] = {}  # hero -> slot -> startCool (turns before the skill is ready)
    need_fx: dict[str, dict] = {}  # hero -> (status, side, slot) -> what it switches on
    rows_dbg: list[dict] = []
    for cid in src["chars"]:
        ch = dchars.get(cid)
        if not ch:
            warn.add(f"синергия: нет героя {cid} в damage/characters.json")
            continue
        for ent in ch.get("skills", []):
            sid = ent["id"] if isinstance(ent, dict) else str(ent)
            typ = (skills.get(sid) or {}).get("type")
            slot = SYN_SLOT.get(typ)
            ds = dskills.get(sid)
            if not slot or not ds:
                continue
            lv0 = ((skills.get(sid) or {}).get("levels") or [{}])[0]
            cd = lv0.get("startCool") or 0
            if slot in ("s1", "s2", "s3"):
                slot_cd.setdefault(cid, {})[slot] = cd
            first: dict[str, int] = {}
            for lv in ds.get("levels", []):
                for b in lv.get("buffIds", []):
                    first.setdefault(b, lv.get("level", 1))
            # a has/has-not pair with the same effect is a branch, not a need (Luna S1: a Dual Attack either way,
            # but the Additional Attack only with a Barrier)
            has, has_not = [], set()
            for b, level in first.items():
                star = star_of(cid, typ, level)
                if star is None:
                    continue
                for r in buffs.get(b, []):
                    ct, cv, tgt = r.get("conditionType"), r.get("conditionValue"), r.get("targetType", "")
                    st = status_of(r, b)
                    # DEBUFF_IGNORE_RESIST / _IGNORE_IMMUNE are applications too
                    if (st and not ct and r.get("buffDebuffType", "").startswith(("BUFF", "DEBUFF"))
                            and r.get("createType") in SYN_CREATE):
                        to = SYN_TO.get(tgt) or ("enemy" if tgt.startswith("ENEMY") else None)
                        if to:
                            key = (st, to, slot)
                            g = gives.setdefault(cid, {}).get(key)
                            if not g or (star, cd) < (g["star"], g["cd"]):
                                gives[cid][key] = {"st": st, "to": to, "slot": slot, "star": star, "cd": cd}
                            if debug:
                                rows_dbg.append({"kind": "give", "hero": cid, "skill": sid, "buff": b, "st": st, "to": to,
                                                 "slot": slot, "star": star, "cd": cd, "rate": r.get("createRate")})
                    if not ct or cv is None or cv in SYN_ANY or "HAS" not in ct:
                        continue
                    need = norm(cv)
                    on = None
                    base = ct.replace("_NOT", "")
                    if base == "CASTER_HAS_BUFF":
                        on = "self"
                    elif base == "OWNER_HAS_BUFF":
                        on = "self" if tgt == "ME" else "enemy" if tgt.startswith("ENEMY") else None
                    elif base == "TARGET_HAS_BUFF":
                        on = "enemy" if tgt.startswith("ENEMY") or ds.get("targetTeamType") == "ENEMY" else None
                    elif base == "CASTER_ENEMY_TEAM_HAS_BUFF":
                        on = "enemy"
                    if not on:
                        continue
                    if "_NOT_" in ct:
                        has_not.add((need, r.get("type")))
                        continue
                    # a passive that fires on skill use gates the skills it names (Epsilon CF: SKT_ALL -> S1/S2/S3);
                    # one that fires each turn stays the passive (Eliza CF ★5: DEF down on bleeding enemies)
                    slots = [slot]
                    if slot == "passive" and r.get("createType", "").startswith("SKILL_"):
                        callers = (r.get("callerSkillType") or "").split(",")
                        slots = (["s1", "s2", "s3"] if "SKT_ALL" in callers else
                                 [SYN_CALLER[c] for c in callers if c in SYN_CALLER]) or slots
                    has.append({"st": need, "on": on, "star": star, "slots": slots, "effect": r.get("type"), "fx": syn_fx(r),
                                "buff": b, "cond": ct})
            for h in has:
                if (h["st"], h["effect"]) in has_not:
                    continue
                if h["on"] == "enemy" and not (effects.get(h["st"]) or {}).get("isDebuff"):
                    continue  # an enemy buff (Fenrir: Barrier) — the team can't give it; v2
                # burst_1..3 are one slot: the lowest ★ that has the condition
                mine = needs.setdefault(cid, {})
                for sl in dict.fromkeys(h["slots"]):
                    key = (h["st"], h["on"], sl)
                    mine[key] = min(h["star"], mine.get(key, h["star"]))
                    fxs = need_fx.setdefault(cid, {}).setdefault(key, [])
                    if h["fx"] not in fxs:
                        fxs.append(h["fx"])
                if debug:
                    rows_dbg.append({"kind": "need", "hero": cid, "skill": sid, **h})

    # a need counts only when some other hero can give the status: a hero-specific mechanic (Beth's Retribution's
    # Dominion, Viella's Corrosive Poison) or a status nobody applies leaves the team nothing to change
    def others_give(cid: str, st: str, on: str) -> bool:
        sides = ("team", "ally") if on == "self" else ("enemy",)
        return any(g["st"] == st and g["to"] in sides for o, gs in gives.items() if o != cid for g in gs.values())

    order = ["s1", "s2", "s3", "burst", "passive"]
    merged: dict[str, list[dict]] = {}
    for cid, hero in needs.items():
        by: dict[tuple, dict] = {}
        for (st, on, slot), star in sorted(hero.items(), key=lambda kv: order.index(kv[0][2])):
            if others_give(cid, st, on):
                n = by.setdefault((st, on, star), {"st": st, "on": on, "slots": [], "star": star, "cd": 99, "fx": {}})
                n["slots"].append(slot)
                n["fx"][slot] = sorted(need_fx[cid][(st, on, slot)], key=SYN_FX_ORDER.index)
                if "other" in n["fx"][slot]:
                    warn.add(f"синергия: у героя {cid} условие на статус {st} включает неизвестный эффект — назови его в update.py SYN_FX")
                if slot in ("s1", "s2", "s3"):  # a burst needs AP, not a cooldown — it doesn't set the turn
                    n["cd"] = min(n["cd"], slot_cd.get(cid, {}).get(slot, 0))
        for n in by.values():
            n["cd"] = 0 if n["cd"] == 99 else n["cd"]
        if by:
            merged[cid] = sorted(by.values(), key=lambda n: (n["star"], order.index(n["slots"][0]), n["st"]))
    wanted = {n["st"] for hero in merged.values() for n in hero}
    heroes: dict[str, dict] = {}
    for cid in src["chars"]:
        need = merged.get(cid, [])
        # a self-only give matters only for the hero's own need
        mine = {n["st"] for n in need}
        give = sorted((g for g in gives.get(cid, {}).values()
                       if g["st"] in wanted and (g["to"] != "self" or g["st"] in mine)),
                      key=lambda g: (int(g["st"]) if g["st"].isdigit() else 0, order.index(g["slot"]), g["to"]))
        if need or give:
            heroes[cid] = {k: v for k, v in (("give", give), ("need", need)) if v}
    statuses = {}
    for st in sorted(wanted, key=lambda x: int(x) if x.isdigit() else 0):
        e = effects.get(st)
        if not e or not en(e.get("name")):
            warn.add(f"синергия: статус {st} без имени в glossaries.effects")
        statuses[st] = {"en": en((e or {}).get("name")) or st, "debuff": bool((e or {}).get("isDebuff"))}
    out = {"statuses": statuses, "heroes": heroes}
    if debug:
        out["rows"] = rows_dbg
    return out


def build_teams(src: dict, chars: list[dict], warn: Warnings) -> dict | None:
    """outerpedia's recommended teams (guides' teams.json): four slots, each a list of interchangeable heroes → hero ids.
    The same team in several guides (guild raid seasons) is one entry with all its guides. None — no guide list."""
    files = src.get("guides")
    if files is None:
        warn.add("команды outerpedia: список гайдов не получен — подсказок «кого добавить» по ним не будет")
        return None
    by_name = {c["name"]: c["id"] for c in chars}
    metas = {k.rsplit("/", 1)[0]: v for k, v in files.items() if k.endswith("meta.json")}

    def title(guide: str) -> str:
        parts = guide.split("/")
        while parts:  # guild raid seasons sit under the boss folder: its meta.json names them
            m = metas.get("/".join(parts))
            if m and en(m.get("title")):
                return en(m["title"]) + ("" if len(parts) == len(guide.split("/")) else " · " + guide.split("/")[-1])
            parts.pop()
        return guide

    def slot_lists(x):
        if isinstance(x, dict):
            sl = x.get("slots")
            if isinstance(sl, list) and sl and all(isinstance(s, list) for s in sl):
                yield sl
            for v in x.values():
                yield from slot_lists(v)
        elif isinstance(x, list):
            for v in x:
                yield from slot_lists(v)

    teams: dict[tuple, dict] = {}
    for path, body in sorted(files.items()):
        if not path.endswith("teams.json"):
            continue
        guide = path.rsplit("/", 1)[0]
        for slots in slot_lists(body):
            ids = []
            for slot in slots:
                got = []
                for name in slot:
                    if name in by_name:
                        got.append(by_name[name])
                    else:
                        warn.add(f"команды outerpedia: герой «{name}» ({guide}) не найден в данных")
                if got:
                    ids.append(got)
            if len(ids) < 2:
                continue
            key = tuple(sorted(tuple(sorted(s)) for s in ids))
            t = teams.setdefault(key, {"g": [], "s": ids})
            if guide not in t["g"]:
                t["g"].append(guide)
    used = sorted({g for t in teams.values() for g in t["g"]})
    return {"guides": {g: title(g) for g in used}, "list": list(teams.values())}


# --------------------------------------------------------------------------- боссы

# boss guides the app lists, in this order (.x/0200-boss D1); hidden guides (adventure license — closed, monad gate —
# route maps without stats) and towers / story bosses are not listed
BOSS_MODES = {"special-request": "sr", "guild-raid": "gr", "world-boss": "wb", "joint-challenge": "jc",
              "irregular-extermination": "ie", "dimensional-singularity": "ds"}
ADV_OF = {"atk": "atk", "def": "def", "hp": "hp", "speed": "spd"}
# BT_REVERSE_HEAL_BASED_* has no glossary key; outerpedia's skill-view.ts shows it as "Fixed Damage" (tooltip 75)
IMMUNE_FALLBACK = {"BT_REVERSE_HEAL_BASED_TARGET": "75", "BT_REVERSE_HEAL_BASED_CASTER": "75"}


def monster_stat(mon: dict, slug: str, level: int, adv: dict | None = None) -> int | None:
    """outerpedia monster-stats.ts statAt(): min + ⌊(max − min)·(level − 1)/99⌋ (CalcStat.cs, extrapolated past Lv100);
    a dungeon's or rank's adv (‰) scales ATK/DEF/HP/SPD only. The Challenge quirk (bosses' q) is the app's, not here."""
    r = (mon.get("stats") or {}).get(slug)
    if not r:
        return None
    v = r["min"] + ((r["max"] - r["min"]) * (level - 1)) // 99
    a = (adv or {}).get(ADV_OF.get(slug, ""))
    return (v * (1000 + a)) // 1000 if a else v


def rank_slices(d: dict) -> dict[int, tuple[int, int]]:
    """outerpedia encounters.ts ranksOfMonster(): with several bosses on one rank ladder (world boss leagues 3–4),
    boss k plays from the first rank at its own level up to the next boss's first rank. {monster index: (lo, hi)}."""
    ranks, mons = d.get("ranks") or [], d["monsters"]
    bosses = [m for m in mons if m["role"] != "add"]
    starts = [next((j for j, r in enumerate(ranks) if r.get("level") == b["level"]), -1) for b in bosses]
    split = len(bosses) >= 2 and all((s == 0) if i == 0 else (s > starts[i - 1]) for i, s in enumerate(starts))
    out = {}
    for i, m in enumerate(mons):
        k = next((q for q, b in enumerate(bosses) if b["id"] == m["id"]), -1) if split and m["role"] != "add" else -1
        out[i] = (starts[k], starts[k + 1] if k + 1 < len(starts) else len(ranks)) if k >= 0 else (0, len(ranks))
    return out


def main_boss(units: list[dict]) -> dict:
    """The fight's boss (outerpedia bossWaveMonsters / groupCombatants): a boss of the last wave that has bosses, the one
    with hpLines first; no boss at all — the first unit."""
    bosses = [u for u in units if u["role"] == "boss"]
    if not bosses:
        return units[0]
    last = max(u.get("wave") or 0 for u in bosses)
    wave = [u for u in bosses if (u.get("wave") or 0) == last]
    return next((u for u in wave if u.get("hpLines")), wave[0])


def stage_label(d: dict, rank: dict | None) -> str:
    """Stage name, language-neutral: "7" (special request, guild raid), "4:SS" (world boss league 4, rank SS),
    "AA+" (singularity rank), "very_hard" (joint challenge, irregular)."""
    diff = d.get("difficulty") or {}
    key = diff.get("key") or ""
    if rank and rank.get("name"):
        return f"{diff.get('order')}:{rank['name']}" if key.startswith("league_") else rank["name"]
    if rank and rank.get("stage"):
        return str(rank["stage"])
    return str(diff.get("order")) if key.startswith("stage_") else key


def fight_rows(enc: dict, mons: dict, dungeons: list[tuple[str, dict]], warn: Warnings, where: str) -> list[tuple[str, int, int, int, str]]:
    """[(label, level, RES, SPD, boss monster id)] — one per stage, in the game's order; where — the fight, for warnings."""
    rows = []
    for _, d in dungeons:
        ranks = d.get("ranks") or []
        if not ranks:
            units = [{**m, "lvl": m["level"]} for m in d["monsters"]]
            rows.append((d, None, units, d.get("adv")))
            continue
        sl = rank_slices(d)
        for ri, r in enumerate(ranks):
            units = [{**m, "lvl": r.get("level", m["level"])} for i, m in enumerate(d["monsters"]) if sl[i][0] <= ri < sl[i][1]]
            rows.append((d, r, units, r.get("adv")))  # a rank's adv replaces the dungeon's (expandRankContexts)
    out = []
    for d, r, units, adv in rows:
        b = main_boss(units)
        mon = mons.get(b["id"])
        res, spd = (monster_stat(mon, "buff_resist", b["lvl"]), monster_stat(mon, "speed", b["lvl"], adv)) if mon else (None, None)
        if res is not None and spd is not None:
            out.append((stage_label(d, r), b["lvl"], res, spd, b["id"]))
        else:
            warn.add(f"боссы outerpedia: {where} — этап «{stage_label(d, r)}» пропущен ("
                     + (f"у монстра {b['id']} нет RES/SPD" if mon else f"монстра {b['id']} нет в monsters.json") + ")")
    return out


def immune_ids(gl: dict, mon: dict) -> list[str]:
    """Glossary effect ids (outerpedia `effects`; the names are the app's own strings) a monster is immune to — outerpedia skill-view.ts
    immunityChipEffects: immuneTooltips, then buffImmune BT types (debuff side first), then statBuffImmune ST types."""
    by_tip, by_key, effects = gl.get("effectByTooltip", {}), gl.get("effectByKey", {}), gl.get("effects", {})
    deb, buf = by_key.get("debuff", {}), by_key.get("buff", {})
    refs = [by_tip.get(str(t), str(t)) for t in mon.get("immuneTooltips", [])]
    for t in mon.get("buffImmune", []):
        base = re.sub(r"\d+", "", t)
        refs.append(deb.get(t) or deb.get(base) or buf.get(t) or buf.get(base) or IMMUNE_FALLBACK.get(t))
    refs += [deb.get(f"BT_STAT|{t}") or buf.get(f"BT_STAT|{t}") for t in mon.get("statBuffImmune", [])]
    out: list[str] = []
    for x in refs:
        if x and str(x) in effects and str(x) not in out:
            out.append(str(x))
    return out


def build_bosses(src: dict, chars: list[dict], warn: Warnings) -> dict | None:
    """Boss fights of outerpedia's guides for the boss on «Команда» (.x/0200-boss stage B).

    {q: Challenge quirk ‰ on boss RES (−200 at the full tree), t: {table id: [[level, RES, SPD, stage label]…]} (RES raw;
    identical tables shared), b: [{key, name, mode, element, class, table, imm, group?, live?, guide, teams?}]}.
    imm — immunities by stage, runs over the rows of the fight's table: [[first row, ids]…], the first run starts at 0 and a
    new run only where the set changes (the row's boss monster changes it); ids — outerpedia glossary effect ids (`effects`;
    names for them are the app's own strings, not in the data), sorted; the stage's set is the last run whose first row ≤
    the stage's row;
    live — [start, battle end] of the latest season (world boss, guild raid, joint challenge); teams — the guide's teams
    for the fight: [{st?: [first, last stage], s: hero ids per slot, r?: [{h, eff?, spd?, trans?}]}] (guild raid
    requirements as the guide writes them: "268", "518/259", "≤180"). Guide texts are not taken (no Russian, D4).
    None — the guide list was not fetched."""
    files = src.get("guides")
    if files is None:
        warn.add("боссы outerpedia: список гайдов не получен — боссов на «Команде» не будет")
        return None
    gl, enc, mons = src["glossaries"], src["encounters"], src["monsters"]
    by_name = {c["name"]: c["id"] for c in chars}

    def ids_of(slots: list, where: str) -> list[list[str]]:
        out = []
        for slot in slots:
            got = []
            for name in slot:
                if name in by_name:
                    got.append(by_name[name])
                else:
                    warn.add(f"боссы outerpedia: герой «{name}» ({where}) не найден в данных")
            if got:
                out.append(got)
        return out

    def group_dungeons(group: str) -> list[tuple[str, dict]]:
        ds = [(k, d) for k, d in enc.items() if d.get("group") == group and d.get("monsters")]
        return sorted(ds, key=lambda kd: ((kd[1].get("difficulty") or {}).get("order", 0), kd[0]))

    def seasons(guide_dir: str) -> list[str]:
        """Season folders of a rotating guide, oldest first."""
        pre = guide_dir + "/versions/"
        return sorted({k[len(pre):].split("/", 1)[0] for k in files if k.startswith(pre)})

    def newest(guide_dir: str, name: str, ok=lambda x: True):
        """(season, json) of the newest season whose file `name` passes ok; (None, None) — none."""
        for v in reversed(seasons(guide_dir)):
            x = files.get(f"{guide_dir}/versions/{v}/{name}")
            if x is not None and ok(x):
                return v, x
        return None, None

    sing = {}  # singularity boss monster → its dungeon
    for gr in (src.get("singularity") or {}).get("groups", []):
        for b in gr.get("bosses", []):
            for mid in b.get("monsters", []):
                sing.setdefault(mid, b["dungeon"])

    sched = src.get("schedule") or {}
    calendar = [(s, [m for b in s.get("bosses", []) for m in b.get("monsters", [])] if "bosses" in s else s.get("monsters", []), mode)
                for key, mode in (("worldBoss", "world-boss"), ("guildRaid", "guild-raid"), ("jointChallenge", "joint-challenge"))
                for s in sched.get(key, [])]

    metas = sorted(((k.split("/")[0], k.rsplit("/", 1)[0], v) for k, v in files.items()
                    if k.endswith("/meta.json") and k.count("/") == 2 and k.split("/")[0] in BOSS_MODES),
                   key=lambda x: (list(BOSS_MODES).index(x[0]), x[2].get("order") or 0, x[1]))
    tables: dict[str, str] = {}  # rows → table id
    table_rows: dict[str, list] = {}
    fights = []
    for mode, gdir, meta in metas:
        if meta.get("hidden"):
            continue
        # (fight key suffix, encounter dungeons, teams)
        parts: list[tuple[str, list, list]] = []
        if mode in ("special-request", "irregular-extermination"):
            body = files.get(gdir + "/teams.json")
            teams = []
            if isinstance(body, dict):  # special request: stage buckets; neighbours with the same slots merge
                for b in body.get("buckets", []):
                    s = ids_of(b.get("slots", []), gdir)
                    if teams and teams[-1]["s"] == s and teams[-1]["st"][1] + 1 == b["stages"][0]:
                        teams[-1]["st"] = [teams[-1]["st"][0], b["stages"][1]]
                    elif s:
                        teams.append({"st": list(b["stages"]), "s": s})
            elif isinstance(body, list):
                teams = [{"s": s} for e in body if (s := ids_of(e.get("slots", []), gdir))]
            parts.append(("", group_dungeons(meta.get("group") or ""), teams))
        elif mode == "dimensional-singularity":
            dk = sing.get(meta.get("bossId") or "")
            parts.append(("", [(dk, enc[dk])] if dk in enc else [], []))
        elif mode == "guild-raid":
            ver, cfg = newest(gdir, "config.json", lambda x: bool(x.get("main")))
            vmain, main = newest(gdir, "main.json", lambda x: bool(x.get("teams")))
            if main is not None and vmain != ver:
                warn.add(f"боссы outerpedia: {gdir} — main.json из сезона {vmain}, config.json из {ver}")
            for slot in ("main", "subA", "subB"):
                teams = []
                if slot == "main":
                    for t in (main or {}).get("teams", []):
                        s = ids_of(t.get("slots", []), gdir)
                        entries = (t.get("requirements") or {}).get("entries") or []
                        for e in entries:
                            if e.get("character") not in by_name:
                                warn.add(f"боссы outerpedia: герой «{e.get('character')}» ({gdir}, требования) не найден в данных")
                        req = [{"h": by_name[e["character"]], **{k: str(v) for k, v in (e.get("stats") or {}).items() if k in ("eff", "spd", "trans")}}
                               for e in entries if e.get("character") in by_name]
                        req = [r for r in req if len(r) > 1]
                        if s:
                            teams.append({"s": s, **({"r": req} if req else {})})
                else:
                    vsub, sub = newest(gdir, slot + ".json", lambda x: bool((x.get("team") or {}).get("slots")))
                    if sub is not None and vsub != ver:
                        warn.add(f"боссы outerpedia: {gdir} — {slot}.json из сезона {vsub}, config.json из {ver}")
                    if sub and (s := ids_of(sub["team"]["slots"], gdir)):
                        teams.append({"s": s})
                parts.append((":" + slot, group_dungeons((cfg or {}).get(slot) or ""), teams))
        else:  # world boss, joint challenge: config.json group of the newest season; teams of the newest season with any
            _, cfg = newest(gdir, "config.json", lambda x: bool(x.get("group")))
            _, body = newest(gdir, "teams.json")
            teams = [{"s": s} for sec in ((body or {}).get("sections") or [body or {}]) if (s := ids_of(sec.get("slots") or [], gdir))]
            parts.append(("", group_dungeons((cfg or {}).get("group") or ""), teams))

        slug = gdir.split("/", 1)[1]
        ids_in_guide = {m["id"] for _, dungeons, _ in parts for _, d in dungeons for m in d["monsters"]}
        mine = [s for s, ms, m in calendar if m == mode and ids_in_guide & set(ms)]
        for s in mine:
            if not s.get("start") or not (s.get("battleEnd") or s.get("end")):
                warn.add(f"боссы outerpedia: {gdir} — у сезона расписания «{en(s.get('title')) or s.get('id') or '?'}» нет start или battleEnd/end")
        season = max(mine, key=lambda s: s.get("start", ""), default=None)
        for suffix, dungeons, teams in parts:
            rows = fight_rows(enc, mons, dungeons, warn, gdir + suffix)
            if not rows:
                warn.add(f"боссы outerpedia: {gdir}{suffix} — нет этапов с RES (формат encounters/monsters изменился?)")
                continue
            table = [[lvl, res, spd, label] for label, lvl, res, spd, _ in rows]
            tid = tables.setdefault(json.dumps(table), f"t{len(tables)}")
            table_rows[tid] = table
            if len(teams) == 1 and teams[0].get("st") == [1, len(rows)]:
                del teams[0]["st"]  # one bucket for every stage
            top = mons[rows[-1][4]]
            imm: list[list] = []
            for i, r in enumerate(rows):
                ids = sorted(immune_ids(gl, mons[r[4]]), key=lambda x: (len(x), x))
                if not imm or imm[-1][1] != ids:
                    imm.append([i, ids])
            fight = {
                "key": f"{BOSS_MODES[mode]}:{slug}{suffix}",
                "name": en(meta.get("title")) if mode in ("world-boss", "dimensional-singularity") else en(top.get("name")),
                "mode": BOSS_MODES[mode],
                "element": top.get("element"),
                "class": top.get("class"),
                "table": tid,
                "imm": imm,
            }
            if mode == "guild-raid":
                fight["group"] = en((season or {}).get("title")) or re.sub(r"\s+Guild Raid Guide$", "", en(meta.get("title")))
            if season and season.get("start") and (season.get("battleEnd") or season.get("end")):
                fight["live"] = [season["start"], season.get("battleEnd") or season["end"]]
            fight["guide"] = gdir
            if teams:
                fight["teams"] = teams
            fights.append(fight)
    q = (gl.get("bossQuirkMods") or {}).get("buff_resist")
    if q is None:
        warn.add("боссы outerpedia: нет bossQuirkMods.buff_resist (Challenge quirk) — считаю −200")
    return {"q": q if q is not None else -200, "t": table_rows, "b": fights}


def build_bosses_safe(src: dict, chars: list[dict], warn: Warnings) -> dict | None:
    """build_bosses, but a format change in the boss data costs only the bosses, not the whole build."""
    try:
        return build_bosses(src, chars, warn)
    except Exception as e:  # noqa: BLE001 — any format change: the rest of the data still ships
        warn.add(f"боссы outerpedia: формат изменился ({type(e).__name__}: {e}) — боссов на «Команде» не будет")
        return None


def build_view(label: str, b: dict, ctx: dict, ee_names: dict, warn: Warnings) -> dict:
    """Один билд outerpedia → компактная запись страницы. label — «Персонаж / Билд» для предупреждений."""
    presets, items, tables = ctx["presets"], ctx["items"], ctx["tables"]

    def gear(refs, keymap, kind):
        out: list[dict] = []
        for ref in refs or []:
            rid = str(ref.get("id", ""))
            if rid.startswith("!"):
                warn.add(f"{label}: нерешённая ссылка на {kind} «{rid[1:]}» (так в outerpedia) — пропущена")
                DROPPED.append(f"{label}:{kind}:{rid}")
                continue
            key = keymap.get(rid)
            if not key or (kind, key) not in items:
                known = rid in tables[kind]
                warn.add(f"{label}: {kind} id {rid} "
                         + ("есть в таблицах игры, но не в wiki-семействах outerpedia" if known else "неизвестен")
                         + " — рекомендация пропущена")
                DROPPED.append(f"{label}:{kind}:{rid}")
                continue
            item = items[(kind, key)]
            possible = set(item["mains"]) | set(item.get("extraMains", []))
            mains, bad = [], []
            for m in (ref.get("mainStat") or "").split("/"):
                m = m.strip().upper()
                m = LABEL_ALIASES.get(m, m)
                if not m:
                    continue
                if possible and m not in possible:
                    bad.append(m)
                    warn.add(f"{label}: outerpedia рекомендует main {m} для «{item['name']}», но у предмета его не бывает (возможны: {', '.join(item['mains'])})")
                else:
                    mains.append(m)
            if bad and not mains and len(item["mains"]) == 1:
                mains = list(item["mains"])  # у предмета единственный возможный main — берём его
            prev = next((g for g in out if g["key"] == key), None)
            if prev:
                prev["mains"] += [m for m in mains if m not in prev["mains"]]
                extra_bad = [m for m in bad if m not in prev.get("bad", [])]
                if extra_bad:
                    prev["bad"] = prev.get("bad", []) + extra_bad
            else:
                entry = {"key": key, "mains": mains}
                if bad:
                    entry["bad"] = bad
                out.append(entry)
        return out

    combos = []
    for s in b.get("sets") or []:
        pieces = s.get("pieces")
        if pieces is None and s.get("preset"):
            pieces = presets.get("sets", {}).get(s["preset"])
            if pieces is None:
                warn.add(f"{label}: неизвестный пресет сетов «{s['preset']}» — комбо пропущено")
        if not pieces:
            continue
        combo = [{"set": str(p["set"]), "n": int(p.get("count", 2))} for p in pieces]
        unknown = [p["set"] for p in combo if p["set"] not in ctx["set_ids"]]
        if unknown:
            warn.add(f"{label}: неизвестный сет {', '.join(unknown)} — комбо пропущено")
            continue
        combos.append(combo)

    tal = []
    for t in b.get("talismans") or []:
        if t.startswith("$"):
            ids = presets.get("talismans", {}).get(t[1:])
            if ids is None:
                warn.add(f"{label}: неизвестный пресет талисманов «{t}»")
                ids = []
        else:
            ids = [t]
        for i in ids:
            if i in ctx["talismans"]:
                if i not in tal:
                    tal.append(i)
            else:
                warn.add(f"{label}: неизвестный талисман {i}")

    subs_raw = b.get("substats") or ""
    if subs_raw.startswith("$"):
        resolved = presets.get("substats", {}).get(subs_raw[1:])
        if resolved is None:
            warn.add(f"{label}: неизвестный пресет сабстатов «{subs_raw}»")
        subs_raw = resolved or ""
    subs = parse_priority(subs_raw)
    for tok in {t for tier in subs for t in tier}:
        axis = tok.rstrip("%")
        if tok not in ctx["sub_keys"] and axis not in ("ATK", "DEF", "HP"):
            warn.add(f"{label}: в приоритете «{tok}», но такой сабстат на 6★ не выпадает — страница его пропустит")

    note = b.get("note")
    note = clean_markup(en(note), ee_names, warn, label) if note else ""
    return {
        "name": b.get("name") or "Build",
        "sets": combos,
        "weapons": gear(b.get("weapons"), ctx["weapon_key"], "weapon"),
        "amulets": gear(b.get("amulets"), ctx["amulet_key"], "accessory"),
        "talismans": tal,
        "subs": subs,
        "note": note,
    }


# --------------------------------------------------------------------------- картинки


def image_paths(data: dict) -> dict[str, str]:
    """Ключ картинки → путь на img.outerpedia.com."""
    paths: dict[str, str] = {}

    def eq(icon):
        if icon:
            paths[f"eq:{icon}"] = f"/images/equipment/{icon}.webp"

    for c in data["chars"]:
        paths[f"face:{c['icon']}"] = f"/images/characters/faceicon/FI_{c['icon']}.webp"
    for it in data["weapons"] + data["amulets"]:
        eq(it["icon"])
    for icon in data["slotIcons"].values():
        eq(icon)
    for s in data["sets"]:
        eq(s["icon"])
        for icon in s["pieces"].values():
            eq(icon)
    for t in data["talismans"].values():
        eq(t["icon"])
    for icon in sorted(set(STAT_ICON.values())):
        paths[f"stat:{icon}"] = f"/images/ui/stat/{icon}.webp"
    for cl in CLASS_ORDER:
        paths[f"class:{cl}"] = f"/images/ui/class/IG_Turn_Class_{cl.capitalize()}.webp"
    for el in ELEMENT_ORDER:
        paths[f"elem:{el}"] = f"/images/ui/elem/IG_Turn_Element_{el.capitalize()}.webp"
    for g, frame in (("rare", "Rare"), ("unique", "Unique")):
        paths[f"frame:{g}"] = f"/images/ui/bg/TI_Slot_{frame}.webp"
    return paths


def is_webp(blob: bytes) -> bool:
    return len(blob) > 12 and blob[:4] == b"RIFF" and blob[8:12] == b"WEBP"


def migrate_old_cache(cache: Path) -> None:
    """Раньше кэш лежал в папке проекта (.cache, плоские имена) — переносим в новое место и удаляем."""
    if not OLD_CACHE_DIR.is_dir():
        return
    moved = 0
    for f in OLD_CACHE_DIR.iterdir():
        if f.suffix == ".webp" and "__" in f.name:
            target = cache / f.name.replace("__", "/")
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.move(str(f), target)
                moved += 1
    shutil.rmtree(OLD_CACHE_DIR, ignore_errors=True)
    log(f"Кэш иконок перенесён из {OLD_CACHE_DIR.name}/ в {cache} ({moved} файлов)")


def fetch_images(paths: dict[str, str], cache: Path, warn: Warnings, refresh: bool) -> dict[str, bytes]:
    """Картинки по ключам. Кэш повторяет пути CDN: <cache>/images/equipment/X.webp."""
    cache.mkdir(parents=True, exist_ok=True)
    max_age = 30 * 24 * 3600  # иконки на CDN иногда обновляют — раз в месяц перекачиваем

    def fetch(item: tuple[str, str]) -> tuple[str, bytes | None]:
        key, path = item
        file = cache / path.strip("/")
        blob = b""
        if file.exists() and not refresh and time.time() - file.stat().st_mtime < max_age:
            blob = file.read_bytes()
        if not is_webp(blob):
            try:
                got = http_get(IMG_BASE + path, timeout=30)
            except Exception:  # noqa: BLE001
                got = b""
            if is_webp(got):
                blob = got
                file.parent.mkdir(parents=True, exist_ok=True)
                tmp = file.with_suffix(file.suffix + ".tmp")
                tmp.write_bytes(blob)
                os.replace(tmp, file)  # атомарно: оборванная запись не отравит кэш
            elif file.exists() and is_webp(file.read_bytes()):
                blob = file.read_bytes()  # CDN недоступен — берём старую копию
            else:
                return key, None
        return key, blob

    out: dict[str, bytes] = {}
    missing = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for key, blob in pool.map(fetch, paths.items()):
            if blob:
                out[key] = blob
            else:
                missing.append(key)
    if missing:
        warn.add(f"Не скачались картинки ({len(missing)}): {', '.join(missing[:8])}{'…' if len(missing) > 8 else ''}")
    return out


def collect_images(data: dict, embed: bool, warn: Warnings, refresh: bool = False) -> dict[str, str]:
    """Одиночная страница: картинки встраиваются как data URI (или ссылками на CDN при --no-embed)."""
    paths = image_paths(data)
    if not embed:
        return {k: IMG_BASE + p for k, p in paths.items()}
    cache = default_cache_dir()
    migrate_old_cache(cache)
    blobs = fetch_images(paths, cache, warn, refresh)
    return {k: "data:image/webp;base64," + base64.b64encode(b).decode("ascii") for k, b in blobs.items()}


# --------------------------------------------------------------------------- PWA


def png_bytes(size: int, pixels: bytearray) -> bytes:
    """RGBA-пиксели → PNG (без внешних библиотек)."""
    stride = size * 4
    raw = b"".join(b"\x00" + bytes(pixels[y * stride:(y + 1) * stride]) for y in range(size))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def render_app_icon(size: int, maskable: bool) -> bytes:
    """Иконка приложения: буква O из логотипа Outerplane с четырёхлучевой искрой."""
    bg = (0x15, 0x1A, 0x22)
    ring_top, ring_bot = (0xF8, 0xC8, 0x48), (0xEE, 0x7A, 0x1A)     # кольцо — палитра страницы
    spark_top, spark_bot = (0xFF, 0xFC, 0xF4), (0xFF, 0xDD, 0x9A)   # искра — светлая, как в логотипе
    # maskable: фон на весь квадрат, знак в безопасной зоне (центральные ~60%)
    corner = 0.0 if maskable else 0.2 * size
    L = size * (0.62 if maskable else 0.78)
    c = size / 2
    rx, ry = 0.425 * L, 0.495 * L       # внешний овал: по бокам шире, чем высок штрих сверху
    hx, hy = rx * 0.545, ry * 0.665     # просвет буквы
    sa, sb = hx * 0.60, hy * 0.90       # полуоси искры: вертикальный луч длиннее
    pw = 0.45                           # < 1 — рёбра искры вогнутые
    px = bytearray(size * size * 4)

    def ellipse(dx: float, dy: float, ax: float, ay: float) -> float:
        """Знаковое расстояние до овала (снаружи > 0)."""
        q = math.hypot(dx / ax, dy / ay)
        if q < 1e-9:
            return -min(ax, ay)
        return (q - 1.0) / math.hypot(dx / (ax * ax * q), dy / (ay * ay * q))

    def spark(t: float) -> float:
        return (abs(math.cos(t) / sa) ** pw + abs(math.sin(t) / sb) ** pw) ** (-1.0 / pw)

    for y in range(size):
        k = y / max(1, size - 1)
        rr, rg, rb = (ring_top[i] + (ring_bot[i] - ring_top[i]) * k for i in range(3))
        sr, sg, sb_ = (spark_top[i] + (spark_bot[i] - spark_top[i]) * k for i in range(3))
        for x in range(size):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            r, g, b = bg
            if abs(dx) < rx + 1 and abs(dy) < ry + 1:       # кольцо буквы
                cov = (max(0.0, min(1.0, 0.5 - ellipse(dx, dy, rx, ry)))
                       * max(0.0, min(1.0, 0.5 + ellipse(dx, dy, hx, hy))))
                if cov:
                    r, g, b = (r + (rr - r) * cov, g + (rg - g) * cov, b + (rb - b) * cov)
            if abs(dx) < sa + 1 and abs(dy) < sb + 1:       # искра в просвете
                rad = math.hypot(dx, dy)
                if rad < 1e-9:
                    d = -min(sa, sb)
                else:
                    t = math.atan2(dy, dx)
                    base = spark(t)
                    slope = (spark(t + 1e-3) - spark(t - 1e-3)) / 2e-3
                    d = (rad - base) / math.hypot(1.0, slope / base)
                cov = max(0.0, min(1.0, 0.5 - d))
                if cov:
                    r, g, b = (r + (sr - r) * cov, g + (sg - g) * cov, b + (sb_ - b) * cov)
            alpha = 1.0
            if corner:                                      # скруглённые углы фона со сглаживанием
                ex = min(max(x + 0.5, corner), size - corner)
                ey = min(max(y + 0.5, corner), size - corner)
                alpha = max(0.0, min(1.0, corner - math.hypot(x + 0.5 - ex, y + 0.5 - ey) + 0.5))
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((int(r), int(g), int(b), int(alpha * 255)))
    return png_bytes(size, px)


def sw_template() -> str:
    """Шаблон service worker из pwa/sw.template.js (первая строка — комментарий для читающего шаблон)."""
    text = SW_TEMPLATE.read_text(encoding="utf-8")
    return text.split("\n", 1)[1] if text.startswith("// Шаблон") else text


def build_pwa(site: Path, data: dict, fragment_for, warn: Warnings, refresh: bool) -> dict:
    """Статический сайт для GitHub Pages: index.html + img/ + manifest + service worker + иконки."""
    site.mkdir(parents=True, exist_ok=True)
    paths = image_paths(data)
    img_dir = site / "img"
    # иконки сайта сами служат кэшем: при сборке в CI не нужно качать заново то, что уже в репозитории
    blobs = fetch_images(paths, img_dir, warn, refresh)
    keep = set()
    data["img"] = {}
    for key, path in paths.items():
        if key in blobs:
            rel = "img/" + path.strip("/")
            data["img"][key] = rel
            keep.add((site / rel).resolve())
    for f in img_dir.rglob("*"):
        if f.is_file() and f.resolve() not in keep:
            f.unlink()  # иконки, которые больше не нужны
    for d in sorted((x for x in img_dir.rglob("*") if x.is_dir()), key=lambda x: -len(x.parts)):
        if not any(d.iterdir()):
            d.rmdir()

    icons = site / "icons"
    icons.mkdir(exist_ok=True)
    for name, size, maskable in (("icon-192.png", 192, False), ("icon-512.png", 512, False),
                                 ("maskable-512.png", 512, True), ("apple-touch-icon.png", 180, True)):
        f = icons / name
        if not f.exists():
            f.write_bytes(render_app_icon(size, maskable))

    manifest = {
        "name": APP_NAME,
        "short_name": APP_SHORT,
        "description": "Keep or dismantle? Outerplane gear check based on outerpedia builds (English / Русский)",
        "lang": "en",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "background_color": "#151a22",
        "theme_color": "#151a22",
        "icons": [
            {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (site / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    head_extra = (
        '<link rel="manifest" href="manifest.webmanifest">\n'
        '<meta name="theme-color" content="#eceff4" media="(prefers-color-scheme: light)">\n'
        '<meta name="theme-color" content="#0c0f14" media="(prefers-color-scheme: dark)">\n'
        '<link rel="icon" href="icons/icon-192.png" type="image/png">\n'
        '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n'
        '<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="Gear Check">\n'
        '<script>window.OGC_PWA = true;</script>\n'
    )
    page = fragment_for(data, head_extra)
    (site / "index.html").write_text(page, encoding="utf-8")
    (site / ".nojekyll").write_text("")

    files = ["./", "index.html", "manifest.webmanifest"] + [f"icons/{f.name}" for f in sorted(icons.glob("*.png"))] + sorted(data["img"].values())
    digest = hashlib.sha1()
    for rel in files[1:]:
        digest.update(rel.encode())
        digest.update((site / rel).read_bytes())
    version = digest.hexdigest()[:12]
    # VERSION — версия приложения: любые файлы. DATA — версия данных: коммит outerpedia снимка (BUILD_STAMP),
    # по ней страница отличает новые данные от правок кода (src/hooks/usePwa.ts)
    sw = (sw_template().replace("__VERSION__", version).replace("__DATA__", json.dumps(data["meta"].get("commit")))
          .replace("__FILES__", json.dumps(files, ensure_ascii=False, indent=2)))
    (site / "sw.js").write_text(sw, encoding="utf-8")
    size = sum((site / rel).stat().st_size for rel in files[1:])
    return {"version": version, "files": len(files), "bytes": size, "page": len(page.encode("utf-8"))}


# --------------------------------------------------------------------------- вывод


def previous_data(path: Path) -> dict | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    m = re.search(r"<script>window\.OGC_DATA\s*=\s*(\{.*?\});\s*</script>", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1).replace("<\\/", "</"))  # старый формат экранировал только «</»
    except json.JSONDecodeError:
        return None


def diff_report(prev: dict | None, data: dict) -> list[str]:
    if not prev:
        return []
    old = {c["id"]: c for c in prev.get("chars", [])}
    new = {c["id"]: c for c in data["chars"]}
    lines = []
    for cid, c in new.items():
        o = old.get(cid)
        name = c["name"] or c["slug"]
        if not o:
            lines.append(f"  + новый персонаж: {name}{'' if c['builds'] else ' (пока без билдов)'}")
            continue
        if o.get("name") != c["name"]:
            lines.append(f"  ~ имя: {o.get('name')} → {name}")
        if json.dumps(o.get("builds"), sort_keys=True) != json.dumps(c["builds"], sort_keys=True):
            lines.append(f"  ~ обновлены билды: {name}")
    for cid, o in old.items():
        if cid not in new:
            lines.append(f"  - персонаж пропал из данных: {o.get('name')}")
    for kind, key in (("предмет", "weapons"), ("предмет", "amulets"), ("сет", "sets")):
        was = {x.get("key", x.get("id")): x.get("name") for x in prev.get(key, [])}
        now = {x.get("key", x.get("id")): x.get("name") for x in data[key]}
        lines += [f"  + новый {kind}: {now[k]}" for k in now if k not in was]
        lines += [f"  - {kind} пропал: {was[k]}" for k in was if k not in now]
    return lines + main_changes(prev, data)


def mains_text(x: dict) -> str:
    """Строки main предмета для отчёта: сначала те, что есть всегда, потом выбор — «ATK + ATK%/DEF%/HP%»."""
    choice = "/".join(x.get("mains") or [])
    if x.get("extraMains"):
        choice += f" (у фиксированных копий ещё {'/'.join(x['extraMains'])})"
    return " + ".join([*(x.get("fixed") or []), *([choice] if choice else [])]) or "—"


def main_changes(prev: dict, data: dict) -> list[str]:
    """Смена main у вещи, которая была и раньше, и новая вещь с main не как у остальных в слоте.

    Страница считает по данным и сама перейдёт на новые main — строка нужна, чтобы это было видно в PR.
    Такая же проверка — dataDiff в scripts/check-data.mjs.
    """
    lines = []
    usual = data.get("fixedMains") or {}
    for key, kind in (("weapons", "weapon"), ("amulets", "accessory")):
        was = {x["key"]: x for x in prev.get(key, [])}
        for x in data[key]:
            o = was.get(x["key"])
            if o is None:
                base = (usual.get(kind) or {}).get(x.get("grade"))
                if x.get("star") == 6 and base is not None and (x.get("fixed") or []) != base:
                    lines.append(f"  + main не как у остальных: {SLOT_RU[kind]} {x['name']} — {mains_text(x)}")
                continue
            if "fixed" not in o:
                o = {**o, "fixed": x.get("fixed")}  # данные до строк main: сравниваем только выбор
            if mains_text(o) != mains_text(x):
                lines.append(f"  ~ main: {SLOT_RU[kind]} {x['name']}: {mains_text(o)} → {mains_text(x)}")
    was_sets = {s["id"]: s for s in prev.get("sets", [])}
    joined = lambda ls: " + ".join(ls) or "—"  # noqa: E731
    for s in data["sets"]:
        o = was_sets.get(s["id"])
        for slot, by_grade in (s.get("fixed") or {}).items():
            for grade, now in by_grade.items():
                where = f"{s['name']}, {SLOT_RU[slot]} {GRADE_EN[grade]}"
                then = ((o or {}).get("fixed") or {}).get(slot, {}).get(grade)
                base = (usual.get(slot) or {}).get(grade)
                if then is None and base is not None and now != base and (o is None or "fixed" in o):
                    lines.append(f"  + main не как у остальных: {where} — {joined(now)} (обычно {joined(base)})")
                elif then is not None and then != now:
                    lines.append(f"  ~ main: {where}: {joined(then)} → {joined(now)}")
    for slot, by_grade in (prev.get("fixedMains") or {}).items():
        for grade, then in by_grade.items():
            now = (usual.get(slot) or {}).get(grade)
            if now is not None and now != then:
                lines.append(f"  ~ main у большинства вещей: {SLOT_RU[slot]} {GRADE_EN[grade]}: {joined(then)} → {joined(now)}")
    return lines


def load_template() -> str:
    """Собранное приложение (build/app/index.html) — с проверками, что его можно безопасно резать и заполнять."""
    rel = TEMPLATE.relative_to(HERE)
    if not TEMPLATE.exists():
        raise SystemExit(f"Нет {rel} — сначала собери приложение: task build:app (или npm run build)")
    page = TEMPLATE.read_text(encoding="utf-8")
    for marker in (DATA_MARKER, *CUT_MARKERS):
        if page.count(marker) != 1:
            raise SystemExit(f"В {rel} маркер {marker} встречается {page.count(marker)} раз, а должен ровно один")
    # встроенный бандл (от маркера до </head>) не должен закрывать <script> раньше времени и открывать
    # HTML-комментарий: иначе браузер оборвёт скрипт посередине
    bundle = page[page.index(CUT_MARKERS[2]) + len(CUT_MARKERS[2]):page.rindex("</head>")]
    if len(re.findall(r"</script", bundle, re.I)) != 1 or "<!--" in bundle:
        raise SystemExit(f"Во встроенном JS {rel} есть «</script» или «<!--» — браузер разберёт страницу неверно")
    return page


def data_blob(data: dict) -> str:
    # «<» → \\u003c: ни «</script», ни «<!--» из данных не сломают разбор страницы; U+2028/2029 — для старых движков
    return (json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            .replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def drop_marker(page: str, marker: str, insert: str = "") -> str:
    """Убирает маркер вместе с отступом и переводом строки после него, на его место ставит insert."""
    return re.sub(re.escape(marker) + r"[ \t]*\n?[ \t]*", lambda _: insert, page, count=1)


def render_document(data: dict, head_extra: str = "") -> str:
    """Страница целиком (одиночный файл и PWA): данные подставлены, head_extra — в начале <head>."""
    page = load_template().replace(DATA_MARKER, data_blob(data), 1)
    page = drop_marker(page, HEAD_MARKER, head_extra)
    for marker in CUT_MARKERS[1:]:
        page = drop_marker(page, marker)
    return page


def render_fragment(data: dict) -> str:
    """Для Claude Artifact: без <html>/<head>/<body> — содержимое <head> после маркера и <body>.
    Порядок в <head> сохраняется: сначала данные, потом бандл."""
    page = load_template().replace(DATA_MARKER, data_blob(data), 1)
    head_end = page.rindex("</head>")  # последний: встроенный JS тоже живёт в <head>
    body_start = page.index("<body>", head_end) + len("<body>")
    frag = page[page.index(HEAD_MARKER) + len(HEAD_MARKER):head_end].strip() + "\n" + page[body_start:page.rindex("</body>")].strip() + "\n"
    for marker in CUT_MARKERS[1:]:
        frag = drop_marker(frag, marker)
    return frag


def render(data: dict) -> tuple[str, str]:
    return render_document(data), render_fragment(data)


def main() -> None:
    ap = argparse.ArgumentParser(description="Обновить данные Outerplane Gear Check из outerpedia")
    ap.add_argument("--source", type=Path, help="локальный клон outerpedia вместо скачивания")
    ap.add_argument("--ref", default=DEFAULT_REF, help="ветка или sha на GitHub (по умолчанию main)")
    ap.add_argument("--no-embed", action="store_true", help="не встраивать иконки, грузить их с img.outerpedia.com")
    ap.add_argument("--refresh-images", action="store_true", help="перекачать все иконки, не глядя в кэш")
    ap.add_argument("--out", type=Path, default=OUT_LOCAL, help="куда писать страницу")
    ap.add_argument("--artifact", type=Path, help="куда писать вариант без <html>-обёртки (по умолчанию build/artifact.html, "
                                                  "а при своём --out — рядом с ним: <имя>.artifact.html)")
    ap.add_argument("--dump-json", "--data-only", dest="dump_json", type=Path, help="дополнительно сохранить датасет в JSON")
    ap.add_argument("--pwa", type=Path, metavar="DIR", help="собрать PWA-сайт в папку DIR (для GitHub Pages) вместо одиночной страницы")
    ap.add_argument("--report-json", type=Path, metavar="FILE", help="с --pwa: итог сборки в JSON (изменения, предупреждения, "
                                                                  "несопоставленные рекомендации) — для scripts/check-data.mjs")
    ap.add_argument("--same-data", action="store_true", help="с --pwa: пересобрать только код — на том же коммите outerpedia, "
                                                             "что в DIR/index.html, за свежими данными не ходить (task preview)")
    ap.add_argument("--dev-data", type=Path, metavar="FILE", help="only the dataset as JSON for task dev: the outerpedia commit "
                                                                   "of docs/index.html, built by this update.py (no app, no images)")
    args = ap.parse_args()
    if args.dev_data:
        return main_dev_data(args)
    if args.same_data and not args.pwa:
        ap.error("--same-data — только вместе с --pwa DIR")
    if args.pwa:
        return main_pwa(args)
    out = args.out.expanduser()
    artifact = args.artifact or (OUT_ARTIFACT if out.resolve() == OUT_LOCAL.resolve()
                                 else out.with_name(out.stem + ".artifact.html"))

    warn = Warnings()
    src, prov = load_sources(args.source, args.ref)
    data = build_dataset(src, prov, warn)
    data["img"] = collect_images(data, embed=not args.no_embed, warn=warn, refresh=args.refresh_images)

    prev = previous_data(out)
    carry_new_ids(data, prev)

    local, fragment = render(data)
    out.parent.mkdir(parents=True, exist_ok=True)
    artifact.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(local, encoding="utf-8")
    artifact.write_text(fragment, encoding="utf-8")
    if args.dump_json:
        slim = {k: v for k, v in data.items() if k != "img"}
        args.dump_json.write_text(json.dumps(slim, ensure_ascii=False, indent=1), encoding="utf-8")

    c = data["meta"]["counts"]
    log(f"Готово: {out}  ({len(local.encode('utf-8')) / 1024 / 1024:.1f} МБ)")
    log(f"  для публикации: {artifact}")
    log(f"  персонажей {c['characters']} (с билдами {c['withBuilds']}), билдов {c['builds']}, "
        f"оружия {c['weapons']}, аксессуаров {c['accessories']}, "
        f"{'ссылок на картинки' if args.no_embed else 'картинок встроено'} {len(data['img'])}")
    report(data, prev, warn)


def main_dev_data(args) -> None:
    """task dev (vite.config.ts devData) takes data from docs/index.html — the published snapshot, built by the update.py
    of that day. A new data field (as Char.chc, mainValues) appears there only after a publish; this builds the dataset
    of the same outerpedia commit with the current update.py, so the dev page sees it now. Images stay docs/'s."""
    prev = previous_data(HERE / "docs" / "index.html")
    commit = ((prev or {}).get("meta") or {}).get("commit")
    if not commit and not args.source:
        raise SystemExit("--dev-data: в docs/index.html нет коммита outerpedia — нечего пересобирать")
    warn = Warnings()
    src, prov = load_sources(args.source, commit or args.ref)
    data = build_dataset(src, prov, warn)
    args.dev_data.parent.mkdir(parents=True, exist_ok=True)
    args.dev_data.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    log(f"Данные для task dev: {args.dev_data} (outerpedia {str(prov.get('commit') or commit)[:7]})")


def report(data: dict, prev: dict | None, warn: Warnings) -> None:
    changes = diff_report(prev, data)
    if changes:
        log("Изменения с прошлого обновления:")
        for line in changes:
            log(line)
    elif prev:
        log("Персонажи и билды не изменились.")
    if warn.items:
        log(f"Предупреждения ({len(warn.items)}):")
        for w in warn.items:
            log(f"  ! {w}")
    if DROPPED:
        log(f"ВНИМАНИЕ: {len(DROPPED)} рекомендаций outerpedia не попали на страницу (см. предупреждения выше). "
            "Скорее всего, в outerpedia поменялась структура данных — стоит обновить update.py.")


# Снимок данных — метки, а не данные: из какого коммита outerpedia и откуда собран набор. У PWA он двигается, только
# когда новые данные outerpedia меняют то, что строит ТЕКУЩИЙ код (main_pwa): новый коммит, не тронувший наши файлы
# или тронувший то, чего мы не читаем, — не обновление, и телефоны не покажут «Вышли новые данные» (sw.js отдаёт
# commit странице как версию данных). source — вместе с коммитом: сборка из локального клона (--source) отличается
# от GitHub только этой подписью
BUILD_STAMP = ("generatedAt", "source", "commit", "commitDate")


def same_content(a: dict, b: dict) -> bool:
    """Два набора одинаковы без меток: снимок (BUILD_STAMP), newIds и img зависят от прошлой страницы, а не от данных.

    meta.gameVersion сравнивается: новая версия игры — новые данные."""
    def strip(d: dict) -> str:
        d = {k: v for k, v in d.items() if k != "img"}
        d["meta"] = {k: v for k, v in d.get("meta", {}).items() if k not in BUILD_STAMP and k != "newIds"}
        return json.dumps(d, sort_keys=True, ensure_ascii=False)
    return strip(a) == strip(b)


def published_dataset(meta: dict) -> dict:
    """Опубликованный снимок (meta — со страницы), собранный ТЕКУЩИМ кодом: с ним сравнивается свежий набор.

    Качается сразу по sha: дата у снимка уже есть, GitHub API не нужен. Предупреждения и DROPPED у этой сборки свои —
    иначе отчёт и описание PR показали бы их дважды."""
    pub = meta["commit"]
    log(f"Сверяю с опубликованным снимком {pub[:7]}")
    dropped = DROPPED[:]
    try:
        src = fetch_sources(pub)
        return build_dataset(src, {"source": f"github.com/{REPO}", "commit": pub, "commitDate": meta.get("commitDate")},
                             Warnings())
    except SystemExit as exc:
        raise SystemExit(f"Не собрался опубликованный снимок {pub[:7]} для сверки ({exc}) — сборку PWA не делаю: "
                         "без сверки не понять, изменились ли данные, а лучше не собрать, чем выпустить ложное "
                         "обновление. Повтори позже.") from None
    finally:
        DROPPED[:] = dropped


def snapshot_kind(data: dict, prev: dict | None, prov: dict) -> str:
    """Какой снимок у новой страницы: same-commit, same-content — прежний; changed — новый (свежий коммит outerpedia).

    Прежний снимок можно оставить, только когда набор совпадает с тем, что дал бы этот коммит текущим кодом:
    публикация кода (--ref опубликованного коммита) и --same-data собирают страницу заново из meta.commit, и старый
    коммит рядом с другими данными молча откатил бы их."""
    pub = ((prev or {}).get("meta") or {}).get("commit")
    if not pub:
        return "changed"  # первая сборка в пустую папку
    if prov["commit"] == pub:
        return "same-commit"  # --same-data, публикация кода роботом, task preview
    return "same-content" if same_content(published_dataset(prev["meta"]), data) else "changed"


def carry_new_ids(data: dict, prev: dict | None) -> None:
    ids_now = {c["id"] for c in data["chars"]}
    fresh = [c["id"] for c in data["chars"] if prev and c["id"] not in {p["id"] for p in prev.get("chars", [])}]
    carried = [i for i in ((prev or {}).get("meta", {}).get("newIds") or []) if i in ids_now]
    data["meta"]["newIds"] = fresh or carried


def main_pwa(args) -> None:
    """PWA в папку: снимок данных двигается, только когда изменились данные (BUILD_STAMP, snapshot_kind).

    Прошлая страница в папке — опубликованная: её meta.commit сравнивается со свежим коммитом outerpedia. Тот же
    коммит — снимок прежний. Другой — опубликованный коммит собирается ещё раз текущим кодом (published_dataset):
    тот же набор — снимок прежний, другой — новый. Правки кода при прежнем снимке дают новую версию приложения
    (VERSION в sw.js), но не версию данных: у телефонов нет плашки «Вышли новые данные»."""
    site = args.pwa.expanduser()
    warn = Warnings()
    prev = previous_data(site / "index.html")
    if args.same_data:
        commit = ((prev or {}).get("meta") or {}).get("commit")
        if not commit:
            raise SystemExit(f"--same-data: в {site / 'index.html'} нет коммита outerpedia — нечего пересобирать")
        args.ref = commit
    src, prov = load_sources(args.source, args.ref)
    if not prov.get("commit") or not prov.get("commitDate"):
        # без sha и даты коммита данные нельзя сравнить с опубликованными: снимок сдвинулся бы, и у всех
        # установленных приложений выскочила бы ложная плашка «вышли новые данные»
        raise SystemExit("Не удалось узнать коммит outerpedia (лимит GitHub API или нет git в --source) — "
                         "сборку PWA не делаю, чтобы не выпустить ложное обновление. Повтори позже.")
    data = build_dataset(src, prov, warn)
    # не время сборки, а дата коммита outerpedia: сайт — функция только кода и коммита. Иначе две сборки одних
    # и тех же новых данных различались бы, и автообновление перепушивало бы ветку PR каждую ночь
    data["meta"]["generatedAt"] = prov["commitDate"]
    kind = snapshot_kind(data, prev, prov)
    pub = ((prev or {}).get("meta") or {}).get("commit") or ""
    if kind == "changed":
        log(f"Снимок данных новый: {prov['commit'][:7]}" + (f" (был {pub[:7]})" if pub else ""))
    else:
        # данные те же — прежний снимок, чтобы файлы не менялись: ни лишнего коммита, ни ложной плашки
        # «вышли новые данные»; страница та же, что собрал бы из meta.commit текущий код
        for key in BUILD_STAMP:
            data["meta"][key] = prev["meta"].get(key, data["meta"][key])
        log(f"Снимок данных прежний: {pub[:7]}" + (" — тот же коммит outerpedia" if kind == "same-commit" else
            f" — у outerpedia новый коммит {prov['commit'][:7]}, но то, что строит этот код, не изменилось"))
    carry_new_ids(data, prev)
    info = build_pwa(site, data, render_document, warn, args.refresh_images)
    if args.dump_json:
        slim = {k: v for k, v in data.items() if k != "img"}
        args.dump_json.write_text(json.dumps(slim, ensure_ascii=False, indent=1), encoding="utf-8")
    c = data["meta"]["counts"]
    log(f"Готово: PWA в {site}/  (index.html {info['page'] / 1024:.0f} КБ, всего {info['files']} файлов, "
        f"{info['bytes'] / 1024 / 1024:.1f} МБ, версия {info['version']})")
    log(f"  персонажей {c['characters']} (с билдами {c['withBuilds']}), билдов {c['builds']}")
    report(data, prev, warn)
    if args.report_json:
        write_report_json(args.report_json, data, prev, prov, warn, kind)


def write_report_json(path: Path, data: dict, prev: dict | None, prov: dict, warn: Warnings, snapshot: str) -> None:
    """Итог сборки для проверок (scripts/check-data.mjs), робота (scripts/autoupdate.sh) и описания PR автообновления.

    dataChanged — снимок данных сдвинулся (у страницы другой meta.commit, чем у прошлой): телефоны покажут «Вышли
    новые данные». snapshot — почему так (snapshot_kind): same-commit, same-content или changed."""
    out = {
        "fetched": {"commit": prov.get("commit"), "commitDate": prov.get("commitDate")},
        "published": {k: (prev or {}).get("meta", {}).get(k) for k in ("commit", "commitDate")},
        "dataChanged": snapshot == "changed",
        "snapshot": snapshot,
        "counts": data["meta"]["counts"],
        "changes": [line.strip() for line in diff_report(prev, data)],
        "warnings": warn.items,
        "dropped": DROPPED,
        "sourceFiles": list(SOURCE_FILES.values()),
    }
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
