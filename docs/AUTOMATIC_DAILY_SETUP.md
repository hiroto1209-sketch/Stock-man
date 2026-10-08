# Automatic Daily Analysis Engine — 導入ガイド

## 現在の状況（2026-10-08）

- **実装済み**: 無料・依存ライブラリ不要の分析コア、日次指標、流動性判定、確認済み開示の採点、NO TRADE、データ鮮度確認、GitHub Actionsの定時実行設定、サイトの自動スナップショット優先表示、端末内JSON取込、Windows向けkabuステーション読み取り専用収集。
- **未接続**: 再配信権限がある最新の株価データプロバイダー、および個人専用リアルタイムデータブリッジ。
- **未検証**: ユーザー自身の三菱UFJ eスマート証券/kabuステーションでの実接続。GitHub Actionsの実際のスケジュール実行。
- **現在のホーム**: `data/daily-analysis.json` が `UNAVAILABLE` のため、過去の10月7日DEMO銘柄を当日推薦として表示しない。

「分析エンジンの自動実行」＝「最新株価の合法な自動取得」ではありません。データ源がなければ候補0件が正しい動作です。

## アーキテクチャ

```text
A: 認可済み・再配信可の市場データ
  ↓ GitHub Actions（18:27 / 08:37 JST）
  ↓ scripts/run-daily-analysis.js
  ↓ engine/analysis-core.js
  ↓ data/daily-analysis.json（公開可能なもののみ）
  ↓ GitHub Pages

B: 三菱UFJ eスマート証券（個人利用）
  ↓ Windows + kabuステーション Professional/Premium
  ↓ scripts/kabu-readonly.mjs（localhost /board、注文APIなし）
  ↓ private/market-input.json（端末のみ。GitHub非公開）
  ↓ iPhoneへファイル共有 → Stock man設定 > JSON読込
  ↓ engine/analysis-core.js（ブラウザ内で分析）
```

個人向け証券APIの市場データを公開GitHub Pages上のJSONへ保存・再配信しないでください。

## 自動更新（GitHub Actions）

ワークフロー:

`.github/workflows/daily-analysis.yml`

- 18:27 JST: 引け後の分析。
- 08:37 JST: 寄り前の再実行。**ただしこの時点でのPTSや寄り前気配を自動取得する仕組みは未接続**なので、同じ日足に対する再確認に留まります。
- 土日を除いて実行（日本の市場休場日には空振りする場合があります）。
- GitHub Actionsには実行の遅延・取りこぼしがあり得ます。

GitHubリポジトリの「Actions」タブでワークフローの存在と実行状態を確認してください。
ScheduleはGitHub側の設定や権限で無効化される場合があります。未稼働の間は自動更新されたと主張しません。

### 自動データ提供元の接続

GitHubの Repository Settings > Secrets and variables > Actions > Variables へ:

`STOCKMAN_PUBLIC_FEED_URL`

を登録できます。これは**公開ページへの分析結果の再配信が明示的に認められたデータ**を返すHTTPS JSON APIだけにしてください。

必要なら Repository Secrets に `STOCKMAN_PUBLIC_FEED_TOKEN` を登録できます。

実装は `Authorization: Bearer` を使用します。

重要：個人利用契約のJ-Quants、証券口座APIなどを**このpublic repoの自動公開データ源に使わないでください。**

JSONに `source.redistributionPermitted: true` と**適切な契約に基づく** `source.licenseUrl` が必要です。適切な権利がないのにtrueと記載することは禁止です。

### 入力データ形式

