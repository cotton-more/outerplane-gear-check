#!/usr/bin/env python3
"""
Outerplane Gear Check — обновление данных страницы.

Берёт свежие данные из репозитория outerpedia (https://github.com/Sevih/outerpedia),
собирает компактный датасет (персонажи, билды, сеты, оружие, аксессуары, талисманы, база статов),
встраивает иконки как data URI и генерирует готовую страницу из template.html.

Запуск (нужен только Python 3.9+, без внешних пакетов):

    python3 update.py                        # скачать последнюю версию с GitHub
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
import shutil
import struct
import zlib
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

if sys.version_info < (3, 9):
    raise SystemExit("Нужен Python 3.9 или новее")

REPO = "Sevih/outerpedia"
DEFAULT_REF = "main"
IMG_BASE = "https://img.outerpedia.com"
USER_AGENT = "outerplane-gear-check/1.0 (+personal inventory tool)"

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "template.html"
OUT_LOCAL = HERE / "outerplane-gear.html"
OUT_ARTIFACT = HERE / "build" / "artifact.html"
OLD_CACHE_DIR = HERE / ".cache"  # старое место кэша иконок — переносим в системный кэш
DATA_MARKER = "/*__OGC_DATA__*/null"
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
    "families": "data/generated/equipment/families.json",
    "sources": "data/generated/equipment/sources.json",
    "bosses": "data/generated/equipment/bosses.json",
    "equipCurated": "data/curated/equipment.json",
    "ee": "data/generated/equipment/ee.json",
    "progression": "data/generated/progression.json",
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


def http_get(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
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
    try:
        info = json.loads(http_get(url, timeout=20))
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
        sha, date = git_info(source)
        # путь к клону в страницу не пишем: он попадёт в публикуемый файл
        return data, {"source": f"github.com/{REPO} (локальный клон)", "commit": sha, "commitDate": date}

    sha, date = resolve_ref(ref)
    log(f"Источник: github.com/{REPO} @ {sha[:10] if date else sha}{' (' + date + ')' if date else ''}")

    def fetch(item: tuple[str, str]) -> tuple[str, object]:
        key, rel = item
        url = f"https://raw.githubusercontent.com/{REPO}/{sha}/{rel}"
        return key, parse_json(fetch_retry(url, rel), rel)

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for key, value in pool.map(fetch, SOURCE_FILES.items()):
            data[key] = value
    return data, {"source": f"github.com/{REPO}", "commit": sha if date else None, "commitDate": date}


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
    Возвращает {"ATK": [база@100, база@макс.LB, quirks], "DEF": [...], "HP": [...]}.
    """
    rarity = str(c.get("rarity"))
    rungs = prog.get("evolutions", {}).get(rarity, [])
    lb = prog.get("limitBreak", {}).get(f"{rarity}_{c.get('element')}", [])
    base_cap = min(x["requireLevel"] for x in lb) if lb else max([1] + [r["level"] for r in rungs if r["level"] <= 100])
    levels = sorted({base_cap, *[x["maxLevel"] for x in lb]})
    rewards = prog.get("evoRewards", {}).get(c["id"], {})
    at: dict[str, dict[int, int]] = {"ATK": {}, "DEF": {}, "HP": {}}
    for level in levels:
        cum: dict[str, int] = {}
        for r in rungs:
            if r["level"] <= level:
                for slug, v in rewards.get(str(r["ev"]), {}).items():
                    cum[slug] = cum.get(slug, 0) + v
        modifier = 0 if level <= 100 else next((x.get("statModifier", 0) for x in lb if x["maxLevel"] >= level), 0)
        for axis, slug in (("ATK", "atk"), ("DEF", "def"), ("HP", "hp")):
            st = (c.get("stats") or {}).get(slug) or {}
            mn = st.get("min", 0)
            rng = st.get("max", 0) - mn
            growth = (rng * (level - 1)) // 99 if rng > 0 else 0
            above = (rng * (level - 100) * modifier) // 99000 if rng > 0 and level > 100 else 0
            at[axis][level] = mn + growth + above + cum.get(slug, 0)
    quirk = {"ATK": 0, "DEF": 0, "HP": 0}
    q = prog.get("quirks", {})
    blocks = [q.get("elemental", {}).get(c.get("element")), q.get("class", {}).get(c.get("class")),
              q.get("subclass", {}).get(c.get("subClass")) if c.get("subClass") else None]
    for bl in blocks:
        for b in (bl or {}).get("stat", []):
            axis = {"atk": "ATK", "def": "DEF", "hp": "HP"}.get(b.get("stat"))
            if axis and b.get("applying") != "rate":
                quirk[axis] += b.get("value", 0)
    lo, hi = levels[0], levels[-1]
    out: dict = {"levels": [lo, hi]}
    for axis, slug in (("ATK", "atk"), ("DEF", "def"), ("HP", "hp")):
        st = (c.get("stats") or {}).get(slug) or {}
        # без собственной базы сравнение flat/% бессмысленно (иначе база = одни quirks) — пусть страница берёт средние
        ok = st.get("max", 0) > st.get("min", 0) > 0
        out[axis] = [at[axis][lo], at[axis][hi], quirk[axis]] if ok else None
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


