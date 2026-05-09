# AppHarbor Studio — Claude Code 向け プロジェクトガイド

AppHarbor Studio は **カートリッジ開発・検証スタジオ**。
AppHarbor プラットフォームにインストール可能な小さなアプリ（カートリッジ）を、
誰もがローカル環境で開発・テスト・エクスポートできる独立した開発キット。

---

## 目的とビジョン

**最終目標**: AppHarbor にインストールできるアプリを、誰もがこの Studio で作れること。

- Studio はカートリッジ開発者向けの**独立したプロジェクト**として配布される
- AppHarbor 本体のソースコードは不要。Studio 単独で完結する
- 本物の Supabase の代わりに **PGlite (WASM PostgreSQL)** を使い、DB セットアップ不要で即開発可能
- 本物の認証の代わりに**モックユーザー（30 人）+ 3 階層の部署構成**で権限テストが可能
- 完成したカートリッジは `.appcart.json` にエクスポートし、AppHarbor 本体にインストールする

---

## AppHarbor 本体との関係

| | AppHarbor (本体) | AppHarbor Studio |
|---|---|---|
| **役割** | 本番 SaaS プラットフォーム | カートリッジ開発環境 |
| **ブランド** | カラー (Amber + 黒) | モノクロ (黒・白) |
| **DB** | Supabase (PostgreSQL + Auth + RLS) | PGlite (WASM, ローカルファイル保存) |
| **認証** | Supabase Auth (実ユーザー) | モック (cookie ベースのユーザー切替) |
| **デプロイ** | Vercel | ローカル (`npm run dev`) |
| **ポート** | 3000 (dev) / 3100 (start) | 3200 |
| **組織スラッグ** | 動的 (`/org/[slug]/`) | 固定 `studio-sandbox` |

### SDK の二重構造

カートリッジは `@/sdk` からインポートする。この `@/sdk` のマッピング先が環境で異なる:

```
カートリッジコード:  import { requireActor } from '@/sdk'
                          ↓ tsconfig paths
AppHarbor 本体:     lib/sdk/        → 本物の Supabase クライアント
AppHarbor Studio:   lib/sdk-mock/   → PGlite + モックユーザー
```

カートリッジのコードは一切変更せずに両環境で動く。

---

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + React 19
- **CSS**: Tailwind 4 + shadcn/ui + lucide-react
- **DB**: PGlite (WASM PostgreSQL, `.studio-db/pgdata` に永続化)
- **状態管理**: Zustand (モックユーザー・組織の状態)
- **言語**: TypeScript
- **ポート**: 3200 (`npm run dev`)

---

## ディレクトリ構成

