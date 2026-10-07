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
  fallbackUsed: false,
  beginnerMode: localStorage.getItem("stockman-beginner-mode") !== "off",
  liveConfig: loadLiveConfig(),
  livePayload: null,
  riskConfig: loadRiskConfig()
};

const els = {
  modeBadge: document.querySelector("#modeBadge"),
  connectionButton: document.querySelector("#connectionButton"),
  liveConnectionPanel: document.querySelector("#liveConnectionPanel"),
  liveConnectionStatus: document.querySelector("#liveConnectionStatus"),
  liveConnectionMessage: document.querySelector("#liveConnectionMessage"),
  backendUrlInput: document.querySelector("#backendUrlInput"),
  stockmanKeyInput: document.querySelector("#stockmanKeyInput"),
  saveConnectionButton: document.querySelector("#saveConnectionButton"),
  clearConnectionButton: document.querySelector("#clearConnectionButton"),
  capitalInput: document.querySelector("#capitalInput"),
  riskPctInput: document.querySelector("#riskPctInput"),
  stopPctInput: document.querySelector("#stopPctInput"),
  riskCandidateSelect: document.querySelector("#riskCandidateSelect"),
  riskResults: document.querySelector("#riskResults"),
  uxModeButton: document.querySelector("#uxModeButton"),
  beginnerGuide: document.querySelector("#beginnerGuide"),
  termHelp: document.querySelector("#termHelp"),
  dataSourceStatus: document.querySelector("#dataSourceStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  marketSession: document.querySelector("#marketSession"),
  updatedAt: document.querySelector("#updatedAt"),
  nextReviewAt: document.querySelector("#nextReviewAt"),
  freshnessStatus: document.querySelector("#freshnessStatus"),
  freshnessBanner: document.querySelector("#freshnessBanner"),
  tradeReadiness: document.querySelector("#tradeReadiness"),
  tradeReadinessLabel: document.querySelector("#tradeReadinessLabel"),
  tradeReadinessMessage: document.querySelector("#tradeReadinessMessage"),
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


const LIVE_CONFIG_KEY = "stockman-private-daily-v1";
const RISK_CONFIG_KEY = "stockman-risk-v1";

function loadLiveConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVE_CONFIG_KEY) || "{}");
    return { endpoint: parsed.endpoint || "", key: parsed.key || "" };
  } catch {
    return { endpoint: "", key: "" };
  }
}

function saveLiveConfig() {
  localStorage.setItem(LIVE_CONFIG_KEY, JSON.stringify(state.liveConfig));
}

function loadRiskConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RISK_CONFIG_KEY) || "{}");
    return {
      capital: Number(parsed.capital) || 0,
      riskPct: Number(parsed.riskPct) || 1,
      stopPct: Number(parsed.stopPct) || 3,
      code: parsed.code || ""
    };
  } catch {
    return { capital: 0, riskPct: 1, stopPct: 3, code: "" };
  }
}

function saveRiskConfig() {
  localStorage.setItem(RISK_CONFIG_KEY, JSON.stringify(state.riskConfig));
}

function normalizeEndpoint(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function connectLiveData(showMessage = true) {
  const endpoint = normalizeEndpoint(state.liveConfig.endpoint);
  const key = String(state.liveConfig.key || "").trim();
  if (!endpoint || !key) {
    setConnectionState("未接続", "Backend URLとアクセスキーを設定してください。", "idle");
    return false;
  }

  setConnectionState("接続中", "J-Quants日次データを確認しています…", "loading");

  const codes = (state.data?.candidates || []).map(c => c.code).join(",");
  try {
    const url = new URL(endpoint);
    url.searchParams.set("codes", codes);
    url.searchParams.set("days", "90");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { "X-Stockman-Key": key, "Accept": "application/json" },
      cache: "no-store"
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || ("HTTP " + response.status));

    state.livePayload = payload;
    mergeLivePayload(payload);
    renderAll();

    if (payload.usableForNextDayDecision) {
      setConnectionState(
        "日次接続済み",
        "J-Quantsの日次データを取得しました。最新取引日: " + (payload.latestTradingDate || "—") +
        "。場中リアルタイムではないため、注文前は証券アプリの現在値・板も確認してください。",
        "ok"
      );
    } else {
      setConnectionState(
        "古いデータ",
        "接続には成功しましたが、返ってきた最新日付が古いため、翌営業日の判断には使用しません。J-Quantsのプラン/更新状況を確認してください。",
        "warn"
      );
    }
    return true;
  } catch (error) {
    console.error(error);
    state.livePayload = null;
    setConnectionState("接続エラー", "接続できません: " + String(error.message || error), "error");
    if (showMessage) renderAll();
    return false;
  }
}

