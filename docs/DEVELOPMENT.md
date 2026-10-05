# 開発ガイド

## 設計

アプリの実行時に外部ライブラリ、CDN、APIサーバーは使用しません。
ソースを役割ごとに保持し、公開時に単独HTMLへまとめます。

| ソース | 役割 |
|---|---|
| `src/index.template.html` | HTMLの画面構造とヘルプ |
| `src/style.css` | レイアウト・見た目・レスポンシブ表示 |
| `src/optics.js` | 光学モデル、形状、LED配置、FFT、色変換。Nodeのテストでも利用 |
| `src/worker.js` | 別の計算スレッドで求解し、結果をUIに返す |
| `src/svg-import.js` | SVGのpath文法・変換の解析、ブラウザ標準の曲線計測、輪郭の数値化 |
| `src/tape-tools.js` | 接続したテープの本数変更・剛体回転・整列 |
| `src/gaming.js` | RGB演出の周期PWMと線形光学フィールドの時間補間 |
| `src/view3d.js` | 計算結果の3D投影、厚さ・ギャップ・穴・視点 |
| `src/app.js` | 設定入力、画面描画、比較、ファイル入出力 |

`build.py` はテンプレートの8個の置換位置を検査して、ソースを変更せずに埋め込みます。
Workerも同じHTMLからBlobとして生成します。GitHub Pagesのプロジェクト名付きURLでも、別ファイルのWorkerパスを組み立てる必要はありません。
このパッケージ化では光学計算・画面コードに変更を加えていません。

## 開発用の環境

同梱の検証はPython 3.13、Node.js 22、Playwright 1.57.0を使用しています。
GitHub ActionsもPython 3.13 / Node.js 22を指定しています。

通常のビルドはPython標準ライブラリだけです。ブラウザテストをしない場合、Playwrightは不要です。
ブラウザでアプリを使う人にPythonやNode.jsのインストールは必要ありません。

```sh
python build.py
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

`http://localhost:8000/` を開きます。
ソース変更後は再度ビルドして再読み込みします。開発サーバーに自動ビルド・ホットリロードはありません。

## 生成済みHTMLを確認する

```sh
python build.py --check
```

このコマンドはファイルを書き換えず、ルートの `index.html` が `src/` と一致するか確認します。
一致しない場合は終了コード1を返します。

通常の `python build.py` は `dist/` を削除して再生成します。`dist/` を手作業の保管場所にしないでください。
公開物はHTML、`.nojekyll`、5件のサンプルJSONに限定しています。
`dist/` の中身を増やす場合は `build.py` の `site_files()` と対応テストを更新してください。

## テストを実行する

```sh
python build.py
python -m unittest discover -s tests -p "test_build.py" -v
node --test tests/test_optics.js tests/test_led_profiles.js tests/test_svg.js tests/test_tape_tools.js tests/test_gaming.js tests/test_view3d.js
```

ブラウザテスト用の依存をインストールします。Pythonの仮想環境の使用は任意です。

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tests/test_browser.py
python tests/test_features.py
python tests/test_interactions.py
```

LinuxのCIでOSライブラリも導入する場合は、同梱ワークフローと同じ次のコマンドを使います。

```sh
python -m playwright install --with-deps chromium
```

ブラウザテストは自分でループバックHTTPサーバーを起動し、`/diffusion-lab/` というサブパスから実際にページを読み込みます。
テープ全体のドラッグ・座標移動・取り消し・接続の保存復元、型番選択・根拠表示・手動上書き・旧設定の互換を含む画面操作と、ルート配信、読み込み後のオフライン計算、HTTPでの設定永続化、プロジェクトURL、実行時エラーを確認します。
`test_features.py` は本数・回転・整列、3Dの視点とPNG、動くRGBの準備・停止・指定精度・JSON、同位相の距離比較を確認します。
テストの出力、PNG、JSON、CSVは `tests/artifacts/` に保存します。このフォルダーはGit管理対象外です。

Playwrightが取得したブラウザではなく、既存のChromiumを利用する場合は `CHROMIUM_PATH` を指定します。

```sh
# bash/zshの例
CHROMIUM_PATH=/usr/bin/chromium python tests/test_browser.py
```

```powershell
# PowerShellの例。実行ファイルの場所は自分の環境に合わせる
$env:CHROMIUM_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
python tests/test_browser.py
```

## ナビゲーションが制限される環境

管理ポリシー等によってブラウザがローカルHTTPを開けない環境に限り、明示的な補助モードを使えます。

```sh
python tests/test_browser.py --embedded
```

このモードは同じ生成済みHTMLを `set_content()` でブラウザへ渡し、計算とUIを検証します。
HTTPナビゲーション、Pages本番公開、HTTPでの設定復元・URL保持の確認を代替するものではありません。
**通常のHTTPモードから自動切り替えはしません。GitHub ActionsではHTTPモードを必須にしています。**

## 変更時の注意

光学モデルやARGBの意味を変える場合は、計算テスト、操作ガイド、`MODEL.md`、アプリ内ヘルプも一緒に更新してください。
材料プリセットは仮定値です。GitHub Pages対応は光学モデルの実測検証を意味しません。

新しいリソースを外部ファイル化する場合は、`/assets/...` のようなサイトルート固定のパスを避け、リポジトリ配下で動く相対パスにしてください。
現在の完全単独HTMLという特性を維持するかどうかも、その変更時に確認します。

## ライセンス

配布条件はこのパッケージでは新たに指定していません。第三者のコードや画像を追加する場合は、そのライセンス条件を確認し、必要な表記を同梱してください。

### テープの接続データ

`manual` は配線順の `[x, y, angle]`（mm / rad）の配列です。`tapeLengths` は各テープのLED数で、合計は `manual.length` と一致します。旧設定や不整合な区切りは全LEDを1本として扱います。schemaVersion 2の追加項目として保存し、schemaVersion 1の読み込みも維持しています。

`Optics.tapeLayout` で自動配置を固定座標とテープ区切りに変換します。並列行は各行1本、ほかの自動配置は1本です。`Optics.moveTape` は先頭LEDの指定座標への平行移動を検証し、全LEDが輪郭内に収まらない場合は例外にして元のデータを変更しません。移動中はUIだけにプレビューを保持し、ドロップで状態・自動保存・計算へ反映します。輪郭変更時も固定座標をクランプせず、輪郭外のLEDは光学計算から除外します。

### SVGの輪郭データ

`shape: "svg"` は `svgShapes` の全形状の塗り領域の和集合です。各要素は `fillRule` (`nonzero` / `evenodd`) と `contours`（各輪郭の0〜100%の座標配列）を持ちます。ラベルは `svgLabel` に保存します。既存schemaVersion 2の追加項目で、旧JSONは空のSVGデータを補います。

SVG文書はDOMParserで解析し、数値とpath/transform/fill-ruleだけを読み取ります。元の文書をDOMへ挿入しません。新規作成したSVGPathElementで曲線を計測し、命令の端点を保持しながら、変換後の最大辺の0.05%を基準に線分へ近似します。取り込み前に文法と複雑さを検証します。

WorkerはSVG DOMへ依存せず、数値化した形状からマスク・ROI・LED配置を求めます。パスの交点で線分を分割し、塗り領域の両側が異なる線分だけを実際の境界にします。これにより重なりやnonzero内部線をROIの端にしません。形状キャッシュには寸法と全SVGデータを含めます。

外周配置は既存多角形と同様に幅・高さから余白を引いて縮小した境界をサンプリングし、輪郭外・端に近い候補を除外する近似です。厳密な法線方向のオフセットではなく、複雑な凹部や穴の周囲には配置されない場合があります。
