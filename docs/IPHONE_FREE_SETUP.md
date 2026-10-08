# Stock man | iPhone・iPadだけで無料の自動日足分析をつなぐ

## 現状と完成条件

2026-10-08時点でコードはGitHub mainへ追加済み。
**Cloudflare/Alpha Vantageのアカウント認証と実データ接続は未実施**。接続できていない間は Stock man は `UNAVAILABLE` を表示する。
Windows PC・kabuステーションは不要。日本株の日足がAlpha Vantageの無料APIで取得可能かどうかは銘柄別に未検証。表示は日足・研究用途のみ。場中リアルタイムやPTS、板、適時開示は未接続。

- 公開フロント: GitHub Pages (`hiroto1209-sketch/Stock-man`)
- 秘密のデータ取得: Cloudflare Worker Free (`cloudflare/worker.js`)
- 保存: Cloudflare Workers KV Free (`MARKET_CACHE` バインディング)
- 価格: Alpha Vantage free `TIME_SERIES_DAILY`（無料枠25 API calls/day、銘柄のサポート要検証）
- ブラウザ側で計算: `engine/analysis-core.js`
- 公開GitHubへの株価レスポンス保存: **禁止**
- GitHub Actionsの公開データルート: この私的Workerと独立。個人用APIキーや私的OHLCVを流さない。

## 1. Alpha Vantage 無料APIキーを取得

公式 https://www.alphavantage.co/support/#api-key

Alpha Vantageは個人・非商用の投資分析/調査/監視での利用を許可。収益化したサイトや第三者向け表示は別の権利/契約が必要になる。

**APIキーをGitHub、チャット、iPhoneのStock man設定画面に貼らないこと。**
後でCloudflare WorkerのSecretに登録する。

無料 `TIME_SERIES_DAILY` はリアルタイム配信ではなく、提供銘柄と実際に返される最新取引日はAPI応答で確認する。

日本株のコードを `3723.TYO` のように書いても対応が保証されるわけではない。
`SYMBOL_SEARCH` APIで証券コードを検索し、Alpha Vantageが返す**正規のsymbol**を選ぶ。
一致しないものは `NO_DAILY_OHLCV` / `UNAVAILABLE` とし、別銘柄で代用しない。
無料枠は1日25リクエスト。検索も上限を消費するため、銘柄登録は5つ以下。

公式 https://www.alphavantage.co/documentation/

## 2. Cloudflareの無料アカウントを作る

https://dash.cloudflare.com/

iPhone Safari / iPad Safariから操作可能。UIによってはSafari「デスクトップ用Webサイトを表示」を使う。

1. Dashboard → Workers & Pages → Create application → Import a repository
2. GitHub連携して `hiroto1209-sketch/Stock-man` を選択
3. Worker名: `stockman-private-market`（`wrangler.jsonc` と一致させる）
4. Git branch: `main`, Root directory: リポジトリのルート `/`
5. Build command: 空欄, Deploy command: `npx wrangler deploy`
6. Save and Deploy
7. `https://stockman-private-market.<your-subdomain>.workers.dev` が発行される

コードは既に `cloudflare/worker.js`、設定は `wrangler.jsonc` にある。
画面やメニュー名はCloudflareの更新で変わる可能性がある。

参考: https://developers.cloudflare.com/workers/ci-cd/builds/

## 3. Cloudflare KVを作る

Cloudflare Dashboard → Storage & databases → KV → Create namespace
名前: `stockman-personal-market`

Worker → Settings → Bindings → Add → KV namespace

- Binding variable: `MARKET_CACHE`
- Namespace: `stockman-personal-market`

**重要**: 再デプロイでKV bindingが外れないよう、後で `wrangler.jsonc` の
`kv_namespaces` に `{"binding":"MARKET_CACHE","id":"<あなたのKV_NAMESPACE_ID>"}` を追加してコミットする。
Namespace IDはAPIキーではなく公開可能な識別子。Cloudflare上で表示される実際の値を入れる。
デプロイ前にダミーIDを記入しないこと。

参考: https://developers.cloudflare.com/kv/concepts/kv-bindings/

## 4. Cloudflareで秘密鍵をセット

Worker → Settings → Variables and Secrets

Secretsに以下を追加:

- `ALPHAVANTAGE_API_KEY`: Alpha Vantage無料キー
- `STOCKMAN_ACCESS_KEY`: Stock manに入力する長いランダムな独自文字列（32文字以上推奨、証券口座のパスワードとは別）