```json
{
  "schemaVersion": 1,
  "asOf": "2026-10-08T16:00:00+09:00",
  "source": {
    "provider": "LICENSED_PROVIDER",
    "status": "DAILY",
    "asOf": "2026-10-08T15:30:00+09:00",
    "redistributionPermitted": false,
    "licenseUrl": ""
  },
  "market": {
    "status": "UNKNOWN",
    "verified": false,
    "note": "市場指標を未検証"
  },
  "disclosuresVerified": false,
  "candidates": [
    {
      "code": "1234",
      "name": "会社名",
      "candles": [
        {"time":"2026-10-08","open":1000,"high":1020,"low":990,"close":1010,"volume":100000}
      ],
      "catalysts": [
        {
          "type":"upward_revision",
          "headline":"適時開示による上方修正",
          "url":"https://example.com/real-company-ir",
          "publishedAt":"2026-10-08T15:10:00+09:00",
          "verified":true
        }
      ]
    }
  ]
}
```

上記は**形式例であり架空の株価や開示です**。実際の売買には使用しないでください。分析には最新の取引日まで連続した最低25営業日分のOHLCVが必要です。

公開データ源として使う場合は、明確な契約権限を取得した上で `redistributionPermitted` と `licenseUrl` を設定してください。

## 三菱UFJ eスマート証券の個人用データ収集

公式:

- https://www.kabu.com/item/kabustation_api/default.html
- https://kabucom.github.io/kabusapi/ptal/howto.html
- https://kabucom.github.io/kabusapi/reference/

**必須条件**:

- Windows PC
- kabuステーションが起動・ログイン済み
- kabuステーションAPIの利用申込が完了
- Professional または Premium の適用条件を満たすこと
- 個人専用のAPIパスワード（GitHubに絶対に保存しない）

PowerShellで例：

```powershell
$env:KABU_API_PASSWORD = "YOUR_LOCAL_API_PASSWORD"
node scripts/kabu-readonly.mjs 3723 2670 6814
Remove-Item Env:KABU_API_PASSWORD
```

株式の取引時間終了後（15:35 JST以降）に実行してください。

スクリプトは次のリクエストだけを使います：

- `POST /kabusapi/token`
- `GET /kabusapi/board/{code}@1`

`/sendorder`、`/cancelorder`は呼びません。

データは `private/market-input.json` にローカル保存し、`.gitignore` で公開リポジトリへの登録を防ぎます。

大引け後の板情報から当日OHLCVを記録し、毎営業日実行することで履歴を積み上げます。初日から25営業日分の履歴が自動で揃うわけではありません。取引所の休場、kabuステーションのログアウト、データのNULLなどは取得失敗として扱います。

得られたJSONをiPhoneへファイル共有して、**Stock man > 設定 > Automatic Daily Analysis > JSON読込**から読み込めます。読み込みはiPhone内で処理され、ファイルはGitHubにアップロードされません。

> 注意：kabuステーションAPIの価格情報は利用規約の範囲内で個人利用してください。公開Webサイトに株価データを配布しないでください。

## 分析ロジックの厳格な制限

- Catalyst = 実在の公式URL・公開時刻・検証済みフラグを持つ情報のみ。
- Relative Strength = 比較対象指数が取得できている場合だけ加点（現在の実装は未接続なので0）。
- Order Flow = 板・歩み値などの実データがなければ0。
- Market Regime = 未確認の場合に強気加点しない。
- Prediction Score = 指標の合成点であり、上昇確率ではない。
- Trade Score = 現在値未確認の状態で強い買い推奨にしないため上限を制限。
- 公開用データが古い・不足・再配信不可 = `UNAVAILABLE`。

## 未完成の機能（今後の優先順位）

1. 契約に沿った**最新データの自動供給**。これができなければ毎日ランキングは自動で変わりません。
2. 適時開示の許可された正規データAPI接続。
3. 市場指数・海外市場・為替の正規API接続。
4. 個人専用kabuステーションbridge（WindowsからiPhoneへ認証付き配信）。
5. 翌営業日OHLCの自動結果突合と予測精度検証。
6. 現物株の注文可能性（100株/単元未満株の取扱条件）を証券会社の実規則と整合。

## 取引前の必須確認

Stock manの監視候補は**買い注文の指示ではありません**。

証券会社アプリで現在値・気配・スプレッド・出来高・価格制限、注文条件を確認し、想定損失が口座の許容額に収まらなければNO TRADEにしてください。