# --------------------------------------------------------------------------- сборка


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
        })

    # --- талисманы
    talismans = {}
    for tid, t in src["talisman"].items():
        talismans[tid] = {"name": en(t.get("name")), "icon": t.get("icon"), "mode": t.get("mode")}

    item_index = {("weapon", w["key"]): w for w in weapons} | {("accessory", a["key"]): a for a in amulets}
    substats = substat_pool(pools)
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
        names_seen.setdefault(entry["name"].lower(), []).append(entry)
        who = entry["name"] or entry["slug"]
        for b in src["reco"].get(cid, []) or []:
            entry["builds"].append(build_view(f"{who} / {b.get('name') or 'build'}", b, ctx, ee_names, warn))
        if not entry["builds"]:
            # у outerpedia билда нет — покажем хотя бы сеты, которые советует сама игра
            entry["gameSets"] = [str(x) for x in (c.get("recommendedSets") or [])]
        entry["rankPvp"] = cur.get("rankPvp")
        entry["flat"] = flat_profile({**c, "id": cid}, src["progression"])
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
        "sets": sets,
        "weapons": weapons,
        "amulets": amulets,
        "talismans": talismans,
        "chars": chars,
    }


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
    """Иконка приложения: знак страницы — шесть сегментов сабстата (3 жёлтых, 2 оранжевых, 1 серый)."""
    bg = (0x15, 0x1A, 0x22)
    colors = [(0xF0, 0xB0, 0x30)] * 3 + [(0xEE, 0x7A, 0x1A)] * 2 + [(0x56, 0x60, 0x6F)]
    # maskable: фон на весь квадрат, знак в безопасной зоне (центральные ~60%)
    radius = 0.0 if maskable else 0.2 * size
    logo_w = size * (0.46 if maskable else 0.6)
    bar_w = logo_w / (6 + 5 * 0.45)
    gap = bar_w * 0.45
    bar_h = logo_w * 0.62
    x0 = (size - logo_w) / 2
    y0 = (size - bar_h) / 2
    bars = [(x0 + i * (bar_w + gap), y0, bar_w, bar_h, colors[i]) for i in range(6)]
    px = bytearray(size * size * 4)

    def cover(a0: float, a1: float, p: int) -> float:  # доля пикселя [p, p+1] внутри отрезка [a0, a1]
        return max(0.0, min(a1, p + 1) - max(a0, p))

    for y in range(size):
        for x in range(size):
            alpha = 1.0
            if radius:  # скруглённые углы фона со сглаживанием
                cx = min(max(x + 0.5, radius), size - radius)
                cy = min(max(y + 0.5, radius), size - radius)
                d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
                alpha = max(0.0, min(1.0, radius - d + 0.5))
            r, g, b = bg
            for bx, by, bw, bh, col in bars:
                k = cover(bx, bx + bw, x) * cover(by, by + bh, y)
                if k:
                    r, g, b = (r + (col[0] - r) * k, g + (col[1] - g) * k, b + (col[2] - b) * k)
            i = (y * size + x) * 4
            px[i:i + 4] = bytes((int(r), int(g), int(b), int(alpha * 255)))
    return png_bytes(size, px)