```
AppHarborStudio/
├── app/                          # Studio 自体の Next.js ページ
│   ├── page.tsx                 #   ホーム（カートリッジ一覧）
│   ├── layout.tsx               #   ルートレイアウト（Sidebar + PreviewNav）
│   ├── inspector/               #   DB インスペクタ
│   ├── cartridge/
│   │   ├── new/                 #   新規カートリッジ作成
│   │   └── [appId]/             #   カートリッジ詳細（Play/Lint/Export）
│   ├── org/[slug]/
│   │   ├── layout.tsx           #   実行レイアウト（PermissionPanel 付き）
│   │   └── apps/                #   ← ここにカートリッジ routes がマウントされる
│   │       └── patrol-navi/     #     mount-cartridges.js がコピーした内容
│   └── api/                     #   各種 API ルート
│       ├── pg-query/            #     ブラウザ → PGlite プロキシ
│       ├── cartridges/          #     カートリッジ管理 CRUD
│       ├── db/                  #     テーブル一覧・クエリ実行
│       ├── app-permissions/     #     権限管理
│       ├── studio/              #     ヘルスチェック・リセット・再起動
│       ├── mount/               #     手動リマウント
│       └── fs/open/             #     エクスプローラで開く
├── lib/
│   ├── config.ts                # resolveCartridgesPath() — カートリッジ置き場解決
│   ├── cartridge-scanner.ts     # scanCartridges() — manifest.json ベースの検出
│   ├── cartridge-lint.ts        # lintCartridge() — import 規約チェック
│   ├── sdk-mock/                # ← モック SDK（後述）
│   │   ├── index.ts             #   メインエクスポート (requireActor, createServerSupabase 等)
│   │   ├── types.ts             #   型定義 (OrgActor, AppContext, OrgRole 等)
│   │   ├── store.ts             #   Zustand ストア (30 ユーザー, 10 部署)
│   │   ├── server-context.ts    #   サーバー側コンテキスト (cookie → ユーザー)
│   │   ├── client.ts            #   ブラウザ側クエリビルダ (/api/pg-query 経由)
│   │   ├── supabase-mock.ts     #   Supabase 互換クエリ実行 (PGlite)
│   │   ├── pg.ts                #   PGlite シングルトン + スキーマ自動適用
│   │   ├── app-permissions.ts   #   ロールオーバーライド永続化
│   │   ├── query-log.ts         #   クエリログリングバッファ (200 件)
│   │   ├── perm-error.ts        #   権限エラー構造化
│   │   └── db-base.sql          #   ベーススキーマ (ユーザー・組織シード)
│   ├── utils.ts                 # cn() ユーティリティ
│   └── use-fullscreen-mode.ts   # フルスクリーンフック
├── components/
│   ├── Sidebar.tsx              # 左サイドバー（カートリッジ一覧）
│   ├── PreviewNav.tsx           # 上部ナビゲーション
│   ├── PermissionPanel.tsx      # 右サイドバー（ロール割当）
│   ├── RoleSwitcher.tsx         # ユーザー/ロール切替
│   ├── RemountButton.tsx        # カートリッジ再マウント
│   ├── PlayButton.tsx           # カートリッジ起動
│   ├── ExportButton.tsx         # .appcart.json エクスポート
│   ├── LintPanel.tsx            # Lint 結果表示
│   └── ui/                     # shadcn/ui コンポーネント
├── cartridges/                  # カートリッジ本体
│   └── patrol-navi/             #   サンプル / 実用カートリッジ
│       ├── manifest.json        #     カートリッジ定義
│       ├── routes/              #     ページ群 (page.tsx)
│       └── db/                  #     schema.sql + sample-data.sql
├── scripts/
│   ├── dev-supervisor.js        # dev server 管理 + auto-sync
│   ├── mount-cartridges.js      # routes/ → app/ コピー
│   ├── sync-types.js            # 型同期 (親が存在する時のみ)
│   ├── sync-types-if-parent-exists.js  # predev フック
│   ├── check-no-parent-imports.js      # 独立性チェック
│   └── init-project.js          # 外部クローン用
├── templates/                   # クローン時テンプレート
├── workspace/                   # フォールバックのカートリッジ置き場
├── .studio-db/                  # PGlite データ + 権限 JSON
└── public/brand/                # ブランドアセット (モノクロ)
```

---

## カートリッジの仕組み

### カートリッジの構造

```
cartridges/{id}/
├── manifest.json       # 必須: ID, 名前, 権限, ナビゲーション, テーブル定義
├── routes/             # 必須: Next.js ページ群
│   ├── page.tsx       #   カートリッジのホーム
│   ├── admin/         #   管理画面
│   └── ...
├── db/
│   ├── schema.sql     # PGlite に自動適用されるテーブル定義
│   └── sample-data.sql # サンプルデータ
├── CLAUDE.md           # カートリッジ固有の指示
└── icon.svg            # アイコン (オプション)
```

### マウント（ルーティング）

`scripts/mount-cartridges.js` がカートリッジの `routes/` を Next.js のルーティングにコピーする:

```
cartridges/patrol-navi/routes/admin/page.tsx
  → app/org/[slug]/apps/patrol-navi/admin/page.tsx
```

