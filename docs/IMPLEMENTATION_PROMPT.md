# Stock man — Master Implementation Prompt

## Role

You are a senior product designer, quantitative product architect, frontend engineer, and financial-data UX specialist.
Build **Stock man**, a Japanese-equity short-term analysis dashboard for real traders.

The product must not behave like a generic “AI stock picker.”
Its core purpose is to separate:

1. **Prediction** — which stocks have relatively strong conditions for the next trading day.
2. **Tradeability** — whether the current/pre-market price still offers an acceptable risk/reward.
3. **Evidence** — what facts support the bullish and bearish cases.
4. **Freshness** — whether the data is current enough to trust.
5. **Validation** — whether historical predictions actually worked.

Do not promise that a stock “will rise.”
Do not invent market data.
If data is unavailable, show `Unavailable`, `Pending`, or `NO TRADE`.

---

## Product thesis

A strong next-day setup usually requires alignment across:

- Catalyst
- Momentum
- Volume
- Liquidity
- Order Flow / Positioning
- Relative Strength
- Market Regime

The app should make this alignment visually obvious.

A stock can have a high **Prediction Score** but a low **Trade Score**.
Example:

- Strong earnings surprise → high Prediction Score.
- Stock gaps +18% before the open → much lower Trade Score.
- Result: the app can say “the bullish thesis was correct, but the entry is unattractive.”

This distinction is a mandatory product behavior.

---

## Primary user

Active Japanese-equity traders using mobile devices before the Tokyo market opens.

Primary use cases:

- 15:30–17:00: detect fresh post-close catalysts.
- 17:00 onward: check PTS reaction.
- Overnight: incorporate US equities, NASDAQ, SOX, VIX, rates, FX.
- 08:00–08:45: re-evaluate Nikkei futures, USD/JPY, pre-market indications.
- 08:45: produce a final pre-open ranking.
- After the session: store outcomes for later validation.

The UI must be highly usable on iPhone.

---

## Ranking model

Use the following conceptual weighting:

- Catalyst: 30%
- Momentum: 20%
- Volume: 15%
- Relative Strength: 15%
- Order Flow / Positioning: 10%
- Market Regime: 10%

### Prediction Score

The Prediction Score is a 0–100 relative score describing the setup strength before entry-price considerations.

### Trade Score

Trade Score begins from Prediction Score and then applies entry-quality adjustments.

Examples of deductions:

- Excessive gap-up
- Obvious catalyst already priced in
- Weak liquidity
- Adverse pre-market reversal
- Negative sector/market confirmation
- Stale data
- Missing required evidence

Examples of confirmations:

- Strong but controlled pre-market reaction
- Relative volume confirmation
- Price holding above VWAP after the open
- Breakout with volume
- Sector and index confirmation

### Rank policy

- S: 80–100
- A: 70–79
- B: 60–69
- C: 50–59
- NO TRADE: below 50 or hard invalidation

Maximum S-rank names: 3.

Hard invalidations override the numeric score.

---

## NO TRADE rules

The app must be allowed to recommend no trade.

Examples:

- Data too stale.
- Market regime severely contradicts the thesis.
- Price gaps too far beyond the intended entry.
- Required source data is missing.
- Risk/reward falls below configured threshold.
- Catalyst is old and fully priced.
- Liquidity is insufficient.
- Bear case materially invalidates the setup.

Never force a “best stock” if the evidence is weak.

---

## Evidence model

Every candidate must show two parallel panels:

### WHY BUY

Only factual or clearly-labeled analytical reasons, such as:

- Upward earnings revision
- Dividend increase
- Buyback
- Strong relative volume
- Breakout
- Sector strength
- Relative strength versus Nikkei / sector
- Positive PTS confirmation

### WHY NOT BUY

Mandatory counter-case, such as:

- Large gap-up risk
- Low liquidity
- Crowded positioning
- Weak follow-through
- Negative market regime
- Catalyst may be priced in
- Earnings/event risk
- Unclear source freshness

The product should train the user to think in both directions.

---

## Data integrity rules

Never mix facts and model inference without labels.

