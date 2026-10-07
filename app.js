const SNAPSHOT_URL = "./data/snapshot.json";
const GAP_STORAGE_KEY = "stockman-gap-simulator-v1";

const FALLBACK = {
  meta: {
    product: "Stock man",
    mode: "DEMO",
    snapshotType: "FALLBACK_FIXTURE",
    generatedAt: "2026-10-07T16:13:00+09:00",
    nextReviewAt: "2026-10-08T08:45:00+09:00",
    marketSession: "POST_CLOSE",
    disclaimer: "Fallback demo fixture — not live market data."
  },
  marketRegime: {
    status: "NEUTRAL",
    score: 54,
    confidence: "LOW",
    note: "Snapshot fetch failed. Showing embedded fallback data.",
    indicators: []
  },
  candidates: [
    ["3723","日本ファルコム","S",86,"引け後の大幅上方修正＋大幅増配"],
    ["2670","ABCマート","A",74,"通期経常利益を上方修正、最高益予想を上乗せ"],
    ["6814","古野電気","A",71,"上方修正後も出来高を伴って続伸"],
    ["3498","霞ヶ関キャピタル","B",66,"好決算後の強いリバウンド＋モメンタム"],
    ["6871","日本マイクロニクス","B",63,"半導体モメンタム継続候補"]
  ].map(([code,name,rank,predictionScore,catalyst]) => ({
    code,name,rank,predictionScore,catalyst,price:null,changePct:null,
    freshness:"STALE",
    dataUpdatedAt:"2026-10-07T16:13:00+09:00",
    components:{catalyst:0,momentum:0,volume:0,relativeStrength:0,orderFlow:0,marketRegime:54},
    whyBuy:["詳細データファイルを再取得してください。"],
    whyNotBuy:["フォールバック表示のため、この状態で売買判断に使用しないでください。"],
    entryCondition:"PENDING",
    invalidation:"PENDING",
    targetLogic:"PENDING",
    riskReward:"PENDING"
  }))
};

const componentLabels = {
  catalyst: "Catalyst",
  momentum: "Momentum",
  volume: "Volume",
  relativeStrength: "Relative Strength",
  orderFlow: "Order Flow",
  marketRegime: "Market Regime"
};

const state = {
  data: null,
  gaps: loadGaps(),
  rankFilter: "ALL",
  sortMode: "trade",
  fallbackUsed: false
};

const els = {
  modeBadge: document.querySelector("#modeBadge"),
  refreshButton: document.querySelector("#refreshButton"),
  marketSession: document.querySelector("#marketSession"),
  updatedAt: document.querySelector("#updatedAt"),
  nextReviewAt: document.querySelector("#nextReviewAt"),
  freshnessStatus: document.querySelector("#freshnessStatus"),
  freshnessBanner: document.querySelector("#freshnessBanner"),
  regimeStatus: document.querySelector("#regimeStatus"),
  regimeScore: document.querySelector("#regimeScore"),
  regimeNote: document.querySelector("#regimeNote"),
  marketIndicators: document.querySelector("#marketIndicators"),
  candidateList: document.querySelector("#candidateList"),
  simulatorList: document.querySelector("#simulatorList"),
  rankFilter: document.querySelector("#rankFilter"),
  sortMode: document.querySelector("#sortMode"),
  resetSimulator: document.querySelector("#resetSimulator"),
  detailDialog: document.querySelector("#detailDialog"),
  detailContent: document.querySelector("#detailContent"),
  closeDialog: document.querySelector("#closeDialog")
};

