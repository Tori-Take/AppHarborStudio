# patrol-navi 開発メモ (Claude Code 向け)

このフォルダは AppHarbor カートリッジ **PatrolNavi**（安全パトロール
管理アプリ）のソースコードです。このフォルダ内のファイルだけを
編集してください。

PatrolNavi は AppHarbor の組織 / 通知 / 権限 / 承認ワークフローを
すべて使う「フラッグシップ」アプリ。新機能を追加するときは
カートリッジ規約と既存の権限モデルを必ず確認すること。

## カートリッジ ID

`patrol-navi`

## ファイル構造

```
.
├── manifest.json               ← カートリッジのメタデータ・権限定義
├── routes/                     ← Next.js 配信されるページ
│   ├── _ui/                    ← cartridge-local な shadcn フォーク
│   │   ├── card.tsx button.tsx input.tsx label.tsx textarea.tsx
│   │   └── cn.ts               ← clsx + twMerge
│   ├── _types.ts               ← PatrolNavi 専用型 + ラベル定数
│   ├── _helpers/               ← サーバ用ロール解決等
│   ├── page.tsx                ← トップページ
│   ├── patrol-layout.tsx       ← サブナビ
│   ├── admin/                  ← テンプレ管理 (admin)
│   ├── patrols/                ← パトロール一覧 / 詳細 / 編集 / 印刷
│   ├── correctives/            ← 是正アクション
│   └── dashboard/              ← KPI ダッシュボード
└── db/
    ├── schema.sql              ← 冪等な統合スキーマ（cartridge canonical）
    └── CHANGELOG.md            ← レガシー migration との対応関係
```

## ⛔ 触ってはいけないファイル（カートリッジ外）

- 親フォルダの `app/`, `lib/`, `components/`, `scripts/`
- ルートの `package.json`, `next.config.ts`, `tsconfig.json`
- 他のカートリッジ
- `supabase/migrations/0023_patrol_navi.sql` 等のレガシー migration
  （履歴として温存。`db/CHANGELOG.md` 参照）

## 規約サマリ

import で使えるのは:
- `@/sdk` / `@/sdk/client` — SDK
- `react`, `next/*` — 標準
- 相対 import（`./_ui/card`, `../_types` 等）
- 平台 peer deps（`lucide-react`, `class-variance-authority`,
  `tailwind-merge`, `@base-ui/react`）

使えないのは:
- `@/lib/*`, `@/components/*`, `@/types/*` — 本体内部
  → 必要なものは `routes/_ui/` や `routes/_types.ts` に持つ

## このカートリッジの権限ロール

manifest.json の `permissions`:

```
- viewer  (default) — 閲覧のみ
- patroller         — 新規パトロール作成・編集・自分が assignee の step 操作
- admin             — テンプレ管理・組織内すべての是正アクション操作
```

サーバ側のロール判定は `routes/_helpers/patrolRole.ts` を経由する。
直接 `ctx.role` を比較するときも、3 段階化されている前提を忘れない。

## DB スキーマ

`db/schema.sql` は **冪等** に書く（既存環境でも再適用できる必要がある）。
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `DROP TRIGGER IF EXISTS` → `CREATE TRIGGER`
- `DROP POLICY IF EXISTS` → `CREATE POLICY`
- `INSERT … ON CONFLICT … DO UPDATE/NOTHING`

スキーマ変更時のフローは `db/CHANGELOG.md` を参照。

**必須事項**:
- 各テーブルに `organization_id uuid not null references organizations(id) on delete cascade`
  （または親テーブル経由で組織が辿れること）
- すべてのテーブルで `enable row level security`
- 同一組織のメンバーのみ閲覧・操作できる RLS ポリシー

## ワークフロー設計（重要）

PatrolNavi の中核は「チェックシート × ワークフローステップ」の組合せ。

- `patrol_workflow_templates` がテンプレ、`patrol_workflow_steps` が
  各ステップ定義（`step_type` = review / comment / approve）
- シート提出時に `patrol_sheet_steps` がスナップショットされ、
  `current_step` インデックスで「いま誰の番か」を表現
- 差戻し（`remanded`）が来たら `current_step` を 0 に戻して
  patroller の編集モードに復帰

UI を追加するときは「ステップ進行」と「差戻し」両方の遷移を必ず確認すること。

## チェックリスト（PR 前に）

- [ ] `npm run cartridge:sync` がエラーなく通る
- [ ] `npx tsc --noEmit` が通る
- [ ] `npm test` が通る
- [ ] `npm run lint` が 0 errors
- [ ] schema.sql を変えた場合: manifest.version を bump し、
      `cart_patrol_navi_v{version}.sql` を生成 → `npm run db:migrate`
- [ ] viewer / patroller / admin の 3 ロールすべてで挙動を確認
- [ ] organization_id を全クエリに含めた
- [ ] manifest.json の `tablePrefix` (`patrol`) でテーブル名が始まっている
