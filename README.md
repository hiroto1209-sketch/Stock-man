# Stock man

日本株の翌営業日候補を、**材料 × モメンタム × 出来高 × 相対強度 × 需給 × 地合い**で整理し、
「上がりそう」と「今から入る期待値」を分けて判断するための分析ダッシュボードです。

> Status: v0.2 prototype — beginner-first UX + visual entry framework  
> Frontend: Static HTML / CSS / JavaScript  
> Hosting target: GitHub Pages  
> Data: 現在は検証用スナップショット。実データAPI接続前のプロトタイプです。

## Core idea

Stock man は単なる「明日上がる株ランキング」ではありません。

- **Prediction Score**: 翌営業日の上昇余地・材料の強さ
- **Trade Score**: 現在の寄り前ギャップ等を考慮したエントリー期待値
- **S / A / B / C / NO TRADE**: 最終ランク
- **WHY BUY / WHY NOT BUY**: 強気・弱気の両論
- **Premarket Simulator**: ギャップ率を入れると Trade Score を再計算
- **Data Freshness Guard**: データが古い場合は警告
- **Audit / Backtest ready**: 将来的に予測と結果を保存し、勝率を公開する設計

## Scoring concept

基本評価:

```text
Catalyst       30%
Momentum       20%
Volume         15%
Relative Strength 15%
Order Flow     10%
Market Regime  10%
```

最終的な Trade Score は Prediction Score から、寄り前の過熱（Gap Up）や材料織り込みを減点し、
出来高・気配・VWAP等の確認要素を加点する想定です。

大幅GUした銘柄を「予想が当たったから買う」のではなく、**上がる予想と実際の売買判断を分離**します。

## Current prototype

`data/snapshot.json` には 2026-10-07 16:13 JST 時点の分析例として以下の5銘柄を入れています。

- 3723 日本ファルコム
- 2670 ABCマート
- 6814 古野電気
- 3498 霞ヶ関キャピタル
- 6871 日本マイクロニクス

このデータはライブ配信ではありません。UI・ロジック検証用です。

## Files

```text
/
├─ index.html
├─ styles.css
├─ app.js
├─ data/
│  └─ snapshot.json
└─ docs/
   ├─ IMPLEMENTATION_PROMPT.md
   └─ ARCHITECTURE.md
```

## Recommended production data path

日本株の価格・財務・決算予定・配当等の基礎データは、JPXの **J-Quants API V2** を第一候補にします。
2026年時点ではAPIキー認証に対応し、分足・Tickデータ、適時開示書類データ等の拡張も提供されています。

本番ではAPIキーをブラウザへ置かず、Cloudflare Workers等のサーバー側に保管してください。

### Production flow

```text
J-Quants / disclosure / market data
          ↓
    Data Normalizer
          ↓
     Feature Engine
          ↓
   Deterministic Scoring
          ↓
      AI Analysis
          ↓
  Validation / Guardrails
          ↓
      JSON Snapshot
          ↓
      Stock man UI
```

AIには「数字を作らせる」のではなく、**構造化された事実を説明・比較・反証させる**役割を持たせます。

## GitHub Pages

リポジトリの Settings → Pages から `main` / root を公開元に設定すれば、この静的版をそのまま公開できます。

## Important

Stock man は分析支援ツールです。将来の株価や利益を保証するものではありません。
表示する確率・スコアはモデル上の相対評価として扱い、実売買ではポジションサイズ・損失許容額・流動性を別途管理してください。


## v0.2 update

The current UI now includes:

- Beginner Mode (default ON)
- plain-Japanese decision labels
- tappable glossary
- per-source freshness/status center
- beginner action state such as “寄り後の確認待ち / 監視のみ / 見送り”
- candlestick renderer contract
- clearly labeled tutorial candle fallback when real OHLC is unavailable
- visual entry map

See `docs/IMPROVEMENT_PROMPT_V02.md` and `docs/LIVE_DATA_PLAN.md`.

**Important:** the current published snapshot is still DEMO data. The app does not yet claim real-time updates.


## v0.3 private daily-data architecture

The repository now includes:

- `api/live-data.js` — authenticated J-Quants V2 private bridge
- real daily OHLC/candlestick merge
- RSI14 / ATR14 / SMA5 / SMA20 / relative-volume calculations
- stale-data rejection
- local-only account/risk calculator
- standard 100-share lot feasibility check
- Trade Readiness: OFF / DAILY READY / PREMARKET READY

The public repository still contains no J-Quants credential and no private J-Quants response data.

See `docs/JQUANTS_V2_PRIVATE_SETUP.md` before enabling live daily data.
