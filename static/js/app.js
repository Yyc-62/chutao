/* 楚陶文化数字馆 —— 前端路由、数据渲染与交互 */
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const app = $("#app");

/* 资源版本号：每次部署更新时递增，用于绕过浏览器/边缘节点对旧失败响应的缓存 */
const ASSET_V = "v=3";
const vUrl = (url) => {
  const s = String(url || "");
  return s + (s.includes("?") ? "&" : "?") + ASSET_V;
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* 静态托管模式：把 /api 请求映射为预生成的 static-data/*.json，并在浏览器端完成筛选 */
const STATIC_MODE = typeof window !== "undefined" && window.CHUTAO_STATIC === true;
const staticCache = new Map();

async function fetchJSON(url) {
  if (!staticCache.has(url)) {
    const p = (async () => {
      const target = vUrl(url);
      let res = await fetch(target);
      if (!res.ok) {
        /* 可能是缓存中的旧失败响应：带时间戳强制重新请求一次 */
        res = await fetch(target + "&_r=" + Date.now(), { cache: "reload" });
      }
      if (!res.ok) throw new Error("请求失败 " + res.status + "(" + url + ")");
      return res.json();
    })();
    staticCache.set(url, p);
  }
  return staticCache.get(url);
}

const hasText = (value, q) => String(value == null ? "" : value).toLowerCase().includes(q.toLowerCase());

function filterKilns(list, q, category) {
  return list.filter((k) => {
    if (category && !hasText(k.category, category)) return false;
    if (q && !(hasText(k.name, q) || hasText(k.alias, q) || hasText(k.city, q) || hasText(k.intro, q))) return false;
    return true;
  });
}

function filterArtifacts(list, q, type, dynasty, kiln) {
  return list.filter((a) => {
    if (type && !hasText(a.type, type)) return false;
    if (dynasty && a.dynasty !== dynasty) return false;
    if (kiln && String(a.kiln_id) !== String(kiln)) return false;
    if (q && !(hasText(a.name, q) || hasText(a.alias, q) || hasText(a.type, q) || hasText(a.museum, q) || hasText(a.description, q))) return false;
    return true;
  });
}

async function staticApi(path) {
  const [p, qs] = path.split("?");
  const params = new URLSearchParams(qs || "");
  if (p === "/api/stats") return fetchJSON("static/static-data/stats.json");
  if (p === "/api/kilns") {
    const list = await fetchJSON("static/static-data/kilns.json");
    return filterKilns(list, params.get("q") || "", params.get("category") || "");
  }
  let m = p.match(/^\/api\/kilns\/(\d+)$/);
  if (m) return fetchJSON(`static/static-data/kilns/${m[1]}.json`);
  if (p === "/api/artifacts") {
    const list = await fetchJSON("static/static-data/artifacts.json");
    return filterArtifacts(list, params.get("q") || "", params.get("type") || "",
      params.get("dynasty") || "", params.get("kiln") || "");
  }
  m = p.match(/^\/api\/artifacts\/(\d+)$/);
  if (m) return fetchJSON(`static/static-data/artifacts/${m[1]}.json`);
  if (p === "/api/timeline") return fetchJSON("static/static-data/timeline.json");
  if (p === "/api/sources") return fetchJSON("static/static-data/sources.json");
  if (p === "/api/search") {
    const q = params.get("q") || "";
    if (!q) return { kilns: [], artifacts: [] };
    const [kilns, artifacts] = await Promise.all([
      fetchJSON("static/static-data/kilns.json"),
      fetchJSON("static/static-data/artifacts.json"),
    ]);
    return {
      kilns: filterKilns(kilns, q, ""),
      artifacts: filterArtifacts(artifacts, q, "", "", ""),
    };
  }
  throw new Error("未知接口 " + path);
}

async function api(path) {
  if (STATIC_MODE && path.startsWith("/api/")) return staticApi(path);
  const res = await fetch(vUrl(path));
  if (!res.ok) throw new Error("请求失败 " + res.status + "(" + path + ")");
  return res.json();
}
function mediaHtml(item, cls = "card-media") {
  if (!item.image) {
    return `<div class="${cls}"><div class="ph">陶</div></div>`;
  }
  return `<div class="${cls}"><img src="${esc(vUrl(item.image))}" alt="${esc(item.name)}" loading="lazy"></div>`;
}

function kilnCard(k, i = 0) {
  return `
    <a class="card reveal d${i % 4}" href="#kilns/${k.id}">
      ${mediaHtml(k)}
      <div class="card-body">
        <h3>${esc(k.name)}</h3>
        <div class="meta">${esc(k.category || "")}${k.city ? " · " + esc(k.city) : ""}</div>
        <p>${esc((k.intro || "").slice(0, 62))}……</p>
        <span class="more">查看窑口</span>
      </div>
    </a>`;
}

function artifactCard(a, i = 0) {
  return `
    <a class="card reveal d${i % 4}" href="#artifacts/${a.id}">
      ${mediaHtml(a)}
      <div class="card-body">
        <h3>${esc(a.name)}</h3>
        <div class="meta">${esc(a.type || "")} · ${esc(a.dynasty || "")}${a.kiln_name ? " · " + esc(a.kiln_name) : ""}</div>
        <p>${esc((a.description || "").slice(0, 54))}……</p>
        <span class="more">查看器物</span>
      </div>
    </a>`;
}

/* 窑口清单项：窑口入口 + 下方官方馆藏/官方认证代表器物入口 */
function regionEntry(k, i = 0) {
  const r = k.representative || null;
  return `
    <div class="region-entry reveal d${i % 4}">
      <a class="region-item" href="#kilns/${k.id}">
        <span class="rnum">${String(i + 1).padStart(2, "0")}</span>
        <span class="rname">${esc(k.name)}</span>
        <span class="raddr">${esc(k.district || k.city)} · ${esc(k.dynasty)}</span>
      </a>
      ${r ? `
        <a class="rep-card" href="#artifacts/${r.id}">
          <span class="rep-media">
            ${r.image ? `<img src="${esc(vUrl(r.image))}" alt="${esc(r.name)}" loading="lazy">` : `<i>陶</i>`}
          </span>
          <span class="rep-body">
            <small>代表器物 · ${esc(k.representative_label || "官方馆藏/认证")}</small>
            <b>${esc(r.name)}</b>
            <em>${esc(r.museum || "")}${r.dynasty ? " · " + esc(r.dynasty) : ""}</em>
          </span>
          <span class="rep-go">查看器物<span>→</span></span>
        </a>` : ""}
    </div>`;
}

function sectionHead(cn, en, desc = "", center = false) {
  return `
    <div class="section-head ${center ? "center" : ""}">
      <div class="label">${esc(en)}</div>
      <h2 class="cn">${esc(cn)}</h2>
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ""}
    </div>`;
}

/* ---------------- 全局交互 ---------------- */
let revealObserver = null;
function observeReveals() {
  if (revealObserver) revealObserver.disconnect();
  const els = $$(".reveal");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        revealObserver.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => revealObserver.observe(el));
}