Each important datum should have:

- value
- source
- timestamp
- freshness state
- whether it is factual or inferred

Suggested freshness states:

- LIVE
- RECENT
- STALE
- PENDING
- UNAVAILABLE

If a score relies on stale/unavailable critical data, visually reduce confidence.

---

## Data architecture

Production target:

```
Market / company data providers
        ↓
Data normalization layer
        ↓
Feature calculation engine
        ↓
Deterministic scoring engine
        ↓
AI analysis / explanation layer
        ↓
Validation / hallucination guard
        ↓
Versioned analysis snapshot
        ↓
Stock man frontend
```

### Recommended Japanese-equity foundation

Use JPX J-Quants API V2 as a primary structured source where suitable for:

- listed-company information
- historical prices
- financial statements
- earnings schedules
- dividends
- higher-frequency minute/tick data when subscribed
- timely disclosure document data when subscribed

Never expose API keys in browser JavaScript.
Store secrets server-side, for example in Cloudflare Workers secrets or another backend secret store.

The static GitHub Pages frontend should consume only sanitized JSON/API responses.

---

## AI responsibility

AI must NOT be the source of truth for prices or disclosures.

AI should:

- summarize structured evidence
- compare catalysts
- generate bullish/bearish arguments
- detect contradictions
- explain why a rank changed
- produce scenario analysis
- create human-readable trade plans
- flag missing evidence

AI should NOT:

- invent prices
- invent PTS data
- invent news
- fabricate probabilities
- silently use stale information

---

## Required screens

### 1. Dashboard

Top section:

- product name: Stock man
- current analysis phase
- last updated timestamp
- freshness badge
- market regime
- countdown / next review point
- data mode badge: LIVE or DEMO

Main ranking table/cards:

- rank
- ticker
- company
- Prediction Score
- Trade Score
- catalyst
- freshness
- status
- expandable details

Sort by Trade Score by default.

### 2. Candidate detail

Show:

- ticker / company
- price if available
- Prediction Score
- Trade Score
- S/A/B/C/NO TRADE
- score breakdown
- catalyst summary
- momentum
- volume
- relative strength
- order-flow summary
- market-regime impact
- WHY BUY
- WHY NOT BUY
- hypothetical entry condition
- invalidation condition
- target logic
- risk/reward
- source timestamps

### 3. Premarket Simulator

Allow the user to input a gap percentage for each candidate.

Immediately recalculate Trade Score.

Suggested gap penalty curve:

- ≤ +3%: 0 penalty
- +5%: modest penalty
- +10%: meaningful penalty
- +15%: strong penalty
- +20% or more: severe penalty / possible NO TRADE

The curve should be continuous rather than only step-based.

Display:

- original Prediction Score
- gap penalty
- adjusted Trade Score
- new rank
- message explaining the change

### 4. Market Regime

Display:

- Nikkei 225
- TOPIX
- Growth 250
- Nikkei futures
- NASDAQ
- S&P 500
- SOX
- VIX
- US 10Y yield
- USD/JPY
- WTI
- BTC, optional

Do not show fake numbers when unavailable.

### 5. History / Validation

Prepare the interface/schema for:

- prediction timestamp
- premarket final score
- open
- high
- low
- close
- return from previous close
- return from open
- maximum favorable excursion
- maximum adverse excursion
- whether stop was hit
- whether target was hit
- model version

Future metrics:

- S-rank win rate
- average return
- median return
- hit rate by catalyst type
- hit rate by market regime
- calibration by score bucket
- drawdown
- profit factor if a defined execution rule is used

Do not display invented historical performance before real records exist.

---

## Initial prototype data

Use a clearly-labelled non-live snapshot based on the 2026-10-07 analysis.

Candidates:

1. 3723 日本ファルコム — S — Prediction Score 86
2. 2670 ABCマート — A — Prediction Score 74
3. 6814 古野電気 — A- / A — Prediction Score 71
4. 3498 霞ヶ関キャピタル — B — Prediction Score 66
5. 6871 日本マイクロニクス — B — Prediction Score 63

