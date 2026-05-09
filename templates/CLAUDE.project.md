# このプロジェクトについて (Claude Code 向け指示)

このプロジェクトは **AppHarbor カートリッジ開発プロジェクト** です。

## あなたの役割

`workspace/` 配下の **1つのカートリッジを完成させる**ことが目的。
完成品は `.appcart.json` として export して AppHarbor 本体に提出される。

## プロジェクト構造

```
.
├── (Studio 一式)            ← 開発環境。基本触らない
│   ├── app/                 ← Studio の UI（触らない）
│   ├── lib/sdk-mock/        ← モック SDK（触らない）
│   ├── components/          ← Studio UI（触らない）
│   └── scripts/             ← Studio スクリプト（触らない）
│
└── workspace/               ← ★ ここで開発する
    └── {cartridge-id}/      ← 開発中のカートリッジ
        ├── manifest.json    ← メタデータ
        ├── routes/          ← Next.js ページ・サーバーアクション
        │   ├── page.tsx
        │   ├── components/
        │   └── server/
        └── db/
            └── schema.sql   ← DB テーブル定義
```

## 触っていい場所 / ダメな場所

| 場所 | 編集可? |
|---|---|
| `workspace/{id}/` 配下 | ✅ ここだけ |
| `studio/`, `app/`, `lib/`, `components/`, `scripts/` | ❌ Studio 本体。触らない |
| `package.json`, `next.config.ts` 等のルート設定 | ❌ 触らない |

## カートリッジ規約（重要）

カートリッジは AppHarbor 本体から物理的に切り離されて配布される。
本体内部を import すると **配布した瞬間に動かなくなる**。

### 許可される import

- `@/sdk` / `@/sdk/client` — SDK 関数（actor 取得・Supabase 接続・権限チェック）
- `react`, `react-dom`, `next/*` — 標準
- 相対 import（`./components/...` 等）
- Node 標準 module

### 禁止される import

- `@/lib/*` — 本体実装。SDK 経由に置き換え
- `@/components/*` — 本体 UI（shadcn/ui 等）。カートリッジ内で UI を完結
- `@/types/*`, `@/core/*`, `@/app/*` — 本体内部
- 外部 npm パッケージで Studio 標準にないもの（lucide-react, clsx, tailwind-merge 等）

> 規約違反は Studio の「規約チェック」で検出される。**赤バッジ = 配布不可**。

## SDK の使い方

```ts
// サーバー側（Server Component / Server Action）
import { requireApp, getAdminSupabase } from '@/sdk'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireApp(slug, '<your-cartridge-id>')
  // ctx.actor.id, ctx.actor.organizationId, ctx.role が使える
  return <div>こんにちは {ctx.actor.actorName} さん</div>
}

// DB 操作（service-role 相当）
const supabase = getAdminSupabase()
const { data, error } = await supabase
  .from('mycart_items')
  .select('id, name, created_at')
  .eq('organization_id', ctx.actor.organizationId)
  .order('created_at', { ascending: false })
  .limit(50)
```

```ts
// クライアント側
import { createBrowserSupabase } from '@/sdk/client'
```

## DB のルール

- 全テーブルに **`organization_id` 列を必須**（テナント境界）
- 全クエリに **`organization_id` フィルタを含める**
- テーブル名は **`manifest.tablePrefix` で始める**（衝突回避）
- `db/schema.sql` に DDL を記述（Studio 起動時に自動適用される）
- RLS ポリシーを `schema.sql` に必ず含める（本番のテナント分離）

## スタイリング

- **推奨**: インライン style / styled-jsx / CSS Modules
- **非推奨**: Tailwind CSS（Studio に入っていない）

## 開発フロー

```bash
npm run dev                         # Studio 起動 (http://localhost:3100)
# ブラウザで「Studio で起動」ボタンから動作確認
```

1. `workspace/{id}/manifest.json` を編集
2. `routes/page.tsx` を実装
3. 必要なら `db/schema.sql` にテーブル定義
4. Studio 画面で動作確認（仮ユーザー切替・ロール割当）
5. **規約チェック**が緑になることを確認
6. **`.appcart.json`** をダウンロード → AppHarbor 本体に提出

## カートリッジ詳細の追加情報

詳しい規約・SDK ドキュメントは Studio README.md と、AppHarbor 本体の docs/design-summary.md（もしあれば）参照。

## 困った時

- Studio が起動しない → `npm install` し直す / port 3100 を解放
- 「Studio で起動」が 404 → manifest.json の id とフォルダ名が一致しているか確認
- DB エラー → `db/schema.sql` の構文確認、`.studio-db/` を削除して再起動