function animateCounts() {
  const nums = $$("[data-count]");
  const run = (el) => {
    const target = +el.dataset.count;
    const dur = 1600;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!("IntersectionObserver" in window)) {
    nums.forEach((el) => { el.textContent = el.dataset.count; });
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        run(en.target);
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.4 });
  nums.forEach((el) => obs.observe(el));
}

/* 滚动动画兜底：避免任何环境下内容不可见 */
let revealFallback = null;
function scheduleRevealFallback() {
  if (revealFallback) clearTimeout(revealFallback);
  revealFallback = setTimeout(() => {
    $$(".reveal").forEach((el) => el.classList.add("in"));
    $$("[data-count]").forEach((el) => {
      if (el.textContent.trim() === "0" || el.textContent.trim() === "") {
        el.textContent = el.dataset.count;
      }
    });
  }, 2200);
}

/* 真实湖北地图（窑口所在区县着色 + 防遮挡引线标注） */
async function renderKilnMap(container) {
  const m = await api("static/maps/hubei-map.json");
  const cityName = (id) => (m.kilns.find((k) => k.id === id) || {}).name || "";
  const regions = m.regions.map((r) => `
    <g class="kregion" tabindex="0" role="link"
       data-id="${r.kiln_id}" data-county="${esc(r.county)}"
       data-name="${esc(cityName(r.kiln_id))}" aria-label="${esc(cityName(r.kiln_id))} · ${esc(r.county)}">
      ${r.paths.map((p) => `
        <path d="${p}" fill="${r.color}" fill-opacity=".24"
              stroke="${r.color}" stroke-opacity=".9" stroke-width=".9"></path>`).join("")}
      ${r.show_tag === false ? "" : `
      <text class="hb-region-label" x="${r.tx || r.cx}" y="${r.ty || r.cy}"
            text-anchor="middle">${esc(r.county)}</text>`}
    </g>`).join("");
  const cities = m.cities.map((c) => `
    <g class="hb-city">
      <circle r="1.7" cx="${c.x}" cy="${c.y}"></circle>
      <text class="hb-city-label" x="${c.x}" y="${c.y - 8}" text-anchor="middle">${esc(c.name)}</text>
    </g>`).join("");
  const kilns = m.kilns.map((k) => {
    const reg = m.regions.find((r) => r.kiln_id === k.id);
    return `
      <g class="kpoint" tabindex="0" role="link" aria-label="${esc(k.name)}"
         data-id="${k.id}" data-name="${esc(k.name)}" data-city="${esc(k.city)}"
         data-county="${esc(k.county)}" data-district="${esc(k.district)}"
         data-dynasty="${esc(k.dynasty)}" data-color="${reg ? reg.color : ""}"
         transform="translate(${k.x},${k.y})">
        <circle r="6.2"></circle>
        <text class="knum" x="0" y="2.6" text-anchor="middle">${String(k.id).padStart(2, "0")}</text>
        <g class="klabel" transform="translate(${k.lx || 0},${k.ly || 0})">
          <text class="kname" x="0" y="0" text-anchor="${k.anchor || "middle"}">${esc(k.name)}</text>
          <text class="ksub" x="0" y="${k.subdy || 15}" text-anchor="${k.anchor || "middle"}">${esc(k.dynasty)}</text>
        </g>
      </g>`;
  }).join("");
  container.innerHTML = `
    <div class="map-svg">
      <svg viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="湖北省窑口分布地图">
        <g class="hb-province">${m.paths.map((p) => `<path class="hb-city" d="${p}"></path>`).join("")}</g>
        <g>${regions}</g>
        <g>${cities}</g>
        <g>${kilns}</g>
      </svg>
      <div class="map-tip"></div>
    </div>
    <div class="map-legend">
      ${m.kilns.map((k, i) => {
        const reg = m.regions[i] || m.regions.find((r) => r.kiln_id === k.id);
        return `<a href="#kilns/${k.id}"><i style="background:${reg ? reg.color : ""}"></i>
          <span><b>${esc(k.name)}</b><em>${esc((reg ? reg.county : "") + " · " + k.dynasty)}</em></span></a>`;
      }).join("")}
    </div>
    <div class="map-scale"><b>北 ↑</b><span>比例尺示意</span><span>0 — 100 km</span></div>
    `;
  const tip = $(".map-tip", container);
  const showTip = (pt) => {
    tip.innerHTML = `<b>${pt.dataset.name}</b>${pt.dataset.county} · ${pt.dataset.district} · ${pt.dataset.dynasty}`;
    tip.classList.add("show");
  };
  $$(".kpoint, .kregion", container).forEach((pt) => {
    pt.addEventListener("mouseenter", () => showTip(pt));
    pt.addEventListener("mousemove", (e) => {
      const r = container.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left) + "px";
      tip.style.top = (e.clientY - r.top) + "px";
    });
    pt.addEventListener("mouseleave", () => tip.classList.remove("show"));
    pt.addEventListener("click", () => { location.hash = "#kilns/" + pt.dataset.id; });
    pt.addEventListener("keydown", (e) => { if (e.key === "Enter") location.hash = "#kilns/" + pt.dataset.id; });
  });
}

