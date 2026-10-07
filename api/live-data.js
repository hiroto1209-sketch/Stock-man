/**
 * Stock man private J-Quants V2 bridge.
 *
 * Required environment variables:
 *   JQUANTS_API_KEY
 *   STOCKMAN_ACCESS_KEY
 *
 * Optional:
 *   STOCKMAN_ALLOWED_ORIGINS
 *   comma-separated origins, e.g.
 *   https://hiroto1209-sketch.github.io,http://localhost:3000
 *
 * This endpoint intentionally refuses to run without a Stock man access key.
 * Do not commit J-Quants credentials or market-data responses to the public repo.
 */

const JQUANTS_BASE = "https://api.jquants.com/v2";
const DEFAULT_CODES = ["3723", "2670", "6814", "3498", "6871"];

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  const origin = String(req.headers.origin || "");
  const allowedOrigins = getAllowedOrigins();

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Stockman-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  }

  const jquantsKey = process.env.JQUANTS_API_KEY;
  const stockmanKey = process.env.STOCKMAN_ACCESS_KEY;

  if (!jquantsKey || !stockmanKey) {
    return json(res, 503, {
      error: "SERVER_NOT_CONFIGURED",
      message: "J-Quants or Stock man server secret is missing."
    });
  }

  const suppliedKey = String(req.headers["x-stockman-key"] || "");
  if (!safeEqual(suppliedKey, stockmanKey)) {
    return json(res, 401, { error: "UNAUTHORIZED" });
  }

  if (origin && !allowedOrigins.includes(origin)) {
    return json(res, 403, { error: "ORIGIN_NOT_ALLOWED" });
  }

  const codes = parseCodes(req.query && req.query.codes);
  const days = clampNumber(req.query && req.query.days, 30, 180, 90);
  const calendarLookback = Math.max(60, Math.ceil(days * 1.8));
  const to = tokyoDateString(new Date());
  const fromDate = new Date();
  fromDate.setUTCDate(fromDate.getUTCDate() - calendarLookback);
  const from = tokyoDateString(fromDate);

  try {
    const results = await Promise.all(
      codes.map(code => getDailySeries(code, from, to, jquantsKey, days))
    );

    const newest = results
      .map(item => item.latest && item.latest.date)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    const ageDays = newest ? dateAgeDays(newest) : null;
    const overallFreshness =
      ageDays === null ? "UNAVAILABLE" :
      ageDays <= 4 ? "DAILY" : "STALE";

    return json(res, 200, {
      mode: "PRIVATE_DAILY",
      provider: "J-Quants API V2",
      generatedAt: new Date().toISOString(),
      requestedRange: { from, to, tradingDays: days },
      latestTradingDate: newest,
      freshness: overallFreshness,
      usableForNextDayDecision: overallFreshness === "DAILY",
      note: overallFreshness === "DAILY"
        ? "Latest available daily bars loaded. This is not intraday real-time data."
        : "Latest returned market data is too old for next-day trading decisions.",
      candidates: results
    });
  } catch (error) {
    console.error("Stock man J-Quants bridge error", safeError(error));
    return json(res, error.statusCode || 502, {
      error: "JQUANTS_FETCH_FAILED",
      message: safeError(error)
    });
  }
};

function getAllowedOrigins() {
  const raw = process.env.STOCKMAN_ALLOWED_ORIGINS ||
    "https://hiroto1209-sketch.github.io,http://localhost:3000,http://127.0.0.1:3000";
  return raw.split(",").map(v => v.trim()).filter(Boolean);
}

function parseCodes(value) {
  const raw = typeof value === "string" && value.trim()
    ? value.split(",")
    : DEFAULT_CODES;

  const unique = [...new Set(
    raw.map(v => String(v).trim()).filter(v => /^\d{4,5}$/.test(v))
  )];

  return unique.slice(0, 20).length ? unique.slice(0, 20) : DEFAULT_CODES;
}