Workerへ登録した `ALPHAVANTAGE_API_KEY` をGitHubに書かない。

参考: https://developers.cloudflare.com/workers/configuration/secrets/

## 5. 監視する日本株を登録（最大5銘柄）

GitHubで `wrangler.jsonc` の `vars.STOCKMAN_SYMBOLS` を編集する。

```json
{
  "STOCKMAN_SYMBOLS": "[{\"code\":\"3723\",\"symbol\":\"VERIFIED_SYMBOL\",\"name\":\"日本ファルコム\"}]"
}
```

上記の `VERIFIED_SYMBOL` は実際に確認できたAlpha Vantageの証券識別子へ置き換える。
これは完全な`wrangler.jsonc`ではなく`vars`部分の説明例。

Workerは、日足OHLCVが25営業日分以上返らなければ採点しない。
Tickerを適当に `3723.TYO` 等に設定して取得できたことにしてはいけない。

## 6. Stock manに接続

GitHub Pages: https://hiroto1209-sketch.github.io/Stock-man/

「設定」→「個人用・日次データ接続」へ進み、

- Backend URL: `https://<あなたのWorker名>.<サブドメイン>.workers.dev/api/daily-input`
- Stock man専用アクセスキー: 手順4の `STOCKMAN_ACCESS_KEY`

を入力。「保存して接続テスト」を押す。

Workerは `https://hiroto1209-sketch.github.io` からのみブラウザ呼び出し可能。
資格がないクライアントには HTTP 401 を返す。
Workerのデータは個人用KV/認証済み応答だけに保存。GitHub Pagesに公開JSONとして保存しない。

「設定」→「Automatic Daily Analysis」で個人用接続の状態を確認する。

### 正常な表示

- `PRIVATE_RESEARCH_DAILY`
- `RESEARCH DAILY`
- 日足の最新取引日、監視候補
- 実取引可否: **未確認**（PTS/板/現在値/適時開示は未接続）

Alpha Vantageが日本株の日足を返さない、API無料枠超過、休日、データ遅延などの場合は `UNAVAILABLE` / `STALE`。

## 7. 自動更新

`wrangler.jsonc`にUTCのcron指定:

- `27 11 * * 1-5`: 平日 **20:27 JST**（引け後）
- `37 23 * * 0-4`: 月〜金 **08:37 JST**（朝）

Cloudflare側のスケジュールが実際に動いているか、Worker Logs / Triggersで確認する。
銘柄5件×2回 = 最大10 Alpha Vantageリクエスト/営業日を想定。
無料APIの上限25に収まるよう、Workerは3時間以内の過剰リフレッシュを抑止。
初回のGET（キャッシュ未作成時）にもAPI呼び出しが発生する。

- 最新の公表時間はプロバイダー次第。
- 同一データが再取得された場合は値を変えない。
- Cronは約束した厳密時刻での更新を保証しない。
- **市場データの最終営業日は必ず確認する。**

## 8. 証券口座について

三菱UFJ eスマート証券のリアルタイム現在値・板・PTSは、証券アプリを使って最終確認する。
Stock manは機械的に1日足を分析するもので、注文執行や投資の利益を保証しない。

個人口座10万円の場合、100株単元の必要資金と想定損失の両方を確認する。
資金条件を満たさなければNO TRADE。株式の標準取引単位・単元未満株の売買条件は証券会社で確認する。

## 9. よくあるエラー

- HTTP 401: `STOCKMAN_ACCESS_KEY` 不一致。
- HTTP 503 CONFIG_REQUIRED: Alpha Vantage APIキー、監視コード、KV binding のいずれか未設定。
- HTTP 503 PROVIDER_DATA_UNAVAILABLE: 銘柄形式不一致、プロバイダー障害、API回数制限、必要日数不足等。
- `STALE`: 日足のデータ日付が古い。API通信時刻が新しくてもDAILYと表示しない。
- 0候補: 安全装置。存在しない株価を作成しない。

## データライセンス

Alpha Vantage Terms: https://www.alphavantage.co/terms_of_service/

これは**本人だけの個人投資研究**用構成。第三者へ株価データを見せるサービスとして公開・収益化する場合は、改めてデータ利用許諾が必要。

Alpha Vantageの日本株サポートが不明な場合、正規APIの検証が終わるまでは、この構成を『毎日自動で最新の日本株が出る完成品』と宣伝しないこと。