The snapshot is a UI fixture, not a live recommendation.
Do not silently update or fabricate missing values.

---

## Design direction

Visual language:

- premium dark financial terminal
- black / deep navy background
- restrained lime/green accent
- red only for risk / negative values
- neutral gray for unavailable data
- high information density without clutter
- rounded cards, subtle borders, minimal glow
- avoid casino-like visual treatment
- no flashing “BUY NOW” behavior

Typography:

- system sans-serif
- tabular numbers where possible
- readable on iPhone

Responsive behavior:

- mobile-first
- ranking becomes stacked cards on narrow screens
- tap targets at least ~44px
- sticky filter/sort controls if useful
- no horizontal overflow for primary interactions

Accessibility:

- sufficient contrast
- semantic HTML
- keyboard accessible controls
- visible focus states
- not color-only status communication

---

## Performance requirements

Target GitHub Pages first.

- No framework required for v0.1.
- Use semantic HTML, CSS, vanilla JS.
- Avoid large libraries.
- Lazy-load optional content.
- Keep first render fast.
- Cache static snapshot files.
- If external data fails, render last-known data with a stale warning instead of a blank screen.

---

## Prototype interaction requirements

Implement now:

1. Load `data/snapshot.json`.
2. Render market-regime summary.
3. Render all candidate cards.
4. Sort by Trade Score.
5. Filter by rank.
6. Open candidate detail.
7. Show WHY BUY / WHY NOT BUY.
8. Show component score bars.
9. Allow manual pre-market gap input.
10. Recalculate Trade Score immediately.
11. Re-rank the list after simulation.
12. Display NO TRADE if the adjusted score or hard rule requires it.
13. Persist simulator inputs locally in the browser.
14. Show data freshness/stale warnings.
15. Never claim the demo snapshot is live.

---

## Suggested gap penalty function

Use a smooth conservative function.

One acceptable prototype:

```js
function gapPenalty(gapPct) {
  if (gapPct <= 3) return 0;
  const excess = gapPct - 3;
  return Math.min(35, Math.round(excess * 1.7));
}
```

For negative gaps, do not automatically add a bonus.
A negative gap can indicate thesis failure.

---

## Production roadmap

### Phase 1 — UI / logic prototype

- static GitHub Pages
- demo snapshot
- scoring UI
- simulator
- detail modal
- freshness guard

### Phase 2 — structured Japanese-market data

- J-Quants V2
- normalized OHLCV
- financials
- earnings calendar
- corporate disclosures
- derived technical features

### Phase 3 — real pre-market layer

- licensed/allowed PTS or indication source
- futures
- FX
- US market / SOX / VIX
- sector mapping
- real pre-open re-score

### Phase 4 — AI reasoning layer

Feed only normalized structured evidence to the LLM.
Require machine-readable JSON output with:

- bullish evidence
- bearish evidence
- uncertainty
- missing data
- scenario probabilities
- invalidation
- explanation of rank changes

### Phase 5 — validation

Store every published snapshot before the market opens.
Never rewrite historical predictions after outcomes are known.
Compute transparent performance metrics.

---

## Security / compliance constraints

- Never expose provider API keys in frontend code.
- No automatic trade execution in v0.1.
- Separate analytics from brokerage/execution.
- Include visible disclaimer.
- Log analysis timestamp and model/data version.
- Preserve prior predictions for auditability.
- Do not use scraped data in production unless terms and licensing allow it.

---

## Acceptance criteria for v0.1

The build is complete only if:

- It loads on GitHub Pages.
- It is usable on iPhone.
- Demo mode is unmistakable.
- All 5 candidates render.
- Prediction Score and Trade Score are visibly different concepts.
- Gap simulation visibly changes Trade Score.
- Excessive gap-up can downgrade a candidate to NO TRADE.
- WHY BUY and WHY NOT BUY are both present.
- Missing values render as unavailable, never invented.
- Data age is shown.
- The page remains useful even if snapshot fetch fails.
- The visual design feels like a serious analytical terminal rather than a gambling app.

Build the application end-to-end according to this specification.
