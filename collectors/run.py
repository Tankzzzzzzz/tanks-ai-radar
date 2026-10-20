#!/usr/bin/env python3
"""Collect public AI growth signals into data/radar/latest.json + status.json."""
import os
import sys
import traceback
from datetime import datetime, timezone

if __package__ in (None, ""):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from collectors import github_trending, huggingface, lean_boards, openrouter_apps, producthunt, translate
    from collectors.common import RADAR_DIR, load_previous, now_iso, save_json
else:
    from . import github_trending, huggingface, lean_boards, openrouter_apps, producthunt, translate
    from .common import RADAR_DIR, load_previous, now_iso, save_json

SOURCES = [
    {
        "key": "github",
        "name": "GitHub 趋势",
        "url": "https://github.com/trending?since=daily",
        "frequency": "每日",
        "method": "公开页面解析 + GitHub 搜索 API 兜底",
        "confidence": "高",
        "note": "今日 Star 为 GitHub 趋势口径；非 AI 项目会被过滤。",
    },
    {
        "key": "openrouter",
        "name": "OpenRouter 应用榜",
        "url": "https://openrouter.ai/rankings",
        "frequency": "每日",
        "method": "公开榜单页面内嵌数据",
        "confidence": "中高",
        "note": "只覆盖通过 OpenRouter 路由的调用，不等于公司总营收。",
    },
    {
        "key": "producthunt",
        "name": "Product Hunt · AI 新品",
        "url": "https://www.producthunt.com/topics/artificial-intelligence",
        "frequency": "每日",
        "method": "公开订阅源",
        "confidence": "中",
        "note": "订阅源不含票数，按发布时间排序；用于发现新品。",
    },
    {
        "key": "huggingface",
        "name": "Hugging Face 趋势",
        "url": "https://huggingface.co/models?sort=trending",
        "frequency": "每日",
        "method": "官方公开 API",
        "confidence": "高",
        "note": "模型热度信号，不等于商业收入。",
    },
    {
        "key": "lean",
        "name": "Lean AI 榜单",
        "url": "https://leanaileaderboard.com/",
        "frequency": "每周日 20:00（源站）",
        "method": "官方公开表格 + Jina 镜像兜底",
        "confidence": "中高",
        "note": "营收/人数为快照口径；部分公司已发生重大变化，详情页另行标注。",
    },
    {
        "key": "opu",
        "name": "一人公司榜 · OPU",
        "url": "https://www.onepersonunicorn.co/",
        "frequency": "随提交（不定期）",
        "method": "公开页面表格",
        "confidence": "中低",
        "note": "团队 ≤10 人；ARR 多为自报，非全部独立核实。",
    },
    {
        "key": "vv",
        "name": "垂直 AI 人均 ARR",
        "url": "https://www.verticalvelocity.co/",
        "frequency": "不定期（2026-09 快照）",
        "method": "公开页面表格",
        "confidence": "中低",
        "note": "垂直 AI 公司人均 ARR；页面更新频率不稳定。",
    },
    {
        "key": "a16z",
        "name": "a16z 消费级 AI Top 100",
        "url": "https://a16z.com/100-gen-ai-apps-7/",
        "frequency": "报告型（2026-10-05 第 7 版）",
        "method": "人工结构化导入（待接入）",
        "confidence": "高",
        "manual": True,
        "last_success": "2026-10-05",
        "note": "消费级 AI 用户规模与支付数据；下一阶段做结构化导入。",
    },
    {
        "key": "rankai",
        "name": "Rank.ai 公司榜",
        "url": "https://www.rank.ai/rankings/families/companies",
        "frequency": "快照型（2026-10-18）",
        "method": "人工结构化导入（待接入）",
        "confidence": "中",
        "manual": True,
        "last_success": "2026-10-18",
        "note": "AI 公司营收/融资/员工，每行带来源与快照日期；下一阶段接入。",
    },
]


def section_count(key, data):
    if key in ("lean", "opu", "vv"):
        if key == "lean":
            return (data.get("lean") or {}).get("count")
        return len((data.get("lean_extra", {}).get(key) or {}).get("items") or [])
    return len((data.get(key) or {}).get("items") or [])


