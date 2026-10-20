#!/usr/bin/env python3
"""Build the standalone Lean AI dashboard from leaderboard CSV + research JSON."""
import csv, json, re, html, statistics, glob, os, datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DATE = datetime.date.today().isoformat()

CATEGORY_BY_DESC = {
    "AI Native Telemedicine": "行业应用",
    "Messaging": "消费产品",
    "Image Generation": "内容与创意",
    "AI Operator": "智能体与自动化",
    "AI Training Data": "数据与模型",
    "AI Hardware & Note-Taking": "消费产品",
    "AI Model Evaluation & Human Feedback": "数据与模型",
    "AI Coding Models & Infrastructure": "编程与开发",
    "AI Code Editor": "编程与开发",
    "AI Coding Data & RL Environments": "数据与模型",
    "AI for Image and Video": "内容与创意",
    "AI Code Gen": "编程与开发",
    "AI Training Data & RL Environments": "数据与模型",
    "AI Calorie Tracker": "消费产品",
    "Website Visitor Identification": "行业应用",
    "Vector and Full Text Search": "基础设施",
    "Talent Marketplace + Data Labeling": "数据与模型",
    "Social AI Platform": "消费产品",
    "AI Enterprise Process Automation": "智能体与自动化",
    "Generative media platform": "内容与创意",
    "AI Voice, Text-to-Speech": "音频与语音",
    "AI for Presentations": "内容与创意",
    "AI Voice": "音频与语音",
    "AI Super Agent": "智能体与自动化",
    "Open-source AI coding agent": "编程与开发",
    "AI Creator Marketing": "内容与创意",
    "AI Avatar Generation": "内容与创意",
    "AI for Homework": "行业应用",
    "AI Consumer Portolio": "消费产品",
    "AI Communication Feedback": "音频与语音",
    "AI Video Ads Generator": "内容与创意",
    "AI Video Generation": "内容与创意",
    "AI for Prescribers": "行业应用",
    "AI Training Data & Evaluation": "数据与模型",
    "AI Chip Design Agents": "基础设施",
    "All-in-one App": "消费产品",
    "Image Editing": "内容与创意",
    "Creator Storefront": "内容与创意",
    "AI Companion App": "消费产品",
    "AI Inference Optimization": "基础设施",
    "AI Coworker for Slack & Teams": "智能体与自动化",
    "On-device AI Media Search": "消费产品",
    "AI Detector": "行业应用",
    "AI Avatars for Learning": "行业应用",
    "AI Note-Taking & Study Assistant": "消费产品",
    "AI Native CI/CD + Code Fixing": "编程与开发",
    "Human Data Infrastructure for Physical AI": "数据与模型",
    "AI Image Generation": "内容与创意",
    "AI Voice Agents for Mortgage Sales": "行业应用",
    "AI Games": "消费产品",
    "AI Video Shorts": "内容与创意",
    "AI Job Search": "行业应用",
    "AI Powered Growth": "智能体与自动化",
    "AI Customer Support": "智能体与自动化",
    "AI for Writing": "内容与创意",
    "AI Character Video Generation": "内容与创意",
    "AI Marketing": "智能体与自动化",
    "AI Cloud Cost Optimization": "基础设施",
    "AI Executive Assistant": "智能体与自动化",
    "AI Voice API": "音频与语音",
    "API for Video Conferences": "基础设施",
    "AI Accounting & Finance": "行业应用",
    "AI Ad Maker": "内容与创意",
    "AI Automation Framework": "智能体与自动化",
}

CAT_ORDER = ["编程与开发", "内容与创意", "音频与语音", "数据与模型",
             "智能体与自动化", "行业应用", "消费产品", "基础设施"]