/* 灯箱 */
const lightbox = $("#lightbox");
function openLightbox(src, caption) {
  if (!src) return;
  $("img", lightbox).src = src;
  $("figcaption", lightbox).textContent = caption || "";
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}
function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
}
$(".lightbox-close", lightbox).addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });

function bindLightbox(root = document) {
  $$(".detail-figure, .gallery figure", root).forEach((fig) => {
    const img = $("img", fig);
    if (!img || !img.src) return;
    fig.addEventListener("click", () => openLightbox(img.src, $("figcaption", fig)?.textContent || ""));
  });
}

/* 回到顶部 + 导航阴影 */
const toTop = $("#to-top");
const masthead = $("#masthead");
window.addEventListener("scroll", () => {
  const y = window.scrollY;
  toTop.classList.toggle("show", y > 700);
  masthead.classList.toggle("scrolled", y > 30);
}, { passive: true });
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ---------------- 首页 ---------------- */
async function viewHome() {
  const [stats, kilns, artifacts, timeline] = await Promise.all([
    api("/api/stats"), api("/api/kilns"), api("/api/artifacts"), api("/api/timeline"),
  ]);
  const heroes = [
    { img: "static/images/ws_ding.jpg", kicker: "战国 · 楚都纪南城", title: "楚陶文化数字馆", sub: "从新石器时代到当代窑火，以数字方式典藏荆楚近七千年制陶记忆。", cta: [{ t: "浏览窑口", h: "#kilns", p: true }, { t: "查询器物", h: "#artifacts" }] },
    { img: "static/images/husig_bowls.jpg", kicker: "两宋 · 湖泗瓷窑址群", title: "湖泗窑：湖北瓷都", sub: "180 余处窑堆、50 万平方米窑场，两宋时期湖北规模最大的制瓷中心。", cta: [{ t: "了解湖泗窑", h: "#kilns/5", p: true }] },
    { img: "static/images/makou_baxian.jpg", kicker: "清代 · 汉川马口窑", title: "铁笔雕花 · 八仙坛", sub: "中国民陶代表，鳝鱼黄釉与铁笔雕花，湖北民间陶艺的独创语言。", cta: [{ t: "走进马口窑", h: "#kilns/2", p: true }] },
  ];
  const slides = heroes.map((h, i) => `
    <div class="hero-slide ${i === 0 ? "active" : ""}" data-i="${i}">
      <div class="bg" style="background-image:url('${vUrl(h.img)}')"></div>
      <div class="hero-content">
        <div class="hero-kicker">${esc(h.kicker)}</div>
        <h1>${esc(h.title)}</h1>
        <p class="sub">${esc(h.sub)}</p>
        <div class="hero-cta">${h.cta.map(c => `<a class="${c.p ? "primary" : ""}" href="${c.h}">${esc(c.t)}</a>`).join("")}</div>
      </div>
    </div>`).join("");
  const dots = heroes.map((_, i) => `<button data-i="${i}" aria-label="第${i + 1}张"></button>`).join("");

  app.innerHTML = `
    <div class="view">
      <section class="hero" id="hero">
        ${slides}
        <div class="hero-dots">${dots}</div>
        <div class="hero-index"><b id="hero-cur">01</b> / 0${heroes.length}</div>
        <div class="scroll-hint"></div>
      </section>
      <div class="marquee">
        <div class="marquee-track">
          ${Array(2).fill(`
            <span>马口窑<em>◆</em>管窑<em>◆</em>蔡家山窑<em>◆</em>湖泗瓷窑址群<em>◆</em>纪南城制陶作坊<em>◆</em>鄂城窑 · 武昌窑<em>◆</em>屈家岭文化<em>◆</em>石家河文化<em>◆</em></span>
          `).join("")}
        </div>
      </div>
      <section class="stats-band">
        <div class="wrap stats-band-inner">
          <div class="stat"><b data-count="${stats.kilns}">0</b><span>窑口资料</span></div>
          <div class="stat"><b data-count="${stats.artifacts}">0</b><span>器物信息</span></div>
          <div class="stat"><b data-count="${stats.timeline}">0</b><span>历史节点</span></div>
          <div class="stat"><b data-count="${stats.sources}">0</b><span>资料来源</span></div>
        </div>
      </section>
      <section class="section">
        <div class="wrap">
          ${sectionHead("窑口总览", "The Kilns", "楚陶窑口上溯楚都纪南城制陶作坊，下及马口、管窑、蔡家山三大民窑与湖泗瓷窑址群。")}
          <div class="region-wrap">
            <div class="region-map reveal">
              <h4>01 — 荆楚窑口分布</h4>
              <div id="home-map"></div>
              <div class="map-extra">
                <b>读图方式</b>
                <div class="map-extra-row"><i>01</i><span>色块 — 窑口所在县（市、区）范围</span></div>
                <div class="map-extra-row"><i>02</i><span>点标 — 窑口真实地理坐标</span></div>
                <div class="map-extra-row"><i>03</i><span>卡片 — 该窑官方馆藏 / 认证代表器物</span></div>
                <p class="map-extra-foot">六件代表器物均经重点博物馆馆藏或官方认证逐条核对，点击可直接查看器物档案。</p>
              </div>
            </div>
            <div class="region-list reveal d1">
              <h4>02 — 窑口清单</h4>
              ${kilns.map((k, i) => regionEntry(k, i)).join("")}
            </div>
          </div>
        </div>
      </section>
      <section class="section alt">
        <div class="wrap">
          ${sectionHead("馆藏器物", "Selected Artifacts", "战国楚陶、民间窑器与湖泗青白瓷，均可通过器物库检索。", true)}
          <div class="grid grid-3">
            ${artifacts.slice(0, 6).map(artifactCard).join("")}
          </div>
          <p style="text-align:center;margin-top:56px" class="reveal"><a class="btn" href="#artifacts">进入器物库</a></p>
        </div>
      </section>
      <section class="section">
        <div class="wrap">
          ${sectionHead("千年窑火", "Timeline", "一条时间线串联荆楚制陶史的关键节点。")}
          <div class="timeline">
            ${timeline.slice(0, 6).map((t, i) => tlCard(t, i)).join("")}
          </div>
          <p style="text-align:center;margin-top:64px" class="reveal"><a class="btn" href="#timeline">查看完整年表</a></p>
        </div>
      </section>
    </div>`;
  startCarousel();
  animateCounts();
  observeReveals();
  renderKilnMap($("#home-map"));
}

