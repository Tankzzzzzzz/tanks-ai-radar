"""OpenRouter app rankings (daily) parsed from the public rankings page payload."""
import json
import re

from .common import http_get, now_iso

URL = "https://openrouter.ai/rankings"
PERIODS = ("day", "week", "month")


def extract_period(html, period):
    marker = '\\"' + period + '\\":['
    idx = html.find(marker)
    if idx < 0:
        return []
    start = idx + len(marker)
    chunk = "[" + html[start:start + 2_000_000]
    # The payload lives inside a JS string; undo its JSON escaping for this slice.
    chunk = chunk.replace("\\\\", "\\").replace('\\"', '"')
    try:
        arr, _ = json.JSONDecoder().raw_decode(chunk)
        return arr if isinstance(arr, list) else []
    except Exception as exc:  # noqa: BLE001
        print(f"openrouter {period} parse failed:", exc)
        return []


def map_rows(rows):
    out = {}
    for row in rows:
        app = row.get("app") or {}
        app_id = row.get("app_id") or app.get("id")
        if not app_id:
            continue
        out[str(app_id)] = {
            "id": str(app_id),
            "slug": app.get("slug") or "",
            "title": app.get("title") or app.get("slug") or "Unknown app",
            "description": app.get("description") or "",
            "categories": app.get("categories") or [],
            "url": app.get("origin_url") or app.get("main_url") or ("https://openrouter.ai/apps/" + (app.get("slug") or "")),
            "source_code_url": app.get("source_code_url") or "",
            "created_at": app.get("created_at"),
            "rank": row.get("rank"),
            "total_tokens": int(row.get("total_tokens") or 0),
            "total_requests": int(row.get("total_requests") or 0),
        }
    return out


def collect():
    html = http_get(URL, timeout=45)
    day = map_rows(extract_period(html, "day"))
    week = map_rows(extract_period(html, "week"))
    month = map_rows(extract_period(html, "month"))
    total_day = sum(x["total_tokens"] for x in day.values()) or 1
    items = []
    for app_id, base in day.items():
        w = week.get(app_id, {})
        m = month.get(app_id, {})
        item = dict(base)
        item.update({
            "rank_day": base.get("rank"),
            "tokens_day": base["total_tokens"],
            "requests_day": base["total_requests"],
            "share_day": round(base["total_tokens"] / total_day * 100, 2),
            "rank_week": w.get("rank"),
            "tokens_week": w.get("total_tokens"),
            "rank_month": m.get("rank"),
            "tokens_month": m.get("total_tokens"),
        })
        if item["rank_week"] and item["rank_day"]:
            item["rank_delta_week"] = item["rank_week"] - item["rank_day"]
        if item["rank_month"] and item["rank_day"]:
            item["rank_delta_month"] = item["rank_month"] - item["rank_day"]
        items.append(item)
    items.sort(key=lambda x: (x.get("rank_day") or 999))
    return {
        "fetched_at": now_iso(),
        "url": URL,
        "items": items[:30],
        "total_tokens_day": total_day,
        "note": "OpenRouter 应用调用量来自公开榜单页面；仅覆盖通过 OpenRouter 路由的调用，不代表公司总营收。",
    }
