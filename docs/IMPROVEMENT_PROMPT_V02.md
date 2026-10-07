# Stock man v0.2 — Beginner-first + Visual Trading Decision Prompt

## Mission

Upgrade Stock man from a good-looking analyst dashboard into a daily-use decision-support product that a beginner can understand in under 60 seconds while preserving enough depth for experienced traders.

The product must answer four questions in order:

1. **今日は相場全体が強いのか弱いのか？**
2. **どの銘柄が注目候補なのか？**
3. **なぜ注目なのか？**
4. **今すぐではなく、どんな条件になったらエントリー候補になるのか？**

Do not optimize only for experts.
A beginner should never need to know the meaning of VWAP, GU, SOX, Relative Strength, or Market Regime before they can use the page.

---

## 1. Two UX modes

### Beginner Mode — default ON

Replace jargon in the primary UI with plain Japanese.

Examples:

- Prediction Score → 上がりやすさ
- Trade Score → 今の入りやすさ
- Market Regime → 今日の相場の雰囲気
- Catalyst → 上がるきっかけ
- Momentum → 値動きの強さ
- Volume → 売買の活発さ
- Relative Strength → 市場より強いか
- Order Flow → 買い・売りの偏り
- Invalidation → この予想が崩れる条件
- Gap Up / GU → 前日終値より高く始まりすぎる状態

For every important concept, expose a tappable explanation.

### Pro Mode

Show the original professional terminology, component scores, detailed technical metrics, and raw source status.

Persist the selected mode in localStorage.

---

## 2. “What should I do now?” layer

Every candidate card needs a simple decision state:

- **寄り後の確認待ち**
- **押し目待ち**
- **高値ブレイク確認待ち**
- **監視のみ**
- **見送り / NO TRADE**

Never show “BUY NOW”.

Show one short sentence explaining why.

Example:

> 上がる材料は強いですが、寄り付きが+12%なら高値づかみの危険が増えるため待ちます。

This message is more important than the numeric score.

---

## 3. Beginner onboarding card

At the top of the dashboard show a 3-step guide:

### STEP 1
相場全体を見る  
「今日の相場の雰囲気」が悪ければ無理に取引しない。

### STEP 2
候補を見る  
「上がりやすさ」が高い銘柄を確認する。

### STEP 3
入り方を見る  
「今の入りやすさ」とエントリー条件を確認する。

Allow the guide to be collapsed later.

---

## 4. Candlestick chart

Candidate detail must support real OHLC candlestick data.

Minimum schema:

```json
{
  "candles": [
    {
      "time": "2026-10-07T09:00:00+09:00",
      "open": 100,
      "high": 105,
      "low": 98,
      "close": 103,
      "volume": 120000
    }
  ]
}
```

Render:

- candlesticks
- latest price line
- VWAP when available
- previous close
- entry zone
- invalidation / stop reference
- target reference
- volume bars if data exists

If real candle data does not exist:
- do not fabricate a chart
- show an obvious “実価格データ未接続” state
- optionally render a clearly labeled “学習用サンプル” explaining how candles work

The learning sample must never look like the selected stock's real price history.

---

## 5. Visual entry map

Under the chart, show an “エントリーマップ”.

Example:

```text
待つ
│
├─ 前日比 +10%以上 → 追わない
│
├─ 寄り後VWAPを維持 → 候補継続
│
├─ 出来高を伴い高値更新 → ブレイク確認
│
└─ VWAP + 支持帯を割る → 見送り
```

Translate technical conditions into beginner Japanese first, with the expert term in smaller text.

---

## 6. Data-source / freshness center

The user must always know which parts are live and which are not.

Add a compact data status panel:

- 株価: LIVE / 15 MIN DELAY / DAILY / DEMO / UNAVAILABLE
- ローソク足: same
- 決算・適時開示: same
- PTS: same
- 米国市場: same
- 日経先物: same
- 為替: same

Never use a generic green “LIVE” badge when some sources are delayed.

---

## 7. Real-time architecture

Current GitHub Pages build is presentation-only.

Production target:

```text
Data Providers
    ↓
Server-side adapters
    ↓
Normalized snapshot
    ↓
Feature Engine
    ↓
Scoring Engine
    ↓
AI explanation
    ↓
Stock man frontend
```

Important Japanese-market constraint:

- J-Quants individual API is useful for historical/daily data, financials, disclosure data, and high-frequency datasets.
- Its minute/tick equity data is not a real-time streaming feed.
- For true intraday or low-delay operation, use a properly licensed market-data source.
- Keep all provider secrets server-side.

Do not mislabel delayed/daily data as real-time.

---

## 8. Data update strategy

Use different update cadences by source.

### After close
- earnings
- upward/downward revisions
- dividends
- buybacks
- disclosures
- daily OHLCV

### Overnight
- S&P 500
- NASDAQ
- SOX
- VIX
- US 10Y
- USD/JPY

### Pre-open
- Nikkei futures
- FX
- PTS if licensed source exists
- indication / quote if licensed source exists

### Intraday
Only if the chosen provider legally permits the required refresh and redistribution.

---

## 9. Beginner glossary

Include tappable explanations for at least:

- 地合い
- GU / ギャップアップ
- VWAP
- 出来高
- モメンタム
- 相対強度
- PTS
- SOX
- 損切り
- 利確
- ブレイクアウト
- 押し目

Each explanation:
- one sentence
- no more than ~70 Japanese characters when possible
- an example when helpful

---

## 10. Candidate card redesign

Primary hierarchy in Beginner Mode:

1. company / ticker
2. simple status (“寄り後の確認待ち”)
3. 上がりやすさ
4. 今の入りやすさ
5. one-line reason
6. risk warning
7. details

Do not make raw component scores the first thing beginners see.

---

## 11. Chart interaction roadmap

v0.2:
- static SVG candlestick renderer
- tutorial fallback
- entry/invalidation visual labels

v0.3:
- real OHLC data
- 1D / 5D / 1M
- pinch/drag
- VWAP
- volume
- moving averages

v0.4:
- intraday refresh
- premarket overlays
- alert conditions

---

## 12. Entry-point guidance

Do not present a single magical entry price.

Represent entry as conditional logic:

- entry zone
- confirmation
- invalidation
- maximum acceptable gap
- risk/reward threshold

Example:

> 2,600円なら買い、ではなく  
> 「GUが+5%以内で、寄り後にVWAPを維持し、出来高が平均以上なら候補」

The system should teach process, not price guessing.

---

## 13. Risk controls

Add a small risk panel:

- 1回の取引で許容する損失
- ストップまでの距離
- 参考ポジションサイズ

Do not connect to brokerage execution yet.
Do not enable one-tap trading.

---

## 14. Acceptance criteria

The v0.2 improvement is complete only if:

- Beginner Mode is ON by default.
- Beginner/Pro mode can be toggled.
- The dashboard explains what to look at in three steps.
- Candidate cards show a plain-language current action state.
- Specialist words have tap explanations.
- Candidate detail has a candlestick chart container.
- Missing real candles are never fabricated as real data.
- A clearly labeled tutorial candlestick example is available.
- Entry conditions are visualized.
- The user can see exactly which data sources are live, delayed, daily, demo, or unavailable.
- Prediction Score and Trade Score remain separate.
- NO TRADE remains a valid output.
- iPhone layout remains the first-class layout.