function tlCard(t, i = 0) {
  return `
    <div class="tl-item reveal d${i % 3}">
      <div class="tl-card">
        <div class="period">${esc(t.period)}</div>
        <h3>${esc(t.title)}</h3>
        <div class="year">${esc(t.year_label)}</div>
        <p>${esc(t.description)}</p>
        ${t.image ? `<div class="tl-img"><img src="${esc(vUrl(t.image))}" alt="${esc(t.title)}" loading="lazy"></div>` : ""}
      </div>
    </div>`;
}

let carouselTimer = null;
function startCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  const slides = $$(".hero-slide");
  const dots = $$(".hero-dots button");
  const cur = $("#hero-cur");
  if (!slides.length) return;
  let idx = 0;
  const show = (i) => {
    slides.forEach((s, j) => s.classList.toggle("active", j === i));
    dots.forEach((d, j) => d.classList.toggle("active", j === i));
    idx = i;
    if (cur) cur.textContent = String(i + 1).padStart(2, "0");
  };
  dots.forEach((d) => d.addEventListener("click", () => {
    show(+d.dataset.i);
    reset();
  }));
  const reset = () => {
    if (carouselTimer) clearInterval(carouselTimer);
    carouselTimer = setInterval(() => show((idx + 1) % slides.length), 6000);
  };
  reset();
}

