"""Free batch English→Chinese translation for public source descriptions.

Uses the same public endpoint as Chrome's translate extension, protects brand
names with placeholders, and caches results so daily runs only translate new
strings. If the endpoint is unavailable, callers fall back to the original text.
"""
import json
import os
import re
import urllib.parse

from .common import RADAR_DIR, http_get, save_json

CACHE_PATH = os.path.join(RADAR_DIR, "i18n_cache.json")
ENDPOINT = "https://clients5.google.com/translate_a/t"

BRANDS = [
    "Claude Code", "Claude", "Cursor", "OpenAI", "Anthropic", "OpenRouter",
    "GitHub", "Hugging Face", "Product Hunt", "ComfyUI", "Hermes", "OpenCode",
    "Next.js", "Vercel", "DeepSeek", "Qwen", "Kling", "Midjourney", "Runway",
    "Stable Diffusion", "Copilot", "Gemini", "Llama", "Mistral", "Figma",
    "Notion", "Slack", "Teams", "Excel", "Chrome", "VS Code", "HBM", "GPU",
    "API", "SDK", "MCP", "RAG", "LLM", "TTS", "ASR", "AGI",
]
# Placeholder tokens survive machine translation and are restored afterwards.
TOKENS = {f"ZXB{i}X": term for i, term in enumerate(BRANDS)}

GLOSSARY = [
    ("人工智能代理", "AI 智能体"),
    ("AI 代理", "AI 智能体"),
    ("编码代理", "编程智能体"),
    ("代理商", "智能体"),
    ("座席", "智能体"),
    ("代理", "智能体"),
    ("人工智能", "AI"),
    ("推断", "推理"),
    ("开放模型", "开源模型"),
    ("大语言模型", "大模型"),
    ("爱马仕", "Hermes"),
    ("分叉", "Fork"),
    ("叉子", "Fork"),
    ("职位申请", "求职"),
    ("在您的计算机上", "在本地"),
    ("计算机上", "本地"),
    ("并拥有它", "并自主掌控"),
    ("AI职位", "AI 求职"),
    ("Fork并", "Fork 并"),
    ("AI求职", "AI 求职"),
]


def _protect(text):
    protected = text
    for i, term in enumerate(BRANDS):
        protected = protected.replace(term, f"ZXB{i}X")
    return protected


def _restore(text):
    out = text
    for token, term in TOKENS.items():
        out = out.replace(token, term)
    for src, dst in GLOSSARY:
        out = out.replace(src, dst)
    out = re.sub(r"\s+", " ", out).strip()
    out = out.replace("AI AI", "AI")
    return out


def load_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def translate_texts(texts, chunk_size=10):
    cache = load_cache()
    missing = []
    seen = set()
    for text in texts:
        text = (text or "").strip()
        if not text or text in cache or text in seen:
            continue
        seen.add(text)
        missing.append(text)
    if not missing:
        return cache

    for start in range(0, len(missing), chunk_size):
        chunk = missing[start:start + chunk_size]
        params = [("client", "dict-chrome-ex"), ("sl", "en"), ("tl", "zh-CN")]
        params += [("q", _protect(t)) for t in chunk]
        url = ENDPOINT + "?" + urllib.parse.urlencode(params)
        try:
            raw = http_get(url, timeout=35)
            translated = json.loads(raw)
            if isinstance(translated, str):
                translated = [translated]
            if not isinstance(translated, list):
                continue
            for orig, zh in zip(chunk, translated):
                if isinstance(zh, str) and zh.strip():
                    cache[orig] = _restore(zh)
            print(f"translated {len(chunk)} strings")
        except Exception as exc:  # noqa: BLE001 - translation is optional
            print("translate chunk failed:", exc)

    # Keep the cache bounded and stable.
    if len(cache) > 3000:
        cache = dict(list(cache.items())[-3000:])
    save_json(CACHE_PATH, cache)
    return cache


def translate_items(items, field):
    texts = [item.get(field, "") for item in items]
    cache = translate_texts(texts)
    for item in items:
        text = (item.get(field) or "").strip()
        if text in cache:
            item[field + "_zh"] = cache[text]
