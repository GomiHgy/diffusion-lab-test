# 検証記録

## テープ幅を含む連続輪郭判定・切り欠きを避ける配置（2026-10-05）

対象：実際の基板幅の入力、端部・回転したLED外形・LED間の基板全体の包含、凹SVG・穴・離れた領域を跨がない自動配置、手動操作の一括拒否、保存済み接続の保持、共通形状による2D/3D表示。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文 | PASS / 9ファイル | 従来7モジュールと tape-geometry / tape-placement |
| 数値・形状・モデル | PASS 145 / 145 | 従来114件と追加31件。テープ・LED両方の回転した角、境界接触、余白、細い切り欠き、基板内部に隠れた穴、SVG和集合、円環、接続順、自動分割、局所外周オフセット、元経路、指定本数、不適合群全体の除外、空の凹形・島への再追加 |
| ビルド・配信 | PASS 12 / 12 | 10ソースの埋め込み、単独HTML、公開物限定、HTTPルート・サブパス |
| ブラウザ操作 | PASS 277 / 277 | 既存100件、機能50件、操作31件、光度52件、新規輪郭44件。U/C形状、幅入力、薄い穴、自動分割、本数自動への復帰、ドラッグ・座標・矢印・回転・整列の一括拒否、手動経路・描画の拒否と復帰、全削除から1本追加、JSON・旧幅・localStorage、共通基板の3D、モバイル |
| 画面確認 | PASS | コの字2Dの基板接続と端部、台座上の14 mm基板とLEDの3D、モバイル幅入力・状態文の折り返しを目視 |
| 実行時エラー・自動外部通信 | PASS / 0件 | 各HTTPブラウザ検証で確認 |
| 生成HTML一致・差分空白 | PASS | build.py --check / git diff --check |
| 実物テープの取付・曲げ・切断・配線 | NOT RUN | 幅と面形状の検証まで。実物の曲げ半径・切断単位・別テープ間の電線はモデル外 |
| 今回のGitHub Pagesデプロイ | NOT RUN | ローカル実装・生成・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。

新規設定のテープ幅8 mmは仮値です。型番変更では入力幅を保持し、幅がない旧version 1設定は従来の描画幅 `packageSize + 2` mmを補います。判定は取り込んだSVGの線分近似に対して行い、端部・接続面内部にある切り欠きや穴も調べます。

自動配置は無効候補や不適合な接続で別のテープに分け、除いたLEDの前後を繋ぎ直しません。固定済みの手動群は分割・変形せず、不適合な群を赤く表示して群全体を光学計算から除外します。座標・接続・配線順の色は保持し、収まる位置へ戻すと再び計算します。手動経路の不適合入力も直前の適用経路を保持します。

再実行は[開発ガイド](DEVELOPMENT.md)のコマンドを使用します。追加検証は `tests/test_tape_geometry.js`、`tests/test_tape_placement.js`、`tests/test_tape_outline.py`。結果は `tests/artifacts/tape-outline-test-results.json`、画面は `preview-tape-width-u-outline.png` / `preview-tape-width-3d.png` / `preview-tape-width-mobile.png` に保存します。CIにも構文・数値・画面の検証を追加しています。

## 型番別RGB光度・光源の推定光束（2026-10-05）

対象：5型番の資料光度、Typ値と記載範囲の中点の区別、型番選択・復元、RGB白のLED1個の推定光束、手動光度と旧設定の保持、求解・演出・3D・書き出しへの反映。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| メーカー資料 | PASS / 5型番 | Worldsemi p.3、OPSCO p.6の光学表を画像と本文で確認。採用版・元範囲・Typ・電流条件を[LED_SPECS.md](LED_SPECS.md)へ記録 |
| JavaScript構文 | PASS | optics / worker / svg-import / gaming / tape-tools / view3d / app |
| 数値・形状・モデル | PASS 114 / 114 | 従来95件と光度19件。資料の固定期待値、旧値保持、非有限入力、独立した球面数値積分、120°のπI、RGB加算、出力1回、面積による光度増加なし、求解結果の光度比、キャッシュ、SK70%条件 |
| ビルド・配信 | PASS 12 / 12 | ソース・生成HTML一致、公開物限定、HTTPルート・サブパス |
| ブラウザ操作 | PASS 233 / 233 | 既存100件、機能50件、操作31件、光度52件。5型番のRGBフィールド比例、出力・露出・接続保持、手動・復元・保存・CSV、旧JSON/localStorage、演出キャッシュ再生成、2D/3D・PNG、モバイル幅 |
| 画面・PNG | PASS | 光度と根拠、RGB白・LED1個のlm説明、3D PNGの光度条件、モバイル折り返しを目視 |
| 実行時エラー・自動外部通信 | PASS / 0件 | 各ブラウザ検証で確認 |
| 生成HTML一致・差分空白 | PASS | build.py --check / git diff --check |
| 実機LEDの測光・校正 | NOT RUN | 資料に基づく計算とブラウザ検証まで。推定lmはメーカー公称光束ではない |
| 今回のGitHub Pagesデプロイ | NOT RUN | ローカル実装・生成・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。

