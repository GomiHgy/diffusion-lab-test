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
| `src/tape-geometry.js` | 基板・端部・LED間の接続の連続形状と輪郭内の判定 |
| `src/tape-placement.js` | 幅を含む自動配置、切り欠き・穴でのテープ分割、手動経路の検証 |
| `src/tape-tools.js` | 接続したテープの本数変更・剛体回転・整列 |
| `src/gaming.js` | RGB演出の周期PWMと線形光学フィールドの時間補間 |
| `src/view3d.js` | 計算結果の3D投影、厚さ・ギャップ・穴・視点 |
| `src/app.js` | 設定入力、画面描画、比較、ファイル入出力 |

`build.py` はテンプレートの10個の置換位置を検査して、ソースを変更せずに埋め込みます。
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
node --test tests/test_optics.js tests/test_led_profiles.js tests/test_photometry.js tests/test_svg.js tests/test_tape_tools.js tests/test_tape_geometry.js tests/test_tape_placement.js tests/test_gaming.js tests/test_view3d.js
```

ブラウザテスト用の依存をインストールします。Pythonの仮想環境の使用は任意です。

```sh
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
python tests/test_browser.py
python tests/test_features.py
python tests/test_interactions.py
python tests/test_photometry.py
python tests/test_tape_outline.py
```

LinuxのCIでOSライブラリも導入する場合は、同梱ワークフローと同じ次のコマンドを使います。

```sh
python -m playwright install --with-deps chromium
```

ブラウザテストは自分でループバックHTTPサーバーを起動し、`/diffusion-lab/` というサブパスから実際にページを読み込みます。
テープ全体のドラッグ・座標移動・取り消し・接続の保存復元、型番選択・根拠表示・手動上書き・旧設定の互換を含む画面操作と、ルート配信、読み込み後のオフライン計算、HTTPでの設定永続化、プロジェクトURL、実行時エラーを確認します。
`test_features.py` は本数・回転・整列、3Dの視点とPNG、動くRGBの準備・停止・指定精度・JSON、同位相の距離比較を確認します。
`test_photometry.js` / `test_photometry.py` は型番別RGB光度、光度と推定光束の単位・配光積分、出力係数、旧設定の保持、求解・演出・2D/3Dへの反映を確認します。
`test_tape_geometry.js` / `test_tape_placement.js` は連続した基板形状とSVGの実境界を使い、細い切り欠き、接続内部に隠れた穴、離れた島、端部、余白、接続順、分割、手動経路を確認します。`test_tape_outline.py` はコの字SVGで幅入力、自動分割、ドラッグ・座標・矢印・回転・整列の拒否と元データの保持、2D/3D表示、JSON互換を確認します。
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

`tapeWidth` は基板の実際の幅（mm）です。新規設定の8 mmは仮値で、型番変更では幅を変えません。旧version 1設定で幅がない場合は、従来の3D表示と同じ `packageSize + 2` mmを補います。

`Optics.tapeFootprints` はLED位置の回転した端部、LED間の連続した基板、LED外形の凸多角形を返します。`Optics.tapeFits` は全形状の包含を確認します。SVGでは和集合の実境界と基板内部の交差を判定するため、LED中心が内側でも細い切り欠きや基板内部の穴を見逃しません。判定と2D/3D表示は同じ基板形状を使います。

`Optics.tapeLayout` で自動配置を固定座標とテープ区切りに変換します。候補の端部・外形が入らない位置は採用せず、接続が切り欠きや穴を跨ぐ箇所は別テープに分けます。削除したLEDの前後を繋ぎ直しません。手動経路は元の折れ線とLED間の接続の両方を検証し、入らない経路を拒否します。指定した並列行の本数以上に分割が必要な場合もエラーにします。

`Optics.moveTape` と回転・整列・複製は、群全体の幅・端部・接続を検証し、入らない場合は例外にして元のデータを変更しません。移動中はUIだけにプレビューを保持し、ドロップで状態・自動保存・計算へ反映します。輪郭や幅の変更で固定配置が不適合になった場合、座標と接続を保持して赤く表示し、該当群全体を光学計算から除外します。実物の曲げ半径、切断単位、別テープ間の配線はモデル化しません。

### SVGの輪郭データ

`shape: "svg"` は `svgShapes` の全形状の塗り領域の和集合です。各要素は `fillRule` (`nonzero` / `evenodd`) と `contours`（各輪郭の0〜100%の座標配列）を持ちます。ラベルは `svgLabel` に保存します。既存schemaVersion 2の追加項目で、旧JSONは空のSVGデータを補います。

SVG文書はDOMParserで解析し、数値とpath/transform/fill-ruleだけを読み取ります。元の文書をDOMへ挿入しません。新規作成したSVGPathElementで曲線を計測し、命令の端点を保持しながら、変換後の最大辺の0.05%を基準に線分へ近似します。取り込み前に文法と複雑さを検証します。

WorkerはSVG DOMへ依存せず、数値化した形状からマスク・ROI・LED配置を求めます。パスの交点で線分を分割し、塗り領域の両側が異なる線分だけを実際の境界にします。これにより重なりやnonzero内部線をROIの端にしません。形状キャッシュには寸法と全SVGデータを含めます。

SVG・多角形の外周配置は各辺の局所的な内向きオフセットを交差させた折れ線をサンプリングし、穴では塗り領域側へずらします。凹部で折れ線が自己交差する場合を含め、最終候補の全基板形状を検証して分割します。円・楕円の輪状配置は端部の半対角長も余白に含めます。これは配置候補を作る近似で、最適な詰め込みや実物の曲げを保証するものではありません。
