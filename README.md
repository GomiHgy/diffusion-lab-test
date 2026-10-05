# Diffusion Lab — GitHub Pages プロジェクト

フルカラーLEDと拡散板の距離・形状・材料・配置を比較するブラウザアプリ。
元の **Diffusion Lab 1.0** の機能を保ち、GitHub Pagesでの公開と継続開発に必要な構成を追加しました。

**実測校正前の設計比較モデルです。実物の見え方を保証するものではありません。**
計算モデルと対象外の条件は [モデルの説明](docs/MODEL.md) を参照してください。

![Diffusion Lab の画面](docs/assets/preview-comparison.png)

## GitHub Pagesで公開

1. GitHubで空のリポジトリを作ります。例：`diffusion-lab`。この手順では公開リポジトリを想定しています。
2. このプロジェクトの**中身**をリポジトリのルートにコミットします。`index.html`、`src/`、`.github/` が同じ階層になるように配置してください。ZIPそのものをアップロードするのではありません。
3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にします。
4. **Actions → Test and deploy GitHub Pages → Run workflow** を開き、`main` を選んで実行します。

完了すると Settings → Pages とワークフローの deploy ジョブに公開URLが表示されます。
通常のプロジェクトサイトのURL形式は次のとおりです。これは**例であり、公開済みURLではありません**。

```text
https://YOUR_GITHUB_NAME.github.io/diffusion-lab/
```

以後は `main` へのpushでビルドとテストを行い、すべて成功した場合だけ自動公開します。
Pull Requestではテストのみを実行し、本番公開しません。

**リポジトリ名を変えてもアプリ内のパス修正は不要です。** JavaScript、CSS、計算Workerを単独HTMLへ埋め込む構成で、ユーザー名やリポジトリ名をコードに固定していません。

Gitコマンド、初回公開のエラー対処、ブランチ公開の代替手順は [公開ガイド](docs/DEPLOYMENT.md) にあります。
GitHub Pagesの設定方法は [GitHub公式ドキュメント](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) に基づいています。

## ローカルで使う

同梱の `index.html` をブラウザで開きます。アプリの利用だけならPython・Node.js・npm・APIキーは不要です。
HTMLファイルの直接実行を制限する環境では、プロジェクトフォルダー内で次を実行します。

```sh
python -m http.server 8000 --bind 127.0.0.1
```

ブラウザで `http://localhost:8000/` を開いてください。設定はブラウザ内に保存し、重要なものはアプリのJSON書き出しでも保存できます。
この構成にService Workerはなく、オンライン公開したURLのオフライン再読み込みを保証するものではありません。保存した単独HTMLは別途オフラインで使用できます。

## 編集・ビルド

編集するファイルは `src/` 以下です。

```sh
python build.py
```

Python標準ライブラリだけで、ルートの `index.html` と公開専用の `dist/` を再生成します。
`dist/` は毎回作り直すため、手作業でファイルを置かないでください。

GitHub Actionsも同じビルドを実行し、**`dist/` の中身だけ**を配信します。ワークフロー、テスト、開発用ドキュメントはPagesの公開物に含めません。
ただし、公開リポジトリそのもののソースは公開されます。

ルートの `index.html` は持ち運び・手動公開用の生成済みコピーです。Actionsによる再生成結果はリポジトリには書き戻しません。単独HTMLも最新に保つ場合は、ローカルでビルドして `src/` と一緒にコミットしてください。

## 構成

```text
.
├── index.html                   単独で使える生成済みアプリ
├── src/                         編集するソース（画面・CSS・計算・Worker）
├── build.py                     単独HTMLとdist/の生成
├── examples/                    JSON設定サンプル5件
├── tests/                       計算・ビルド・ブラウザテスト
├── docs/                        操作・モデル・公開・開発ガイド
├── requirements-dev.txt         ブラウザテスト専用の依存
├── .github/workflows/pages.yml  テストとGitHub Pagesへの公開
├── .github/dependabot.yml       開発依存・Actionsの更新確認
└── .nojekyll                    手動のブランチ公開にも使用
```

## テスト

ビルド後に次を実行します。

```sh
python -m unittest discover -s tests -p "test_build.py" -v
node --test tests/test_optics.js
```

ブラウザテストにはPlaywrightとChromiumが必要です。開発・CIの手順は [開発ガイド](docs/DEVELOPMENT.md)、今回の実行結果と検証範囲は [検証記録](docs/TEST_REPORT.md) を参照してください。

## ガイド

[操作ガイド](docs/USAGE.md) · [計算モデル](docs/MODEL.md) · [公開ガイド](docs/DEPLOYMENT.md) · [開発ガイド](docs/DEVELOPMENT.md) · [検証記録](docs/TEST_REPORT.md)

## 公開とライセンス

このパッケージではGitHubへのリポジトリ作成・push・実サイトの公開は行っていません。
ライセンスの指定は受けていないため、MIT等のライセンスを自動付与していません。再配布条件を決める場合は、公開時に適切な `LICENSE` を追加してください。
