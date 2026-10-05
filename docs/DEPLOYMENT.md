# GitHub Pages 公開ガイド

## 前提

この手順はGitHub.comの新しい空の公開リポジトリと、`main` ブランチを想定しています。
既存のリポジトリへ追加する場合は、既存ファイルや公開設定を上書きせず、専用ブランチで内容を確認してください。

今回の納品はプロジェクトファイルの作成までです。以下のURLや名前は例で、リポジトリの作成・実サイトへのデプロイは未実施です。

## 1. 空のリポジトリを作る

GitHubの New repository で、たとえば `diffusion-lab` を作ります。
以下のGitコマンドを使う場合は、README・.gitignore・LICENSEの自動追加を選ばず、空の状態にしてください。
無料プランでの公開を想定してPublicを選ぶ手順です。公開範囲は作成前に確認してください。

## 2. プロジェクトの中身をpushする

ZIPを展開して、`index.html`、`build.py`、`.github` が見えるフォルダーでコマンドを実行します。
`YOUR_GITHUB_NAME` と必要に応じてリポジトリ名を置き換えます。

```sh
git init -b main
git add .
git commit -m "Initial Diffusion Lab Pages project"
git remote add origin https://github.com/YOUR_GITHUB_NAME/diffusion-lab.git
git push -u origin main
```

GitHubのWeb画面でアップロードすることもできます。その場合も、ZIPをそのままアップロードしたり、プロジェクトの親フォルダーを一段余分に入れたりしないでください。

`.github` は先頭にドットが付いたフォルダーです。ファイル選択やコピー時に見落とさず、次のファイルがリポジトリに存在することを確認します。

```text
.github/workflows/pages.yml
```

## 3. Pagesの公開元をGitHub Actionsにする

リポジトリで次を選びます。

```text
Settings
  → Pages
    → Build and deployment
      → Source: GitHub Actions
```

公式のワークフローテンプレートを新たに作る必要はありません。同梱の `pages.yml` を使用します。

初回push時点でPagesが未設定だと、テストが成功しても公開ジョブが失敗することがあります。
上記の設定を行った後、次の操作で明示的に再実行してください。失敗履歴が残っていても、後から成功した実行を確認すれば問題ありません。

```text
Actions
  → Test and deploy GitHub Pages
    → Run workflow
      → Branch: main
        → Run workflow
```

## 4. 公開を確認する

`Test and build` と `Deploy to GitHub Pages` が成功したら、Settings → Pagesに表示されるサイトURLを開きます。
普通のプロジェクト用リポジトリならURL形式は次のとおりです。

```text
https://YOUR_GITHUB_NAME.github.io/diffusion-lab/
```

`YOUR_GITHUB_NAME.github.io` というユーザーサイト用リポジトリを使う場合は、通常リポジトリ名のパスが付きません。本アプリはどちらも同じHTMLを使えます。

表示後、サンプル選択、距離変更、6距離比較、JSON書き出しまで操作すると初回確認になります。

## 更新の流れ

```text
src/を変更
  → mainへpush
  → JavaScript構文検査
  → HTMLと公開専用フォルダーのビルド
  → ビルド・計算・ブラウザテスト
  → 成功時のみPagesへ公開
```

Pull Requestではビルドとテストのみを行います。公開権限があるのは `main` の公開ジョブだけです。
管理者が本番用 `github-pages` environmentのデプロイ許可を `main` のみに制限する運用も推奨します。
ワークフローに個人用アクセストークンや秘密鍵を埋め込む必要はありません。GitHubが用意するトークンと明示したジョブ権限を使用します。

ルートの `index.html` を直接編集しても、次のビルドで `src/` から再生成されます。変更は `src/` に加えてください。
Actions内で再生成した `index.html` はリポジトリには自動コミットしません。単独HTMLの配布版も更新する場合は、ローカルで `python build.py` を実行してコミットします。

## GitHub Actionsを使わずに公開する代替手順

生成済み `index.html` があるため、手動ビルドを前提にしたブランチ公開も可能です。
ただし、公開前テストを自動で必須にする同梱ワークフローの方を通常は推奨します。

1. `python build.py` を実行し、最新の `index.html` と `.nojekyll` を `main` にコミットします。
2. 同梱の `Test and deploy GitHub Pages` ワークフローをActionsのメニューから無効化するか、`.github/workflows/pages.yml` を削除します。二つの公開方式を混在させないためです。
3. Settings → Pages → Sourceを **Deploy from a branch** に変更し、Branchを `main`、Folderを `/(root)` にして保存します。

この代替方式では `src/` の変更は自動ビルドされません。更新時は必ず生成済み `index.html` もコミットしてください。
また、ルートを公開すると開発用ファイルも配信対象になり得ます。公開物を `dist/` のみに限定する標準のActions方式とは異なります。

## よくある問題

### Actions一覧にワークフローがない

`.github/workflows/pages.yml` がリポジトリのルートから見て正しい位置にあるか確認します。
隠しフォルダーをコピーし忘れた場合や、親フォルダーを余分にアップロードした場合に起こります。
GitHubまたは組織設定でActionsが無効になっている場合は、その設定も確認してください。

### Pagesが未設定、または公開の権限エラー

SourceがGitHub Actionsか確認します。変更にはリポジトリの適切な権限が必要です。
同梱ワークフローには公開ジョブの `pages: write` と `id-token: write` を設定済みです。
組織のActions許可ポリシーやenvironmentの保護ルールがある場合は、それらにも従う必要があります。

### テストで止まる

テストが失敗した状態では公開しません。Actionsの該当ステップのログを確認してください。
ローカルで再現するコマンドは [DEVELOPMENT.md](DEVELOPMENT.md) にあります。

ブラウザのダウンロード・インストールが一時的に失敗した場合は、原因を確認してワークフローを再実行します。
CIでは `--embedded` に自動フォールバックしません。HTTP配信の検証を省略したまま公開成功に見せないためです。

### 古い画面が表示される

Actionsで最新コミットの公開が成功しているか確認し、ブラウザを再読み込みします。
Service Workerは追加していないため、独自のPWAキャッシュを削除する必要はありません。
ブラウザ内の以前の設定が復元される場合は、アプリのサンプル選択で条件を切り替えます。

### ブランチ名を変更した

ワークフローは `main` を明示しています。変更する場合は `push.branches`、`pull_request.branches`、公開条件の `refs/heads/main` をすべて揃えます。
リポジトリ名の変更だけなら、アプリやワークフローのパス修正は不要です。

## 公式資料

- [公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [独自ワークフローとPagesの権限・公開方法](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Playwright PythonのCI実行](https://playwright.dev/python/docs/ci)

参照日：2026-10-05。サービス側のUIや設定が変更された場合は公式資料を確認してください。