function mergeLivePayload(payload) {
  if (!payload || !Array.isArray(payload.candidates) || !state.data) return;
  const byCode = new Map(payload.candidates.map(item => [String(item.code).slice(0,4), item]));

  state.data.candidates = (state.data.candidates || []).map(candidate => {
    const live = byCode.get(String(candidate.code).slice(0,4));
    if (!live || !live.latest) return candidate;
    return {
      ...candidate,
      price: live.latest.close,
      changePct: live.latest.changePct,
      candles: Array.isArray(live.candles) ? live.candles : candidate.candles,
      marketMetrics: live.metrics || {},
      freshness: live.freshness || payload.freshness || "DAILY",
      dataUpdatedAt: (live.latest.date || payload.latestTradingDate) + "T15:30:00+09:00"
    };
  });

  const status = payload.usableForNextDayDecision ? "DAILY" : "STALE";
  state.data.meta.mode = payload.usableForNextDayDecision ? "LIVE DAILY" : "STALE DAILY";
  state.data.meta.generatedAt = payload.generatedAt || state.data.meta.generatedAt;
  state.data.meta.marketSession = "DAILY_CLOSE_DATA";

  const sources = state.data.dataSources || [];
  for (const source of sources) {
    if (source.label === "株価" || source.label === "ローソク足") {
      source.status = status;
      source.note = "J-Quants " + (payload.latestTradingDate || "");
    }
  }
}

function setConnectionState(label, message, tone) {
  if (els.liveConnectionStatus) {
    els.liveConnectionStatus.textContent = label;
    els.liveConnectionStatus.className = "pill connection-status status-" + tone;
  }
  if (els.liveConnectionMessage) {
    els.liveConnectionMessage.textContent = message;
    els.liveConnectionMessage.className = "connection-message connection-" + tone;
  }
  if (els.connectionButton) {
    els.connectionButton.textContent = label === "日次接続済み" ? "日次接続済み" : "日次データ接続";
  }
}

function marketMetricCards(candidate) {
  const m = candidate.marketMetrics;
  if (!m || Object.keys(m).length === 0) {
    return '<div class="empty">実日足を接続すると、5日騰落・RSI・出来高倍率などを表示します。</div>';
  }

  const card = (label, value, hint, tone="") => `
    <div class="technical-card ${tone}">
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(hint)}</span>
    </div>`;

  const fmtPct = v => Number.isFinite(Number(v)) ? (Number(v) > 0 ? "+" : "") + Number(v).toFixed(1) + "%" : "—";
  const rsi = Number(m.rsi14);
  const rsiHint = !Number.isFinite(rsi) ? "データ不足" : rsi >= 70 ? "過熱に注意" : rsi <= 30 ? "売られすぎ圏" : "中立〜健全";
  const rvol = Number(m.relativeVolume20);
  const rvolHint = !Number.isFinite(rvol) ? "データ不足" : rvol >= 1.5 ? "売買がかなり活発" : rvol >= 1 ? "平均以上" : "平均未満";

  return `
    <div class="technical-grid">
      ${card("5日間", fmtPct(m.return5dPct), "短期の値動き")}
      ${card("20日間", fmtPct(m.return20dPct), "中期の値動き")}
      ${card("RSI", Number.isFinite(rsi) ? rsi.toFixed(1) : "—", rsiHint, rsi >= 70 ? "warn" : "")}
      ${card("出来高倍率", Number.isFinite(rvol) ? rvol.toFixed(2) + "×" : "—", rvolHint)}
      ${card("20日線", m.aboveSma20 === true ? "上" : m.aboveSma20 === false ? "下" : "—", "終値が20日平均より" + (m.aboveSma20 === true ? "強い" : m.aboveSma20 === false ? "弱い" : "不明"))}
      ${card("20日高値まで", fmtPct(m.distanceTo20dHighPct), "0%に近いほど高値圏")}
    </div>`;
}

