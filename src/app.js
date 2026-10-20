let COMPANIES = {{DATA_JSON}};
const S = {{STATS_JSON}};
const RADAR = {{RADAR_JSON}};
const SOURCES = {{SOURCES_JSON}};
const LEAN_EXTRA = {{LEAN_EXTRA_JSON}};

const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ1vMlwTJ8_Lty161T73uwnMzVxb48XzHxz9aPNla5OgCjd2yJ0HMfxEHGSv1OsyGOarWUYDcsJZfmk/pub?gid=0&single=true&output=csv";
const STORE_KEY = "lean70.tracker.v1";
const CADENCES = [[0, "手动"], [1, "每天"], [3, "每 3 天"], [7, "每周"], [14, "每两周"], [30, "每月"]];
const CAT_ORDER = ["编程与开发", "内容与创意", "音频与语音", "数据与模型", "智能体与自动化", "行业应用", "消费产品", "基础设施"];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "");
const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u || ""; } };
const uid = () => "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function fmtMoney(v) {
  if (v == null) return "—";
  if (v === 0) return "$0";
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e8) return "$" + Math.round(v / 1e6) + "M";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  return "$" + Math.round(v / 1e3) + "K";
}
function fmtNum(v) { return v == null ? "—" : Number(v).toLocaleString("en-US"); }
function fmtDate(ts) { if (!ts) return "—"; const d = new Date(ts); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`; }
function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtWeekday(d) { return "周" + "日一二三四五六"[d.getDay()]; }
function relTime(ts) {
  if (!ts) return "—";
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return Math.floor(s / 60) + " 分钟前";
  if (s < 86400) return Math.floor(s / 3600) + " 小时前";
  if (s < 86400 * 30) return Math.floor(s / 86400) + " 天前";
  return fmtDate(ts);
}
function safeUrl(u) {
  if (!u) return "";
  u = String(u).trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

/* =========================================================
   localStorage
   ========================================================= */
function defaultStore() {
  return {
    version: 1,
    watches: [],
    settings: {
      autoSync: true,
      lastSync: S.builtAt ? Date.parse(S.builtAt) : Date.now(),
      lastError: null,
      lastCount: null
    }
  };
}
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultStore();
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.watches)) return defaultStore();
    o.settings = Object.assign(defaultStore().settings, o.settings || {});
    return o;
  } catch (e) { return defaultStore(); }
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* file:// storage may be unavailable */ }
}
let store = loadStore();

/* =========================================================
   layers (drawers / modals)
   ========================================================= */
const layerStack = [];
let lastFocus = null;
function updateScrollLock() { document.body.classList.toggle("no-scroll", layerStack.length > 0); }
function openLayer(el, backdrop, close) {
  if (!el || layerStack.some(l => l.el === el)) return;
  if (!layerStack.length) lastFocus = document.activeElement;
  layerStack.push({ el, backdrop, close });
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  if (backdrop) backdrop.classList.add("open");
  updateScrollLock();
  setTimeout(() => {
    const f = el.querySelector("[data-autofocus]") || el.querySelector("button:not(:disabled), a[href], input, select, textarea");
    if (f) f.focus({ preventScroll: true });
  }, 120);
}
function closeLayer(el) {
  const i = layerStack.findIndex(l => l.el === el);
  if (i < 0) {
    if (el) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); }
    return;
  }
  const [layer] = layerStack.splice(i, 1);
  layer.el.classList.remove("open");
  layer.el.setAttribute("aria-hidden", "true");
  if (layer.backdrop) layer.backdrop.classList.remove("open");
  updateScrollLock();
  if (!layerStack.length && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
function topLayer() { return layerStack[layerStack.length - 1]; }

/* =========================================================
   toast
   ========================================================= */
let toastTimer;
function toast(msg, actionLabel, actionFn) {
  const el = $("#toast");
  if (!el) return;
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button" id="toastAction">${esc(actionLabel)}</button>` : ""}`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  if (actionLabel && actionFn) $("#toastAction").onclick = () => { actionFn(); el.classList.remove("show"); };
  toastTimer = setTimeout(() => el.classList.remove("show"), actionLabel ? 7000 : 3600);
}

/* =========================================================
   leaderboard data helpers
   ========================================================= */
function findCompany(name) {
  if (name == null) return null;
  const n = norm(name);
  return COMPANIES.find(c => norm(c.name) === n) || null;
}
function findCompanyByRank(rank) { return COMPANIES.find(c => c.rank === rank) || null; }
function countCats() {
  S.cats = CAT_ORDER.map(name => ({ name, n: COMPANIES.filter(c => c.category === name).length })).filter(x => x.n);
}
function calcStats() {
  const revs = COMPANIES.map(c => c.rev).filter(v => v != null);
  const emps = COMPANIES.map(c => c.emp).filter(v => v != null);
  const rpes = COMPANIES.map(c => c.rpe).filter(v => v != null);
  const totalRev = revs.reduce((a, b) => a + b, 0);
  const totalEmp = emps.reduce((a, b) => a + b, 0);
  const avgEmp = emps.length ? Math.round(totalEmp / emps.length) : 0;
  const sorted = [...rpes].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
  return {
    totalRev, totalEmp, avgEmp, median,
    maxRpe: rpes.length ? Math.max(...rpes) : 0,
    profit: COMPANIES.filter(c => c.profit).length,
    one: COMPANIES.filter(c => c.emp === 1).length
  };
}
function updateStats() {
  const st = calcStats();
  const n = COMPANIES.length;
  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  set("statTotalRev", `${(st.totalRev / 1e9).toFixed(2)}<small>B</small>`);
  set("statAvgEmp", `${st.avgEmp}`);
  set("statProfit", `${st.profit}<small>家</small>`);
  set("statOne", `${st.one}<small>家</small>`);
  const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setText("statCountNote", `按 ${n} 家快照加总`);
  setText("statProfitPct", `占全部公司 ${Math.round(st.profit / Math.max(1, n) * 100)}%`);
  setText("statOneNote", `最高人均营收 ${fmtMoney(st.maxRpe)}`);
  setText("heroTotalEmp", `合计 ${st.totalEmp.toLocaleString("en-US")} 名员工`);
  setText("heroMedianRpe", `人均营收中位数 ${fmtMoney(st.median)}`);
  setText("leanCount", n);
  S.stats = st;
}
function tickerHtml() {
  return [...COMPANIES].filter(c => c.rpe != null).sort((a, b) => b.rpe - a.rpe).slice(0, 8)
    .map(c => `<span class="ticker-item"><b>${String(c.rank).padStart(2, "0")} ${esc(c.name)}</b><span>${c.emp ?? "—"} 人</span><span class="t-accent">${fmtMoney(c.rpe)}/人</span></span>`).join("");
}
function updateTicker() { const html = tickerHtml(); $$(".ticker-seq").forEach(el => { el.innerHTML = html; }); }

/* =========================================================
   watchlist
   ========================================================= */
function cadenceLabel(d) {
  const found = CADENCES.find(x => x[0] === Number(d));
  return found ? found[1] : "每 " + d + " 天";
}
function isWatched(name) {
  return store.watches.some(w => w.type === "company" && !w.custom && norm(w.name) === norm(name));
}
function watchByCompany(name) {
  return store.watches.find(w => w.type === "company" && !w.custom && norm(w.name) === norm(name)) || null;
}
function findWatch(id) { return store.watches.find(w => w.id === id) || null; }
function nextDue(w) { return w.cadenceDays ? (w.lastChecked || w.createdAt) + w.cadenceDays * 86400000 : null; }
function dueState(w) {
  if (!w.cadenceDays) return { due: false, label: "手动" };
  const n = nextDue(w);
  if (!n) return { due: true, label: "待更新" };
  const diff = n - Date.now();
  if (diff <= 0) return { due: true, label: "待更新" };
  if (diff < 86400000) return { due: false, label: "今天" };
  return { due: false, label: Math.ceil(diff / 86400000) + " 天后" };
}
function pushWatch(w) { store.watches.unshift(w); saveStore(); afterWatchChange(); }
function removeWatch(id, withUndo) {
  const i = store.watches.findIndex(w => w.id === id);
  if (i < 0) return;
  const [w] = store.watches.splice(i, 1);
  saveStore();
  afterWatchChange();
  if (withUndo !== false) {
    toast(`已删除「${w.name}」，不再追踪`, "撤销", () => {
      store.watches.splice(Math.min(i, store.watches.length), 0, w);
      saveStore();
      afterWatchChange();
    });
  }
}
function toggleCompanyWatch(name) {
  const exists = watchByCompany(name);
  if (exists) { removeWatch(exists.id); return; }
  const c = findCompany(name);
  if (!c) return;
  pushWatch({
    id: uid(), type: "company", custom: false, name: c.name, rank: c.rank,
    website: c.website || "", github: c.github || "",
    cadenceDays: 7, lastChecked: Date.now(), createdAt: Date.now(), note: ""
  });
  toast(`已关注 ${c.name}，可在「我的追踪」设置周期`);
}
function afterWatchChange() {
  const el = $("#watchCount");
  if (el) el.textContent = store.watches.length;
  refreshWatchUI();
  if ($("#tracker") && $("#tracker").classList.contains("open")) renderTracker();
}
function refreshWatchUI() {
  $$("[data-watch]").forEach(el => {
    const name = el.dataset.watch;
    const on = isWatched(name);
    el.classList.toggle("on", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
    el.setAttribute("aria-label", on ? `取消关注 ${name}` : `关注 ${name}`);
    if (el.classList.contains("watch-pill")) el.innerHTML = on ? "★ 已关注" : "☆ 关注";
    else el.textContent = on ? "★" : "☆";
  });
  $$("[data-watch-signal]").forEach(el => {
    const [source, id] = (el.dataset.watchSignal || "").split("|");
    const on = isSignalWatched(source, id);
    el.classList.toggle("on", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
    if (el.classList.contains("pill-link")) el.textContent = on ? "★ 已关注" : "☆ 关注";
    else el.textContent = on ? "★" : "☆";
  });
  const count = $("#watchCount");
  if (count) count.textContent = store.watches.length;
}
function markChecked(id, silent) {
  const w = findWatch(id);
  if (!w) return;
  w.lastChecked = Date.now();
  saveStore();
  if ($("#tracker") && $("#tracker").classList.contains("open")) renderTracker();
  if (!silent) toast(`已标记「${w.name}」为已检查`);
}

/* =========================================================
   GitHub
   ========================================================= */
function normalizeRepo(input) {
  let s = String(input || "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\/github\.com\//i, "").replace(/^github\.com\//i, "");
  s = s.split(/[?#]/)[0].replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  return parts[0] + "/" + parts[1];
}
async function fetchRepo(slug) {
  const res = await fetch(`https://api.github.com/repos/${slug}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    if (res.status === 404) throw new Error("仓库不存在或不是公开仓库");
    if (res.status === 403) throw new Error("GitHub API 限流（每小时 60 次），请稍后再试");
    throw new Error("GitHub 请求失败（" + res.status + "）");
  }
  const d = await res.json();
  let release = null;
  try {
    const rr = await fetch(`https://api.github.com/repos/${slug}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (rr.ok) { const r = await rr.json(); release = { tag: r.tag_name, name: r.name || r.tag_name, published: r.published_at, url: r.html_url }; }
  } catch (e) { /* ignore */ }
  return {
    fullName: d.full_name, url: d.html_url, description: d.description || "",
    stars: d.stargazers_count, forks: d.forks_count, issues: d.open_issues_count,
    pushedAt: d.pushed_at, language: d.language, homepage: d.homepage || "",
    topics: d.topics || [], release, fetchedAt: Date.now()
  };
}
async function refreshRepo(id) {
  const w = findWatch(id);
  if (!w || w.type !== "github") return;
  w.loading = true; w.error = "";
  renderTracker();
  try {
    w.repo = await fetchRepo(w.repoSlug);
    w.lastChecked = Date.now();
    toast(`已刷新 ${w.name}`);
  } catch (e) {
    w.error = e.message;
  }
  w.loading = false;
  saveStore();
  renderTracker();
}

/* =========================================================
   radar signals
   ========================================================= */
const SOURCE_BY_KEY = Object.fromEntries((SOURCES || []).map(x => [x.key, x]));
const LENS_KEYS = ["growth", "lean", "github", "models", "launches", "sources"];

function compact(n, digits = 1) {
  if (n == null) return "—";
  const v = Number(n);
  if (v >= 1e12) return (v / 1e12).toFixed(digits) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(digits) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(digits) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(digits) + "K";
  return String(v);
}
function radarItems(key) { const sec = RADAR && RADAR[key]; return (sec && sec.items) || []; }
function signalKey(source, item) {
  if (source === "github") return item.repo;
  if (source === "openrouter") return item.slug || item.id;
  if (source === "producthunt") return item.url || item.title;
  if (source === "huggingface") return item.id;
  return item.id || item.name;
}
function findSignal(source, id) {
  return radarItems(source).find(x => signalKey(source, x) === id) || null;
}
function signalName(source, item) {
  if (source === "github") return item.repo;
  if (source === "openrouter") return item.title;
  if (source === "producthunt") return item.title;
  if (source === "huggingface") return item.id;
  return item.name || "Signal";
}
function signalUrl(source, item) {
  if (source === "github") return item.url;
  if (source === "openrouter") return item.url;
  if (source === "producthunt") return item.url;
  if (source === "huggingface") return item.url;
  return item.url || "";
}
function signalSummary(source, item) {
  if (source === "github") {
    const bits = [];
    if (item.stars_today != null) bits.push(`+${fmtNum(item.stars_today)} stars today`);
    if (item.stars != null) bits.push(`${compact(item.stars)} total`);
    if (item.language) bits.push(item.language);
    return bits.join(" · ");
  }
  if (source === "openrouter") {
    const bits = [`源榜 #${item.rank_day || item.rank || "—"}`, `${compact(item.tokens_day)} tokens/day`];
    if (item.share_day != null) bits.push(`${item.share_day}% share`);
    return bits.join(" · ");
  }
  if (source === "producthunt") return item.tagline || "New launch";
  if (source === "huggingface") {
    const bits = [`score ${fmtNum(item.trending_score)}`, `${compact(item.downloads)} downloads`, `${fmtNum(item.likes)} likes`];
    return bits.join(" · ");
  }
  return "";
}
function isSignalWatched(source, id) {
  return store.watches.some(w => w.type === "signal" && w.source === source && w.sourceId === id);
}
function toggleSignalWatch(source, id) {
  const exist = store.watches.find(w => w.type === "signal" && w.source === source && w.sourceId === id);
  if (exist) { removeWatch(exist.id); return; }
  const item = findSignal(source, id);
  if (!item) return;
  pushWatch({
    id: uid(), type: "signal", source, sourceId: id,
    name: signalName(source, item), url: signalUrl(source, item),
    summary: signalSummary(source, item), cadenceDays: 7,
    lastChecked: Date.now(), createdAt: Date.now(), note: ""
  });
  toast(`已关注「${signalName(source, item)}」`);
}
function metaFetched(source) {
  const sec = RADAR && RADAR[source];
  return sec && sec.fetched_at ? fmtDateTime(sec.fetched_at) : "—";
}
function signalMetricRows(source, item) {
  const rows = [];
  if (source === "github") {
    rows.push(["今日 Star", item.stars_today != null ? "+" + fmtNum(item.stars_today) : "—"]);
    rows.push(["总 Star", fmtNum(item.stars)]);
    rows.push(["Forks", fmtNum(item.forks)]);
    rows.push(["语言", item.language || "—"]);
    rows.push(["Trending 排名", "#" + (item.trending_rank || item.rank || "—")]);
    rows.push(["最近采集", metaFetched(source)]);
  } else if (source === "openrouter") {
    rows.push(["日榜", "#" + (item.rank_day || "—")]);
    rows.push(["周榜", item.rank_week ? "#" + item.rank_week : "—"]);
    rows.push(["月榜", item.rank_month ? "#" + item.rank_month : "—"]);
    rows.push(["日 Tokens", compact(item.tokens_day)]);
    rows.push(["日请求", fmtNum(item.requests_day)]);
    rows.push(["日份额", item.share_day != null ? item.share_day + "%" : "—"]);
    rows.push(["类别", (item.categories || []).join(" / ") || "—"]);
    rows.push(["应用 ID", item.id || "—"]);
    rows.push(["最近采集", metaFetched(source)]);
  } else if (source === "producthunt") {
    rows.push(["发布", item.published ? fmtDateTime(item.published) : "—"]);
    rows.push(["作者", item.author || "—"]);
    rows.push(["最近采集", metaFetched(source)]);
  } else if (source === "huggingface") {
    rows.push(["Trending", fmtNum(item.trending_score)]);
    rows.push(["Likes", fmtNum(item.likes)]);
    rows.push(["Downloads", fmtNum(item.downloads)]);
    rows.push(["Pipeline", item.pipeline || "—"]);
    rows.push(["Created", item.created_at ? item.created_at.slice(0, 10) : "—"]);
    rows.push(["最近采集", metaFetched(source)]);
  }
  return rows;
}
function openSignal(source, id) {
  const item = findSignal(source, id);
  if (!item) return;
  const meta = SOURCE_BY_KEY[source] || {};
  $("#signalSource").textContent = meta.name || source;
  const rows = signalMetricRows(source, item).map(([k, v]) => `<div class="signal-metric"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("");
  const watched = isSignalWatched(source, id);
  $("#signalBody").innerHTML = `
    <div class="signal-detail-head">
      <div class="drawer-cat">${esc(meta.name || source)} · ${esc(meta.confidence || "—")}</div>
      <h2 id="signalTitle">${esc(signalName(source, item))}</h2>
      <p class="signal-desc">${esc(item.description || item.tagline || "—")}</p>
    </div>
    <div class="signal-metrics">${rows}</div>
    <div class="signal-links">
      <a class="pill-link" href="${esc(signalUrl(source, item))}" target="_blank" rel="noopener">打开来源 ↗</a>
      <button type="button" class="pill-link" data-signal-news="${esc(source)}|${esc(id)}">◈ 舆情 · 最新资讯</button>
      <button type="button" class="pill-link signal-watch ${watched ? "on" : ""}" data-watch-signal="${esc(source)}|${esc(id)}" aria-pressed="${watched}">${watched ? "★ 已关注" : "☆ 关注"}</button>
    </div>
    <div class="signal-note">${esc(meta.note || "")}</div>
  `;
  openLayer($("#signalPanel"), $("#signalBackdrop"), closeSignal);
}
function closeSignal() { closeLayer($("#signalPanel")); }

/* =========================================================
   radar rendering
   ========================================================= */
function googleSourceLink(source, item) {
  return `https://www.google.com/search?q=${encodeURIComponent(signalName(source, item) + " AI")}`;
}
function githubCardHTML(item) {
  const id = signalKey("github", item);
  const watched = isSignalWatched("github", id);
  return `<article class="signal-card" data-open-signal="github|${esc(id)}">
    <div class="signal-card-top">
      <span class="source-badge">GITHUB</span>
      <span class="signal-hot">+${fmtNum(item.stars_today || 0)} ★ today</span>
    </div>
    <h3>${esc(item.repo)}</h3>
    <p>${esc(item.description || "—")}</p>
    <div class="signal-card-meta"><span>${esc(item.language || "—")}</span><span>${compact(item.stars)} total stars</span><span>#${item.trending_rank || item.rank || "—"}</span></div>
    <div class="signal-card-foot">
      <button type="button" class="signal-watch ${watched ? "on" : ""}" data-watch-signal="github|${esc(id)}" aria-pressed="${watched}">${watched ? "★" : "☆"}</button>
      <span class="text-link">详情 →</span>
    </div>
  </article>`;
}
function openrouterRowHTML(item, index) {
  const id = signalKey("openrouter", item);
  const watched = isSignalWatched("openrouter", id);
  return `<div class="radar-item" data-open-signal="openrouter|${esc(id)}">
    <span class="radar-rank">${index + 1}</span>
    <div class="radar-main">
      <div class="radar-title">${esc(item.title)} <span class="source-badge small">OPENROUTER</span></div>
      <div class="radar-meta">源榜 #${item.rank_day || "—"} · ${esc((item.categories || []).join(" / ") || "app")} · ${compact(item.tokens_day)} tokens/day · ${fmtNum(item.requests_day)} requests · ${item.share_day != null ? item.share_day + "% 份额" : ""}</div>
    </div>
    <div class="radar-delta">${item.rank_delta_month > 0 ? "↑" + item.rank_delta_month : item.rank_delta_month < 0 ? "↓" + Math.abs(item.rank_delta_month) : "—"}<span>vs 月榜</span></div>
    <button type="button" class="signal-watch ${watched ? "on" : ""}" data-watch-signal="openrouter|${esc(id)}" aria-pressed="${watched}">${watched ? "★" : "☆"}</button>
  </div>`;
}
function launchRowHTML(item) {
  const id = signalKey("producthunt", item);
  const watched = isSignalWatched("producthunt", id);
  return `<div class="launch-item" data-open-signal="producthunt|${esc(id)}">
    <div class="launch-main"><div class="launch-title">${esc(item.title)} <span class="source-badge small">PH</span></div><p>${esc(item.tagline || "—")}</p></div>
    <div class="launch-meta"><span>${esc(item.author || "")}</span><span>${relTime(item.published)}</span></div>
    <button type="button" class="signal-watch ${watched ? "on" : ""}" data-watch-signal="producthunt|${esc(id)}" aria-pressed="${watched}">${watched ? "★" : "☆"}</button>
  </div>`;
}
function modelRowHTML(item) {
  const id = signalKey("huggingface", item);
  const watched = isSignalWatched("huggingface", id);
  return `<div class="model-item" data-open-signal="huggingface|${esc(id)}">
    <div class="model-main"><div class="model-title">${esc(item.id)} <span class="source-badge small">HF</span></div><p>${esc(item.pipeline || "")}</p></div>
    <div class="model-metrics"><span>score <b>${fmtNum(item.trending_score)}</b></span><span>${compact(item.downloads)} downloads</span><span>${fmtNum(item.likes)} likes</span></div>
    <button type="button" class="signal-watch ${watched ? "on" : ""}" data-watch-signal="huggingface|${esc(id)}" aria-pressed="${watched}">${watched ? "★" : "☆"}</button>
  </div>`;
}
function renderGrowth() {
  const gh = radarItems("github").slice(0, 6);
  const or = radarItems("openrouter").slice(0, 8);
  const ph = radarItems("producthunt").slice(0, 8);
  const hf = radarItems("huggingface").slice(0, 8);
  $("#growthGithub").innerHTML = gh.length ? gh.map(githubCardHTML).join("") : '<div class="empty-inline">暂无 GitHub 数据</div>';
  $("#growthOpenrouter").innerHTML = or.length ? or.map(openrouterRowHTML).join("") : '<div class="empty-inline">暂无 OpenRouter 数据</div>';
  $("#growthPH").innerHTML = ph.length ? ph.map(launchRowHTML).join("") : '<div class="empty-inline">暂无 Product Hunt 数据</div>';
  $("#growthHF").innerHTML = hf.length ? hf.map(modelRowHTML).join("") : '<div class="empty-inline">暂无 Hugging Face 数据</div>';
  updateSourceStates();
}
function renderGithubPage() {
  const items = radarItems("github");
  $("#githubList").innerHTML = items.length ? items.map((item, i) => `<div class="entity-row" data-open-signal="github|${esc(signalKey("github", item))}">
    <span class="entity-rank">${String(i + 1).padStart(2, "0")}</span>
    <div class="entity-main"><div class="entity-title">${esc(item.repo)}</div><p>${esc(item.description || "—")}</p></div>
    <div class="entity-metrics"><span>+${fmtNum(item.stars_today || 0)} ★ today</span><span>${compact(item.stars)} total</span><span>${esc(item.language || "—")}</span></div>
    <button type="button" class="signal-watch ${isSignalWatched("github", signalKey("github", item)) ? "on" : ""}" data-watch-signal="github|${esc(signalKey("github", item))}">${isSignalWatched("github", signalKey("github", item)) ? "★" : "☆"}</button>
  </div>`).join("") : '<div class="empty-inline">暂无数据</div>';
}
function renderModelsPage() {
  const items = radarItems("huggingface");
  $("#modelList").innerHTML = items.length ? items.map((item, i) => `<div class="entity-row" data-open-signal="huggingface|${esc(signalKey("huggingface", item))}">
    <span class="entity-rank">${String(i + 1).padStart(2, "0")}</span>
    <div class="entity-main"><div class="entity-title">${esc(item.id)}</div><p>${esc(item.pipeline || "")}</p></div>
    <div class="entity-metrics"><span>score ${fmtNum(item.trending_score)}</span><span>${compact(item.downloads)} downloads</span><span>${fmtNum(item.likes)} likes</span></div>
    <button type="button" class="signal-watch ${isSignalWatched("huggingface", item.id) ? "on" : ""}" data-watch-signal="huggingface|${esc(item.id)}">${isSignalWatched("huggingface", item.id) ? "★" : "☆"}</button>
  </div>`).join("") : '<div class="empty-inline">暂无数据</div>';
}
function renderLaunchesPage() {
  const items = radarItems("producthunt");
  $("#launchList").innerHTML = items.length ? items.map(item => `<div class="entity-row" data-open-signal="producthunt|${esc(signalKey("producthunt", item))}">
    <span class="entity-rank">${relTime(item.published).replace("前", "")}</span>
    <div class="entity-main"><div class="entity-title">${esc(item.title)}</div><p>${esc(item.tagline || "")}</p></div>
    <div class="entity-metrics"><span>${esc(item.author || "")}</span><span>${fmtDateTime(item.published)}</span></div>
    <button type="button" class="signal-watch ${isSignalWatched("producthunt", signalKey("producthunt", item)) ? "on" : ""}" data-watch-signal="producthunt|${esc(signalKey("producthunt", item))}">${isSignalWatched("producthunt", signalKey("producthunt", item)) ? "★" : "☆"}</button>
  </div>`).join("") : '<div class="empty-inline">暂无数据</div>';
}
function renderSourcesPage() {
  const cards = (SOURCES || []).map(src => {
    const st = src.status || "unknown";
    const label = { ok: "在线", stale: "沿用旧数据", error: "失败", manual: "报告型 / 待接入" }[st] || st;
    return `<article class="source-card ${st}">
      <div class="source-card-top"><span class="source-dot ${st}"></span><span class="source-badge">${esc(src.key.toUpperCase())}</span><span class="source-status">${label}</span></div>
      <h3>${esc(src.name)}</h3>
      <div class="source-meta"><span>频率：${esc(src.frequency || "—")}</span><span>方式：${esc(src.method || "—")}</span><span>置信度：${esc(src.confidence || "—")}</span></div>
      <div class="source-meta"><span>条目：${src.count == null ? "—" : fmtNum(src.count)}</span><span>最后成功：${src.last_success ? esc(fmtDate(src.last_success)) : "—"}</span></div>
      <p>${esc(src.note || "")}</p>
      ${src.error ? `<p class="source-error">错误：${esc(src.error)}</p>` : ""}
      <a href="${esc(src.url)}" target="_blank" rel="noopener">打开源站 ↗</a>
    </article>`;
  }).join("");
  $("#sourceGrid").innerHTML = cards || '<div class="empty-inline">暂无数据源状态</div>';
  updateSourceStates();
}
function updateSourceStates() {
  $$("[data-source-state]").forEach(el => {
    const src = SOURCE_BY_KEY[el.dataset.sourceState];
    if (!src) return;
    const st = src.status || "unknown";
    el.textContent = st === "ok" ? "在线 · " + (src.last_success ? fmtDate(src.last_success) : "") : st === "stale" ? "旧数据 · " + (src.last_success ? fmtDate(src.last_success) : "") : st === "manual" ? "报告型" : "失败";
    el.className = "source-state " + st;
  });
}
function updateRadarStats() {
  const gh = radarItems("github");
  const or = radarItems("openrouter");
  const ph = radarItems("producthunt");
  const hf = radarItems("huggingface");
  const stars = gh.reduce((a, b) => a + (b.stars_today || 0), 0);
  const top = or[0];
  const okSources = (SOURCES || []).filter(s => s.status === "ok").length;
  const realSources = (SOURCES || []).length;
  const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setText("statSignals", fmtNum(gh.length + or.length + ph.length + hf.length));
  setText("statGithubStars", "+" + compact(stars));
  setText("statTopApp", top ? compact(top.tokens_day) : "—");
  setText("statSources", `${okSources}/${realSources}`);
  setText("statSignalsNote", `GH ${gh.length} · OR ${or.length} · PH ${ph.length} · HF ${hf.length}`);
  setText("statTopAppNote", top ? top.title + " · 仅路由调用" : "OpenRouter");
  setText("statSourcesNote", `含 ${(SOURCES || []).filter(s => s.status === "manual").length} 个报告型来源`);
  const generated = RADAR.generated_at ? new Date(RADAR.generated_at) : null;
  setText("radarUpdated", generated ? "更新于 " + fmtDateTime(generated.getTime()) : "—");
  setText("mastUpdated", generated ? "更新 " + fmtDate(generated.getTime()) : "—");
  setText("radarGenerated", generated ? "采集 " + fmtDateTime(generated.getTime()) : "—");
  setText("radarCoverage", `${fmtNum(gh.length + or.length + ph.length + hf.length)} 条信号`);
  setText("radarSources", `${(SOURCES || []).filter(s => s.status === "ok").length} 个公开数据源`);
  setText("radarDate", generated ? fmtDate(generated.getTime()) : "—");
}
function updateTicker() {
  const gh = radarItems("github").slice(0, 3);
  const or = radarItems("openrouter").slice(0, 3);
  const ph = radarItems("producthunt").slice(0, 2);
  const hf = radarItems("huggingface").slice(0, 2);
  const parts = [];
  gh.forEach(x => parts.push(`<span class="ticker-item"><b>GH</b> ${esc(x.repo)} <span class="t-accent">+${fmtNum(x.stars_today || 0)}★</span></span>`));
  or.forEach(x => parts.push(`<span class="ticker-item"><b>OR</b> ${esc(x.title)} <span class="t-accent">${compact(x.tokens_day)} tok/d</span></span>`));
  ph.forEach(x => parts.push(`<span class="ticker-item"><b>PH</b> ${esc(x.title)} <span class="t-accent">NEW</span></span>`));
  hf.forEach(x => parts.push(`<span class="ticker-item"><b>HF</b> ${esc(x.id)} <span class="t-accent">score ${fmtNum(x.trending_score)}</span></span>`));
  const html = parts.join("") || '<span class="ticker-item">等待数据采集…</span>';
  $$(".ticker-seq").forEach(el => { el.innerHTML = html; });
}

/* =========================================================
   lean lens
   ========================================================= */
function renderLeanExtra(kind) {
  const box = $("#leanExtraBody");
  const data = kind === "opu" ? (LEAN_EXTRA.opu || {}) : (LEAN_EXTRA.vv || {});
  const items = data.items || [];
  if (kind === "opu") {
    box.innerHTML = `<div class="lean-extra-head"><div><span class="eyebrow">ONE PERSON UNICORN</span><h3>一人公司 · 团队 ≤10 人</h3></div><span class="source-badge">SELF-REPORTED</span></div>
      ${items.length ? `<div class="lean-table-wrap"><table class="lean-table"><thead><tr><th>#</th><th>公司</th><th>类别</th><th>ARR</th><th>团队</th><th>人均 ARR</th><th>成立</th><th>盈利</th><th>工具</th></tr></thead><tbody>
      ${items.map(x => `<tr><td>${x.rank}</td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></td><td>${esc(x.category)}</td><td>${esc(x.arr)}</td><td>${esc(x.team)}</td><td>${esc(x.rpe)}</td><td>${esc(x.founded)}</td><td>${esc(x.profitable)}</td><td class="lean-tools">${esc(x.tools || "—")}</td></tr>`).join("")}
      </tbody></table></div>` : '<div class="empty-inline">暂无数据</div>'}
      <p class="lean-note">${esc(data.note || "")}</p>`;
  } else {
    box.innerHTML = `<div class="lean-extra-head"><div><span class="eyebrow">VERTICAL VELOCITY</span><h3>垂直 AI · 人均 ARR</h3></div><span class="source-badge">PERIODIC</span></div>
      ${items.length ? `<div class="lean-table-wrap"><table class="lean-table"><thead><tr><th>#</th><th>公司</th><th>行业</th><th>人均 ARR</th><th>ARR</th></tr></thead><tbody>
      ${items.map(x => `<tr><td>${x.rank}</td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a></td><td>${esc(x.sector)}</td><td>${esc(x.arr_per_employee)}</td><td>${esc(x.arr)}</td></tr>`).join("")}
      </tbody></table></div>` : '<div class="empty-inline">暂无数据</div>'}
      <p class="lean-note">${esc(data.note || "")}</p>`;
  }
}
function setLeanSource(kind) {
  state.leanSource = kind;
  $$("#leanTabs button").forEach(b => b.classList.toggle("active", b.dataset.lean === kind));
  $("#leanPanel70").classList.toggle("hidden", kind !== "lean70");
  $("#leanPanelExtra").classList.toggle("hidden", kind === "lean70");
  if (kind !== "lean70") renderLeanExtra(kind);
  syncURL();
}
function renderLean() {
  setLeanSource(state.leanSource || "lean70");
  const opu = LEAN_EXTRA.opu || {};
  const vv = LEAN_EXTRA.vv || {};
  const setText = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  setText("opuCount", opu.items ? "· " + opu.items.length : "");
  setText("vvCount", vv.items ? "· " + vv.items.length : "");
}

/* =========================================================
   lens switching
   ========================================================= */
function showLens(lens, push = true) {
  if (!LENS_KEYS.includes(lens)) lens = "growth";
  state.lens = lens;
  document.body.dataset.lens = lens;
  $$(".page").forEach(p => p.classList.toggle("hidden", p.id !== "page-" + lens));
  $$("#lensbar .lensbtn").forEach(b => b.classList.toggle("active", b.dataset.lens === lens));
  if (lens === "growth") renderGrowth();
  if (lens === "github") renderGithubPage();
  if (lens === "models") renderModelsPage();
  if (lens === "launches") renderLaunchesPage();
  if (lens === "sources") renderSourcesPage();
  if (lens === "lean") renderLean();
  window.scrollTo(0, 0);
  if (push) syncURL();
}

/* =========================================================
   舆情 (Hacker News + search links)
   ========================================================= */
let newsToken = 0;

function newsQuery(target) { return target.query || target.name; }
function searchLinks(q, website, github) {
  const e = encodeURIComponent(q);
  const out = [
    ["Google 新闻（中文）", `https://news.google.com/search?q=${e}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`],
    ["Google News（EN）", `https://news.google.com/search?q=${e}&hl=en-US&gl=US&ceid=US:en`],
    ["Bing 新闻", `https://cn.bing.com/news/search?q=${e}`],
    ["百度资讯", `https://www.baidu.com/s?wd=${e}&tn=news`],
    ["X / Twitter", `https://x.com/search?q=${e}&f=live`],
    ["微信（搜狗）", `https://weixin.sogou.com/weixin?type=2&query=${e}`]
  ];
  if (website) out.push(["官网", website]);
  if (github) out.push(["GitHub 仓库", github]);
  return out;
}
function renderNewsShell(target) {
  const q = newsQuery(target);
  const links = searchLinks(q, target.website, target.github);
  $("#newsTitle").textContent = target.name;
  $("#newsBody").innerHTML = `
    <div class="news-head">
      <div class="drawer-cat">SENTIMENT · LATEST SIGNALS</div>
      <h2 id="newsTitleInner">${esc(target.name)} <span class="news-q">检索词：${esc(q)}</span></h2>
      <div class="news-links">${links.map(([label, url]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join("")}</div>
    </div>
    <div class="news-section">
      <div class="news-section-head"><span>HACKER NEWS · 最新讨论</span><span class="mono">近 365 天</span></div>
      <div id="newsFeed" class="news-feed"><div class="news-loading">正在检索最新资讯…</div></div>
    </div>
    ${target.github && normalizeRepo(target.github) ? `<div class="news-section" id="newsReleases"><div class="news-section-head"><span>GITHUB · 最新发布</span></div><div class="news-loading">正在读取 Releases…</div></div>` : ""}
    <p class="news-note">舆情从公开 API 与搜索入口实时获取，不代表看板立场；部分站点可能需要登录或代理。</p>
  `;
}
async function hnSearch(q, recent) {
  const cutoff = Math.floor(Date.now() / 1000) - 365 * 86400;
  const base = recent ? "search_by_date" : "search";
  let url = `https://hn.algolia.com/api/v1/${base}?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=12`;
  if (recent) url += `&numericFilters=created_at_i>${cutoff}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("HN " + r.status);
  const d = await r.json();
  return (d.hits || []).filter(h => h.title);
}
async function loadNews(target, token) {
  const feed = $("#newsFeed");
  if (!feed) return;
  const q = newsQuery(target);
  try {
    let hits = await hnSearch(q, true);
    if (!hits.length) hits = await hnSearch(q, false);
    if (token !== newsToken) return;
    const toks = q.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    const relevant = hits.filter(h => toks.some(t => (h.title + " " + (h.url || "")).toLowerCase().includes(t)));
    if (relevant.length) hits = relevant;
    if (!hits.length) {
      feed.innerHTML = `<div class="news-empty">近一年没有找到相关讨论，试试上方搜索入口。</div>`;
    } else {
      feed.innerHTML = hits.slice(0, 10).map(h => {
        const d = h.url ? domain(h.url) : "news.ycombinator.com";
        return `<a class="news-item" href="${esc(h.url || "https://news.ycombinator.com/item?id=" + h.objectID)}" target="_blank" rel="noopener">
          <div class="news-title">${esc(h.title || "(untitled)")}</div>
          <div class="news-meta"><span class="news-domain">${esc(d)}</span><span>▲ ${h.points || 0}</span><span>💬 ${h.num_comments || 0}</span><span>${relTime(h.created_at)}</span></div>
        </a>`;
      }).join("");
    }
  } catch (e) {
    if (token !== newsToken) return;
    feed.innerHTML = `<div class="news-empty">实时资讯加载失败（${esc(e.message || "网络不可用")}）。仍可通过上方搜索入口查看最新报道。</div>`;
  }
  if (target.github) loadReleases(target.github, token);
}
async function loadReleases(githubUrl, token) {
  const slug = normalizeRepo(githubUrl);
  const box = $("#newsReleases");
  if (!slug || !box) return;
  const slow = setTimeout(() => {
    if (token === newsToken && box.querySelector(".news-loading")) {
      box.innerHTML = `<div class="news-section-head"><span>GITHUB · 最新发布</span><a href="${esc(githubUrl)}" target="_blank" rel="noopener">仓库 ↗</a></div><div class="news-empty">Releases 加载较慢或触发限流，可打开仓库查看。</div>`;
    }
  }, 6000);
  try {
    const r = await fetch(`https://api.github.com/repos/${slug}/releases?per_page=5`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error("GitHub " + r.status);
    const rels = await r.json();
    if (token !== newsToken) return;
    clearTimeout(slow);
    box.innerHTML = `<div class="news-section-head"><span>GITHUB · 最新发布</span><a href="${esc(githubUrl)}" target="_blank" rel="noopener">仓库 ↗</a></div>` +
      (rels.length ? `<div class="release-list">${rels.map(r => `<a class="release-item" href="${esc(r.html_url)}" target="_blank" rel="noopener"><b>${esc(r.tag_name)}</b><span>${esc(r.name || "")}</span><time>${relTime(r.published_at)}</time></a>`).join("")}</div>` : `<div class="news-empty">暂无 Release。</div>`);
  } catch (e) {
    clearTimeout(slow);
    if (token !== newsToken) return;
    box.innerHTML = `<div class="news-section-head"><span>GITHUB · 最新发布</span><a href="${esc(githubUrl)}" target="_blank" rel="noopener">仓库 ↗</a></div><div class="news-empty">暂时无法读取 Releases。</div>`;
  }
}
function openNews(target) {
  if (!target) return;
  newsToken++;
  renderNewsShell(target);
  openLayer($("#newsPanel"), $("#newsBackdrop"), closeNews);
  loadNews(target, newsToken);
  if (target.watchId) markChecked(target.watchId, true);
}
function closeNews() { closeLayer($("#newsPanel")); }