/* ---------------- 窑口 ---------------- */
async function viewKilns(params = {}) {
  const kilns = await api("/api/kilns?" + new URLSearchParams(params).toString());
  const cats = [...new Set(kilns.map(k => k.category).filter(Boolean))];
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>窑口</div>
          <h1>窑口总览</h1>
          <div class="sub">${kilns.length} 处窑口与窑址，涵盖楚都作坊、民窑与瓷窑遗址。</div>
        </div>
        <div class="region-wrap reveal" style="margin-bottom:80px">
          <div class="region-map">
            <h4>01 — 荆楚窑口分布</h4>
            <div id="kiln-map"></div>
            <div class="map-extra">
              <b>读图方式</b>
              <div class="map-extra-row"><i>01</i><span>色块 — 窑口所在县（市、区）范围</span></div>
              <div class="map-extra-row"><i>02</i><span>点标 — 窑口真实地理坐标</span></div>
              <div class="map-extra-row"><i>03</i><span>卡片 — 该窑官方馆藏 / 认证代表器物</span></div>
              <p class="map-extra-foot">六件代表器物均经重点博物馆馆藏或官方认证逐条核对，点击可直接查看器物档案。</p>
            </div>
          </div>
          <div class="region-list">
            <h4>02 — 窑口清单</h4>
            ${kilns.map((k, i) => regionEntry(k, i)).join("")}
          </div>
        </div>
        <div class="toolbar">
          <div class="field">
            <label>关键词</label>
            <input id="f-q" placeholder="窑口名称 / 地区 / 描述" value="${esc(params.q || "")}">
          </div>
          <div class="field">
            <label>类别</label>
            <div class="chip-row" id="chip-cat">
              <button class="chip ${!params.category ? "active" : ""}" data-v="">全部</button>
              ${cats.map(c => `<button class="chip ${c === params.category ? "active" : ""}" data-v="${esc(c)}">${esc(c)}</button>`).join("")}
            </div>
          </div>
          <button class="btn accent" id="f-go">查询</button>
          ${params.q || params.category ? `<a class="clear-filters" href="#kilns">清空条件</a>` : ""}
          <span class="count-line">共 ${kilns.length} 处</span>
        </div>
        <div class="grid grid-3">
          ${kilns.map(kilnCard).join("") || `<div class="empty">未找到符合条件的窑口</div>`}
        </div>
      </div>
    </div>`;
  let cat = params.category || "";
  $$("#chip-cat .chip").forEach((chip) => chip.addEventListener("click", () => {
    cat = chip.dataset.v;
    go();
  }));
  const go = () => {
    const p = new URLSearchParams();
    if ($("#f-q").value.trim()) p.set("q", $("#f-q").value.trim());
    if (cat) p.set("category", cat);
    location.hash = "#kilns" + (p.toString() ? "?" + p.toString() : "");
  };
  $("#f-go").addEventListener("click", go);
  $("#f-q").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  observeReveals();
  renderKilnMap($("#kiln-map"));
}

async function viewKiln(id) {
  const k = await api("/api/kilns/" + id);
  const gallery = (k.images || []).slice(1);
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i><a href="#kilns">窑口</a><i>/</i>${esc(k.name)}</div>
          <h1>${esc(k.name)}</h1>
          <div class="sub">${esc(k.alias || "")} · ${esc(k.category || "")}</div>
        </div>
        ${k.representative ? `
          <a class="rep-hero reveal" href="#artifacts/${k.representative.id}">
            <div class="rep-hero-media">
              ${k.representative.image ? `<img src="${esc(vUrl(k.representative.image))}" alt="${esc(k.representative.name)}">` : `<div class="ph">陶</div>`}
            </div>
            <div class="rep-hero-body">
              <div class="label">Official Representative · 官方馆藏代表器物</div>
              <h2>${esc(k.representative.name)}</h2>
              <p class="rep-hero-badge"><i></i>${esc(k.representative_label || "官方馆藏/认证")}</p>
              <p>${esc((k.representative.description || "").slice(0, 120))}……</p>
              <div class="rep-hero-meta">
                <span><b>馆藏 / 认证</b>${esc(k.representative.museum || "官方认证")}</span>
                <span><b>年代</b>${esc(k.representative.dynasty || "")}${k.representative.period ? " · " + esc(k.representative.period) : ""}</span>
                <span><b>类别</b>${esc(k.representative.type || "")}</span>
              </div>
              <span class="more">进入器物档案 →</span>
            </div>
          </a>` : ""}
        <div class="detail-layout">
          <div>
            <figure class="detail-figure reveal">
              ${k.image ? `<img src="${esc(vUrl(k.image))}" alt="${esc(k.name)}">` : `<div class="ph">陶</div>`}
              <figcaption>${esc((k.images && k.images[0] && k.images[0].credit) || "")}</figcaption>
              <span class="zoom-hint">⤢</span>
            </figure>
            ${gallery.length ? `
              <div class="gallery">
                ${gallery.map(i => `<figure class="reveal"><img src="${esc(vUrl(i.src))}" alt="${esc(k.name)}" loading="lazy"><figcaption>${esc(i.credit)}</figcaption></figure>`).join("")}
              </div>` : ""}
          </div>
          <div class="detail-info">
            <h2>窑口档案</h2>
            <table class="info-table">
              <tr><th>名称</th><td>${esc(k.name)}${k.alias ? "（" + esc(k.alias) + "）" : ""}</td></tr>
              <tr><th>位置</th><td>${esc(k.province)}${esc(k.city)}${esc(k.district)}</td></tr>
              <tr><th>年代</th><td>${esc(k.year_start || "")} — ${esc(k.year_end || "")}</td></tr>
              <tr><th>类别</th><td>${esc(k.category)}</td></tr>
              <tr><th>现状</th><td>${esc(k.status || "")}</td></tr>
              <tr><th>殊荣</th><td>${esc(k.honors || "")}</td></tr>
            </table>
            <h2>窑口介绍</h2>
            <p class="lead">${esc(k.intro)}</p>
            <h2>工艺特色</h2>
            <p class="lead">${esc(k.features)}</p>
            <h2>工艺流程</h2>
            <p class="lead">${esc(k.craft)}</p>
          </div>
        </div>
        ${k.artifacts && k.artifacts.length ? `
          <section class="section" style="padding-top:110px">
            ${sectionHead("关联器物", "Related Artifacts", "", true)}
            <div class="grid grid-4">${k.artifacts.map((a, i) => artifactCard({ ...a, kiln_name: k.name }, i)).join("")}</div>
          </section>` : ""}
        <section class="section" style="padding-top:20px">
          ${sectionHead("资料来源", "Sources")}
          ${renderSources(k.sources)}
        </section>
      </div>
    </div>`;
  bindLightbox();
  observeReveals();
}