SW_TEMPLATE = """// Service worker Outerplane Gear Check: офлайн-режим и обновление данных.
// Сгенерирован update.py — не редактируй вручную.
const VERSION = '__VERSION__';
const CACHE = 'ogc-' + VERSION;
const FONTS = 'ogc-fonts';
const PRECACHE = __FILES__;

self.addEventListener('install', (event) => {
  // новая версия ждёт: страница сама предложит обновиться, чтобы не перезагружаться посреди оценки
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ogc-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // файлы сборки — из кэша (офлайн), иначе из сети; навигация — всегда index.html
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await caches.match('index.html');
        if (page) return page;
      }
      return fetch(req);
    })());
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // шрифты: сразу из кэша, в фоне обновляем
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
"""


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
        "description": "Что оставить, а что разобрать в Outerplane — по билдам outerpedia",
        "lang": "ru",
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

    files = ["./", "index.html", "manifest.webmanifest"] + [f"icons/{f.name}" for f in sorted(icons.iterdir())] + sorted(data["img"].values())
    digest = hashlib.sha1()
    for rel in files[1:]:
        digest.update(rel.encode())
        digest.update((site / rel).read_bytes())
    version = digest.hexdigest()[:12]
    sw = SW_TEMPLATE.replace("__VERSION__", version).replace("__FILES__", json.dumps(files, ensure_ascii=False, indent=2))
    (site / "sw.js").write_text(sw, encoding="utf-8")
    size = sum((site / rel).stat().st_size for rel in files[1:])
    return {"version": version, "files": len(files), "bytes": size, "page": len(page.encode("utf-8"))}


# --------------------------------------------------------------------------- вывод


def previous_data(path: Path) -> dict | None:
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\.OGC_DATA\s*=\s*(\{.*?\});\s*</script>", text, re.S)
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
    return lines


def render_fragment(data: dict) -> str:
    template = TEMPLATE.read_text(encoding="utf-8")
    if DATA_MARKER not in template:
        raise SystemExit(f"В {TEMPLATE.name} нет маркера {DATA_MARKER}")
    # «<» → \\u003c: ни «</script», ни «<!--» из данных не сломают разбор страницы; U+2028/2029 — для старых движков
    blob = (json.dumps(data, ensure_ascii=False, separators=(",", ":"))
            .replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
    return template.replace(DATA_MARKER, blob)


def render_document(data: dict, head_extra: str = "") -> str:
    fragment = render_fragment(data)
    cut = fragment.find("</style>")
    head, body = (fragment[:cut + 8], fragment[cut + 8:]) if cut != -1 else ("", fragment)
    return (
        '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head_extra + head + "\n</head>\n<body>\n" + body.lstrip() + "\n</body>\n</html>\n"
    )


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
    args = ap.parse_args()
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


def same_content(a: dict, b: dict) -> bool:
    def strip(d: dict) -> str:
        d = {k: v for k, v in d.items()}
        d["meta"] = {k: v for k, v in d.get("meta", {}).items() if k != "generatedAt"}
        return json.dumps(d, sort_keys=True, ensure_ascii=False)
    return strip(a) == strip(b)


def carry_new_ids(data: dict, prev: dict | None) -> None:
    ids_now = {c["id"] for c in data["chars"]}
    fresh = [c["id"] for c in data["chars"] if prev and c["id"] not in {p["id"] for p in prev.get("chars", [])}]
    carried = [i for i in ((prev or {}).get("meta", {}).get("newIds") or []) if i in ids_now]
    data["meta"]["newIds"] = fresh or carried


def main_pwa(args) -> None:
    site = args.pwa.expanduser()
    warn = Warnings()
    src, prov = load_sources(args.source, args.ref)
    data = build_dataset(src, prov, warn)
    prev = previous_data(site / "index.html")
    carry_new_ids(data, prev)
    info = build_pwa(site, data, render_document, warn, args.refresh_images)
    if prev and same_content(prev, data):
        # данные те же — оставляем прежнюю дату сборки, чтобы файлы не менялись: ни лишнего коммита,
        # ни ложной плашки «вышли новые данные» у пользователей
        data["meta"]["generatedAt"] = prev["meta"].get("generatedAt", data["meta"]["generatedAt"])
        info = build_pwa(site, data, render_document, warn, args.refresh_images)
    if args.dump_json:
        slim = {k: v for k, v in data.items() if k != "img"}
        args.dump_json.write_text(json.dumps(slim, ensure_ascii=False, indent=1), encoding="utf-8")
    c = data["meta"]["counts"]
    log(f"Готово: PWA в {site}/  (index.html {info['page'] / 1024:.0f} КБ, всего {info['files']} файлов, "
        f"{info['bytes'] / 1024 / 1024:.1f} МБ, версия {info['version']})")
    log(f"  персонажей {c['characters']} (с билдами {c['withBuilds']}), билдов {c['builds']}")
    report(data, prev, warn)


if __name__ == "__main__":
    main()
