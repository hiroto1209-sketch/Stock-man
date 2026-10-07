# Stock man — Live Data Plan

## Current truth

Stock man v0.2 is **not real-time**.

The frontend is a GitHub Pages application reading a static JSON snapshot.
That is intentionally visible in the UI as DEMO / UNAVAILABLE / PENDING.

Do not remove those labels until the corresponding source is actually connected.

## Important J-Quants limitation

J-Quants API V2 is an excellent primary source for structured Japanese-market research data.

Useful roles:

- daily/historical OHLC
- company master
- financial results
- earnings calendar
- dividends
- disclosure-related datasets
- minute/tick datasets for historical/high-frequency research

However, the individual J-Quants minute/tick add-on is distributed daily rather than as a real-time streaming market feed.

Therefore:

> J-Quants alone should not be marketed as a real-time intraday source for Stock man.

## Three deployment tracks

### Track A — Daily decision support (recommended first)

Goal: make Stock man genuinely useful every day without pretending it is real-time.

Use:

- J-Quants V2 for Japanese company / daily market data
- timely disclosure data where plan permits
- overnight global-market providers
- scheduled snapshot generation
- 08:45 final pre-open analysis

Result:

- strong daily workflow
- reproducible research
- clean backtesting
- low infrastructure complexity

This should be completed before adding execution.

### Track B — Personal real-time intraday

A practical official broker route is kabu Station API.

It can provide:

- current price / board information
- time-and-sales
- account / order information
- push/registered-symbol functionality depending on API feature

Important architecture constraint:

The API endpoint is served by the local kabu Station application on the user's machine.
It is not a normal public cloud market-data endpoint.

Possible personal architecture:

```text
Windows PC running kabu Station
          ↓
local Stock man bridge
          ↓
private secure tunnel / VPN
          ↓
Stock man on iPhone
```

Security requirements:

- never expose kabu Station directly to the public internet
- do not store brokerage credentials in GitHub
- separate read-only market-data bridge from future order execution
- require authentication
- restrict symbols and rate limits
- rotate tokens as required

Do not implement automated trading in the first real-time phase.

### Track C — Public / commercial real-time service

If Stock man is published to other users, use a market-data contract that explicitly permits the intended display and redistribution.

Do not assume a personal brokerage feed can legally be republished.

A production provider abstraction should allow licensed sources to be swapped without changing the frontend.

## Recommended build order

### Phase 1 — now

- Beginner Mode
- terminology help
- per-source freshness status
- candlestick renderer contract
- entry map
- Prediction vs Trade separation
- immutable demo snapshots

### Phase 2 — daily live data

- J-Quants V2 server-side adapter
- scheduled daily OHLC ingestion
- financials
- earnings schedule
- disclosures
- snapshot generator
- automatic source timestamps

### Phase 3 — chart quality

- actual candles
- 1D / 5D / 1M
- volume
- VWAP where valid
- moving averages
- prior close
- entry zone / invalidation
- responsive touch chart

### Phase 4 — pre-open

- overnight US indices
- SOX / VIX / rates
- USD/JPY
- Nikkei futures from a licensed source
- PTS from a permitted source
- 08:45 final re-score

### Phase 5 — optional intraday personal mode

- broker API bridge
- board / time-and-sales
- intraday candles
- alert engine
- private mobile access

### Phase 6 — validation

- save every published score before outcomes
- ingest next-session OHLC
- calculate MFE / MAE
- score calibration
- win rate by catalyst / regime
- never rewrite history

## API contract for candles

The frontend now expects:

```json
{
  "candles": [
    {
      "time": "ISO-8601",
      "open": 1000,
      "high": 1020,
      "low": 990,
      "close": 1015,
      "volume": 123456
    }
  ]
}
```

If candles do not exist, the app must show a tutorial example that is visibly labeled as non-market data.

## Data-source metadata

Every dataset should expose:

```json
{
  "label": "株価",
  "status": "LIVE | DELAYED_15M | DAILY | DEMO | PENDING | UNAVAILABLE",
  "provider": "provider name",
  "asOf": "ISO-8601",
  "note": "human-readable caveat"
}
```

## Recommended next implementation

The next actual engineering milestone should be:

> Connect J-Quants V2 through a server-side adapter and replace the five demo candidates' daily price/fundamental fields with generated snapshots.

Do not begin with real-time streaming.

A stable daily pipeline + stored history gives more value immediately because it allows Stock man to prove whether its ranking system works.