光度値は資料に記載されたmcdを採用し、各色の正面光度として計算に使用します。TypがないWS2812B・SK6812・SK6812-MINIは範囲の中点をモデル代表値とします。採用資料に絶対光束lmはなく、前方半球のcosⁿ配光積分による推定を表示します。光度測定の電圧・温度・PWM dutyは光学表に明記されていません。

SK6812-012の三色同時70%条件は説明と計算警告で示し、入力値を強制変更しません。保存済みの明示光度は読み込み時に保持し、型番選択または初期値復元時に新しい光度を適用します。

再実行は[開発ガイド](DEVELOPMENT.md)のコマンドを使用します。追加検証は `tests/test_photometry.js` と `tests/test_photometry.py`。結果は `tests/artifacts/photometry-test-results.json`、画面は `preview-datasheet-photometry-3d.png` / `preview-datasheet-gaming-photometry.png` / `preview-datasheet-photometry-mobile.png`、PNGは `photometry-3d-preview.png` に保存します。CIにも両検証を追加しています。

## 3D土台への設置・キーボード移動・回転モード・LEDサイズ表示（2026-10-05）

対象：テープと土台の接触、立体基板・パッケージ、選択テープの矢印キー移動、ダブルクリック回転、型番ごとの外形表示。前のファビコン変更も維持しています。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文 | PASS | app / optics / view3d |
| 数値・モデル・形状 | PASS 95 / 95 | 既存87件に、型番切替の配置余白・発光ラスタ・総光度・Solverキャッシュ4件、3Dの接触高さ・1 LED基板・接続単位・表示切替と穴4件 |
| ビルド・配信 | PASS 12 / 12 | 埋め込み・HTML一致・データURIファビコンの単独配信・公開物限定・ルート／サブパス |
| 既存ブラウザ操作 | PASS 100 / 100 | SVG・接続テープ・旧設定・操作・保存・モバイル・オフライン |
| 機能ブラウザ操作 | PASS 50 / 50 | 従来42件とLED3サイズの2D実描画幅・3Dの実更新・型番切替時の外形表示・接触構造8件 |
| 新しい入力操作 | PASS 31 / 31 | 4矢印・Shift10 mm・Ctrl0.1 mm・未選択・入力欄・select・textarea・contenteditable・モーダル・3D時のガード、板端とSVG穴での一括拒否、LED/接続線ダブルクリック、centroid回転・1°/15°刻み・プレビュー・取消・最後の有効角度・移動モードへ復帰 |
| 画面確認 | PASS | 土台上の連結した3 LEDの3D、5050/3535/2020系のサイズ変化、回転案内・紫ガイド・ハンドル・角度欄 |
| 実行時エラー・外部通信 | PASS / 0件 | 3種類の実Chrome・ローカルHTTP検証中 |
| 生成HTML・空白検査 | PASS | build.py --check / git diff --check |
| LED実機・光学校正・実機スマートフォン | NOT RUN | ブラウザとモバイル幅エミュレーションまで |
| 今回のGitHub Pagesデプロイ | NOT RUN | ローカルの実装・ビルド・配信検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。

型番切替の外形・発光幅は既に求解へ反映されていましたが、仕上がりでは外形表示がOFFだとパッケージ寸法が見えません。型番切替で外形表示をONにし、サイズ区分と計算に使う代表幅を表示します。資料値・開口近似・未記載値の仮定を維持し、外形幅をそのまま発光幅として扱う変更は行っていません。

3Dでは土台上面と基板底面、基板上面とLEDパッケージ底面の高さを一致させます。高さは模式値で、LED発光面z=0と板裏面gapの基準を変えません。回転ドラッグは接続群の平均位置を軸にし、確定前は保存した配置を変えず、取消で戻します。