/* ---------------- 器物 ---------------- */
async function viewArtifacts(params = {}) {
  const [artifacts, stats, kilns] = await Promise.all([
    api("/api/artifacts?" + new URLSearchParams(params).toString()),
    api("/api/stats"), api("/api/kilns"),
  ]);
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>器物</div>
          <h1>器物查询</h1>
          <div class="sub">关键词 + 类型 + 朝代 + 窑口，多条件组合检索楚陶器物。</div>
        </div>
        <div class="toolbar">
          <div class="field">
            <label>关键词</label>
            <input id="f-q" placeholder="器物名 / 馆藏 / 描述" value="${esc(params.q || "")}">
          </div>
          <div class="field">
            <label>类型</label>
            <div class="chip-row" id="chip-type">
              <button class="chip ${!params.type ? "active" : ""}" data-v="">全部</button>
              ${stats.artifact_types.map(t => `<button class="chip ${t === params.type ? "active" : ""}" data-v="${esc(t)}">${esc(t)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label>朝代</label>
            <div class="chip-row" id="chip-dyn">
              <button class="chip ${!params.dynasty ? "active" : ""}" data-v="">全部</button>
              ${stats.dynasties.map(d => `<button class="chip ${d === params.dynasty ? "active" : ""}" data-v="${esc(d)}">${esc(d)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label>窑口</label>
            <div class="chip-row" id="chip-kiln">
              <button class="chip ${!params.kiln ? "active" : ""}" data-v="">全部</button>
              ${kilns.map(k => `<button class="chip ${String(k.id) === String(params.kiln || "") ? "active" : ""}" data-v="${k.id}">${esc(k.name)}</button>`).join("")}
            </div>
          </div>
          <button class="btn accent" id="f-go">查询</button>
          ${params.q || params.type || params.dynasty || params.kiln ? `<a class="clear-filters" href="#artifacts">清空条件</a>` : ""}
          <span class="count-line">共 ${artifacts.length} 件</span>
        </div>
        ${artifacts.length ? `
          <div class="grid grid-4" id="art-grid">
            ${artifacts.slice(0, 12).map(artifactCard).join("")}
          </div>
          ${artifacts.length > 12 ? `<div class="more-wrap"><button class="btn" id="btn-more">加载更多 · 已显示 12 / ${artifacts.length}</button></div>` : ""}
        ` : `<div class="empty">未找到符合条件的器物</div>`}
      </div>
    </div>`;
  let sel = { type: params.type || "", dynasty: params.dynasty || "", kiln: params.kiln || "" };
  const bind = (id, key) => $$(`#${id} .chip`).forEach((chip) => chip.addEventListener("click", () => {
    sel[key] = chip.dataset.v;
    $$(`#${id} .chip`).forEach(c => c.classList.toggle("active", c === chip));
    go();
  }));
  bind("chip-type", "type");
  bind("chip-dyn", "dynasty");
  bind("chip-kiln", "kiln");
  const go = () => {
    const p = new URLSearchParams();
    if ($("#f-q").value.trim()) p.set("q", $("#f-q").value.trim());
    if (sel.type) p.set("type", sel.type);
    if (sel.dynasty) p.set("dynasty", sel.dynasty);
    if (sel.kiln) p.set("kiln", sel.kiln);
    location.hash = "#artifacts" + (p.toString() ? "?" + p.toString() : "");
  };
  $("#f-go").addEventListener("click", go);
  $("#f-q").addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  const btnMore = $("#btn-more");
  if (btnMore) {
    let shown = 12;
    btnMore.addEventListener("click", () => {
      const next = artifacts.slice(shown, shown + 12);
      $("#art-grid").insertAdjacentHTML("beforeend", next.map(artifactCard).join(""));
      shown += next.length;
      if (shown >= artifacts.length) {
        btnMore.textContent = "已全部加载（" + artifacts.length + " 件）";
        btnMore.disabled = true;
        btnMore.style.opacity = ".5";
      } else {
        btnMore.textContent = "加载更多 · 已显示 " + shown + " / " + artifacts.length;
      }
      observeReveals();
    });
  }
  observeReveals();
}