function loadGaps() {
  try {
    return JSON.parse(localStorage.getItem(GAP_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveGaps() {
  localStorage.setItem(GAP_STORAGE_KEY, JSON.stringify(state.gaps));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function gapPenalty(gapPct) {
  const gap = Number(gapPct) || 0;
  if (gap <= -10) return 18;
  if (gap <= -6) return 8;
  if (gap <= 3) return 0;
  return Math.min(35, Math.round((gap - 3) * 1.7));
}

function adjustedTradeScore(candidate) {
  const gap = Number(state.gaps[candidate.code] ?? 0);
  return clamp(Math.round(candidate.predictionScore - gapPenalty(gap)), 0, 100);
}

function rankFromScore(score, gap = 0) {
  if (gap >= 20 || gap <= -10) return "NO TRADE";
  if (score >= 80) return "S";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  return "NO TRADE";
}

function displayRank(candidate) {
  const gap = Number(state.gaps[candidate.code] ?? 0);
  return rankFromScore(adjustedTradeScore(candidate), gap);
}

function safeText(value, fallback = "Unavailable") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d) + " JST";
}

function ageHours(iso) {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return Infinity;
  return (Date.now() - ts) / 36e5;
}

function freshnessLabel() {
  if (!state.data) return { label: "UNKNOWN", tone: "stale" };
  if (state.data.meta?.mode === "DEMO") return { label: "DEMO SNAPSHOT", tone: "demo" };
  const hours = ageHours(state.data.meta?.generatedAt);
  if (hours <= 1) return { label: "LIVE / RECENT", tone: "live" };
  if (hours <= 12) return { label: "RECENT", tone: "recent" };
  return { label: "STALE", tone: "stale" };
}

async function loadSnapshot(force = false) {
  els.refreshButton.disabled = true;
  els.refreshButton.textContent = "Loading…";
  try {
    const url = force ? `${SNAPSHOT_URL}?t=${Date.now()}` : SNAPSHOT_URL;
    const response = await fetch(url, { cache: force ? "no-store" : "default" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.fallbackUsed = false;
  } catch (error) {
    console.warn("Snapshot load failed:", error);
    state.data = structuredClone(FALLBACK);
    state.fallbackUsed = true;
  } finally {
    els.refreshButton.disabled = false;
    els.refreshButton.textContent = "Refresh snapshot";
    renderAll();
  }
}

function renderMeta() {
  const { meta } = state.data;
  const freshness = freshnessLabel();

  els.modeBadge.textContent = meta.mode || "UNKNOWN";
  els.marketSession.textContent = safeText(meta.marketSession, "—");
  els.updatedAt.textContent = formatDateTime(meta.generatedAt);
  els.nextReviewAt.textContent = formatDateTime(meta.nextReviewAt);
  els.freshnessStatus.textContent = freshness.label;

  const isStale = freshness.tone === "stale";
  const showBanner = state.fallbackUsed || isStale || meta.mode === "DEMO";
  els.freshnessBanner.classList.toggle("hidden", !showBanner);

  if (state.fallbackUsed) {
    els.freshnessBanner.textContent = "Snapshot fetch failed. Embedded fallback data is displayed. Do not use it as live market data.";
  } else if (meta.mode === "DEMO") {
    els.freshnessBanner.textContent = "DEMO DATA — これはライブ市場データではありません。UI・分析ロジック検証用スナップショットです。";
  } else if (isStale) {
    els.freshnessBanner.textContent = "STALE DATA — データが古いため、スコアを売買判断に使用しないでください。";
  }
}

function renderMarket() {
  const regime = state.data.marketRegime || {};
  els.regimeStatus.textContent = safeText(regime.status, "UNKNOWN");
  els.regimeScore.textContent = Number.isFinite(regime.score) ? regime.score : "—";
  els.regimeNote.textContent = safeText(regime.note, "No regime note.");

  const indicators = regime.indicators || [];
  els.marketIndicators.innerHTML = indicators.length
    ? indicators.map(item => `
      <div class="indicator">
        <small>${escapeHtml(item.name)}</small>
        <strong class="state-${String(item.state || "unavailable").toLowerCase()}">
          ${item.value === null || item.value === undefined ? escapeHtml(item.state || "UNAVAILABLE") : escapeHtml(String(item.value))}
        </strong>
      </div>`).join("")
    : '<div class="empty">Market indicators unavailable.</div>';
}

function candidateViewModels() {
  const list = (state.data.candidates || []).map(candidate => ({
    ...candidate,
    gap: Number(state.gaps[candidate.code] ?? 0),
    tradeScore: adjustedTradeScore(candidate),
    displayRank: displayRank(candidate)
  }));

  const filtered = state.rankFilter === "ALL"
    ? list
    : list.filter(item => item.displayRank === state.rankFilter);

  return filtered.sort((a, b) => {
    if (state.sortMode === "prediction") return b.predictionScore - a.predictionScore;
    if (state.sortMode === "code") return a.code.localeCompare(b.code, "ja");
    return b.tradeScore - a.tradeScore;
  });
}

function rankClass(rank) {
  return "rank-" + rank.replaceAll(" ", "-");
}

function renderCandidates() {
  const list = candidateViewModels();

  if (!list.length) {
    els.candidateList.innerHTML = '<div class="empty">この条件に該当する候補はありません。</div>';
    return;
  }

  els.candidateList.innerHTML = list.map(c => {
    const changeClass = c.changePct > 0 ? "positive" : c.changePct < 0 ? "negative" : "";
    const changeText = c.changePct === null || c.changePct === undefined ? "—" : `${c.changePct > 0 ? "+" : ""}${c.changePct}%`;
    return `
      <article class="candidate-card">
        <div class="rank-badge ${rankClass(c.displayRank)}">${escapeHtml(c.displayRank)}</div>
        <div class="stock-id">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.code)} · ¥${formatNumber(c.price)} · <span class="${changeClass}">${changeText}</span></span>
        </div>
        <div class="catalyst">
          <strong title="${escapeHtml(c.catalyst)}">${escapeHtml(c.catalyst)}</strong>
          <small>${escapeHtml(c.freshness || "UNKNOWN")} · Gap simulator ${c.gap >= 0 ? "+" : ""}${c.gap}%</small>
        </div>
        <div class="score-block prediction">
          <small>Prediction</small>
          <strong>${c.predictionScore}</strong>
        </div>
        <div class="score-block trade">
          <small>Trade</small>
          <strong>${c.tradeScore}</strong>
        </div>
        <button class="button button-secondary details-button" data-detail="${escapeHtml(c.code)}" type="button">Details</button>
      </article>
    `;
  }).join("");

  els.candidateList.querySelectorAll("[data-detail]").forEach(button => {
    button.addEventListener("click", () => openDetail(button.dataset.detail));
  });
}

function renderSimulator() {
  const list = [...(state.data.candidates || [])].sort((a, b) => b.predictionScore - a.predictionScore);

  els.simulatorList.innerHTML = list.map(c => {
    const gap = Number(state.gaps[c.code] ?? 0);
    const penalty = gapPenalty(gap);
    const tradeScore = adjustedTradeScore(c);
    const rank = rankFromScore(tradeScore, gap);
    return `
      <div class="sim-row">
        <div class="sim-stock">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.code)} · Prediction ${c.predictionScore}</span>
        </div>
        <label class="gap-input-wrap" aria-label="${escapeHtml(c.name)} gap percentage">
          <input data-gap="${escapeHtml(c.code)}" type="number" min="-30" max="50" step="0.5" value="${gap}" />
          <span>%</span>
        </label>
        <div class="penalty-meter" title="Gap penalty: ${penalty}">
          <i style="width:${Math.min(100, penalty / 35 * 100)}%"></i>
        </div>
        <div class="sim-score">
          <small>Trade</small>
          <strong>${tradeScore}</strong>
        </div>
        <div class="rank-badge ${rankClass(rank)}">${escapeHtml(rank)}</div>
      </div>
    `;
  }).join("");

  els.simulatorList.querySelectorAll("[data-gap]").forEach(input => {
    input.addEventListener("input", event => {
      const code = event.target.dataset.gap;
      const raw = Number(event.target.value);
      state.gaps[code] = Number.isFinite(raw) ? clamp(raw, -30, 50) : 0;
      saveGaps();
      renderSimulator();
      renderCandidates();
    });
  });
}

function openDetail(code) {
  const c = (state.data.candidates || []).find(item => item.code === code);
  if (!c) return;

  const gap = Number(state.gaps[c.code] ?? 0);
  const tradeScore = adjustedTradeScore(c);
  const rank = rankFromScore(tradeScore, gap);
  const penalty = gapPenalty(gap);

  const breakdown = Object.entries(c.components || {}).map(([key, value]) => `
    <div class="break-row">
      <span>${escapeHtml(componentLabels[key] || key)}</span>
      <div class="bar"><i style="width:${clamp(Number(value) || 0,0,100)}%"></i></div>
      <b>${Number(value) || 0}</b>
    </div>
  `).join("");

  const buyItems = (c.whyBuy || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const bearItems = (c.whyNotBuy || []).map(item => `<li>${escapeHtml(item)}</li>`).join("");

  els.detailContent.innerHTML = `
    <div class="detail-header">
      <span class="code">${escapeHtml(c.code)} · ${escapeHtml(c.exchange || "TSE")}</span>
      <h2>${escapeHtml(c.name)}</h2>
      <p class="muted">${escapeHtml(c.catalyst)}</p>
    </div>

    <div class="detail-score-row">
      <div class="metric-card">
        <small>Prediction</small>
        <strong>${c.predictionScore}</strong>
      </div>
      <div class="metric-card">
        <small>Trade</small>
        <strong class="positive">${tradeScore}</strong>
      </div>
      <div class="metric-card">
        <small>Rank</small>
        <strong>${escapeHtml(rank)}</strong>
      </div>
    </div>

    <div class="metric-card">
      <small>Premarket adjustment</small>
      <strong style="font-size:16px">${gap >= 0 ? "+" : ""}${gap}% gap → -${penalty} pts</strong>
    </div>

    <div class="breakdown">${breakdown}</div>

    <div class="dual-case">
      <section class="case buy">
        <h3>WHY BUY</h3>
        <ul>${buyItems}</ul>
      </section>
      <section class="case bear">
        <h3>WHY NOT BUY</h3>
        <ul>${bearItems}</ul>
      </section>
    </div>

    <div class="trade-plan">
      <div class="plan-row"><small>Entry condition</small><p>${escapeHtml(safeText(c.entryCondition))}</p></div>
      <div class="plan-row"><small>Invalidation</small><p>${escapeHtml(safeText(c.invalidation))}</p></div>
      <div class="plan-row"><small>Target logic</small><p>${escapeHtml(safeText(c.targetLogic))}</p></div>
      <div class="plan-row"><small>Data updated</small><p>${escapeHtml(formatDateTime(c.dataUpdatedAt))}</p></div>
    </div>
  `;

  if (typeof els.detailDialog.showModal === "function") {
    els.detailDialog.showModal();
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function renderAll() {
  if (!state.data) return;
  renderMeta();
  renderMarket();
  renderCandidates();
  renderSimulator();
}

els.rankFilter.addEventListener("change", event => {
  state.rankFilter = event.target.value;
  renderCandidates();
});

els.sortMode.addEventListener("change", event => {
  state.sortMode = event.target.value;
  renderCandidates();
});

els.refreshButton.addEventListener("click", () => loadSnapshot(true));

els.resetSimulator.addEventListener("click", () => {
  state.gaps = {};
  saveGaps();
  renderSimulator();
  renderCandidates();
});

els.closeDialog.addEventListener("click", () => els.detailDialog.close());

els.detailDialog.addEventListener("click", event => {
  if (event.target === els.detailDialog) els.detailDialog.close();
});

loadSnapshot();