async function getDailySeries(code, from, to, apiKey, maxRows) {
  const rows = [];
  let paginationKey = null;
  let pages = 0;

  do {
    const url = new URL(JQUANTS_BASE + "/equities/bars/daily");
    url.searchParams.set("code", code);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    if (paginationKey) url.searchParams.set("pagination_key", paginationKey);

    const response = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "accept": "application/json"
      }
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(body.message || ("J-Quants HTTP " + response.status));
      error.statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
      throw error;
    }

    const pageRows = Array.isArray(body.data) ? body.data : [];
    rows.push(...pageRows);
    paginationKey = body.pagination_key || null;
    pages += 1;
  } while (paginationKey && pages < 10);

  const normalized = rows
    .map(normalizeBar)
    .filter(Boolean)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(-maxRows);

  const latest = normalized.at(-1) || null;
  const previous = normalized.at(-2) || null;

  return {
    code,
    freshness: latest && dateAgeDays(latest.time.slice(0, 10)) <= 4 ? "DAILY" : "STALE",
    latest: latest ? {
      date: latest.time.slice(0, 10),
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
      turnoverValue: latest.turnoverValue,
      changePct: previous && previous.close
        ? round2((latest.close / previous.close - 1) * 100)
        : null
    } : null,
    metrics: computeMetrics(normalized),
    candles: normalized
  };
}

function normalizeBar(row) {
  const date = row.Date || row.date;
  const open = firstNumber(row.AdjO, row.O, row.Open, row.open);
  const high = firstNumber(row.AdjH, row.H, row.High, row.high);
  const low = firstNumber(row.AdjL, row.L, row.Low, row.low);
  const close = firstNumber(row.AdjC, row.C, row.Close, row.close);
  const volume = firstNumber(row.AdjVo, row.Vo, row.Volume, row.volume);
  const turnoverValue = firstNumber(row.Va, row.TurnoverValue, row.turnoverValue);

  if (!date || ![open, high, low, close].every(Number.isFinite)) return null;

  return {
    time: String(date) + "T15:30:00+09:00",
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : null,
    turnoverValue: Number.isFinite(turnoverValue) ? turnoverValue : null
  };
}

function computeMetrics(candles) {
  const closes = candles.map(x => x.close);
  const volumes = candles.map(x => x.volume).filter(Number.isFinite);
  const latest = candles.at(-1);
  if (!latest) return {};

  const ret = n => {
    if (closes.length <= n || !closes.at(-(n + 1))) return null;
    return round2((latest.close / closes.at(-(n + 1)) - 1) * 100);
  };

  const sma = n => {
    if (closes.length < n) return null;
    return round2(avg(closes.slice(-n)));
  };

  const recent20 = candles.slice(-20);
  const high20 = recent20.length ? Math.max(...recent20.map(x => x.high)) : null;
  const avgVol20 = volumes.length >= 5 ? avg(volumes.slice(-20)) : null;
  const rvol20 = avgVol20 && Number.isFinite(latest.volume)
    ? round2(latest.volume / avgVol20)
    : null;

  return {
    return1dPct: ret(1),
    return5dPct: ret(5),
    return20dPct: ret(20),
    sma5: sma(5),
    sma20: sma(20),
    rsi14: calculateRsi(closes, 14),
    atr14: calculateAtr(candles, 14),
    relativeVolume20: rvol20,
    high20,
    distanceTo20dHighPct: high20
      ? round2((latest.close / high20 - 1) * 100)
      : null,
    aboveSma5: sma(5) ? latest.close >= sma(5) : null,
    aboveSma20: sma(20) ? latest.close >= sma(20) : null
  };
}

function calculateRsi(closes, period) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i] - slice[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = (gains / period) / (losses / period);
  return round2(100 - 100 / (1 + rs));
}

function calculateAtr(candles, period) {
  if (candles.length < period + 1) return null;
  const trs = [];
  const slice = candles.slice(-(period + 1));
  for (let i = 1; i < slice.length; i++) {
    const current = slice[i];
    const prev = slice[i - 1];
    trs.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    ));
  }
  return round2(avg(trs.slice(-period)));
}

function firstNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return NaN;
}

function avg(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return NaN;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function dateAgeDays(yyyyMmDd) {
  const target = new Date(yyyyMmDd + "T15:30:00+09:00").getTime();
  return Math.floor(Math.max(0, Date.now() - target) / 86400000);
}

function tokyoDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function round2(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function setSecurityHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function safeError(error) {
  const message = error && error.message ? String(error.message) : "Unknown error";
  return message.slice(0, 300);
}
