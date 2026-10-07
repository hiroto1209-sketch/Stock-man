# Stock man v0.3 — Production Upgrade Prompt

You are upgrading Stock man from a prototype into a serious personal Japanese-equity decision-support system.

## Non-negotiable principle

Do not optimize for “more signals.”
Optimize for avoiding bad trades.

The product should prefer:

```text
NO TRADE
```

over a low-quality forced recommendation.

## User workflow

The intended workflow is:

```text
Previous close
→ candidate screening
→ catalyst analysis
→ daily technical confirmation
→ overnight context
→ pre-open re-evaluation
→ live broker quote confirmation
→ conditional entry or NO TRADE
→ post-trade journal
→ model validation
```

## Current architecture

Public frontend:
- GitHub Pages

Private data backend:
- serverless bridge
- J-Quants API V2 key stored only in server secret
- private Stock man access key required
- public repository must never contain private data responses

## Daily data layer

Use J-Quants V2 endpoint:

```text
/equities/bars/daily
```

Normalize adjusted OHLC where available.

Calculate:

- 1-day return
- 5-day return
- 20-day return
- SMA5
- SMA20
- RSI14
- ATR14
- 20-day relative volume
- 20-day high
- distance from 20-day high

Every calculation must be deterministic code, not LLM estimation.

## Staleness guard

A successful HTTP connection does not mean data is usable.

The system must compare latest returned trading date with current date.

If the dataset is materially delayed:

- show STALE
- preserve the chart for research if desired
- do NOT mark the candidate as ready for next-session trading
- do NOT upgrade Trade Score because of stale evidence

## Trading-readiness gate

Create a visible readiness state:

### OFF
DEMO / stale / missing critical data.

### DAILY READY
Latest daily OHLC is connected, but intraday/pre-market confirmation is not complete.

### PREMARKET READY
Daily + required overnight/pre-open context is current.

### EXECUTION CHECK
The user must still verify the brokerage app's current price, spread, and order book.

Never display a state equivalent to “safe to buy.”

## Risk-first module

User account values must be stored locally only.

Inputs:

- deployable capital
- max loss per trade %
- expected stop distance %
- selected stock

Outputs:

- risk budget
- estimated loss per share at stop
- cash required for 100-share lot
- estimated loss for 100-share lot
- whether a standard lot fits both cash and risk rules
- odd-lot reference maximum

Do not send these personal values to GitHub or the market-data backend.

## Entry guidance

Never output only one magic number.

Represent entry as:

```text
Entry condition
+ maximum acceptable gap
+ confirmation
+ invalidation
+ risk budget
```

Example:

```text
Wait.
If gap <= 5%
AND price holds above intraday VWAP
AND volume confirms
THEN candidate remains valid.

If VWAP/support fails
THEN NO TRADE.
```

## Beginner language

Default UI:

- Prediction Score → 上がりやすさ
- Trade Score → 今の入りやすさ
- Relative Volume → いつもより売買が多いか
- RSI → 過熱していないか
- SMA20 → 1か月程度の平均価格
- Invalidation → この予想をやめる条件

Expert terminology remains available in Pro mode.

## Candlestick requirements

When real J-Quants bars are available:

- render actual daily candles
- show timeframe / last data date
- no tutorial watermark

When bars are missing:

- never fabricate
- use clearly labeled tutorial chart

Later phases:

- volume
- SMA5/SMA20 overlays
- support / resistance
- entry zone
- stop line
- target scenario
- 1D / 5D / 1M

## Capital constraint

For Japanese common shares, standard trading units are commonly 100 shares.

The UI should immediately warn when:

```text
latest price × 100 > available capital
```

or

```text
stop-distance loss × 100 > risk budget
```

This prevents a high-ranked stock from being presented as practically tradable when the account size cannot support the planned position.

## AI role

AI may:

- explain catalysts
- compare bullish / bearish evidence
- translate technical conditions
- explain rank changes
- create conditional scenarios

AI must not:

- fabricate prices
- fabricate news
- fabricate volume
- treat model confidence as probability
- override stale-data guards
- force a trade
- hide contradictory evidence

## Next engineering milestone after v0.3

Build a private universe screener that:

1. fetches licensed/allowed market data
2. filters out illiquid names
3. filters by account affordability
4. calculates deterministic technical features
5. ranks a manageable candidate set
6. passes only finalists into the AI catalyst/reasoning layer

The account-affordability filter should happen BEFORE the user sees a “top pick.”

## Acceptance criteria

- J-Quants API key never enters browser code.
- Public repo never stores raw private J-Quants results.
- A separate private access key protects the backend.
- Real daily bars replace tutorial candles after connection.
- Latest returned date is visible.
- Stale/free-plan delayed data cannot masquerade as current.
- Risk budget is local-only.
- 100-share lot feasibility is explicit.
- Scores do not imply guaranteed returns.
- User is told to verify current brokerage quote before actual entry.