URL: `http://localhost:3200/org/studio-sandbox/apps/patrol-navi/admin`

### カートリッジ検出

ホームページの一覧表示は `lib/cartridge-scanner.ts` の `scanCartridges()` が担う:

1. `lib/config.ts` → `resolveCartridgesPath()` でカートリッジ置き場を特定
2. 各サブフォルダの `manifest.json` を読み込み
3. `studioCompatible: false` のカートリッジは除外マーク
4. `routes/` と `db/` の有無を検出

**パス解決の優先順位**（`resolveCartridgesPath` と `mount-cartridges.js` で統一）:
1. 環境変数 `STUDIO_CARTRIDGES_PATH`
2. `./cartridges` (ローカル / 単独配布時)
3. `../cartridges` (AppHarbor 内で動作している時)
4. `./workspace` (フォールバック)

### 権限モデル

manifest.json の `permissions` でロールを定義:

```json
{
  "permissions": [
    { "id": "viewer", "label": "閲覧者", "default": true },
    { "id": "admin", "label": "管理者" }
  ]
}
```

Studio ではロール切替 UI (`PermissionPanel`) で任意のユーザーにロールを割り当て、
権限による画面の出し分けをテストできる。
ロール情報は `.studio-db/app-permissions.json` に永続化される。

---

## SDK モック層 (`lib/sdk-mock/`)

カートリッジが `@/sdk` から使う主要関数:

| 関数 | 用途 |
|---|---|
| `requireActor(slug)` | 現在のログインユーザーを返す (cookie ベース) |
| `requirePlatformAdmin()` | プラットフォーム管理者チェック |
| `requireApp(slug, appId)` | アプリコンテキスト取得 + ロールチェック |
| `getAppRole(slug, appId, userId)` | ユーザーのアプリロール取得 |
| `createServerSupabase()` | PGlite ラップの Supabase 互換クライアント (サーバー用) |
| `getAdminSupabase()` | RLS スキップの管理者クライアント |

### クエリの流れ

```
サーバーコンポーネント:
  createServerSupabase() → supabase-mock.ts → PGlite 直接

クライアントコンポーネント:
  createBrowserSupabase() → client.ts → /api/pg-query → PGlite
```

### モックデータ

- **30 人のユーザー** (8 人が主要テスト用)
- **10 部署** (3 階層: 本部 → 部 → 課)
- **組織**: `studio-sandbox` (固定スラッグ)
- **PGlite 永続化**: `.studio-db/pgdata` (ファイルシステム)

---

## 開発ワークフロー

### 起動

```bash
npm run dev       # supervisor 経由 (auto-sync + restart 対応)
npm run dev:raw   # Next.js 直接起動 (デバッグ用)
```

### カートリッジ開発の流れ

1. `cartridges/{id}/` にフォルダを作成
2. `manifest.json` を作成 (最低限: id, name, permissions)
3. `db/schema.sql` でテーブル定義
4. `routes/page.tsx` を作成
5. dev server が `auto-sync` で変更を自動検出・マウント
6. ブラウザで `/org/studio-sandbox/apps/{id}` にアクセス

### dev-supervisor の機能

- カートリッジファイルの変更を `fs.watch` で監視し、`routes/` 配下の変更を自動でマウント先にコピー
- `.studio-restart-flag` ファイルの出現で dev server を自動再起動 (`.next` 削除含む)
- Studio UI からの再起動ボタン対応

### DB スキーマの自動適用

`lib/sdk-mock/pg.ts` が PGlite 初期化時に:
1. `db-base.sql` (ユーザー・組織シード) を適用
2. 各カートリッジの `db/schema.sql` を順番に適用
3. `studioCompatible: false` のカートリッジはスキップ

---

## UI コンポーネント

### Button コンポーネント

`components/ui/button.tsx` は `@base-ui/react/button` ベース。
**Radix の `asChild` には未対応**:

