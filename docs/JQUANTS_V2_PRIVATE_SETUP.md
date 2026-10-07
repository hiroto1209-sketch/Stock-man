# Stock man — J-Quants V2 Private Daily Setup

## Goal

Replace the public DEMO price/candlestick fixture with **real J-Quants daily OHLC data** without exposing the J-Quants API key or redistributing the personal API feed publicly.

Current architecture:

```text
J-Quants API V2
      ↓
Private serverless bridge
      ↓
Stock man access key check
      ↓
Your iPhone only
      ↓
GitHub Pages UI
```

The public GitHub repository contains code only.
It must NOT contain:

- JQUANTS_API_KEY
- Stock man access key
- raw private J-Quants responses
- generated personal market-data dumps

## Why private

J-Quants API for individuals is for personal use and JPX states that secondary distribution is not permitted.

Therefore Stock man must not commit J-Quants response data into a public GitHub Pages repository.

## J-Quants plan requirement

For tomorrow/next-session analysis, do not use the Free plan's delayed dataset.

The bridge checks the latest returned trading date.
If the latest date is too old, Stock man displays **古いデータ** and does not mark it as usable for the next session.

## Step 1 — J-Quants API V2

Create/sign in to a J-Quants account and issue an API key from the J-Quants dashboard.

V2 authentication uses:

```http
x-api-key: YOUR_JQUANTS_API_KEY
```

Never paste this key into Stock man's browser UI.
Never commit it to GitHub.

## Step 2 — Deploy the private backend

Recommended for this repository: Vercel serverless function.

Import:

```text
hiroto1209-sketch/Stock-man
```

The API function already exists:

```text
/api/live-data.js
```

## Step 3 — Set server environment variables

Create these secrets in the backend deployment:

### JQUANTS_API_KEY

Your real J-Quants V2 API key.

### STOCKMAN_ACCESS_KEY

Create a separate long random string only for Stock man.

This is NOT your brokerage password.
It protects the private market-data bridge.

Recommended length: at least 32 random characters.

### STOCKMAN_ALLOWED_ORIGINS

For the current GitHub Pages frontend:

```text
https://hiroto1209-sketch.github.io
```

You may add localhost origins separated by commas for development.

## Step 4 — Deploy

After deployment, the endpoint should look like:

```text
https://YOUR-PROJECT.vercel.app/api/live-data
```

Calling it without the Stock man access key should return 401.
That is correct.

## Step 5 — Connect your iPhone

Open Stock man.

Go to:

```text
本物の日次データへ接続
```

Enter:

- Backend URL: your deployed `/api/live-data`
- Stock man access key: the separate key created above

Press:

```text
保存して接続テスト
```

The browser stores these two values only in localStorage on that device.

The J-Quants API key remains server-side.

## Expected success state

Stock man should display:

```text
日次接続済み
Latest trading date: current/latest TSE session
```

Then:

- candidate price → real latest daily close
- previous-day change → real
- candlesticks → real J-Quants daily OHLC
- 5-day return → calculated from real bars
- 20-day return → calculated from real bars
- RSI14 → calculated
- relative volume → calculated
- SMA5 / SMA20 → calculated
- 20-day high distance → calculated

## What this is NOT

This connection is **not intraday real-time**.

J-Quants individual minute/tick datasets are daily-delivered datasets rather than a streaming quote feed.

Before any actual order:

1. use Stock man for candidate / scenario analysis
2. confirm current quote in the brokerage app
3. confirm spread / order book
4. verify the entry condition still holds

## Failure states

### SERVER_NOT_CONFIGURED

Backend secrets are missing.

### UNAUTHORIZED

Wrong Stock man access key.

### JQUANTS_FETCH_FAILED

J-Quants rejected the API key, endpoint, plan access, or temporarily failed.

### 古いデータ

Connection works, but the J-Quants plan returned data too old for next-session use.

Do not override this guard.

## Daily production roadmap

After this daily bridge is confirmed working:

1. connect company master
2. connect financial summary
3. build catalyst extraction
4. expand from five candidates to a wider universe
5. store only model outcomes/metadata where licensing permits
6. add PTS / futures / FX from appropriately licensed providers
7. add broker/current-quote validation for intraday execution