既存コマンドに `python tests/test_interactions.py` を追加して再実行できます。結果は `tests/artifacts/interaction-test-results.json`、画面は `preview-tape-keyboard-editor.png` / `preview-tape-rotation-editor.png` / `features-mounted-tapes.png` に保存します。CIにも新しい操作検証を追加済みです。

## テープ本数・回転・整列 / 3D / 動くRGB演出（2026-10-05）

対象：LEDテープ本数の指定・複製・削減、接続したLED群の剛体回転、板に対する6方向の整列、2D/3D切替・視点・PNG、4種類の動くRGB演出・停止・保存・同位相の距離比較。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文 | PASS | optics / worker / svg-import / tape-tools / gaming / view3d / app |
| 数値・形状・モデル | PASS 87 / 87 | 従来の光学・LED型番・SVG58件に、テープ編集12件、演出11件、3D6件。回転中心・距離保持・他テープ不変・6方向・全体整列・複製・一括失敗・5,000 LED上限・周期・PWM・線形光学補間・厚さと距離・穴・和集合 |
| ビルド・配信 | PASS 12 / 12 | 8ソースのそのままの埋め込み、indexとソース一致、公開ファイル限定、HTTPルート・サブパス |
| 既存ブラウザ操作 | PASS 100 / 100 | SVG取り込み、テープ移動、旧JSON・localStorage、従来の設定・比較・出力・モバイル操作 |
| 新機能のブラウザ操作 | PASS 42 / 42 | 本数・再読み込み・回転・6方向・全体整列・複製・入らない本数の一括拒否、3Dカメラ・ホイール・リセット・PNGと背景、SVGの穴、24位相の準備、物理フィールドの変化、4演出・速度・停止・指定精度・位相入力・JSON、同位相の距離比較、過去比較からの再生、モバイル欄 |
| 画面・PNG | PASS | デスクトップ3DとPNG、モバイル3D・テープ編集を目視。板厚・ギャップ・視点欄・6方向の整列欄・再生欄を確認 |
| 実行時エラー・自動外部通信 | PASS / 0件 | 2種類のブラウザ検証中。ライブラリ・CDNを使わず動作 |
| 生成HTML一致・差分の空白検査 | PASS | build.py --check / git diff --check |
| 実機LEDへの出力・光学校正 | NOT RUN | ブラウザの設計比較プレビュー。LEDへの通信は今回の対象外 |
| 実機スマートフォンの操作 | NOT RUN | 390px幅のChromeエミュレーションまで |
| GitHub Pagesへの今回のデプロイ | NOT RUN | ローカル実装・単独HTML生成・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。
3Dは正面光学結果の遠近投影で、斜め配光・反射・屈折の計算ではありません。演出の再生中は長辺160点の24位相を線形補間し、停止時は現在位相を選択精度で直接計算します。テープ複製の空き場所判定は外接範囲に基づく近似です。

再実行（PowerShell）：

```powershell
.\.venv\Scripts\python.exe build.py
node --test tests/test_optics.js tests/test_led_profiles.js tests/test_svg.js tests/test_tape_tools.js tests/test_gaming.js tests/test_view3d.js
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_build.py -v
$env:CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:PYTHONIOENCODING = 'utf-8'
.\.venv\Scripts\python.exe tests/test_browser.py
.\.venv\Scripts\python.exe tests/test_features.py
.\.venv\Scripts\python.exe build.py --check
```

新機能の操作結果は `tests/artifacts/features-report.json`、画面は `features-3d.png` / `features-mobile.png` / `features-mobile-editor.png`、PNG・設定は `features-3d-export.png` / `features-settings.json` に保存します。GitHub Actionsにも新モジュールと新ブラウザ検証を追加しています。

## SVGの全パス輪郭取り込み（2026-10-05）

