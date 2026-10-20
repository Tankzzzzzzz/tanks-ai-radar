"""Shared helpers for Tank's AI Radar collectors (stdlib only)."""
import gzip
import html as html_lib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
RADAR_DIR = os.path.join(DATA_DIR, "radar")
UA = "Mozilla/5.0 (compatible; TanksAIRadar/1.0; +https://github.com/)"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def http_get(url, headers=None, timeout=35, retries=2):
    hdrs = {
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.8,zh-CN;q=0.6",
    }
    if headers:
        hdrs.update(headers)
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding", "").lower() == "gzip":
                    raw = gzip.decompress(raw)
                return raw.decode("utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001 - collectors should degrade gracefully
            last = exc
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    raise last


def http_get_json(url, headers=None, timeout=35):
    raw = http_get(url, headers=headers, timeout=timeout)
    return json.loads(raw)


def strip_html(text):
    text = re.sub(r"<script[\s\S]*?</script>", " ", text or "", flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html_lib.unescape(text)).strip()


def to_int(value):
    if value is None:
        return None
    digits = re.sub(r"[^\d]", "", str(value))
    return int(digits) if digits else None


def to_money(value):
    if not value:
        return None
    text = str(value).strip().replace(",", "").replace("$", "")
    m = re.match(r"^([\d.]+)\s*([KkMmBb])?", text)
    if not m:
        return None
    num = float(m.group(1))
    suffix = (m.group(2) or "").lower()
    mult = {"": 1, "k": 1e3, "m": 1e6, "b": 1e9}[suffix]
    return num * mult


def load_previous():
    path = os.path.join(RADAR_DIR, "latest.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


class TableParser(HTMLParser):
    """Very small table reader: tables -> rows -> cells, with links per cell."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self._table = None
        self._row = None
        self._cell = None
        self._in_cell = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs = dict(attrs)
        if tag == "table":
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = {"text": "", "links": []}
            self._in_cell = True
        elif tag == "a" and self._in_cell and attrs.get("href"):
            href = attrs["href"]
            if href.startswith("/"):
                href = "https://www.producthunt.com" + href
            self._cell["links"].append(href)

    def handle_data(self, data):
        if self._in_cell and self._cell is not None:
            self._cell["text"] += data

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in ("td", "th") and self._row is not None and self._cell is not None:
            self._cell["text"] = re.sub(r"\s+", " ", self._cell["text"]).strip()
            self._row.append(self._cell)
            self._cell = None
            self._in_cell = False
        elif tag == "tr" and self._table is not None and self._row is not None:
            if self._row:
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            self.tables.append(self._table)
            self._table = None


def parse_tables(html):
    parser = TableParser()
    parser.feed(html)
    return parser.tables
