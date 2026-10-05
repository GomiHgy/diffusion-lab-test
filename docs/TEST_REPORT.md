# 検証記録 — GitHub Pagesプロジェクト化

実行日：2026-10-05。
対象：今回同梱したソースと `build.py` から生成した `index.html` / `dist/`。

## 実行結果

| 検証 | 結果 | 実行内容 |
|---|---|---|
| JavaScript構文検査 | 合格 | `app.js`、`optics.js`、`worker.js` をNodeで検査 |
| 光学計算テスト | 25 / 25合格 | 元の数値回帰テストを再実行 |
| ビルド・配信ファイルのテスト | 12 / 12合格 | 再現性、ソース埋め込み、公開物の限定、JSON、HTTP配信パス等 |
| Chromium画面操作テスト | 40 / 40合格 | 明示的な `--embedded` モード。元の37件と追加3件 |
| ブラウザ内実行時エラー | 0件 | 上記の画面操作中 |
| 外部通信 | 0件 | 上記の画面操作中にアプリから外部サイトへの自動リクエストなし |

環境：Python 3.13.5、Node.js 22.16.0、Playwright 1.57.0、Chromium 144.0.7559.96。

## 公開対応の確認範囲

PythonのHTTPクライアントで実際のローカルHTTPサーバーに接続し、`/`、`/index.html`、`/diffusion-lab/`、`/diffusion-lab/index.html` が同じHTMLを200で返すことを確認しました。
プロジェクト用サブパスからのサンプルJSON取得、および公開物に開発ソースやワークフローを含めないことも確認しました。

生成HTML内に自動ロードする外部リソースやサイトルート固定の参照がないこと、テンプレートの置換残りがないこと、IDが重複しないことを検査しました。
配信用 `dist/` は7ファイルに限定しています（HTML、`.nojekyll`、サンプルJSON5件）。

`src/optics.js` は元の納品と同じです。SHA-256：

```text
cfbfc7301ac920bae8dc1b18b1fc00e3cc83f6c6bae8e50d6dc495c85fa7c3ac
```

今回のパッケージ化では、他の `src/` ファイルと生成済みHTMLも元のバイト列を維持しています。

## ブラウザHTTP検証の制限

この作業環境では、ChromiumからローカルHTTPへ移動すると `net::ERR_BLOCKED_BY_ADMINISTRATOR` で拒否されました。
そのため、ブラウザの画面操作は `set_content()` を用いる明示的なembeddedモードで検証しました。
HTTP配信の検証とブラウザのUI検証は別々に実行しており、**ブラウザがHTTPから読み込む全体のE2E検証を通過したとは主張しません。**

通常の `python tests/test_browser.py` はHTTPモードで実行します。
同梱のGitHub ActionsもHTTPモードを使うため、公開環境ではこの追加検証が通ることが公開の条件になります。
HTTPモードではさらに「再読み込み時の設定復元」「プロジェクトURLの保持」の2件を確認しますが、この作業環境では未実行です。

GitHubのリポジトリ作成、Actionsランナー上での実行、GitHub Pagesへの実デプロイ、本番URLでの確認は未実施です。

## 引き続き未検証のもの

実物のLED・拡散板との比較、測光器による校正、材料プリセットの同定、入力上限を組み合わせた長時間負荷、Windows版Edge・Firefox・Safari・iOS・Android実機での個別検証は未実施です。
数値テストの合格と実物への再現精度は別です。

## 同梱ログ

- `tests/reports/optics-tests.txt`
- `tests/reports/build-tests.txt`
- `tests/reports/browser-tests.txt`
- `tests/reports/browser-test-results.json`

再実行手順は [DEVELOPMENT.md](DEVELOPMENT.md) にあります。