/* =========================================================
   leaderboard sync
   ========================================================= */
function parseCsv(csv) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function parseMoney(s) {
  if (s == null) return null;
  s = String(s).replace(/≥/g, "").replace(/\$/g, "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}
function parseNum(s) {
  if (s == null) return null;
  s = String(s).replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}
function snapAge(s) {
  const M = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const m = String(s || "").match(/^([A-Z][a-z]{2})\s+(\d{4})$/);
  if (!m) return null;
  return Math.max(0, (2026 - Number(m[2])) * 12 + (10 - M[m[1]]));
}
function defaultTerm(name) {
  const t = String(name).replace(/\s*\([^)]*\)\s*/g, " ").trim();
  return t || name;
}
function sheetToCompanies(csv) {
  const rows = parseCsv(String(csv).replace(/^\uFEFF/, ""));
  const out = [];
  rows.slice(1).forEach(r => {
    if (!r || !r[2] || !String(r[2]).trim()) return;
    const name = String(r[2]).trim();
    const desc = String(r[3] || "").trim();
    const rev = parseMoney(r[5]);
    const emp = parseNum(r[6]);
    const val = parseMoney(r[11]);
    const fund = parseMoney(r[10]);
    const old = findCompany(name);
    const site = (S.sites && S.sites[name]) || {};
    const category = (S.catMap && S.catMap[desc]) || (old && old.category) || "其他";
    out.push({
      rank: parseInt(r[0], 10) || out.length + 1,
      name, desc,
      loc: String(r[4] || "").trim(),
      rev, emp,
      rpe: rev != null && emp ? rev / emp : parseMoney(r[7]),
      profit: String(r[8] || "").toLowerCase() === "yes",
      fund, val,
      vpe: val != null && emp ? val / emp : parseMoney(r[12]),
      founded: String(r[13] || "").trim(),
      foundedNum: /^\d{4}$/.test(String(r[13] || "").trim()) ? Number(r[13]) : null,
      snap: String(r[14] || "").trim(),
      snapAge: snapAge(r[14]),
      src: String(r[15] || "").trim(),
      months: parseNum(r[9]),
      category,
      website: (old && old.website) || site.website || "",
      github: (old && old.github) || site.github || "",
      searchTerm: (old && old.searchTerm) || site.searchTerm || defaultTerm(name),
      status: (old && old.status) || "",
      statusLong: (old && old.statusLong) || "",
      value: (old && old.value) || "新上榜公司，调研待补充",
      model: (old && old.model) || "暂无调研。可查看官网，或点击「舆情」获取最新资讯。",
      moat: (old && old.moat) || "暂无调研。",
      progress: (old && old.progress) || "暂无调研；数据来自官方榜单最新快照。",
      confidence: (old && old.confidence) || "low",
      sources: (old && old.sources && old.sources.length) ? old.sources : (String(r[15] || "").startsWith("http") ? [String(r[15]).trim()] : [])
    });
  });
  return out;
}
function applyCompanies(next) {
  COMPANIES = next;
  countCats();
  store.settings.lastSync = Date.now();
  store.settings.lastError = null;
  store.settings.lastCount = next.length;
  saveStore();
  updateStats();
  updateTicker();
  renderChips();
  render();
  refreshWatchUI();
  if ($("#tracker").classList.contains("open")) renderTracker();
}
function fetchWithTimeout(url, opts = {}, ms = 12000) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, reject) => setTimeout(() => reject(new Error("请求超时")), ms))
  ]);
}
async function fetchSheetCsv() {
  // 1) direct Google Sheets (works when the browser can reach Google)
  try {
    const res = await fetchWithTimeout(SHEET_URL + "&_=" + Date.now(), { cache: "no-store" }, 9000);
    if (res.ok) {
      const text = await res.text();
      if (/Company/.test(text)) return { text, via: "google" };
    }
  } catch (e) { /* fall through */ }
  // 2) Jina reader mirror (CORS-friendly, useful behind restricted networks)
  const res = await fetchWithTimeout("https://r.jina.ai/" + SHEET_URL, { cache: "no-store" }, 20000);
  if (!res.ok) throw new Error("镜像请求失败 HTTP " + res.status);
  const text = await res.text();
  const idx = text.indexOf("Company,Description");
  if (idx < 0) throw new Error("镜像返回内容不是榜单 CSV");
  const start = text.lastIndexOf("\n", idx) + 1;
  return { text: text.slice(start), via: "jina" };
}
async function syncLeaderboard() {
  const { text, via } = await fetchSheetCsv();
  if (!/Company/.test(text)) throw new Error("返回内容不是榜单 CSV");
  const next = sheetToCompanies(text);
  if (next.length < 10) throw new Error("解析到的公司数量异常（" + next.length + "）");
  applyCompanies(next);
  return { count: next.length, via };
}
function lastSyncCutoff(now = new Date()) {
  const c = new Date(now);
  c.setHours(20, 0, 0, 0);
  c.setDate(c.getDate() - c.getDay());
  if (c > now) c.setDate(c.getDate() - 7);
  return c;
}
function nextSyncTime(now = new Date()) {
  const c = lastSyncCutoff(now);
  c.setDate(c.getDate() + 7);
  return c;
}
function syncDue() { return !store.settings.lastSync || store.settings.lastSync < lastSyncCutoff().getTime(); }
async function autoSync() {
  if (!store.settings.autoSync || !syncDue() || !navigator.onLine) return;
  const lastAttempt = store.settings.lastAttempt || 0;
  if (Date.now() - lastAttempt < 30 * 60 * 1000) return;
  store.settings.lastAttempt = Date.now();
  saveStore();
  try {
    const r = await syncLeaderboard();
    toast(`榜单已自动同步 · ${r.count} 家公司${r.via === "jina" ? "（镜像）" : ""}`);
  } catch (e) {
    store.settings.lastError = e.message;
    saveStore();
    if ($("#tracker").classList.contains("open")) renderTracker();
  }
}