function renderRiskCenter() {
  if (!els.riskCandidateSelect || !state.data) return;
  const candidates = state.data.candidates || [];
  const existing = els.riskCandidateSelect.value || state.riskConfig.code;
  els.riskCandidateSelect.innerHTML = candidates.map(c =>
    `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)} ${escapeHtml(c.name)}</option>`
  ).join("");

  const selectedCode = candidates.some(c => c.code === existing) ? existing : (candidates[0]?.code || "");
  els.riskCandidateSelect.value = selectedCode;
  state.riskConfig.code = selectedCode;

  if (els.capitalInput && document.activeElement !== els.capitalInput) {
    els.capitalInput.value = state.riskConfig.capital || "";
  }
  if (els.riskPctInput && document.activeElement !== els.riskPctInput) {
    els.riskPctInput.value = state.riskConfig.riskPct;
  }
  if (els.stopPctInput && document.activeElement !== els.stopPctInput) {
    els.stopPctInput.value = state.riskConfig.stopPct;
  }

  const candidate = candidates.find(c => c.code === selectedCode);
  const capital = Number(state.riskConfig.capital);
  const riskPct = Number(state.riskConfig.riskPct);
  const stopPct = Number(state.riskConfig.stopPct);
  const price = Number(candidate?.price);

  if (!capital || !Number.isFinite(price) || price <= 0) {
    els.riskResults.innerHTML = `
      <div class="empty">${!capital ? "運用資金を入力してください。" : "実株価を接続すると、この銘柄の資金管理を計算できます。"}</div>`;
    return;
  }

  const riskBudget = capital * riskPct / 100;
  const stopPerShare = price * stopPct / 100;
  const sharesByRisk = stopPerShare > 0 ? Math.floor(riskBudget / stopPerShare) : 0;
  const sharesByCash = Math.floor(capital / price);
  const maxShares = Math.max(0, Math.min(sharesByRisk, sharesByCash));
  const standardLotCost = price * 100;
  const canBuyStandardLot = capital >= standardLotCost && sharesByRisk >= 100;
  const standardRisk = stopPerShare * 100;

  const yen = value => "¥" + Math.round(value).toLocaleString("ja-JP");

  els.riskResults.innerHTML = `
    <div class="risk-result-card"><small>この1回で許容する損失</small><strong>${yen(riskBudget)}</strong><span>資金 × ${riskPct}%</span></div>
    <div class="risk-result-card"><small>想定ストップ1株あたり</small><strong>${yen(stopPerShare)}</strong><span>株価 ${yen(price)} × ${stopPct}%</span></div>
    <div class="risk-result-card"><small>100株に必要な現金</small><strong>${yen(standardLotCost)}</strong><span>${capital >= standardLotCost ? "現金面では到達" : "運用資金を超えます"}</span></div>
    <div class="risk-result-card ${canBuyStandardLot ? "risk-ok" : "risk-warn"}"><small>通常100株単元</small><strong>${canBuyStandardLot ? "条件内" : "条件外"}</strong><span>100株で想定損失 ${yen(standardRisk)}</span></div>
    <div class="risk-result-card"><small>単元未満での参考上限</small><strong>${maxShares}株</strong><span>資金と損失上限の小さい方</span></div>
  `;
}