```tsx
// NG: asChild は動かない
<Button asChild><Link href="...">...</Link></Button>

// OK: buttonVariants を使う
<Link href="..." className={cn(buttonVariants({ size: 'sm' }))}>...</Link>
```

---

## 重要原則

### Studio フォルダの独立性

- Studio 内のコードは Studio フォルダ外を一切 import しない
- `scripts/check-no-parent-imports.js` で検証可能
- 親フォルダ (AppHarbor 本体) が存在する時のみ `predev` で型同期

### カートリッジの import ルール

カートリッジは以下のみ import 可能:

| 許可 | 例 |
|---|---|
| `@/sdk` / `@/sdk/*` | `import { requireActor } from '@/sdk'` |
| `react` / `react-dom` | `import { useState } from 'react'` |
| `next/*` | `import Link from 'next/link'` |
| 相対パス | `import { MyComponent } from './components/MyComponent'` |
| npm パッケージ | `import { format } from 'date-fns'` |

以下は**禁止** (`cartridge-lint.ts` が検出):
- `@/lib/*` — Studio 内部モジュール
- `@/components/*` — Studio UI コンポーネント
- `@/app/*` — Studio ページ

### モック SDK の shape 維持

`lib/sdk-mock/types.ts` の型定義は AppHarbor 本体の `lib/sdk/types.ts` と一致させる。
型のズレはカートリッジの本番デプロイ時にエラーを引き起こす。

---

## よくある罠

### PowerShell 5.1 のエンコーディング

`.ps1` / `.bat` ファイルに日本語コメントを書かない。
BOM なし UTF-8 を Shift-JIS と誤解釈し、謎の構文エラーになる。

### Windows のディレクトリロック

`cartridges/` 配下のフォルダは Next.js の file watcher が掴むため、
削除時は dev server を止めてから操作する。

### gitignore の `[slug]` 問題

`.gitignore` で `[slug]` を使う時は `\[slug\]` とエスケープ。
`[slug]` はキャラクタークラス (s, l, u, g の 1 文字) として解釈される。

### PGlite のパス

Windows では PGlite のパスをフォワードスラッシュに変換する必要がある。
`pg.ts` が自動処理するので、呼び出し側は気にしなくてよい。

---

## 配色・ブランド

Studio は**モノクロ**。カラーは本番 (AppHarbor 本体) 専用:

| 要素 | Studio | 本体 |
|---|---|---|
| ロゴ | `appharbor-logo-black.svg` (黒) | `appharbor-logo-light.svg` (カラー) |
| favicon | 黒固定版 | カラー版 |
| テーマ | モノクロ (黒・白) | Amber + 黒 |

サイドバーロゴ下に `STUDIO` をトラッキング広め (`tracking-[0.3em] uppercase`) で表示。

---

## API ルート一覧

| エンドポイント | メソッド | 用途 |
|---|---|---|
| `/api/pg-query` | POST | ブラウザ → PGlite クエリプロキシ |
| `/api/cartridges/[appId]` | GET | カートリッジ情報取得 |
| `/api/cartridges/[appId]/lint` | GET | Lint 実行 |
| `/api/cartridges/[appId]/export` | GET | .appcart.json エクスポート |
| `/api/cartridges/[appId]/reset` | POST | カートリッジ状態リセット |
| `/api/cartridges/new` | POST | 新規カートリッジ作成 |
| `/api/app-permissions/[appId]` | GET/POST | 権限管理 |
| `/api/db/tables` | GET | テーブル一覧 |
| `/api/db/query` | POST | SQL 直接実行 |
| `/api/db/log` | GET | クエリログ取得 |
| `/api/studio/health` | GET | ヘルスチェック |
| `/api/studio/restart-dev` | POST | dev server 再起動 |
| `/api/studio/clean-start` | POST | 全データリセット |
| `/api/mount` | POST | カートリッジ再マウント |