SEARCH_TERMS = {
    "Anysphere (Cursor)": "Cursor",
    "Intelligence (Design Arena)": "Design Arena",
    "Stackblitz (Bolt.new)": "Bolt.new",
    "Tolan (Portola)": "Tolan",
    "Eleven Labs": "ElevenLabs",
    "SurgeAI": "Surge AI",
    "Chai Research": "Chai AI",
    "Pocket": "Pocket AI notetaker",
    "Morph": "Morph LLM",
    "Gamma": "Gamma AI presentations",
    "Stan": "Stan Store",
    "Icon": "Icon AI ads",
    "Haven": "Haven bookkeeping",
    "Conversion": "Conversion AI marketing",
    "Latitude": "Latitude AI Dungeon",
    "GrowthX": "GrowthX AI",
    "SubMagic": "Submagic",
    "Wafer": "Wafer AI inference",
    "Viktor": "Viktor AI",
    "Sela": "Sela AI",
    "OpenArt": "OpenArt AI",
    "Super.com": "Super.com",
}

STATUS = {
    "Cal AI": ("已并购", "2026-03 被 MyFitnessPal 收购，已不再独立运营。"),
    "GPTZero": ("已并购", "2026-09 被 Superhuman（原 Grammarly）收购，已不再独立。"),
    "Base44": ("已并购", "2025-06 被 Wix 收购，现为 Wix 旗下产品；「1 人」为收购前口径。"),
    "Anysphere (Cursor)": ("合并中", "2026-06 与 SpaceX 签署 600 亿美元全股票合并协议，将不再独立。"),
    "Medvi": ("争议", "2026 年曝出 FDA 警告信、AI 假医生广告与多起诉讼；榜单 18 亿美元为 2026 年目标口径。"),
    "Chai Research": ("合规风险", "2026-07 一度在 166 个地区被 App Store 下架（8 月恢复），并面临监管问询。"),
}


def money(s):
    if s is None:
        return None
    s = str(s).replace("≥", "").replace("$", "").replace(",", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def num(s):
    s = str(s or "").replace(",", "").strip()
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s) if "." in s else int(s)
    return None


def key(name):
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


def load_websites():
    out = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "websites_*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
        except Exception as e:
            print(f"!! skip {path}: {e}")
            continue
        for item in obj.get("companies", []):
            if item.get("name"):
                out[key(item["name"])] = item
    return out


def load_research():
    merged = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "research_batch_*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                obj = json.load(f)
        except Exception as e:
            print(f"!! skip {path}: {e}")
            continue
        for item in obj.get("companies", []):
            if not item.get("name"):
                continue
            merged.setdefault(key(item["name"]), item)
    return merged


