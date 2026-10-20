"""Hugging Face trending models via the public API."""
from .common import http_get_json, now_iso

URL = "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=24"


def collect():
    rows = http_get_json(URL, timeout=40)
    items = []
    for row in rows:
        model_id = row.get("id") or row.get("modelId")
        if not model_id:
            continue
        items.append({
            "id": model_id,
            "name": model_id,
            "url": "https://huggingface.co/" + model_id,
            "downloads": row.get("downloads"),
            "likes": row.get("likes"),
            "trending_score": row.get("trendingScore"),
            "pipeline": row.get("pipeline_tag"),
            "library": row.get("library_name"),
            "tags": (row.get("tags") or [])[:8],
            "created_at": row.get("createdAt"),
        })
    items.sort(key=lambda x: (x.get("trending_score") or 0), reverse=True)
    return {
        "fetched_at": now_iso(),
        "url": URL,
        "items": items,
        "note": "Hugging Face trendingScore 为平台热度信号，不等于商业收入。",
    }
