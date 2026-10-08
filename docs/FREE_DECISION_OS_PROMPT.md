# Stock man Free Decision OS — Master Prompt v1

## Mission

Evolve Stock man into a free-first Japanese-equity decision-support system.

The system must not promise to predict tomorrow's winner. Its job is to:

- find candidates
- reject weak candidates
- reject unaffordable trades
- avoid chasing excessive gaps
- preserve the reasoning available before the outcome
- record actual trades
- append next-session outcomes without editing predictions
- learn only from real observations

## Integrity rules

Never fabricate price, volume, news, disclosure, PTS, market index data, or probabilities.

Every data source must expose one of:

- LIVE
- RECENT
- DAILY
- DELAYED
- STALE
- MANUAL
- UNAVAILABLE
- DEMO

DEMO observations must never enter real performance statistics.

STALE evidence may remain visible for research but may not upgrade a trade-readiness state.

NO TRADE is a valid and desirable result.

## Free-mode product strategy

Do not imitate an expensive real-time terminal.

Optimize the free version for:

1. previous-close / daily analysis
2. catalyst organization
3. affordability
4. entry-condition planning
5. risk budgeting
6. immutable prediction capture
7. trade journaling
8. outcome validation
9. transparent performance history

Use the brokerage app for final current quote / board / spread verification.

## Decision hierarchy

The dashboard must answer in this order:

1. Is the market environment supportive?
2. Which stocks deserve attention?
3. Can the account realistically trade them?
4. Is the current setup still attractive?
5. What confirmation is required?
6. What invalidates the thesis?
7. If conditions are weak, show NO TRADE.

## Scoring separation

Prediction Score:
relative setup strength for the next session.

Trade Score:
entry quality after gap, staleness, liquidity, market conditions, and other execution constraints.

A high Prediction Score must never force a high Trade Score.

## Affordability gate

When capital is configured, affordability is a hard gate.

Standard-lot mode:

- calculate latest price × 100
- calculate stop-distance loss × 100
- require both cash and risk budget to pass

Odd-lot mode:

- calculate the maximum shares permitted by both cash and risk budget
- clearly warn that broker execution rules differ

If price is unavailable, affordability is UNAVAILABLE and the candidate cannot become an execution candidate.

## Beginner UX

Default labels:

- Prediction Score → 上がりやすさ
- Trade Score → 今の入りやすさ
- Market Regime → 今日の相場の雰囲気
- Relative Volume → いつもより売買が多いか
- Relative Strength → 市場より強いか
- Catalyst → 上がるきっかけ
- Invalidation → この予想をやめる条件

The first screen must be understandable in approximately 60 seconds.

## Daily Plan

Show:

- current market state
- number of currently tradable candidates
- configured capital
- data readiness
- top three candidates after affordability and Trade Score constraints
- current action state

Action states:

- 寄り後の確認待ち
- 押し目待ち
- 高値更新待ち
- 監視のみ
- 資金条件で見送り
- NO TRADE

Never display BUY NOW.

## Chart policy

If real OHLC exists, show:

- daily candles
- volume
- SMA5
- SMA20
- previous close

Later add VWAP only when appropriate intraday data exists.

If OHLC does not exist, use only a clearly labeled tutorial example.

Never fabricate a symbol-specific chart.

## Trade Journal

Persist locally:

- symbol
- datetime
- entry
- exit
- shares
- P/L
- entry reason
- exit reason
- Prediction Score
- Trade Score
- market regime
- rule compliance
- reflection
- optional compressed screenshot

User account values and journal data must not be committed to GitHub.

## Prediction History

Allow the user to freeze the current prediction state.

Frozen prediction fields are not editable in the UI.

Store:

- timestamp
- checkpoint
- model version
- data mode
- market regime
- source states
- candidates
- Prediction Score
- Trade Score
- rank
- catalyst
- snapshot price
- entry condition
- invalidation
- affordability result

Outcome data is append-only and separate.

## Outcome validation

Allow the user to append next-session:

- open
- high
- low
- close

Derive:

- previous-close → close return
- open → close return
- MFE
- MAE
- win/loss for the defined evaluation

Do not alter the frozen prediction after the result is known.

## Performance dashboard

Exclude DEMO records.

Do not show win-rate or performance statistics until a minimum real sample threshold is reached.

Initial minimum: 10 settled observations.

After threshold:

- sample count
- win rate
- average return
- median return
- average MFE
- average MAE
- rank-level win rate

Future:

- catalyst type
- market regime
- score bucket
- drawdown
- execution-rule statistics

## Backup

Provide local JSON export of:

- journal
- immutable history
- outcomes
- risk settings

No private API credential should be included in the export.

## Official/free data policy

Prefer official or explicitly permitted sources.

Do not build unsupported scraping into the production path.

If a free source cannot legally/reliably supply a datum:

- show MANUAL when user-supplied
- show UNAVAILABLE when missing
- do not infer a value

## Completion criteria

A user opening Stock man should be able to understand:

- whether market conditions are supportive
- which candidates matter
- which candidates are unaffordable
- which candidates are overextended
- what confirmation is still required
- what invalidates the setup
- when the correct answer is NO TRADE

The product succeeds when it reduces bad trades rather than maximizing the number of signals.