function syncRiskInputs() {
  if (!els.capitalInput) return;
  state.riskConfig.capital = Number(els.capitalInput.value) || 0;
  state.riskConfig.riskPct = clamp(Number(els.riskPctInput.value) || 1, 0.1, 5);
  state.riskConfig.stopPct = clamp(Number(els.stopPctInput.value) || 3, 0.5, 20);
  state.riskConfig.code = els.riskCandidateSelect.value || state.riskConfig.code;
  saveRiskConfig();
  renderRiskCenter();
}

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
    const decision = decisionState(c);
    const predictionLabel = state.beginnerMode ? "上がりやすさ" : "Prediction";
    const tradeLabel = state.beginnerMode ? "今の入りやすさ" : "Trade";
    return `
      <article class="candidate-card">
        <div class="rank-badge ${rankClass(c.displayRank)}">${escapeHtml(c.displayRank)}</div>
        <div class="stock-id">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.code)} · ¥${formatNumber(c.price)} · <span class="${changeClass}">${changeText}</span></span>
          <div class="decision-chip decision-${decision.tone}">${escapeHtml(decision.label)}</div>
        </div>
        <div class="catalyst">
          <strong title="${escapeHtml(c.catalyst)}">${escapeHtml(c.catalyst)}</strong>
          <small>${state.beginnerMode ? escapeHtml(decision.detail) : `${escapeHtml(c.freshness || "UNKNOWN")} · Gap simulator ${c.gap >= 0 ? "+" : ""}${c.gap}%`}</small>
        </div>
        <div class="score-block prediction">
          <small>${predictionLabel}</small>
          <strong>${c.predictionScore}</strong>
        </div>
        <div class="score-block trade">
          <small>${tradeLabel}</small>
          <strong>${c.tradeScore}</strong>
        </div>
        <button class="button button-secondary details-button" data-detail="${escapeHtml(c.code)}" type="button">${state.beginnerMode ? "なぜ？ / 入り方" : "Details"}</button>
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

    ${chartSection(c)}

    <section class="market-confirmation">
      <div class="entry-map-title">
        <small>REAL DAILY CHECK</small>
        <strong>実日足で何が確認できた？</strong>
      </div>
      ${marketMetricCards(c)}
    </section>

    <div class="detail-score-row">
      <div class="metric-card">
        <small>${state.beginnerMode ? "上がりやすさ" : "Prediction"}</small>
        <strong>${c.predictionScore}</strong>
      </div>
      <div class="metric-card">
        <small>${state.beginnerMode ? "今の入りやすさ" : "Trade"}</small>
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

    ${beginnerEntryMap(c)}

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


const glossary = {
  "地合い": "市場全体が上がりやすいか、下がりやすいかという“相場の空気”です。",
  "GU": "ギャップアップ。前日の終値より高い価格から始まること。高すぎると高値づかみの危険もあります。",
  "VWAP": "その日の平均的な売買価格の目安。株価がVWAPより上を保てるかを見ることがあります。",
  "出来高": "売買された株数。増えているほど、その値動きに参加している人が多いと考えられます。",
  "モメンタム": "株価の勢い。短期間で強く上がっているか、失速しているかを見る考え方です。",
  "相対強度": "日経平均や同業株より、その銘柄が強く動いているかを見る考え方です。",
  "PTS": "取引所の通常時間外に株を売買できる私設市場です。翌日の反応を見る参考になります。",
  "SOX": "米国の主要半導体株で作る指数。日本の半導体株を見る時の参考になります。",
  "損切り": "予想が外れた時、損失を大きくしないために手仕舞うルールです。",
  "利確": "含み益が出ている状態で売り、利益を確定することです。",
  "ブレイクアウト": "直近の高値など重要な価格を、勢いを伴って上抜く動きです。",
  "押し目": "上昇中の銘柄が一時的に下がる場面。再上昇を確認して入る考え方があります。"
};

function decisionState(candidate) {
  const gap = Number(state.gaps[candidate.code] ?? 0);
  const score = adjustedTradeScore(candidate);
  const rank = rankFromScore(score, gap);
  if (rank === "NO TRADE") {
    return { label: "見送り", detail: "今は条件が崩れているため、無理に入らない判断を優先します。", tone: "stop" };
  }
  if (gap >= 10) {
    return { label: "上がりすぎ注意・待つ", detail: "材料は強くても、寄り付きが高すぎると高値づかみの危険が増えます。", tone: "wait" };
  }
  if (score >= 80) {
    return { label: "寄り後の確認待ち", detail: "候補は強め。寄り後に買いが続くか、平均価格帯を保てるかを確認します。", tone: "ready" };
  }
  if (score >= 70) {
    return { label: "押し目・高値更新を確認", detail: "良い候補ですが、すぐ追わず、反発または高値更新の確認を待ちます。", tone: "watch" };
  }
  return { label: "監視のみ", detail: "現時点では決め手が弱め。条件が改善するまで監視に留めます。", tone: "watch" };
}

function statusLabel(status) {
  const map = {
    LIVE: "LIVE",
    DELAYED_15M: "15分遅れ",
    DAILY: "日次",
    DEMO: "DEMO",
    PENDING: "未確定",
    UNAVAILABLE: "未接続",
    RECENT: "最新付近"
  };
  return map[status] || status || "未接続";
}


function renderTradeReadiness() {
  if (!els.tradeReadiness) return;

  let level = "OFF";
  let tone = "off";
  let message = "DEMOまたは重要データ未接続。実取引判断には使用しないでください。";

  if (state.livePayload?.usableForNextDayDecision) {
    level = "DAILY READY";
    tone = "daily";
    message = "最新の日足は確認済み。ただし寄り付き・場中の現在値ではありません。発注前に証券アプリで現在値、板、スプレッドを必ず確認してください。";

    const sources = state.data?.dataSources || [];
    const lookup = Object.fromEntries(sources.map(s => [s.label, s.status]));
    const premarketOk =
      ["PTS","日経先物","為替"].every(name => ["LIVE","RECENT"].includes(lookup[name]));

    if (premarketOk) {
      level = "PREMARKET READY";
      tone = "premarket";
      message = "日足と主要な寄り前情報を確認済み。それでも最終発注前に証券アプリの現在値・板を確認してください。";
    }
  } else if (state.livePayload && !state.livePayload.usableForNextDayDecision) {
    level = "STALE";
    tone = "stale";
    message = "API接続済みですがデータが古いため、翌営業日の取引判断には使用しません。";
  }

  els.tradeReadiness.className = "trade-readiness readiness-" + tone;
  els.tradeReadinessLabel.textContent = level;
  els.tradeReadinessMessage.textContent = message;
}

function renderDataSources() {
  if (!els.dataSourceStatus) return;
  const sources = state.data.dataSources || [
    {label:"株価",status:"DEMO"},
    {label:"ローソク足",status:"UNAVAILABLE"},
    {label:"決算・適時開示",status:"DEMO"},
    {label:"PTS",status:"UNAVAILABLE"},
    {label:"米国市場",status:"PENDING"},
    {label:"日経先物",status:"PENDING"},
    {label:"為替",status:"PENDING"}
  ];
  els.dataSourceStatus.innerHTML = sources.map(source => `
    <div class="data-source-item">
      <span>${escapeHtml(source.label)}</span>
      <strong class="source-${String(source.status || "UNAVAILABLE").toLowerCase()}">${escapeHtml(statusLabel(source.status))}</strong>
      <small>${escapeHtml(source.note || "")}</small>
    </div>`).join("");
}

function applyUxMode() {
  document.body.classList.toggle("beginner-mode", state.beginnerMode);
  document.body.classList.toggle("pro-mode", !state.beginnerMode);
  if (els.uxModeButton) {
    els.uxModeButton.textContent = state.beginnerMode ? "はじめてモード ON" : "Proモード";
    els.uxModeButton.setAttribute("aria-pressed", String(state.beginnerMode));
  }
  if (els.beginnerGuide) els.beginnerGuide.classList.toggle("hidden", !state.beginnerMode);
  const marketTitle = document.querySelector(".market-panel h2");
  const thesisTitle = document.querySelector(".thesis-panel h2");
  if (marketTitle) marketTitle.textContent = state.beginnerMode ? "今日の相場の雰囲気" : "地合い";
  if (thesisTitle) thesisTitle.textContent = state.beginnerMode ? "上がりやすさと、入りやすさは別" : "Prediction ≠ Trade";
}

function tutorialChartSvg() {
  const sample = [
    {o:44,h:50,l:41,c:48},
    {o:48,h:53,l:46,c:51},
    {o:51,h:52,l:45,c:47},
    {o:47,h:56,l:46,c:54},
    {o:54,h:62,l:52,c:59},
    {o:59,h:63,l:55,c:57},
    {o:57,h:66,l:56,c:64}
  ];
  const min = 40, max = 68, width = 620, height = 220, pad = 26;
  const scaleY = v => pad + (max-v)/(max-min)*(height-pad*2);
  const gap = (width-pad*2)/sample.length;
  const candles = sample.map((d,i)=>{
    const x=pad+i*gap+gap/2;
    const up=d.c>=d.o;
    const yOpen=scaleY(d.o), yClose=scaleY(d.c), yHigh=scaleY(d.h), yLow=scaleY(d.l);
    const y=Math.min(yOpen,yClose), h=Math.max(3,Math.abs(yClose-yOpen));
    const cls=up?"tutorial-up":"tutorial-down";
    return `<line x1="${x}" x2="${x}" y1="${yHigh}" y2="${yLow}" class="${cls} wick"/>
      <rect x="${x-10}" y="${y}" width="20" height="${h}" rx="2" class="${cls}"/>`;
  }).join("");
  return `<svg viewBox="0 0 620 220" class="candle-svg" role="img" aria-label="学習用ローソク足サンプル">
    <line x1="26" x2="594" y1="${scaleY(55)}" y2="${scaleY(55)}" class="entry-line"/>
    <text x="590" y="${scaleY(55)-6}" text-anchor="end" class="chart-label">確認ラインの例</text>
    ${candles}
    <text x="310" y="28" text-anchor="middle" class="tutorial-watermark">学習用サンプル — 実価格ではありません</text>
  </svg>`;
}

function realCandleSvg(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return "";
  const data = candles.slice(-40);
  const lows=data.map(d=>Number(d.low)).filter(Number.isFinite);
  const highs=data.map(d=>Number(d.high)).filter(Number.isFinite);
  if (!lows.length || !highs.length) return "";
  const min=Math.min(...lows), max=Math.max(...highs);
  const range=Math.max(0.0001,max-min);
  const width=620,height=250,pad=30;
  const scaleY=v=>pad+(max-v)/range*(height-pad*2);
  const gap=(width-pad*2)/data.length;
  const bodyW=Math.max(3,Math.min(12,gap*.55));
  const nodes=data.map((d,i)=>{
    const o=Number(d.open),h=Number(d.high),l=Number(d.low),c=Number(d.close);
    if (![o,h,l,c].every(Number.isFinite)) return "";
    const x=pad+i*gap+gap/2, up=c>=o;
    const yo=scaleY(o),yc=scaleY(c),yh=scaleY(h),yl=scaleY(l);
    const y=Math.min(yo,yc), bh=Math.max(2,Math.abs(yc-yo));
    const cls=up?"real-up":"real-down";
    return `<line x1="${x}" x2="${x}" y1="${yh}" y2="${yl}" class="${cls} wick"/><rect x="${x-bodyW/2}" y="${y}" width="${bodyW}" height="${bh}" rx="1" class="${cls}"/>`;
  }).join("");
  return `<svg viewBox="0 0 620 250" class="candle-svg" role="img" aria-label="実価格ローソク足">${nodes}</svg>`;
}

function chartSection(candidate) {
  const hasReal = Array.isArray(candidate.candles) && candidate.candles.length >= 2;
  return `
    <section class="chart-card">
      <div class="chart-head">
        <div>
          <small>PRICE ACTION</small>
          <strong>ローソク足</strong>
        </div>
        <span class="pill ${hasReal ? "" : "pill-demo"}">${hasReal ? "DATA" : "学習用"}</span>
      </div>
      <div class="chart-frame">
        ${hasReal ? realCandleSvg(candidate.candles) : tutorialChartSvg()}
      </div>
      <p class="chart-note">${hasReal
        ? "実OHLCデータを描画しています。今後VWAP・出来高・支持帯を重ねます。"
        : "実価格データはまだ接続していません。この図はローソク足の読み方を理解するための見本です。選択中の銘柄の値動きではありません。"}</p>
    </section>`;
}

function beginnerEntryMap(candidate) {
  const gap = Number(state.gaps[candidate.code] ?? 0);
  const decision = decisionState(candidate);
  return `
    <section class="entry-map">
      <div class="entry-map-title">
        <small>ENTRY MAP</small>
        <strong>どうなったら次の判断へ進む？</strong>
      </div>
      <div class="entry-current ${decision.tone}">
        <span>現在</span>
        <b>${escapeHtml(decision.label)}</b>
        <p>${escapeHtml(decision.detail)}</p>
      </div>
      <div class="entry-steps">
        <div><span>①</span><p><b>寄り付きが高すぎない</b><small>現在の入力: ${gap >= 0 ? "+" : ""}${gap}%</small></p></div>
        <div><span>②</span><p><b>寄り後も買いが続く</b><small>VWAP・出来高を確認</small></p></div>
        <div><span>③</span><p><b>高値更新か押し目反発を確認</b><small>勢いを確認してから候補継続</small></p></div>
        <div><span>×</span><p><b>予想が崩れたら見送る</b><small>${escapeHtml(safeText(candidate.invalidation))}</small></p></div>
      </div>
    </section>`;
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
  applyUxMode();
  renderMeta();
  renderMarket();
  renderTradeReadiness();
  renderDataSources();
  renderCandidates();
  renderSimulator();
  renderRiskCenter();
}

els.rankFilter.addEventListener("change", event => {
  state.rankFilter = event.target.value;
  renderCandidates();
});

els.sortMode.addEventListener("change", event => {
  state.sortMode = event.target.value;
  renderCandidates();
});

els.refreshButton.addEventListener("click", async () => {
  await loadSnapshot(true);
  if (state.liveConfig.endpoint && state.liveConfig.key) await connectLiveData(false);
});

if (els.connectionButton && els.liveConnectionPanel) {
  els.connectionButton.addEventListener("click", () => {
    els.liveConnectionPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => els.backendUrlInput?.focus(), 350);
  });
}

if (els.backendUrlInput) els.backendUrlInput.value = state.liveConfig.endpoint || "";
if (els.stockmanKeyInput) els.stockmanKeyInput.value = state.liveConfig.key || "";

if (els.saveConnectionButton) {
  els.saveConnectionButton.addEventListener("click", async () => {
    state.liveConfig.endpoint = normalizeEndpoint(els.backendUrlInput.value);
    state.liveConfig.key = String(els.stockmanKeyInput.value || "").trim();
    saveLiveConfig();
    await connectLiveData(true);
  });
}

if (els.clearConnectionButton) {
  els.clearConnectionButton.addEventListener("click", () => {
    state.liveConfig = { endpoint: "", key: "" };
    state.livePayload = null;
    saveLiveConfig();
    els.backendUrlInput.value = "";
    els.stockmanKeyInput.value = "";
    setConnectionState("未接続", "接続情報をこの端末から削除しました。", "idle");
  });
}

[els.capitalInput, els.riskPctInput, els.stopPctInput].forEach(input => {
  if (input) input.addEventListener("input", syncRiskInputs);
});
if (els.riskCandidateSelect) els.riskCandidateSelect.addEventListener("change", syncRiskInputs);

if (els.uxModeButton) {
  els.uxModeButton.addEventListener("click", () => {
    state.beginnerMode = !state.beginnerMode;
    localStorage.setItem("stockman-beginner-mode", state.beginnerMode ? "on" : "off");
    renderAll();
  });
}

document.querySelectorAll("[data-term]").forEach(button => {
  button.addEventListener("click", () => {
    const term = button.dataset.term;
    if (els.termHelp) els.termHelp.innerHTML = `<strong>${escapeHtml(term)}</strong> — ${escapeHtml(glossary[term] || "説明を準備中です。")}`;
  });
});

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

loadSnapshot().then(async () => {
  if (state.liveConfig.endpoint && state.liveConfig.key) {
    await connectLiveData(false);
  } else {
    setConnectionState("未接続", "現在はDEMOです。接続できるまで実取引の価格確認には使用しないでください。", "idle");
  }
});