/* =========================================================
   tracker panel
   ========================================================= */
function syncCardHtml() {
  const gen = RADAR.generated_at ? new Date(RADAR.generated_at) : null;
  const srcs = SOURCES || [];
  const ok = srcs.filter(x => x.status === "ok").length;
  return `<div class="sync-card">
    <div class="sync-head">
      <span class="sync-dot ${ok === srcs.length ? "" : "due"}"></span>
      <b>自动采集</b>
      <span class="sync-status">${gen ? "采集于 " + fmtDateTime(gen.getTime()) : "尚未采集"}</span>
    </div>
    <div class="sync-grid">
      <div><span>发布节奏</span><b>每日 08:00</b></div>
      <div><span>Lean 榜单</span><b>每周日 20:00</b></div>
      <div><span>数据源</span><b>${ok}/${srcs.length} 在线</b></div>
    </div>
    <div class="sync-actions">
      <button type="button" class="btn-solid" data-act="sources">查看数据源</button>
      <button type="button" class="btn-ghost" data-act="reload">重新载入</button>
    </div>
    <p class="sync-note">数据由 GitHub Actions 定时采集并生成静态站；打开页面只读取最新构建，不在浏览器里抓取大源。Lean 榜单可手动导入 CSV 兜底。</p>
    <div class="sync-backup"><button type="button" data-act="export">导出追踪备份</button><button type="button" data-act="state-import">导入备份</button></div>
  </div>`;
}

