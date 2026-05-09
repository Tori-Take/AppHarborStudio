# AppHarbor Studio

カートリッジ開発・検証専用のスタジオ環境。AppHarbor 本体から独立した Next.js アプリ。

## 起動方法

### 黒画面ゼロ起動（推奨）

| OS | ファイル | 操作 |
|---|---|---|
| Windows | `Studio起動.bat` | ダブルクリック |
| macOS   | `start-studio.command` | ダブルクリック（初回は右クリック→「開く」） |

初回は依存パッケージを自動インストール（数分）。
起動後、自動でブラウザが http://localhost:3100 を開く。

### CLI 起動

```bash
cd studio
npm install
npm run dev
```

## カートリッジ置き場の解決

優先順:
1. 環境変数 `STUDIO_CARTRIDGES_PATH`
2. 親フォルダの `../cartridges`（AppHarbor 内で動作している時）
3. `./workspace`（単独配布時）

## 単独配布

このフォルダは `AppHarbor/studio/` 配下に置かれているが、単独で動作するよう設計されている。

```bash
# studio フォルダだけを別の場所にコピー
cp -r AppHarbor/studio ~/Projects/MyStudio
cd ~/Projects/MyStudio
npm install
npm run dev
```

カートリッジは `./workspace/` に置く（または `STUDIO_CARTRIDGES_PATH` で指定）。

## 自己完結性チェック

```bash
npm run verify-standalone
```

Studio 内のコードが親フォルダを import していないかをスキャン。違反があれば exit code 1。

## 型定義の同期

AppHarbor 内で動作している時は `predev` / `prebuild` で自動的に親の型を確認:

```bash
npm run sync-types
```

Phase 1 では参考情報出力のみ。`lib/sdk-mock/types.ts` は手動メンテで運用する。

## Phase 1 の制限

- カートリッジ実行（routes 配下のページ表示・Server Actions）は未対応
- 仮 DB（Supabase 互換）は未対応
- 本フェーズは「manifest 確認 + 仮ユーザー切替の動作確認」までが目標

## ロードマップ

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | scaffold / manifest 表示 / ロール切替バー | ✅ |
| 2 | カートリッジ実行 + supabase mock | ✅ |
| 3 | PGlite 仮想 DB / schema.sql 自動適用 | ✅ |
| Stage A | プロジェクトクローン / 新規生成 / 規約 lint / .appcart export | ✅ |
| 4 | Claude Code 連携 / AI バイブコーディング統合 | 計画中 |

## 標準フロー（推奨・CLI 最小）

Studio は AppHarbor 内で常時動作している前提。**ターミナルを使わず Studio UI だけで開発**できる。

```
1. Studio ホーム → 「+ 新規カートリッジ」 → 名前入力
2. カートリッジ詳細 → 「📂 エクスプローラーで開く」
3. Claude Desktop アプリでそのフォルダを開く
4. AI と対話してカートリッジを実装
   ↓
5. Studio に戻って「▶ Studio で起動」で動作確認
6. 仮ユーザー切替・ロール割当てで全パターン検証
   ↓
7. 「🔎 規約チェック」が緑になるまで磨く
8. 「⬇ .appcart.json をダウンロード」 → AppHarbor に提出
```

各カートリッジには `CLAUDE.md` が自動配置されるので、Claude が文脈を把握した状態で起動する。

## Studio UI でできること

| ボタン | 機能 |
|---|---|
| **+ 新規カートリッジ** | TypingDash 流の最小骨組みを生成 |
| **▶ Studio で起動** | 仮ユーザーで動作確認 + 仮 DB（PGlite）に永続化 |
| **🤖 AI で開発** | カートリッジパス表示・コピー・エクスプローラーで開く |
| **🔎 規約チェック** | 静的 import lint で規約違反を検出 |
| **⬇ .appcart.json** | 配布用バンドルを出力 |
| **🔐 アプリ権限パネル** | ユーザー別ロール割当て・切替 |

## 上級フロー: 別 PC で開発できるよう Studio を配布する

カートリッジ開発キットを他人に渡して別 PC で開発してもらう場合の手順。

### 配布用フォルダを作成

```bash
node scripts/init-project.js C:/Users/torit/Desktop/StudioForBob
```

`node_modules` 等を除外したクリーンなコピーが作成される。
`Studio起動.bat` / `start-studio.command` も同梱される。

### 受け取る人の手順

1. **Node.js** をインストール（[nodejs.org](https://nodejs.org/ja)）
2. **Claude Desktop** をインストール（任意・AI 開発に使う場合）
3. 受け取ったフォルダを解凍
4. `Studio起動.bat` （Win） / `start-studio.command` （Mac） を**ダブルクリック**
5. 自動的にブラウザで Studio が開く
6. 「+ 新規カートリッジ」で開発開始
7. 完成したら「⬇ .appcart.json」を出力 → Tori さんへ送る

CLI 操作は不要。受け取った人もすべて UI で完結する。

### 配布される人ができること / できないこと

| | できる | できない |
|---|---|---|
| カートリッジ開発（コード作成） | ✅ | |
| 規約チェック・動作確認 | ✅ | |
| 仮ユーザーで権限テスト | ✅ | |
| `.appcart.json` 出力 | ✅ | |
| AppHarbor 本体への install | | ❌ Tori さんの役目 |
| 本番 Supabase へのスキーマ反映 | | ❌ Tori さんの役目 |

## 設計参照

- 親フォルダの [docs/design-summary.md](../docs/design-summary.md)「AppHarbor Studio」セクション
