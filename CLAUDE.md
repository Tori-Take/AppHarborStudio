# AppHarbor Studio — Claude Code 向け プロジェクトガイド

AppHarbor Studio は **カートリッジ開発・検証スタジオ**。
AppHarbor プラットフォームにインストール可能な小さなアプリ（カートリッジ）を、
誰もがローカル環境で開発・テスト・エクスポートできる独立した開発キット。

---

## 🎯 AppHarbor 最終目標との関係

Studio は **AppHarbor 全体の最終目標を実現する手段** のひとつ。
全体ビジョンは AppHarbor 本体リポジトリの `docs/vision.md` に定義されている:

> **B2B 業務 SaaS の共通インフラを 1 つにまとめ、AI バイブコーディングで「カートリッジを書く時間を 1/10 にする」プラットフォーム**

参照: [Tori-Take/AppHarbor の docs/vision.md](https://github.com/Tori-Take/AppHarbor/blob/main/docs/vision.md)

Studio はこのビジョンにおいて:
- カートリッジ作者の **開発体験を最大化** する役割
- ローカル環境で **3 環境統一実行** の最初の検証地点
- AI バイブコーディングと連携する **入口**

Studio の改修判断はすべて **「このビジョンへの貢献度」** で優先順位を決める。

---

## 目的とビジョン（Studio 自体）

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

### Tailwind 4 の `[slug]` 問題（gitignore と同根）

Tailwind 4 の自動 content 検出も内部で fast-glob を使うため、
`app/org/[slug]/apps/...` 配下のカートリッジ utility class が CSS に出力されない。
症状: `sm:hidden` が効かず、デスクトップでハンバーガーメニューが見える等。
解決: `app/globals.css` で兄弟 cart-* リポと cartridges/ を `@source` で明示する。
```css
@source "../../cart-*/routes/**/*.{ts,tsx,js,jsx}";
@source "../cartridges/**/*.{ts,tsx,js,jsx}";
```
（commit 409936f で適用済み）

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

## 🗺 設計の振り返りと将来構想

> 2026-05-11 の壁打ちで整理。Studio 大改修に取り組む前に必ずここを再読すること。
> これまでの試行錯誤と、これから目指す方向を一望できる「設計の歴史と地図」。

---

### 1. SDK・DB のメンタルモデル（これは守る）

```
カートリッジコード (例: patrol-navi/routes/...)
  import { getAdminSupabase, requireApp } from '@/sdk'
  await supabase.from('patrol_check_sheets').insert(...)

         │ 同じ API で 3 環境に対応
         ▼
SDK 層 (lib/sdk-mock + lib/sdk-base)
         │
   ┌─────┴──────┬─────────────────┐
   ▼            ▼                  ▼
 ローカル     Studio Deploy    AppHarbor 本番
 PGlite       Supabase          Supabase
 .studio-db/  studio スキーマ   public スキーマ
 pgdata       (本番 DB 内分離)   (本番 DB メイン)
```

**カートリッジ作者の責務は 3 つだけ:**
1. `db/schema.sql` — テーブル定義（全テーブルに `organization_id`）
2. `manifest.json` — メタ情報
3. `routes/*` — 必ず `organization_id` でフィルタするコード

> **「カートリッジは organization_id を持つテーブルを作るだけ。データがどこに保存されるかは SDK と環境が決める」**

これ 1 行に集約されるのが Studio の核となる設計思想。

---

### 2. これまでに積み上げた仕掛け（2026-05 時点）

時系列で「何がきっかけで」「何を作ったか」を整理:

| 時期 | きっかけ | 追加した仕掛け | 場所 |
|---|---|---|---|
| 初期 | カートリッジ開発をローカル完結させたい | PGlite + supabase-mock | `lib/sdk-mock/` |
| 初期 | 認証なしで権限テストしたい | Cookie ベースのモックユーザー | `lib/sdk-mock/store.ts` |
| 中期 | Studio を Vercel にデプロイしてデモしたい | in-memory PGlite + サンプルデータ自動投入 | `lib/sdk-mock/pg.ts` |
| 中期 | Vercel の read-only FS でロール永続化が壊れた | Cookie 経由でロール上書き保存 | `lib/sdk-mock/app-permissions.ts` |
| 中期 | Vercel で写真がエフェメラル | ファイル保存 + `/api/studio-storage` | `app/api/studio-storage/route.ts` |
| 後期 | Vercel で関数間 DB 不共有 → CSV インポート 404 | リダイレクト廃止 + alert に変更 | `cartridges/.../ImportChecklistButton.tsx` |
| 後期 | 根本解決として永続化が欲しい | 本番 Supabase の `studio` スキーマ統合 | `lib/sdk-mock/supabase-real.ts` |
| 後期 | studio スキーマを PostgREST から見えるように | GRANT + Exposed Schemas 設定 | `supabase/migrations/...studio_grants.sql` |

→ デプロイ Studio を「動くもの」にするだけで**workaround を 5 段重ね**ている。
これは「思想の単純さ」から離れてしまった象徴。

---

### 3. 今の Studio が思想からズレている 4 点

#### A. カートリッジコードが 3 箇所に重複

```
AppHarbor リポジトリ
  └── cartridges/<id>/             ← 真のソース
AppHarborStudio リポジトリ
  ├── cartridges/<id>/             ← 手動コピー
  └── app/org/[slug]/apps/<id>/    ← mount-cartridges.js が複製
```

1 修正 → 3 箇所コピー。本セッションでも繰り返し発生。

#### B. スキーマが 3 重管理

| 場所 | 役割 |
|---|---|
| `cartridges/<id>/db/schema.sql` | ローカル PGlite に適用 |
| `supabase/migrations/...studio_schema.sql` | Vercel Studio 用（studio スキーマ） |
| `supabase/migrations/...cart_<id>_v*.sql` | AppHarbor 本番用（public スキーマ） |

同じ内容を 3 形態で書き分け、同期ルールが明文化されていない。

#### C. Studio デプロイ版の位置付け曖昧

「Studio = 開発環境」が思想なら、本来 Vercel にデプロイする必然性は低い。
にも関わらずデプロイした結果、上記の workaround 5 連発に至った。

#### D. migration 生成が手動

理想: `db/schema.sql` 更新 → コマンド一発で本番用 + studio 用 migration 自動生成
現実: 手書きで 2 種類のファイル + ALTER TABLE まで手動

---

### 4. 大改修の方向性

> **方針: 「Studio はカートリッジ作者と AI のための最良の出発点」に再定義する**

#### 4-1. リポジトリ構造の単純化

**現状:**
- AppHarbor 本体リポ ＋ AppHarborStudio リポ（独立）
- カートリッジコードが 2 つのリポに重複

**改修後候補 A: モノレポ化**
```
appharbor/ (1 つのリポジトリ)
  ├── app/                  ← AppHarbor 本番 (Vercel project A)
  ├── studio/               ← Studio (Vercel project B、同じリポから)
  ├── cartridges/           ← 単一ソース
  └── packages/
      └── sdk/              ← @appharbor/sdk として publish 可能
```

**改修後候補 B: SDK だけ独立リポ + 残りはモノレポ**
- `appharbor/sdk` — SDK 独立リポ (npm 配布)
- `appharbor/main` — AppHarbor + Studio + cartridges
- 一番疎結合で外部開発者と共有しやすい

→ 候補 B が拡張性高い。

#### 4-2. SDK を独立パッケージへ

```
@appharbor/sdk
  ├── 公開: 型 + 関数のインターフェース + 一部実装
  ├── 配布:
  │     Phase 1: github:appharbor/sdk#vX.Y.Z (git 直接参照)
  │     Phase 2: GitHub Packages (認証付き)
  │     Phase 3: npm 公開
  └── 環境別実装の差し替え:
        Studio: webpack alias で sdk-mock に向ける
        AppHarbor 本番: そのまま使う (実 Supabase)
```

**SDK = 契約** のパターン。カートリッジコードは sdk しか知らない。

#### 4-3. カートリッジ配布: GitHub 連邦型（モデル B）

```
作成者リポ (個別):           中央レジストリ:                 Studio:
yamada/cart-expense  ──┐   appharbor/cartridges-registry  ──┐
sato/cart-chat        ─┼─►   └── registry.yaml           ──┼─► プレビュー & 一覧
appharbor/cart-patrol ─┘                                  ─┘
```

- 作成者: `appharbor/cartridge-template` から「Use this template」で自分のリポ作成
- 開発: ローカル / Codespaces のどちらでも
- 提出: `cartridges-registry` リポへの PR (1 行追加)
- Admin: PR レビュー → マージ = Studio プレビュー公開

#### 4-4. 4 段階のリリースパイプライン

```
[Phase 1] 作成
  作成者がローカル / Codespaces で開発
       │
       ├─ GitHub Actions が自動検証 (manifest / schema / lint)
       │
[Phase 2] プレビューデプロイ
  Admin が submission を承認 → Studio プレビューへ
       │
       ├─ 作成者ごとに独立 schema (studio_creator_<uuid>)
       │
[Phase 3] ブラッシュアップ
  作成者: プレビューを見ながらコミット → 自動再デプロイ
  Admin: PR でフィードバック
       │
[Phase 4] 本番昇格
  品質ゲート通過 → AppHarbor 本体カートリッジへ統合
       │
       └─ migration 自動生成 + マーケットプレイス公開
```

#### 4-5. AI 開発体験の組み込み

**「AI バイブコーディングで AppHarbor SDK ネイティブのアプリが書ける」**を実現する 4 段ガードレール:

1. **AI 向けドキュメント** — 各 AI ツールが読む規約ファイルを揃える
   - `CLAUDE.md` (Claude Code)
   - `.cursorrules` (Cursor)
   - `.github/copilot-instructions.md` (GitHub Copilot)
   - `AGENTS.md` (汎用)

2. **TypeScript 型による物理ガード**
   - `CartridgeTable` 等の型で `organization_id` 必須を強制
   - AI が間違えると型エラーで気付く

3. **MCP サーバー (`@appharbor/mcp`)**
   - `get_sdk_reference()` / `get_example(pattern)` / `validate_cartridge()` を提供
   - AI が動的に Studio のコンテキストに問い合わせ可能

4. **テンプレート + サンプルカートリッジ群**
   - パターン例 (CRUD / Workflow / Dashboard) を AI が学習元にする

#### 4-6. ゼロインストール開発体験

`appharbor/cartridge-template` に `.devcontainer/devcontainer.json` を配置:

```
[作成者の体験]
1. cartridge-template を「Use this template」でフォーク
2. 「Open in Codespaces」をクリック
3. ブラウザに VS Code が起動 + Studio が自動起動
4. AI アシスタント (Claude / Cursor) が CLAUDE.md を読み込み済み
5. 即開発開始 — npm / Docker / Supabase 一切不要
```

#### 4-7. migration 自動生成スクリプト

```bash
npm run cartridge:release <cartridge-id>
```

このコマンドが:
1. `cartridges/<id>/db/schema.sql` を読む
2. 前回 release との diff を計算
3. `supabase/migrations/<timestamp>_cart_<id>_v<version>.sql` を生成
4. studio スキーマ版（`SET search_path TO studio` 付き）も同時生成

→ 作者は `db/schema.sql` だけ書けばよくなる。スキーマ 3 重管理の終焉。

#### 4-8. mount-cartridges 廃止

`cartridges/` を `app/` から相対参照（`@cartridge/*` パスエイリアス）。
ビルド時ファイルコピーをやめる → コード重複 3 箇所目を消滅させる。

#### 4-9. Studio デプロイ版の位置付け再定義

**新定義: Studio デプロイ版 = 「読み取り専用デモ + AI バイブコーディング起点」**

データ永続化が本気で必要な場面は以下に振り分け:
- ローカル Studio（開発者の手元、完全永続化）
- AppHarbor 本番（カートリッジ正式リリース後）

Vercel デプロイ Studio は:
- カートリッジマーケットプレイスのデモ（誰でも触れる）
- AI バイブコーディング Web UI の動作環境
- クライアント向けプレビュー（共有 URL）

→ 5 連発の workaround は「デモのため」と割り切れる。

---

### 5. 改修ロードマップ案

#### Step 1: 基盤整備（1〜2 週間）

- [ ] `appharbor/sdk` リポジトリ作成（既存の `lib/sdk-mock` + `lib/sdk-base` から抽出）
- [ ] `appharbor/cartridge-template` リポジトリ作成（Hello World カートリッジ + `.devcontainer/`）
- [ ] `appharbor/cartridges-registry` リポジトリ作成（registry.yaml + GitHub Actions 検証）

#### Step 2: AI ファースト化（1 週間）

- [ ] テンプレートに `CLAUDE.md` / `.cursorrules` / `copilot-instructions.md` を整備
- [ ] サンプルカートリッジ 3 個（CRUD / Workflow / Dashboard）
- [ ] AI 向け SDK ドキュメントを `docs/AI_GUIDE.md` に集約

#### Step 3: マイグレーション自動化（2〜3 日）

- [ ] `npm run cartridge:release` スクリプト実装
- [ ] schema.sql の diff から SQL 自動生成
- [ ] studio スキーマ版もセットで生成

#### Step 4: モノレポ統合 / mount-cartridges 廃止（中期）

- [ ] AppHarborStudio リポを AppHarbor 本体に統合
- [ ] `mount-cartridges.js` を廃止し、Next.js のルーティングで直接読込
- [ ] Vercel project 構成を見直し（同リポから 2 プロジェクト）

#### Step 5: MCP サーバー（中期）

- [ ] `@appharbor/mcp` 開発（Node.js）
- [ ] 主要ツール実装: `get_sdk_reference` / `get_example` / `validate_cartridge`
- [ ] Cursor / Claude Code への登録ドキュメント

#### Step 6: マーケットプレイス UI（長期）

- [ ] AppHarbor 本体に「カートリッジを探す」画面
- [ ] registry.yaml を読んでカード表示
- [ ] 組織管理者が 1 クリックでインストール

#### Step 7: AI 生成 Web UI（長期）

- [ ] bolt.new スタイル「アプリを 1 行で生成」UI
- [ ] LLM + MCP + Studio プレビューを統合
- [ ] AppHarbor の独自ポジション（業務 SaaS の v0.dev）として確立

---

### 6. 大改修中も守る原則

1. **カートリッジ作者の責務 3 つ（schema.sql / manifest.json / routes/）は変えない**
2. **`@/sdk` の公開インターフェースは破壊的変更しない**（既存カートリッジが壊れる）
3. **organization_id ベースのマルチテナンシーは維持**
4. **Studio ローカル開発（PGlite + ファイル永続化）の即時性は維持**
5. **「動くカートリッジが正しい」**（型 / lint / migration が通っても動かないなら設計が悪い）

---

### 7. 関連する壁打ちログ

このセクションは 2026-05-11 の以下の議論の整理結果:

- 「Studio で作成したアプリのデータ保管場所をどうするか」
- 「カートリッジ作成を GitHub で行えないか」
- 「SDK を GitHub 経由で配布できないか」
- 「AI バイブコーディングと Studio をどう統合するか」

AppHarbor 本体の CLAUDE.md にも同様の整理がある（"今の Studio 実装が思想からズレているところ" セクション）。
両方を同期しながら更新すること。

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