async function viewArtifact(id) {
  const a = await api("/api/artifacts/" + id);
  const rows = [
    ["名称", a.name + (a.alias ? "（" + a.alias + "）" : "")],
    ["类型", a.type],
    ["朝代", a.dynasty + " · " + a.period],
    ["窑口", a.kiln ? `<a href="#kilns/${a.kiln.id}" style="border-bottom:1px solid var(--line-2)">${esc(a.kiln.name)}</a>` : "—"],
    ["馆藏", a.museum || "—"],
    ["出土", a.excavated || "—"],
    ["材质", a.material || "—"],
    ["工艺", a.technique || "—"],
    ["尺寸", a.dimensions || "—"],
  ];
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i><a href="#artifacts">器物</a><i>/</i>${esc(a.name)}</div>
          <h1>${esc(a.name)}</h1>
          <div class="sub">${esc(a.type || "")} · ${esc(a.dynasty || "")}</div>
        </div>
        <div class="detail-layout">
          <figure class="detail-figure reveal">
            ${a.image ? `<img src="${esc(vUrl(a.image))}" alt="${esc(a.name)}">` : `<div class="ph" style="aspect-ratio:4/3">陶</div>`}
            <figcaption>${esc(a.image_credit || "")}</figcaption>
            ${a.image ? `<span class="zoom-hint">⤢</span>` : ""}
          </figure>
          <div class="detail-info">
            <h2>器物档案</h2>
            <table class="info-table">
              ${rows.map(([th, td]) => `<tr><th>${esc(th)}</th><td>${td}</td></tr>`).join("")}
            </table>
            <h2>器物介绍</h2>
            <p class="lead">${esc(a.description)}</p>
            ${renderSources(a.sources)}
          </div>
        </div>
      </div>
    </div>`;
  bindLightbox();
  observeReveals();
}

/* ---------------- 年表 / 来源 / 关于 / 搜索 ---------------- */
async function viewTimeline() {
  const timeline = await api("/api/timeline");
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>历史年表</div>
          <h1>历史年表</h1>
          <div class="sub">从城背溪文化到当代楚陶复兴，13 个关键节点。</div>
        </div>
        <div class="timeline">
          ${timeline.map((t, i) => tlCard(t, i)).join("")}
        </div>
      </div>
    </div>`;
  observeReveals();
}

