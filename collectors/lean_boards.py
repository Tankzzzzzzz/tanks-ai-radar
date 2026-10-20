"""Lean AI / one-person / vertical AI revenue boards."""
import csv
import io
import os
import re

from .common import DATA_DIR, http_get, now_iso, parse_tables, to_int, to_money

SHEET_URL = ("https://docs.google.com/spreadsheets/d/e/"
             "2PACX-1vQ1vMlwTJ8_Lty161T73uwnMzVxb48XzHxz9aPNla5OgCjd2yJ0HMfxEHGSv1OsyGOarWUYDcsJZfmk/"
             "pub?gid=0&single=true&output=csv")
OPU_URL = "https://www.onepersonunicorn.co/"
VV_URL = "https://www.verticalvelocity.co/"


def fetch_lean_sheet():
    text = None
    via = "google"
    try:
        text = http_get(SHEET_URL, timeout=30)
        if "Company,Description" not in text:
            text = None
    except Exception:
        text = None
    if text is None:
        via = "jina"
        text = http_get("https://r.jina.ai/" + SHEET_URL, timeout=50)
        idx = text.find("Company,Description")
        if idx < 0:
            raise RuntimeError("Lean mirror did not return CSV")
        text = text[text.rfind("\n", 0, idx) + 1:]
    path = os.path.join(DATA_DIR, "leaderboard_snapshot.csv")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text if text.startswith("\ufeff") else "\ufeff" + text)
    rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    count = sum(1 for r in rows[1:] if len(r) > 2 and r[2].strip())
    return {
        "fetched_at": now_iso(),
        "url": SHEET_URL,
        "via": via,
        "count": count,
        "note": "Lean AI 官方公开表格；营收/人数为快照口径。",
    }


def _cell(row, i):
    return row[i]["text"] if i < len(row) else ""


def _link(row, i):
    if i >= len(row):
        return ""
    links = row[i].get("links") or []
    return links[0] if links else ""


def fetch_opu():
    html = http_get(OPU_URL, timeout=40)
    tables = parse_tables(html)
    if not tables:
        raise RuntimeError("OPU table not found")
    items = []
    for row in tables[0]:
        if not row:
            continue
        rank = _cell(row, 0)
        if not re.fullmatch(r"\d+", rank):
            continue
        name = _cell(row, 1)
        if not name:
            continue
        items.append({
            "rank": int(rank),
            "name": name,
            "url": _link(row, 1) or OPU_URL,
            "category": _cell(row, 2),
            "arr": _cell(row, 3),
            "team": _cell(row, 4),
            "rpe": _cell(row, 5),
            "founded": _cell(row, 6),
            "profitable": _cell(row, 7),
            "tools": _cell(row, 8),
        })
    return {
        "fetched_at": now_iso(),
        "url": OPU_URL,
        "items": items,
        "note": "One Person Unicorn：团队 ≤10 人，ARR 主要为自报/创始人提交，非全部独立核实。",
    }


def fetch_vv():
    html = http_get(VV_URL, timeout=40)
    tables = parse_tables(html)
    if not tables:
        raise RuntimeError("VV table not found")
    items = []
    for row in tables[0]:
        if not row:
            continue
        rank = _cell(row, 0)
        if not re.fullmatch(r"\d+", rank):
            continue
        name = _cell(row, 1)
        if not name:
            continue
        items.append({
            "rank": int(rank),
            "name": name,
            "url": _link(row, 1) or VV_URL,
            "sector": _cell(row, 2),
            "arr_per_employee": _cell(row, 3),
            "arr": _cell(row, 4),
        })
    return {
        "fetched_at": now_iso(),
        "url": VV_URL,
        "items": items,
        "note": "Vertical Velocity：垂直 AI 公司人均 ARR 排名，页面更新不定期。",
    }


def collect():
    lean = fetch_lean_sheet()
    extras = {}
    try:
        extras["opu"] = fetch_opu()
    except Exception as exc:  # noqa: BLE001
        print("OPU failed:", exc)
        extras["opu"] = {"error": str(exc)}
    try:
        extras["vv"] = fetch_vv()
    except Exception as exc:  # noqa: BLE001
        print("VV failed:", exc)
        extras["vv"] = {"error": str(exc)}
    return {"lean": lean, "lean_extra": extras}