対象：SVGファイル・d属性の入力、全パスの和集合、曲線・穴・変換の読み取り、輪郭の表示と光学計算、設定保存・復元、単独HTMLの再生成。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文検査 | PASS | optics.js / svg-import.js / app.js / worker.js |
| 光学・型番・テープ・SVG | PASS 58 / 58 | 既存45件とSVG13件。パス文法、相対座標、円弧フラグ、変換、塗り規則、穴、重なり、重複、離れた輪郭、自己交差、ROI、外周の接続、LED配置・テープ移動 |
| ビルド・配信 | PASS 12 / 12 | 5ソースの埋め込み、単独HTML一致、公開ファイル限定、ルート・サブパスのHTTP配信 |
| ブラウザ操作 | PASS 100 / 100 | 実際のローカルHTTP。全3パスのSVG、親グループ変換、穴と空白のマスク、ベジェ曲線・円弧、開いたパス、CSS塗り規則の明示指定、不正入力時の既存輪郭保持、JSON・HTTP再読み込み、従来の操作 |
| 元SVGのスクリプト・外部参照 | PASS / 実行・通信0件 | スクリプト、イベント属性、画像、外部DOCTYPEを含むSVGを数値化。元の文書を挿入せず参照先を読み込まない |
| モバイル幅・画面確認 | PASS | 390px幅のChromeエミュレーションでSVG入力・穴を適用。横方向のはみ出しなし。デスクトップの輪郭・穴・離れた部分・取り込み欄を目視確認 |
| 実行時エラー・自動外部通信 | PASS / 0件 | 上記のブラウザ操作中 |
| 実機スマートフォンでの操作 | NOT RUN | エミュレーションまで |
| GitHub Pagesへの今回の変更のデプロイ | NOT RUN | ローカルのビルド・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。
円弧の閉じた終点にはブラウザの丸め誤差が含まれるため、近似精度より十分小さい終点のずれを吸収し、境界を接続します。曲線の厳密なCAD形状一致や寸法測定を保証する検証ではありません。

再実行コマンド（PowerShell）：

```powershell
.\.venv\Scripts\python.exe build.py
node --test tests/test_optics.js tests/test_led_profiles.js tests/test_svg.js
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_build.py -v
$env:CHROMIUM_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:PYTHONIOENCODING = 'utf-8'
.\.venv\Scripts\python.exe tests/test_browser.py
.\.venv\Scripts\python.exe build.py --check
```

テスト結果、SVG設定JSON、デスクトップとモバイル幅の画像は `tests/artifacts/` に保存します。対応範囲・寸法・近似・未対応項目は [操作ガイド](USAGE.md) を参照してください。

## LEDテープ全体の位置調整（2026-10-05）

対象：接続単位の選択・強調表示、ドラッグ、先頭LEDのX/Y座標入力、取り消し、接続情報の保存復元、再生成した単独HTML。

| 検証 | 結果 | 確認内容 |
|---|---|---|
| JavaScript構文検査 | PASS | optics.js / app.js / worker.js |
| 光学計算・型番・テープ配置 | PASS 45 / 45 | テープ単位、配線順、平行移動、他テープ不変、角度・色・間隔の維持、輪郭外拒否、旧設定、輪郭変更後の座標保持 |
| ビルド・配信 | PASS 12 / 12 | ソース一致、公開ファイル限定、ルートとサブパスのHTTP配信 |
| ブラウザ操作 | PASS 76 / 76 | Chromeで実際のローカルHTTPから読み込み。LED中心・接続部分のドラッグ、X/Y・小数・Enter、範囲外・空欄、Escape・pointercancel、選択なし時の無効化、JSON保存復元、HTTP再読み込み |
| モバイル幅の操作 | PASS | 390px幅のChromeエミュレーション。タッチイベントでテープを移動し、X/Yを適用。横方向のはみ出しなし |
| 実行時エラー・自動外部通信 | PASS / 0件 | 上記ブラウザ操作中 |
| 画面の目視確認 | PASS | テープ全体の強調、先頭位置の表示、座標欄と説明。デスクトップとモバイル幅の画像 |
| 実機スマートフォンでの操作 | NOT RUN | ブラウザのエミュレーションまで |
| GitHub Pagesへの今回の変更のデプロイ | NOT RUN | ローカルのビルド・HTTP検証まで |

実行環境：Windows、Python 3.11.7、Node.js 24.13.0、Playwright 1.57.0、Chrome 152.0.7977.83。
再実行コマンドは次節と同じです。`tests/artifacts/` に操作結果JSON、テープ設定JSON、デスクトップ・モバイル幅の画像を保存します。

移動時はテープ全体の座標を一括で検証し、ドラッグ中はプレビューだけを変更します。ドロップ後に自動保存・再計算し、ドラッグ中の古い結果の書き出しは無効にします。旧個別配置は1本として復元します。詳しい操作と座標基準は [操作ガイド](USAGE.md) を参照してください。

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
