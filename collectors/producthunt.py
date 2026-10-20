"""Product Hunt new AI launches via the public Atom feed (no secret required)."""
import re
import xml.etree.ElementTree as ET

from .common import http_get, now_iso, strip_html

URL = "https://www.producthunt.com/feed?category=artificial-intelligence"
NS = {"a": "http://www.w3.org/2005/Atom"}


def collect():
    xml_text = http_get(URL, timeout=40)
    root = ET.fromstring(xml_text)
    items = []
    for entry in root.findall("a:entry", NS):
        title = (entry.findtext("a:title", default="", namespaces=NS) or "").strip()
        link_el = entry.find("a:link", NS)
        url = link_el.attrib.get("href", "") if link_el is not None else ""
        published = entry.findtext("a:published", default="", namespaces=NS)
        author = entry.findtext("a:author/a:name", default="", namespaces=NS)
        content = entry.findtext("a:content", default="", namespaces=NS)
        text = strip_html(content)
        text = re.sub(r"\s*Discussion\s*\|\s*Link\s*$", "", text).strip()
        tagline = text.split(" Discussion ")[0].strip()
        items.append({
            "name": title,
            "title": title,
            "tagline": tagline,
            "url": url,
            "published": published,
            "author": author,
        })
    items.sort(key=lambda x: x.get("published") or "", reverse=True)
    return {
        "fetched_at": now_iso(),
        "url": URL,
        "items": items[:60],
        "note": "Product Hunt 公共订阅源只提供发布信息，不提供票数；按发布时间排序。",
    }
