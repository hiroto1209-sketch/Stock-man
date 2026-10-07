# Stock man Architecture

## 1. Product boundary

Stock man should remain an **analysis system**, not an execution bot.

The frontend must never become the authority for raw prices, disclosure facts, or API secrets.
Its job is to render versioned analysis snapshots and help a human understand the trade-off between prediction quality and entry quality.

## 2. Target architecture

```text
┌──────────────────────────────┐
│ External structured sources │
│ J-Quants / market / FX / US │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Cloudflare Worker / API      │
│ - secret storage             │
│ - rate-limit                 │
│ - provider adapters          │
│ - validation                 │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Normalized Market Schema     │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Feature Engine               │
│ - returns                    │
│ - relative volume            │
│ - VWAP                       │
│ - RSI / MACD / bands         │
│ - high distance              │
│ - relative strength          │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Deterministic Scoring        │
│ Prediction / Trade / Rank    │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ AI Analysis                  │
│ explain / challenge / cases  │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Snapshot Validator           │
│ source + timestamp + schema  │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ Versioned snapshot storage   │
└──────────────┬───────────────┘
               ↓
┌──────────────────────────────┐
│ GitHub Pages frontend        │
└──────────────────────────────┘
```

## 3. Why the LLM is not the scoring engine

LLMs are useful for:

- explaining a catalyst
- comparing competing theses
- producing bull/base/bear scenarios
- identifying contradictions
- turning structured facts into readable analysis

They are not ideal as the only source for:

- current prices
- exact volume
- financial numbers
- disclosure timestamps
- deterministic score calculations

Therefore Stock man should calculate core features and scores in code, then give the model a constrained JSON object for analysis.

## 4. Suggested normalized schema

```json
{
  "symbol": "3723",
  "asOf": "ISO-8601",
  "price": {
    "last": null,
    "open": null,
    "high": null,
    "low": null,
    "close": null,
    "vwap": null
  },
  "volume": {
    "current": null,
    "avg20": null,
    "relative": null
  },
  "catalysts": [],
  "positioning": {},
  "marketContext": {},
  "sources": [
    {
      "provider": "provider-name",
      "timestamp": "ISO-8601",
      "freshness": "LIVE|RECENT|STALE|PENDING|UNAVAILABLE"
    }
  ]
}
```

## 5. Analysis output contract

The AI layer should return strict JSON, not prose-only output.

```json
{
  "symbol": "3723",
  "bullishEvidence": [],
  "bearishEvidence": [],
  "missingEvidence": [],
  "catalystInterpretation": "",
  "pricedInRisk": "LOW|MEDIUM|HIGH",
  "scenario": {
    "bull": {"probability": null, "condition": ""},
    "base": {"probability": null, "condition": ""},
    "bear": {"probability": null, "condition": ""}
  },
  "entryCondition": "",
  "invalidation": "",
  "confidence": 0,
  "explanation": ""
}
```

Probabilities must be absent/null unless they are produced by a calibrated statistical model.
An LLM confidence score must never be disguised as a real-world probability.

## 6. Premarket rescore

At each checkpoint, create a new immutable analysis snapshot.

Suggested checkpoints:

- POST_CLOSE
- PTS
- US_OPEN
- US_CLOSE
- PREMARKET_0800
- PREMARKET_FINAL_0845
- POST_OPEN_CONFIRMATION

Never overwrite a previous snapshot.
That allows later analysis of **what the system knew at the time**.

## 7. Trade Score model

Prototype:

```text
Trade Score
  = Prediction Score
  - Gap Penalty
  - Priced-In Penalty
  - Stale-Data Penalty
  - Liquidity Penalty
  + Confirmation Bonus
```

Hard rules can override the arithmetic.

Example hard rule:

```text
IF critical_data_missing = true
THEN rank = NO TRADE
```

## 8. Data freshness guard

Critical fields should define an acceptable maximum age.

Example:

```text
daily OHLC       : current trading day
disclosure       : event timestamp
US close         : latest completed US session
FX / futures     : minutes, not hours, for final premarket
pre-open quote   : seconds/minutes depending on provider
```

If a critical source fails:

1. keep last-known value
2. mark it STALE
3. reduce confidence
4. never silently present it as current

## 9. J-Quants direction

For Japanese equities, J-Quants API V2 is a strong primary structured source for the production roadmap.
Keep the provider behind an adapter so another licensed source can be swapped in without changing the scoring engine.

Suggested interface:

```js
class JapaneseEquityProvider {
  async getListedInfo(date) {}
  async getDailyQuotes(symbol, from, to) {}
  async getFinancials(symbol) {}
  async getEarningsCalendar(date) {}
  async getDividends(symbol) {}
  async getDisclosures(date) {}
}
```

Do not call a secret-bearing provider directly from GitHub Pages.

## 10. Cloudflare Worker boundary

A Worker can later provide endpoints such as:

```text
GET /api/snapshot/latest
GET /api/snapshot/:id
GET /api/candidate/:symbol
POST /api/rescore
GET /api/history
```

Responsibilities:

- keep API keys in secrets
- normalize providers
- cache expensive calls
- rate-limit clients
- validate response schemas
- strip unnecessary licensed/raw fields
- return only frontend-safe JSON

## 11. Audit and backtest storage

Each published signal should be immutable.

Suggested identity:

```text
analysis_date + checkpoint + symbol + model_version
```

Record:

- Prediction Score
- Trade Score
- rank
- catalyst category
- market regime
- entry rules
- invalidation
- source timestamps
- next-session OHLC
- MFE / MAE
- target/stop outcomes

This prevents survivorship bias and hindsight editing.

## 12. Next engineering steps

1. Publish the v0.1 static interface.
2. Connect J-Quants V2 through a server-side adapter.
3. Add a snapshot generator.
4. Add scheduled premarket snapshots.
5. Add an AI explanation endpoint that only accepts normalized data.
6. Save final 08:45 snapshots permanently.
7. Add outcome ingestion after the close.
8. Build the validation dashboard only after sufficient real observations exist.

## 13. Non-negotiable integrity rules

- No fabricated data.
- No hidden stale data.
- No forced buy recommendation.
- No API key in client code.
- No editing old predictions after the outcome.
- No “AI probability” unless statistically calibrated.
- Facts, derived metrics, and model inference must be visually distinguishable.