function trackItemHtml(w) {
  if (w.type === "signal") {
    const due = dueState(w);
    const metaLabel = { github: "GitHub", openrouter: "OpenRouter", producthunt: "Product Hunt", huggingface: "Hugging Face" }[w.source] || w.source;
    return `<div class="track-item ${due.due ? "is-due" : ""}" data-id="${esc(w.id)}">
      <div class="track-head">
        <span class="type-badge signal">${esc(metaLabel)}</span>
        <button type="button" class="track-name" data-act="open" title="打开">${esc(w.name)}</button>
        <span class="due-pill ${due.due ? "due" : ""}">${due.label}</span>
        <button type="button" class="track-del" data-act="remove" aria-label="删除 ${esc(w.name)}" title="删除，不再追踪">×</button>
      </div>
      <div class="track-meta"><span>${esc(w.summary || "")}</span></div>
      ${w.note ? `<p class="track-note">${esc(w.note)}</p>` : ""}
      <div class="track-actions">
        <select data-act="cadence" class="mini-select" aria-label="更新周期">${CADENCES.map(([d, label]) => `<option value="${d}" ${Number(w.cadenceDays) === d ? "selected" : ""}>${label}</option>`).join("")}</select>
        <span class="track-cycle">下次：${w.cadenceDays ? (nextDue(w) ? fmtDate(nextDue(w)) : "—") : "手动"}</span>
        <span class="track-spacer"></span>
        ${w.url ? `<a class="track-link" href="${esc(w.url)}" target="_blank" rel="noopener">来源 ↗</a>` : ""}
        <button type="button" class="btn-mini" data-act="check">查看详情</button>
        <button type="button" class="btn-mini" data-act="mark">已检查</button>
      </div>
    </div>`;
  }
  const c = w.type === "company" ? (w.custom ? null : findCompany(w.name)) : null;
  const due = dueState(w);
  const meta = [];
  if (w.type === "company") {
    meta.push(w.custom ? "自定义公司" : (c ? `榜单 #${c.rank}` : "已不在榜单"));
    if (c) {
      meta.push(`ARR ${fmtMoney(c.rev)}`);
      meta.push(`${c.emp ?? "—"} 人`);
      if (c.val) meta.push(`估值 ${fmtMoney(c.val)}`);
    } else if (w.desc) meta.push(w.desc);
    if (w.website) meta.push(domain(w.website));
  } else {
    const r = w.repo;
    if (r) {
      meta.push(`★ ${fmtNum(r.stars)}`);
      meta.push(`Forks ${fmtNum(r.forks)}`);
      meta.push(`Issues ${fmtNum(r.issues)}`);
      meta.push(`最近提交 ${relTime(r.pushedAt)}`);
      if (r.release) meta.push(`Release ${r.release.tag}`);
    } else meta.push(w.repoSlug);
  }
  const website = w.type === "company" ? (w.website || (c && c.website) || "") : (w.repo ? w.repo.url : "");
  const github = w.type === "github" ? (w.repo ? w.repo.url : "") : (w.github || (c && c.github) || "");
  return `<div class="track-item ${due.due ? "is-due" : ""}" data-id="${esc(w.id)}">
    <div class="track-head">
      <span class="type-badge ${w.type} ${w.custom ? "custom" : ""}">${w.type === "github" ? "GH" : w.custom ? "自定义" : "榜单"}</span>
      <button type="button" class="track-name" data-act="open" title="打开">${esc(w.name)}</button>
      <span class="due-pill ${due.due ? "due" : ""}">${due.label}</span>
      <button type="button" class="track-del" data-act="remove" aria-label="删除 ${esc(w.name)}" title="删除，不再追踪">×</button>
    </div>
    <div class="track-meta">${meta.map(x => `<span>${esc(x)}</span>`).join("")}</div>
    ${w.note ? `<p class="track-note">${esc(w.note)}</p>` : ""}
    ${w.error ? `<p class="track-error">${esc(w.error)}</p>` : ""}
    <div class="track-actions">
      <select data-act="cadence" class="mini-select" aria-label="更新周期">
        ${CADENCES.map(([d, label]) => `<option value="${d}" ${Number(w.cadenceDays) === d ? "selected" : ""}>${label}</option>`).join("")}
      </select>
      <span class="track-cycle">下次：${w.cadenceDays ? (nextDue(w) ? fmtDate(nextDue(w)) : "—") : "手动"}</span>
      <span class="track-spacer"></span>
      ${website ? `<a class="track-link" href="${esc(website)}" target="_blank" rel="noopener">${w.type === "github" ? "仓库" : "官网"} ↗</a>` : ""}
      ${github && w.type !== "github" ? `<a class="track-link" href="${esc(github)}" target="_blank" rel="noopener">GitHub ↗</a>` : ""}
      <button type="button" class="btn-mini" data-act="check">${w.loading ? "刷新中…" : w.type === "github" ? "刷新" : "舆情"}</button>
      <button type="button" class="btn-mini" data-act="mark">已检查</button>
    </div>
  </div>`;
}
function renderTracker() {
  const body = $("#trackerBody");
  if (!body) return;
  const list = [...store.watches].sort((a, b) => {
    const da = dueState(a).due ? 0 : 1, db = dueState(b).due ? 0 : 1;
    if (da !== db) return da - db;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  body.innerHTML = `
    ${syncCardHtml()}
    <div class="track-toolbar">
      <div><span class="track-count">${store.watches.length}</span> 个追踪项目</div>
      <button type="button" class="btn-solid" data-act="add">＋ 添加追踪</button>
    </div>
    ${store.watches.length ? `<div class="track-list">${list.map(trackItemHtml).join("")}</div>` : `
      <div class="track-empty">
        <div class="track-empty-star">☆</div>
        <p>还没有关注任何公司。</p>
        <p class="muted">在榜单卡片上点 ☆，或添加一家公司 / 一个 GitHub 项目，设置自己的更新周期。</p>
        <button type="button" class="btn-solid" data-act="add">＋ 添加第一个追踪</button>
      </div>`}
    <div class="tracker-foot"><span>数据保存在本机浏览器 localStorage；清理浏览器数据会丢失，建议定期导出备份。</span></div>
  `;
}
let refreshingDue = false;
async function refreshDueRepos() {
  if (refreshingDue) return;
  const due = store.watches.filter(w => w.type === "github" && dueState(w).due && !w.loading);
  if (!due.length) return;
  refreshingDue = true;
  for (const w of due.slice(0, 6)) {
    w.loading = true;
    renderTracker();
    try {
      w.repo = await fetchRepo(w.repoSlug);
      w.lastChecked = Date.now();
      w.error = "";
    } catch (e) {
      w.error = e.message;
    }
    w.loading = false;
    saveStore();
    renderTracker();
  }
  refreshingDue = false;
}
function openTracker() {
  renderTracker();
  openLayer($("#tracker"), $("#trackerBackdrop"), closeTracker);
  setTimeout(refreshDueRepos, 600);
}
function closeTracker() { closeLayer($("#tracker")); }

/* =========================================================
   add tracker
   ========================================================= */
let addType = "company";
function setAddType(type) {
  addType = type;
  $$("#addTabs button").forEach(b => b.classList.toggle("active", b.dataset.type === type));
  $$("#addForm .f-company").forEach(el => el.style.display = type === "company" ? "" : "none");
  $$("#addForm .f-github").forEach(el => el.style.display = type === "github" ? "" : "none");
  $("#addError").textContent = "";
  const title = $("#addTitle");
  if (title) title.textContent = type === "company" ? "追踪一家公司" : "追踪 GitHub 项目";
}
function openAdd(type = "company") {
  addType = type;
  const form = $("#addForm");
  if (form) form.reset();
  $("#addError").textContent = "";
  setAddType(type);
  openLayer($("#addPanel"), $("#addBackdrop"), closeAdd);
}
function closeAdd() { closeLayer($("#addPanel")); }
async function submitAdd(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const cadenceDays = Number(fd.get("cadence") || 7);
  const note = String(fd.get("note") || "").trim();
  const err = $("#addError");
  err.textContent = "";
  if (addType === "company") {
    const name = String(fd.get("name") || "").trim();
    if (!name) { err.textContent = "请填写公司名称"; return; }
    const match = findCompany(name);
    if (match && isWatched(match.name)) { err.textContent = "这家公司已经在追踪列表里了"; return; }
    if (store.watches.some(w => w.custom && norm(w.name) === norm(name))) { err.textContent = "同名公司已经在追踪列表里了"; return; }
    const website = safeUrl(fd.get("website"));
    pushWatch({
      id: uid(), type: "company", custom: !match, name: match ? match.name : name,
      rank: match ? match.rank : null,
      website: website || (match && match.website) || "",
      github: match ? (match.github || "") : "",
      desc: String(fd.get("desc") || "").trim(),
      cadenceDays, lastChecked: Date.now(), createdAt: Date.now(), note
    });
    closeAdd();
    toast(match ? `已关注 ${match.name}` : `已添加自定义追踪：${name}`);
    return;
  }
  const slug = normalizeRepo(fd.get("repo"));
  if (!slug) { err.textContent = "请填写 owner/repo 或 GitHub 仓库链接"; return; }
  if (store.watches.some(w => w.type === "github" && w.repoSlug === slug)) { err.textContent = "这个仓库已经在追踪列表里了"; return; }
  const btn = $("#addSubmit");
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = "读取仓库中…";
  try {
    const repo = await fetchRepo(slug);
    pushWatch({
      id: uid(), type: "github", custom: true, name: repo.fullName, repoSlug: slug, repo,
      website: repo.homepage || "", github: repo.url,
      cadenceDays, lastChecked: Date.now(), createdAt: Date.now(), note
    });
    closeAdd();
    toast(`已开始追踪 ${repo.fullName}`);
  } catch (e2) {
    err.textContent = e2.message;
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

/* =========================================================
   board rendering
   ========================================================= */
const cats = () => ["all", ...S.cats.map(c => c.name)];
function card(c, i) {
  const watched = isWatched(c.name);
  return `<article class="card" data-rank="${c.rank}" style="--i:${Math.min(i, 36)}" tabindex="0" role="button" aria-label="查看 ${esc(c.name)} 详情">
    <div class="card-top">
      <span class="rank">${String(c.rank).padStart(2, "0")}</span>
      <span class="card-tags"><span class="cat">${esc(c.category)}</span>${c.status ? `<span class="status-tag">${esc(c.status)}</span>` : ""}</span>
    </div>
    <h2 class="name">${esc(c.name)}</h2>
    <p class="card-value">${esc(c.value)}</p>
    <div class="card-metrics">
      <div><b>${fmtMoney(c.rev)}</b><span>年营收</span></div>
      <div><b>${c.emp ?? "—"}</b><span>员工</span></div>
      <div><b>${fmtMoney(c.rpe)}</b><span>人均营收</span></div>
    </div>
    <div class="card-foot">
      <span>${esc(c.loc)} · 快照 ${esc(c.snap)}</span>
      <span class="foot-right">
        <button type="button" class="watch ${watched ? "on" : ""}" data-watch="${esc(c.name)}" aria-pressed="${watched}" aria-label="${watched ? "取消关注" : "关注"} ${esc(c.name)}" title="关注 / 取消关注">${watched ? "★" : "☆"}</button>
        <span class="open">详情 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17 17 7M8 7h9v9"/></svg></span>
      </span>
    </div>
  </article>`;
}
function ctaCard() {
  return `<a class="cta-card" href="https://forms.gle/ceEFvWH9nPiD2bMT8" target="_blank" rel="noopener">
    <div class="cta-top"><span class="rank">MISSING</span><span class="cat">OPEN CALL</span></div>
    <div>
      <h2>还知道更 lean 的公司？</h2>
      <p>ARR &gt; $5M、员工 &lt; 50、成立 &lt; 5 年，或人均 ARR &gt; $1M。<br>推荐给官方榜单，下一版就可能出现在这里。</p>
    </div>
    <div class="cta-foot"><span>提交公司</span><span class="open">↗</span></div>
  </a>`;
}
function row(c) {
  const watched = isWatched(c.name);
  return `<tr data-rank="${c.rank}" tabindex="0">
    <td class="t-rank">${String(c.rank).padStart(2, "0")}</td>
    <td><div class="t-name"><button type="button" class="t-watch ${watched ? "on" : ""}" data-watch="${esc(c.name)}" aria-pressed="${watched}" aria-label="${watched ? "取消关注" : "关注"} ${esc(c.name)}">${watched ? "★" : "☆"}</button>${esc(c.name)}${c.status ? `<span class="t-status">${esc(c.status)}</span>` : ""}</div><div class="t-sub">${esc(c.value)}</div></td>
    <td class="t-cat">${esc(c.category)}</td>
    <td class="t-num">${fmtMoney(c.rev)}</td>
    <td class="t-num">${c.emp ?? "—"}</td>
    <td class="t-num">${fmtMoney(c.rpe)}</td>
    <td class="t-num">${fmtMoney(c.val)}</td>
    <td class="t-num">${c.profit ? '<span class="t-dot"></span>是' : "否"}</td>
    <td class="t-num">${esc(c.founded)}</td>
  </tr>`;
}
function filtered() {
  const q = state.q.trim().toLowerCase();
  const arr = COMPANIES.filter(c => {
    if (state.cat !== "all" && c.category !== state.cat) return false;
    if (!q) return true;
    return [c.name, c.desc, c.value, c.model, c.moat, c.progress, c.category, c.loc].join(" ").toLowerCase().includes(q);
  });
  const key = {
    rank: (a, b) => a.rank - b.rank,
    rpe: (a, b) => (b.rpe ?? -1) - (a.rpe ?? -1),
    rev: (a, b) => (b.rev ?? -1) - (a.rev ?? -1),
    emp: (a, b) => (a.emp ?? 999) - (b.emp ?? 999),
    val: (a, b) => (b.val ?? -1) - (a.val ?? -1),
    founded: (a, b) => (b.foundedNum ?? 0) - (a.foundedNum ?? 0)
  }[state.sort];
  return arr.sort(key);
}
function renderChips() {
  const counts = Object.fromEntries(S.cats.map(c => [c.name, c.n]));
  const all = cats();
  if (!all.includes(state.cat)) state.cat = "all";
  $("#chips").innerHTML = all.map(c => {
    const n = c === "all" ? COMPANIES.length : counts[c] || 0;
    return `<button class="chip ${c === state.cat ? "active" : ""}" data-cat="${esc(c)}">${c === "all" ? "全部" : esc(c)}<span class="n">${n}</span></button>`;
  }).join("");
}
function render() {
  const arr = filtered();
  $("#count").textContent = `${arr.length} / ${COMPANIES.length}`;
  $("#empty").classList.toggle("visible", arr.length === 0);
  if (state.view === "grid") {
    $("#grid").innerHTML = arr.map(card).join("") + ((state.cat === "all" && !state.q) ? ctaCard() : "");
    $("#tbody").innerHTML = "";
    $("#tableWrap").classList.remove("visible");
  } else {
    $("#tbody").innerHTML = arr.map(row).join("");
    $("#grid").innerHTML = "";
    $("#tableWrap").classList.add("visible");
  }
  $("#grid").classList.toggle("hidden", state.view !== "grid");
  refreshWatchUI();
}

/* =========================================================
   company drawer
   ========================================================= */
function openDrawer(rank, push = true) {
  const c = findCompanyByRank(rank);
  if (!c) return;
  if (state.lens !== "lean") { state.lens = "lean"; showLens("lean", false); }
  const i = COMPANIES.indexOf(c);
  state.open = rank;
  const prev = COMPANIES[i - 1], next = COMPANIES[i + 1];
  const srcs = (c.sources || []).slice(0, 3);
  const confMap = { high: ["high", "信息充分"], medium: ["medium", "部分推断"], low: ["low", "公开信息有限"] };
  const [confCls, confLabel] = confMap[c.confidence] || confMap.medium;
  const watched = isWatched(c.name);
  const website = c.website || "";
  const siteLink = website
    ? `<a class="pill-link" href="${esc(website)}" target="_blank" rel="noopener">官网 ${esc(domain(website))} ↗</a>`
    : `<a class="pill-link" href="https://www.google.com/search?q=${encodeURIComponent(c.name + " official site")}" target="_blank" rel="noopener">搜索官网 ↗</a>`;
  const ghLink = c.github ? `<a class="pill-link" href="${esc(c.github)}" target="_blank" rel="noopener">GitHub ↗</a>` : "";

  $("#drawerIdx").textContent = `NO.${String(c.rank).padStart(2, "0")} / ${COMPANIES.length}`;
  $("#drawerBody").innerHTML = `
    <div class="drawer-cat">${esc(c.category)} · ${esc(c.desc)}</div>
    <h2 id="drawerTitle">${esc(c.name)}</h2>
    <div class="drawer-sub">
      <span>${esc(c.loc)}</span>
      <span>${esc(c.founded)} 年成立</span>
      <span>快照 ${esc(c.snap)}${c.snapAge != null ? ` · ${c.snapAge} 个月前` : ""}</span>
      <span>榜单第 ${c.rank} 位</span>
    </div>
    <div class="drawer-links">
      ${siteLink}
      <button type="button" class="pill-link" data-news="${esc(c.name)}">◈ 舆情 · 最新资讯</button>
      <button type="button" class="pill-link watch-pill ${watched ? "on" : ""}" data-watch="${esc(c.name)}" aria-pressed="${watched}">${watched ? "★ 已关注" : "☆ 关注"}</button>
      ${ghLink}
    </div>
    ${c.statusLong ? `<div class="status-banner"><span>${esc(c.status)}</span>${esc(c.statusLong)}</div>` : ""}
    <div class="drawer-value"><span class="q">一句话核心价值</span>${esc(c.value)}</div>
    <div class="drawer-metrics">
      <div class="dm"><b>${fmtMoney(c.rev)}</b><span>年营收 ARR</span></div>
      <div class="dm"><b>${c.emp ?? "—"}</b><span>员工数</span></div>
      <div class="dm"><b>${fmtMoney(c.rpe)}</b><span>人均营收</span></div>
      <div class="dm"><b>${c.profit ? "盈利" : "未披露"}</b><span>盈利状态</span></div>
      <div class="dm"><b>${fmtMoney(c.val)}</b><span>估值</span></div>
      <div class="dm"><b>${fmtMoney(c.vpe)}</b><span>估值/员工</span></div>
      <div class="dm"><b>${fmtMoney(c.fund)}</b><span>累计融资</span></div>
      <div class="dm"><b>${c.months ? c.months + " 个月" : "—"}</b><span>达到 ARR 用时</span></div>
    </div>
    <div class="drawer-facts">
      <div><span>官网</span>${website ? `<a href="${esc(website)}" target="_blank" rel="noopener">${esc(domain(website))} ↗</a>` : "—"}</div>
      <div><span>总部</span>${esc(c.loc)}</div>
      <div><span>成立</span>${esc(c.founded)}</div>
      <div><span>最近快照</span>${esc(c.snap)}</div>
      <div><span>数据来源</span>${c.src && c.src.startsWith("http") ? `<a href="${esc(c.src)}" target="_blank" rel="noopener">原始来源 ↗</a>` : "榜单官方核验"}</div>
      <div><span>GitHub</span>${c.github ? `<a href="${esc(c.github)}" target="_blank" rel="noopener">${esc(domain(c.github))} ↗</a>` : "—"}</div>
    </div>
    <div class="section">
      <div class="section-head"><span class="section-num">01</span><h3>商业模式</h3></div>
      <p>${esc(c.model)}</p>
      <div class="tagline">Customer · Product · Revenue model</div>
    </div>
    <div class="section">
      <div class="section-head"><span class="section-num">02</span><h3>护城河</h3></div>
      <p>${esc(c.moat)}</p>
      <div class="tagline">Data · Distribution · Switching cost</div>
    </div>
    <div class="section">
      <div class="section-head"><span class="section-num">03</span><h3>最新进展</h3></div>
      <p>${esc(c.progress)}</p>
      <div class="tagline">Latest signals · ${esc(c.snap)} snapshot</div>
    </div>
    ${srcs.length ? `<div class="drawer-sources"><div class="src-label">参考来源</div>${srcs.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, "").split("?")[0])} ↗</a>`).join("")}</div>` : ""}
    <div class="drawer-foot">
      <span class="conf ${confCls}"><i></i>${confLabel}</span>
      <span>数据快照 ${esc(c.snap)}</span>
      <span>调研更新 ${esc(S.generated)}</span>
    </div>
    <div class="drawer-note">上方指标为 Lean AI Leaderboard 官方快照（各公司时点不同，可能已过时）；最新变化以「最新进展」为准。商业模式与护城河为公开信息整理与判断，不构成投资建议。</div>
    <div class="drawer-nav">
      <button ${prev ? "" : "disabled"} data-go="${prev ? prev.rank : ""}"><small>← 上一家</small><span>${prev ? esc(prev.name) : "—"}</span></button>
      <button class="next" ${next ? "" : "disabled"} data-go="${next ? next.rank : ""}"><small>下一家 →</small><span>${next ? esc(next.name) : "—"}</span></button>
    </div>
  `;
  if (!$("#drawer").classList.contains("open")) openLayer($("#drawer"), $("#backdrop"), closeDrawer);
  $("#drawer").scrollTop = 0;
  if (push) syncURL();
}
function closeDrawer() {
  state.open = -1;
  closeLayer($("#drawer"));
  syncURL();
}

/* =========================================================
   URL state
   ========================================================= */
const P = new URLSearchParams(location.search);
let state = {
  q: "",
  cat: P.get("cat") || "all",
  sort: P.get("sort") || "rank",
  view: P.get("view") === "table" ? "table" : "grid",
  lens: P.get("lens") || "growth",
  leanSource: P.get("lean") || "lean70",
  open: -1
};
function syncURL() {
  const p = new URLSearchParams();
  if (state.lens !== "growth") p.set("lens", state.lens);
  if (state.lens === "lean" && state.leanSource !== "lean70") p.set("lean", state.leanSource);
  if (state.lens === "lean") {
    if (state.view === "table") p.set("view", "table");
    if (state.cat !== "all") p.set("cat", state.cat);
    if (state.sort !== "rank") p.set("sort", state.sort);
  }
  const qs = p.toString();
  const hash = state.open > 0 ? "#c" + state.open : "";
  try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + hash); } catch (e) { }
}

/* =========================================================
   controls & events
   ========================================================= */
function wire() {
  $("#lensbar").addEventListener("click", e => {
    const b = e.target.closest("[data-lens]");
    if (b) showLens(b.dataset.lens);
  });
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goto-lens]");
    if (g) { e.preventDefault(); showLens(g.dataset.gotoLens); return; }
  });
  $("#leanTabs").addEventListener("click", e => {
    const b = e.target.closest("[data-lean]");
    if (b) setLeanSource(b.dataset.lean);
  });

  // radar signal cards, watch buttons, detail modal
  document.addEventListener("click", e => {
    const wb = e.target.closest("[data-watch-signal]");
    if (wb) {
      e.preventDefault();
      e.stopPropagation();
      const [source, id] = (wb.dataset.watchSignal || "").split("|");
      toggleSignalWatch(source, id);
      return;
    }
    const card = e.target.closest("[data-open-signal]");
    if (card) {
      const [source, id] = (card.dataset.openSignal || "").split("|");
      openSignal(source, id);
    }
  });
  $("#closeSignal").addEventListener("click", closeSignal);
  $("#signalBackdrop").addEventListener("click", closeSignal);
  $("#signalBody").addEventListener("click", e => {
    const nb = e.target.closest("[data-signal-news]");
    if (nb) {
      const [source, id] = (nb.dataset.signalNews || "").split("|");
      const item = findSignal(source, id);
      if (!item) return;
      const meta = SOURCE_BY_KEY[source] || {};
      openNews({
        name: signalName(source, item),
        query: source === "huggingface" ? signalName(source, item).split("/").pop() : signalName(source, item),
        website: signalUrl(source, item),
        github: source === "github" ? signalUrl(source, item) : (item.source_code_url || ""),
        watchId: null
      });
    }
  });

  $("#chips").addEventListener("click", e => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.cat = b.dataset.cat; renderChips(); render(); syncURL();
  });
  $("#q").addEventListener("input", e => {
    clearTimeout(window.__qt);
    window.__qt = setTimeout(() => { state.q = e.target.value; render(); }, 90);
  });
  $("#sort").addEventListener("change", e => {
    state.sort = e.target.value; render(); syncURL();
  });
  $("#viewGrid").addEventListener("click", () => {
    state.view = "grid"; $("#viewGrid").classList.add("active"); $("#viewTable").classList.remove("active"); render(); syncURL();
  });
  $("#viewTable").addEventListener("click", () => {
    state.view = "table"; $("#viewTable").classList.add("active"); $("#viewGrid").classList.remove("active"); render(); syncURL();
  });

  const boardClick = e => {
    const wb = e.target.closest("[data-watch]");
    if (wb) { e.preventDefault(); e.stopPropagation(); toggleCompanyWatch(wb.dataset.watch); return; }
    const el = e.target.closest("[data-rank]");
    if (el) openDrawer(Number(el.dataset.rank));
  };
  $("#grid").addEventListener("click", boardClick);
  $("#tbody").addEventListener("click", boardClick);
  const boardKey = e => {
    if (e.target.closest("[data-watch]")) return;
    const el = e.target.closest("[data-rank]");
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDrawer(Number(el.dataset.rank)); }
  };
  $("#grid").addEventListener("keydown", boardKey);
  $("#tbody").addEventListener("keydown", boardKey);

  $("#backdrop").addEventListener("click", closeDrawer);
  $("#closeBtn").addEventListener("click", closeDrawer);
  $("#prevBtn").addEventListener("click", () => {
    const c = findCompanyByRank(state.open); if (!c) return;
    const i = COMPANIES.indexOf(c); if (i > 0) openDrawer(COMPANIES[i - 1].rank);
  });
  $("#nextBtn").addEventListener("click", () => {
    const c = findCompanyByRank(state.open); if (!c) return;
    const i = COMPANIES.indexOf(c); if (i < COMPANIES.length - 1) openDrawer(COMPANIES[i + 1].rank);
  });
  $("#drawerBody").addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (go && go.dataset.go) { openDrawer(Number(go.dataset.go)); return; }
    const wb = e.target.closest("[data-watch]");
    if (wb) { e.preventDefault(); toggleCompanyWatch(wb.dataset.watch); return; }
    const nb = e.target.closest("[data-news]");
    if (nb) {
      const c = findCompany(nb.dataset.news);
      if (c) openNews({ name: c.name, query: c.searchTerm || defaultTerm(c.name), website: c.website, github: c.github });
    }
  });

  $("#openTracker").addEventListener("click", openTracker);
  $("#closeTracker").addEventListener("click", closeTracker);
  $("#trackerBackdrop").addEventListener("click", closeTracker);

  const body = $("#trackerBody");
  body.addEventListener("click", e => {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const item = act.closest("[data-id]");
    const id = item ? item.dataset.id : null;
    const w = id ? findWatch(id) : null;
    const a = act.dataset.act;
    if (a === "sync" || a === "sources") { closeTracker(); showLens("sources"); return; }
    if (a === "reload") { location.reload(); return; }
    if (a === "import") { $("#csvFile").click(); return; }
    if (a === "state-import") { $("#stateFile").click(); return; }
    if (a === "export") { exportStore(); return; }
    if (a === "add") { openAdd("company"); return; }
    if (!w) return;
    if (a === "remove") { removeWatch(w.id); return; }
    if (a === "mark") { markChecked(w.id); return; }
    if (a === "check") {
      if (w.type === "signal") {
        if (findSignal(w.source, w.sourceId)) openSignal(w.source, w.sourceId);
        else if (w.url) window.open(w.url, "_blank", "noopener");
        markChecked(w.id, true);
      } else if (w.type === "github") refreshRepo(w.id);
      else {
        const c = findCompany(w.name);
        openNews({
          name: w.name,
          query: (c && c.searchTerm) || defaultTerm(w.name),
          website: w.website || (c && c.website) || "",
          github: w.github || (c && c.github) || "",
          watchId: w.id
        });
      }
      return;
    }
    if (a === "open") {
      if (w.type === "signal") {
        if (findSignal(w.source, w.sourceId)) openSignal(w.source, w.sourceId);
        else if (w.url) window.open(w.url, "_blank", "noopener");
        return;
      }
      if (w.type === "company" && !w.custom) {
        const c = findCompany(w.name);
        if (c) { closeTracker(); openDrawer(c.rank); }
        else toast("这家公司已不在最新榜单中，但追踪仍保留");
      } else if (w.type === "github") {
        window.open(w.repo ? w.repo.url : "https://github.com/" + w.repoSlug, "_blank", "noopener");
      } else if (w.website) {
        window.open(w.website, "_blank", "noopener");
      } else {
        toast(w.note || "没有更多信息，可添加备注或官网");
      }
    }
  });
  body.addEventListener("change", e => {
    if (e.target.id === "autoSyncToggle") {
      store.settings.autoSync = e.target.checked; saveStore();
      toast(store.settings.autoSync ? "已开启每周自动同步" : "已关闭自动同步");
      return;
    }
    if (e.target.matches("[data-act=cadence]")) {
      const item = e.target.closest("[data-id]");
      const w = item ? findWatch(item.dataset.id) : null;
      if (!w) return;
      w.cadenceDays = Number(e.target.value);
      saveStore();
      renderTracker();
      toast(`「${w.name}」更新周期：${cadenceLabel(w.cadenceDays)}`);
    }
  });

  $("#addTabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-type]");
    if (b) setAddType(b.dataset.type);
  });
  $("#addForm").addEventListener("submit", submitAdd);
  $("#closeAdd").addEventListener("click", closeAdd);
  $("#addBackdrop").addEventListener("click", closeAdd);

  $("#closeNews").addEventListener("click", closeNews);
  $("#newsBackdrop").addEventListener("click", closeNews);

  $("#csvFile").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = sheetToCompanies(reader.result);
        if (next.length < 10) throw new Error("公司数量异常");
        applyCompanies(next);
        toast(`已导入 CSV · ${next.length} 家公司`);
      } catch (err) { toast("导入失败：" + err.message); }
      e.target.value = "";
    };
    reader.readAsText(f, "utf-8");
  });
  $("#stateFile").addEventListener("change", e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const o = JSON.parse(reader.result);
        if (!o || !Array.isArray(o.watches)) throw new Error("格式不正确");
        store = Object.assign(defaultStore(), o);
        store.settings = Object.assign(defaultStore().settings, o.settings || {});
        saveStore();
        afterWatchChange();
        renderTracker();
        toast(`已导入 ${store.watches.length} 个追踪项目`);
      } catch (err) { toast("备份导入失败：" + err.message); }
      e.target.value = "";
    };
    reader.readAsText(f, "utf-8");
  });

  document.addEventListener("keydown", e => {
    const top = topLayer();
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); if (top.close) top.close(); return; }
    if (e.key === "Tab") {
      const f = $$("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)", top.el).filter(x => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (top.el.id === "drawer" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const c = findCompanyByRank(state.open); if (!c) return;
      const i = COMPANIES.indexOf(c);
      const t = COMPANIES[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (t) openDrawer(t.rank);
    }
  });
}
function exportStore() {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `lean70-tracker-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast("已导出追踪备份");
}

/* =========================================================
   boot
   ========================================================= */
function boot() {
  if (!cats().includes(state.cat)) state.cat = "all";
  $("#sort").value = state.sort;
  if (state.view === "table") { $("#viewTable").classList.add("active"); $("#viewGrid").classList.remove("active"); }
  renderChips();
  render();
  updateStats();
  updateRadarStats();
  updateTicker();
  refreshWatchUI();
  setAddType("company");
  wire();
  showLens(state.lens, false);
  const m = location.hash.match(/^#c(\d+)$/);
  if (m) {
    const c = findCompanyByRank(Number(m[1]));
    if (c) { state.lens = "lean"; showLens("lean", false); openDrawer(c.rank, false); }
  }
  if (location.search) syncURL();
}
boot();