async function viewSources() {
  const sources = await api("/api/sources");
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>资料来源</div>
          <h1>资料来源</h1>
          <div class="sub">全部文字资料均来自以下公开网络来源，图片版权归原作者或媒体所有。</div>
        </div>
        <div class="reveal">
          <table class="sources-table">
            <thead><tr><th>#</th><th>标题</th><th>发布方</th><th>日期</th><th>链接</th></tr></thead>
            <tbody>
              ${sources.map(s => `
                <tr>
                  <td>${String(s.id).padStart(2, "0")}</td>
                  <td>${esc(s.title)}</td>
                  <td>${esc(s.publisher)}</td>
                  <td>${esc(s.date)}</td>
                  <td><a href="${esc(s.url)}" target="_blank" rel="noopener">打开 ↗</a></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  observeReveals();
}

async function viewAbout() {
  const stats = await api("/api/stats");
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>关于本站</div>
          <h1>关于本站</h1>
        </div>
        <div class="about-panel reveal">
          <h2>楚陶是什么</h2>
          <p>楚陶是荆楚地区陶器的总称。考古表明，湖北自新石器时代起就生产陶器，城背溪、大溪、屈家岭、石家河文化遗址中均发现红陶、黑陶、灰陶生活器具。东周楚都纪南城内外窑址成排，轮制模制并用；明清以降，马口窑、管窑、蔡家山窑三大民窑使湖北民间陶走进千家万户；两宋时期的湖泗瓷窑址群则是湖北本土制瓷的唯一高潮。</p>
          <h2>数据与查询</h2>
          <p>本站数据全部入库（SQLite），包含 ${stats.kilns} 个窑口/窑址、${stats.artifacts} 条器物信息、${stats.timeline} 个历史节点与 ${stats.sources} 条资料来源。前端通过 JSON API 检索，支持关键词、类型、朝代、窑口多条件组合查询。</p>
          <h2>资料与版权说明</h2>
          <div class="notice">
            <p>1. 文字资料来自公开网络来源，详见“资料来源”页，仅作文化展示与学习研究用途。</p>
            <p>2. 图片分别来自 Wikimedia Commons（CC0 / CC BY-SA 4.0）与新华网、湖北日报、荆楚网、人民网、中国网、中新网等媒体的公开配图，版权归原作者或媒体所有。</p>
            <p>3. 本站为演示项目，不用于商业用途；如涉及版权问题，请联系删除或替换。</p>
          </div>
          <h2>设计参考</h2>
          <p>视觉语言参考高端品牌网站（Cartier、Aesop、Apple）的简约克制：纸白底色、墨色文字、朱砂与暗金点睛；信息架构参考故宫数字文物库与景德镇陶瓷类网站的“分类—检索—详情”逻辑。</p>
        </div>
      </div>
    </div>`;
  observeReveals();
}

async function viewSearch(q) {
  const data = await api("/api/search?q=" + encodeURIComponent(q));
  app.innerHTML = `
    <div class="view">
      <div class="wrap">
        <div class="page-title reveal">
          <div class="breadcrumb"><a href="#home">首页</a><i>/</i>搜索</div>
          <h1>“${esc(q)}”</h1>
          <div class="sub">窑口 ${data.kilns.length} 项 · 器物 ${data.artifacts.length} 项</div>
        </div>
        <section class="section" style="padding:40px 0 90px">
          ${sectionHead("匹配窑口", "Kilns")}
          <div class="grid grid-3">${data.kilns.map(kilnCard).join("") || `<div class="empty">未找到匹配窑口</div>`}</div>
        </section>
        <section class="section alt" style="padding-top:90px">
          <div class="wrap">
            ${sectionHead("匹配器物", "Artifacts", "", true)}
            ${data.artifacts.length ? `
              <div class="grid grid-4" id="search-grid">
                ${data.artifacts.slice(0, 12).map(artifactCard).join("")}
              </div>
              ${data.artifacts.length > 12 ? `<div class="more-wrap"><button class="btn" id="btn-search-more">加载更多 · 已显示 12 / ${data.artifacts.length}</button></div>` : ""}
            ` : `<div class="empty">未找到匹配器物</div>`}
          </div>
        </section>
      </div>
    </div>`;
  const btnMore = $("#btn-search-more");
  if (btnMore) {
    let shown = 12;
    btnMore.addEventListener("click", () => {
      const next = data.artifacts.slice(shown, shown + 12);
      $("#search-grid").insertAdjacentHTML("beforeend", next.map(artifactCard).join(""));
      shown += next.length;
      if (shown >= data.artifacts.length) {
        btnMore.textContent = "已全部加载（" + data.artifacts.length + " 件）";
        btnMore.disabled = true;
      } else {
        btnMore.textContent = "加载更多 · 已显示 " + shown + " / " + data.artifacts.length;
      }
      observeReveals();
    });
  }
  observeReveals();
}

function renderSources(sources) {
  if (!sources || !sources.length) return "";
  return `
    <h2>资料来源</h2>
    <ul class="source-list">
      ${sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> <span class="pub">— ${esc(s.publisher)} ${esc(s.date)}</span></li>`).join("")}
    </ul>`;
}

/* ---------------- 路由 ---------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(queryPart || ""));
  const segs = pathPart.split("/").filter(Boolean);
  return { segs, params };
}

async function route() {
  const { segs, params } = parseHash();
  $$(".mainnav a").forEach(a => a.classList.remove("active"));
  const active = ["kilns", "artifacts", "timeline", "sources"].includes(segs[0]) ? segs[0] : "home";
  const link = $(`.mainnav a[data-nav="${active}"]`);
  if (link) link.classList.add("active");

  app.innerHTML = `<div class="boot"><span>正在点亮窑火</span></div>`;
  window.scrollTo({ top: 0 });
  try {
    if (segs[0] === "kilns" && segs[1]) await viewKiln(segs[1]);
    else if (segs[0] === "kilns") await viewKilns(params);
    else if (segs[0] === "artifacts" && segs[1]) await viewArtifact(segs[1]);
    else if (segs[0] === "artifacts") await viewArtifacts(params);
    else if (segs[0] === "timeline") await viewTimeline();
    else if (segs[0] === "sources") await viewSources();
    else if (segs[0] === "about") await viewAbout();
    else if (segs[0] === "search") await viewSearch(params.q || "");
    else await viewHome();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="empty">加载失败：${esc(err.message)}<br><br><a href="#" id="retry-load" style="border-bottom:1px solid var(--ink)">重新加载</a>&nbsp;&nbsp;&nbsp;<a href="#home" style="border-bottom:1px solid var(--ink)">返回首页</a></div>`;
    const retryBtn = $("#retry-load");
    if (retryBtn) retryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      location.replace(location.pathname + "?r=" + Date.now() + (location.hash || ""));
    });
  }
  scheduleRevealFallback();
}

$("#global-search").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#global-q").value.trim();
  if (!q) return;
  location.hash = "#search?q=" + encodeURIComponent(q);
});

window.addEventListener("hashchange", route);
route();
