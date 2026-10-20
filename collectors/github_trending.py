"""GitHub Trending (daily) + Search API fallback, filtered to AI projects."""
import os
import re
from datetime import datetime, timedelta, timezone

from .common import http_get, http_get_json, now_iso, strip_html, to_int

TRENDING_URL = "https://github.com/trending?since=daily"
AI_KEYWORDS = [
    " ai", "ai-", "-ai", "llm", "agent", "agentic", "machine learning", "deep learning",
    "generative", "diffusion", "transformer", "rag", "retrieval", "embedding", "vector",
    "prompt", "chatbot", "copilot", "gpt", "claude", "gemini", "llama", "mistral",
    "stable diffusion", "text-to-image", "text-to-video", "speech", "tts", "asr",
    "voice", "multimodal", "fine-tun", "inference", "model", "mcp", "computer vision",
    "nlp", "neural", "openai", "anthropic", "huggingface", "langchain", "crewai",
]


def is_ai(repo, desc):
    text = (" " + (repo or "") + " " + (desc or "")).lower()
    return any(k in text for k in AI_KEYWORDS)


def parse_trending(html):
    items = []
    articles = re.findall(r"<article[\s\S]*?</article>", html)
    for index, article in enumerate(articles, 1):
        m = re.search(r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"', article)
        if not m:
            continue
        repo = m.group(1).strip("/")
        desc_m = re.search(r'<p class="col-9[^"]*">([\s\S]*?)</p>', article)
        desc = strip_html(desc_m.group(1)) if desc_m else ""
        if not is_ai(repo, desc):
            continue
        stars_today = None
        st = re.search(r"([\d,]+)\s+stars today", article)
        if st:
            stars_today = to_int(st.group(1))
        stars = forks = None

        def link_count(suffix):
            m = re.search(r'href="/' + re.escape(repo) + r'/' + suffix + r'"[^>]*>([\s\S]*?)</a>', article)
            if not m:
                return None
            inner = re.sub(r'<svg[\s\S]*?</svg>', ' ', m.group(1))
            return to_int(strip_html(inner))

        stars = link_count('stargazers')
        forks = link_count('forks')
        lang_m = re.search(r'itemprop="programmingLanguage">([^<]+)', article)
        items.append({
            "repo": repo,
            "name": repo.split("/")[-1],
            "url": "https://github.com/" + repo,
            "description": desc,
            "stars_today": stars_today,
            "stars": stars,
            "forks": forks,
            "language": lang_m.group(1).strip() if lang_m else None,
            "source": "trending",
            "trending_rank": index,
        })
    items.sort(key=lambda x: (x.get("stars_today") or 0), reverse=True)
    return items


def search_fallback(limit=10):
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    since = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
    url = ("https://api.github.com/search/repositories?q="
           f"topic:ai+pushed:>{since}&sort=stars&order=desc&per_page={limit}")
    data = http_get_json(url, headers=headers)
    out = []
    for row in data.get("items", []):
        out.append({
            "repo": row["full_name"],
            "name": row["name"],
            "url": row["html_url"],
            "description": row.get("description") or "",
            "stars_today": None,
            "stars": row.get("stargazers_count"),
            "forks": row.get("forks_count"),
            "language": row.get("language"),
            "topics": row.get("topics", []),
            "created_at": row.get("created_at"),
            "pushed_at": row.get("pushed_at"),
            "source": "search",
        })
    return out


def collect():
    items = parse_trending(http_get(TRENDING_URL))
    if len(items) < 6:
        try:
            existing = {x["repo"].lower() for x in items}
            for row in search_fallback(12):
                if row["repo"].lower() not in existing:
                    items.append(row)
        except Exception as exc:  # noqa: BLE001
            print("github search fallback failed:", exc)
    for i, item in enumerate(items, 1):
        item["rank"] = i
    return {
        "fetched_at": now_iso(),
        "url": TRENDING_URL,
        "items": items[:30],
        "note": "Trending 的 stars today 为 GitHub 官方页面口径；搜索兜底为中 Star AI 项目。",
    }