def main():
    with open(os.path.join(ROOT, "data", "leaderboard_snapshot.csv"), encoding="utf-8-sig") as f:
        raw = list(csv.reader(f))
    cols = ["rank", "blank", "Company", "Description", "Location", "Annual Revenue", "Employees",
            "Revenue/Employee", "Profitable?", "Months to reach ARR", "Total Funding", "Valuation",
            "Valuation/Employee", "Founded", "Snapshot Time", "Source"]
    rows = []
    for r in raw[1:]:
        if len(r) >= 16 and r[2].strip():
            rows.append(dict(zip(cols, r)))

    research = load_research()
    websites = load_websites()
    radar = {}
    radar_path = os.path.join(ROOT, "data", "radar", "latest.json")
    if os.path.exists(radar_path):
        with open(radar_path, encoding="utf-8") as f:
            radar = json.load(f)
    sources_status = []
    status_path = os.path.join(ROOT, "data", "radar", "status.json")
    if os.path.exists(status_path):
        with open(status_path, encoding="utf-8") as f:
            sources_status = json.load(f).get("sources", [])
    lean_extra = radar.get("lean_extra", {}) or {}
    missing = []
    companies = []
    for r in rows:
        name = r["Company"].strip()
        desc = r["Description"].strip()
        rev = money(r["Annual Revenue"])
        emp = num(r["Employees"])
        val = money(r["Valuation"])
        fund = money(r["Total Funding"])
        founded = r["Founded"].strip()
        founded_num = int(founded) if founded.isdigit() else None
        rpe = rev / emp if rev and emp else money(r["Revenue/Employee"])
        vpe = val / emp if val and emp else money(r["Valuation/Employee"])
        profit = r["Profitable?"].strip().lower() == "yes"
        months = num(r["Months to reach ARR"])

        res = research.get(key(name)) or {}
        if not res:
            missing.append(name)
        snap = r["Snapshot Time"].strip()
        companies.append({
            "rank": int(r["rank"]),
            "name": name,
            "desc": desc,
            "loc": r["Location"].strip(),
            "rev": rev,
            "emp": emp,
            "rpe": rpe,
            "profit": profit,
            "fund": fund,
            "val": val,
            "vpe": vpe,
            "founded": founded,
            "foundedNum": founded_num,
            "snap": snap,
            "snapAge": snap_age(snap),
            "src": r["Source"].strip(),
            "months": months,
            "category": CATEGORY_BY_DESC.get(desc, "其他"),
            "value": (res.get("value") or f"待补充：{desc}").strip().rstrip("。"),
            "model": res.get("model") or "调研资料待补充。",
            "moat": res.get("moat") or "调研资料待补充。",
            "progress": res.get("progress") or "调研资料待补充。",
            "confidence": res.get("confidence") or "low",
            "website": (websites.get(key(name)) or {}).get("website", ""),
            "github": (websites.get(key(name)) or {}).get("github", ""),
            "searchTerm": SEARCH_TERMS.get(name) or re.sub(r"\s*\([^)]*\)\s*", " ", name).strip(),
            "status": STATUS.get(name, ("", ""))[0],
            "statusLong": STATUS.get(name, ("", ""))[1],
            "sources": dedupe([u for u in (res.get("sources") or []) if u] +
                              ([r["Source"].strip()] if r["Source"].strip().startswith("http") else []))[:4],
        })

    # aggregate stats
    total_rev = sum(c["rev"] for c in companies if c["rev"])
    emps = [c["emp"] for c in companies if c["emp"]]
    rpes = [c["rpe"] for c in companies if c["rpe"]]
    profits = sum(1 for c in companies if c["profit"])
    total_emp = int(sum(emps))
    avg_emp = round(sum(emps) / len(emps)) if emps else 0
    median_rpe = statistics.median(rpes) if rpes else 0

    cats = []
    for name in CAT_ORDER:
        n = sum(1 for c in companies if c["category"] == name)
        if n:
            cats.append({"name": name, "n": n})

    # ticker: radar growth signals
    sig = []
    for item in (radar.get("github", {}) or {}).get("items", [])[:3]:
        sig.append(f'<span class="ticker-item"><b>GH</b> {html.escape(item["repo"])} <span class="t-accent">+{item.get("stars_today") or 0}★</span></span>')
    for item in (radar.get("openrouter", {}) or {}).get("items", [])[:3]:
        toks = item.get("tokens_day") or 0
        label = f"{toks/1e12:.1f}T" if toks >= 1e12 else f"{toks/1e9:.1f}B"
        sig.append(f'<span class="ticker-item"><b>OR</b> {html.escape(item["title"])} <span class="t-accent">{label} tok/d</span></span>')
    for item in (radar.get("producthunt", {}) or {}).get("items", [])[:2]:
        sig.append(f'<span class="ticker-item"><b>PH</b> {html.escape(item["title"])} <span class="t-accent">NEW</span></span>')
    for item in (radar.get("huggingface", {}) or {}).get("items", [])[:2]:
        sig.append(f'<span class="ticker-item"><b>HF</b> {html.escape(item["id"])} <span class="t-accent">score {item.get("trending_score") or 0}</span></span>')
    ticker = "".join(sig) or '<span class="ticker-item">等待数据采集…</span>'
    data_radar = json.dumps(radar, ensure_ascii=False, separators=(",", ":"))
    data_sources = json.dumps(sources_status, ensure_ascii=False, separators=(",", ":"))
    data_lean_extra = json.dumps(lean_extra, ensure_ascii=False, separators=(",", ":"))

    data_json = json.dumps(companies, ensure_ascii=False, separators=(",", ":"))
    sites = {c["name"]: {"website": c["website"], "github": c["github"], "searchTerm": c["searchTerm"]}
             for c in companies if c["website"] or c["github"]}
    stats_obj = {
        "cats": cats,
        "generated": DATE,
        "builtAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "catMap": CATEGORY_BY_DESC,
        "sites": sites,
        "radarGenerated": radar.get("generated_at"),
    }
    stats_json = json.dumps(stats_obj, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8") as f:
        tpl = f.read()
    with open(os.path.join(ROOT, "src", "app.js"), encoding="utf-8") as f:
        app_js = f.read()
    with open(os.path.join(ROOT, "src", "extra.css"), encoding="utf-8") as f:
        extra_css = f.read()

    app_js = (app_js.replace("{{DATA_JSON}}", data_json)
              .replace("{{STATS_JSON}}", stats_json)
              .replace("{{RADAR_JSON}}", data_radar)
              .replace("{{SOURCES_JSON}}", data_sources)
              .replace("{{LEAN_EXTRA_JSON}}", data_lean_extra))
    tpl = tpl.replace("{{APP_JS}}", app_js).replace("{{EXTRA_CSS}}", extra_css)

    replacements = {
        "{{DATA_JSON}}": data_json,
        "{{STATS_JSON}}": stats_json,
        "{{GENERATED_AT}}": DATE,
        "{{STAT_TOTAL_REV}}": f"{total_rev/1e9:.2f}",
        "{{STAT_AVG_EMP}}": f"{avg_emp}",
        "{{STAT_PROFIT}}": f"{profits}",
        "{{STAT_PROFIT_PCT}}": f"{round(profits/len(companies)*100)}",
        "{{STAT_TOTAL_EMP}}": f"{total_emp:,}",
        "{{STAT_MEDIAN_RPE}}": fmt_money(median_rpe),
        "{{TICKER}}": ticker,
    }
    out = tpl
    for k, v in replacements.items():
        out = out.replace(k, v)

    with open(os.path.join(ROOT, "data", "companies.json"), "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)

    out_path = os.path.join(ROOT, "index.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
    dist_dir = os.path.join(ROOT, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    with open(os.path.join(dist_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(out)

    print(f"built {out_path}")
    print(f"companies={len(companies)} research={len(companies)-len(missing)} missing={len(missing)}")
    if missing:
        print("missing:", ", ".join(missing))
    print(f"total_rev=${total_rev/1e9:.2f}B avg_emp={avg_emp} median_rpe={fmt_money(median_rpe)}")
    print("categories:", ", ".join(f"{c['name']}={c['n']}" for c in cats))
    for c in companies:
        if c["category"] == "其他":
            print("!! uncategorized:", c["name"], c["desc"])


def dedupe(items):
    out = []
    for x in items:
        if x and x not in out:
            out.append(x)
    return out


def snap_age(s):
    months = {"Jan":1,"Feb":2,"Mar":3,"Apr":4,"May":5,"Jun":6,"Jul":7,"Aug":8,"Sep":9,"Oct":10,"Nov":11,"Dec":12}
    try:
        m, y = s.split()
        idx = (2026 - int(y)) * 12 + (10 - months[m])
        return max(0, idx)
    except Exception:
        return None


def StringRank(n):
    return str(n).zfill(2)


def fmt_money(v):
    if v is None:
        return "—"
    if v == 0:
        return "$0"
    if v >= 1e9:
        return f"${v/1e9:.1f}B"
    if v >= 1e8:
        return f"${v/1e6:.0f}M"
    if v >= 1e6:
        return f"${v/1e6:.1f}M"
    return f"${v/1e3:.0f}K"


if __name__ == "__main__":
    main()
