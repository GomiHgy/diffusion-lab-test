# 検証記録

## LED型番プリセットへの変更（2026-10-05）

対象：型番選択、資料の根拠表示、手動上書き、設定互換、PNG出力と、再生成した単独HTML。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文検査 | PASS | optics.js / app.js / worker.js |
| 光学計算・LEDプリセット | PASS 36 / 36 | 既存25件と型番・根拠・旧設定・面積換算・半値角11件 |
| ビルド・配信 | PASS 12 / 12 | ソース一致、公開ファイル限定、ルートとサブパスのHTTP配信 |
| ブラウザ操作 | PASS 57 / 57 | Chromeで実際のローカルHTTPから読み込み。型番5種類、手動値と根拠表示、初期値復帰、旧JSON、新JSON保存復元、旧localStorage、距離比較、スマートフォン幅 |
| 実行時エラー・自動外部通信 | PASS / 0件 | 上記ブラウザ操作中 |
| 画面・PNGの目視確認 | PASS | 型番、幅・角度と根拠が表示され、文字の欠けがないこと |
| LED実機との光学比較・校正 | NOT RUN | 機械開口の面積換算は近似。資料未記載の値は仮定 |
| GitHub Pagesへの今回の変更のデプロイ | NOT RUN | ローカルのビルド・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。
今回はブラウザからHTTP配信を検証しており、下記の初回検証時のembeddedモードとは異なります。

再実行コマンド（PowerShell）：

```powershell
.\.venv\Scripts\python.exe build.py
node --test tests/test_optics.js tests/test_led_profiles.js
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_build.py -v
$env:CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
.\.venv\Scripts\python.exe tests/test_browser.py
.\.venv\Scripts\python.exe build.py --check
```

型番ごとの参照版・計算値・未記載項目は [LEDの仕様と近似](LED_SPECS.md) を参照してください。
既存サンプルJSON5件は旧schemaVersion 1のまま維持し、カスタムとして元の数値を再現します。
ブラウザテストの結果と画像は `tests/artifacts/` に保存します。

## 初回GitHub Pagesプロジェクト化時の記録

以下は初回パッケージ化時の記録です。ソースのハッシュ、実行環境、当時の公開状況はその時点のもので、今回の型番変更後の状態を表しません。

実行日：2026-10-05。
対象：今回同梱したソースと `build.py` から生成した `index.html` / `dist/`。

### 実行結果

| 検証 | 結果 | 実行内容 |
|---|---|---|
| JavaScript構文検査 | 合格 | `app.js`、`optics.js`、`worker.js` をNodeで検査 |
| 光学計算テスト | 25 / 25合格 | 元の数値回帰テストを再実行 |
| ビルド・配信ファイルのテスト | 12 / 12合格 | 再現性、ソース埋め込み、公開物の限定、JSON、HTTP配信パス等 |
| Chromium画面操作テスト | 40 / 40合格 | 明示的な `--embedded` モード。元の37件と追加3件 |
| ブラウザ内実行時エラー | 0件 | 上記の画面操作中 |
| 外部通信 | 0件 | 上記の画面操作中にアプリから外部サイトへの自動リクエストなし |

環境：Python 3.13.5、Node.js 22.16.0、Playwright 1.57.0、Chromium 144.0.7559.96。

### 公開対応の確認範囲

PythonのHTTPクライアントで実際のローカルHTTPサーバーに接続し、`/`、`/index.html`、`/diffusion-lab/`、`/diffusion-lab/index.html` が同じHTMLを200で返すことを確認しました。
プロジェクト用サブパスからのサンプルJSON取得、および公開物に開発ソースやワークフローを含めないことも確認しました。

生成HTML内に自動ロードする外部リソースやサイトルート固定の参照がないこと、テンプレートの置換残りがないこと、IDが重複しないことを検査しました。
配信用 `dist/` は7ファイルに限定しています（HTML、`.nojekyll`、サンプルJSON5件）。

`src/optics.js` は元の納品と同じです。SHA-256：

```text
cfbfc7301ac920bae8dc1b18b1fc00e3cc83f6c6bae8e50d6dc495c85fa7c3ac
```

今回のパッケージ化では、他の `src/` ファイルと生成済みHTMLも元のバイト列を維持しています。

### ブラウザHTTP検証の制限

この作業環境では、ChromiumからローカルHTTPへ移動すると `net::ERR_BLOCKED_BY_ADMINISTRATOR` で拒否されました。
そのため、ブラウザの画面操作は `set_content()` を用いる明示的なembeddedモードで検証しました。
HTTP配信の検証とブラウザのUI検証は別々に実行しており、**ブラウザがHTTPから読み込む全体のE2E検証を通過したとは主張しません。**

通常の `python tests/test_browser.py` はHTTPモードで実行します。
同梱のGitHub ActionsもHTTPモードを使うため、公開環境ではこの追加検証が通ることが公開の条件になります。
HTTPモードではさらに「再読み込み時の設定復元」「プロジェクトURLの保持」の2件を確認しますが、この作業環境では未実行です。

GitHubのリポジトリ作成、Actionsランナー上での実行、GitHub Pagesへの実デプロイ、本番URLでの確認は未実施です。

### 引き続き未検証のもの

実物のLED・拡散板との比較、測光器による校正、材料プリセットの同定、入力上限を組み合わせた長時間負荷、Windows版Edge・Firefox・Safari・iOS・Android実機での個別検証は未実施です。
数値テストの合格と実物への再現精度は別です。

### 同梱ログ

- `tests/reports/optics-tests.txt`
- `tests/reports/build-tests.txt`
- `tests/reports/browser-tests.txt`
- `tests/reports/browser-test-results.json`

再実行手順は [DEVELOPMENT.md](DEVELOPMENT.md) にあります。