def main():
    previous = load_previous()
    latest = {"generated_at": now_iso()}
    status = []

    def record(src, state, count=None, error=None, last_success=None, data=None):
        status.append({
            "key": src["key"],
            "name": src["name"],
            "url": src["url"],
            "frequency": src["frequency"],
            "method": src["method"],
            "confidence": src["confidence"],
            "status": state,
            "last_attempt": now_iso(),
            "last_success": last_success,
            "count": count,
            "error": error,
            "note": src["note"],
        })

    for src in SOURCES:
        key = src["key"]
        if src.get("manual"):
            record(src, "manual", None, None, src.get("last_success"))
            continue
        if key == "lean":
            try:
                result = lean_boards.collect()
                if not result["lean"].get("count"):
                    raise RuntimeError("Lean sheet returned 0 companies")
                latest["lean"] = result["lean"]
                latest["lean_extra"] = result["lean_extra"]
                record(src, "ok", result["lean"].get("count"), None, result["lean"].get("fetched_at"))
                # extras status
                for sub, name, note in [
                    ("opu", "One Person Unicorn", "团队 ≤10 人；ARR 多为自报。"),
                    ("vv", "Vertical Velocity", "垂直 AI 人均 ARR；更新不定期。"),
                ]:
                    sub_src = next(x for x in SOURCES if x["key"] == sub)
                    extra = result["lean_extra"].get(sub) or {}
                    if extra.get("error"):
                        record(sub_src, "error", 0, extra["error"], None)
                    else:
                        record(sub_src, "ok", len(extra.get("items") or []), None, extra.get("fetched_at"))
            except Exception as exc:  # noqa: BLE001
                print("lean failed:", exc)
                traceback.print_exc()
                if previous.get("lean"):
                    latest["lean"] = previous["lean"]
                    latest["lean_extra"] = previous.get("lean_extra", {})
                    record(src, "stale", section_count("lean", previous), str(exc), previous["lean"].get("fetched_at"))
                else:
                    record(src, "error", 0, str(exc))
            continue

        collector = {
            "github": github_trending.collect,
            "openrouter": openrouter_apps.collect,
            "producthunt": producthunt.collect,
            "huggingface": huggingface.collect,
        }.get(key)
        if not collector:
            continue
        try:
            data = collector()
            count = len(data.get("items") or [])
            if count == 0:
                raise RuntimeError("source returned 0 items")
            latest[key] = data
            record(src, "ok", count, None, data.get("fetched_at"))
            print(f"{key}: {count} items")
        except Exception as exc:  # noqa: BLE001
            print(f"{key} failed: {exc}")
            traceback.print_exc()
            if previous.get(key):
                latest[key] = previous[key]
                record(src, "stale", section_count(key, previous), str(exc), previous[key].get("fetched_at"))
            else:
                latest[key] = {"fetched_at": None, "items": [], "error": str(exc)}
                record(src, "error", 0, str(exc))

    try:
        translate.translate_items((latest.get("github") or {}).get("items", []), "description")
        translate.translate_items((latest.get("openrouter") or {}).get("items", []), "description")
        translate.translate_items((latest.get("producthunt") or {}).get("items", []), "tagline")
    except Exception as exc:  # noqa: BLE001 - translation must never block collection
        print("translation failed:", exc)

    save_json(os.path.join(RADAR_DIR, "latest.json"), latest)
    save_json(os.path.join(RADAR_DIR, "status.json"), {"generated_at": latest["generated_at"], "sources": status})
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    save_json(os.path.join(RADAR_DIR, "history", day + ".json"), latest)
    ok = sum(1 for s in status if s["status"] == "ok")
    stale = sum(1 for s in status if s["status"] == "stale")
    err = sum(1 for s in status if s["status"] == "error")
    print(f"radar collected: ok={ok} stale={stale} error={err}; latest={RADAR_DIR}/latest.json")


if __name__ == "__main__":
    main()
