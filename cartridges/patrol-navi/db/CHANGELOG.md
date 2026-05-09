# PatrolNavi DB スキーマ変更履歴

このアプリは元々 SDK 規約に従わずに作られたため、初期のスキーマは
`supabase/migrations/` にプラットフォーム migration として直接置かれている。
v2.0.0 で cartridge 規約に整理し、以後はこの cartridge 内で完結する形で
管理する。

## v2.0.0 — 2026-05-04 (cartridge 化)

- `db/schema.sql` を冪等な形に統合（IF NOT EXISTS / DROP IF EXISTS）
- `supabase/migrations/20260504043955_cart_patrol_navi_v2_0_0.sql`
  を `lib/cartridge/migration.ts` 経由で生成
- 既存環境では下記レガシー migration が既に適用済みなので
  cart_patrol_navi_v2_0_0 は no-op として通る
- 新規環境（ローカル `supabase db reset` / 新しい本番）では
  レガシーが順次適用された後に cart_patrol_navi_v2_0_0 が
  no-op として適用される

## レガシー migration（cartridge 化以前 / 削除不可）

`supabase/migrations/` にある PatrolNavi 関連:

| ファイル | 内容 |
|---|---|
| `0023_patrol_navi.sql`              | ベーステーブル + RLS + apps 登録（v1.0.0） |
| `0039_patrol_attachments_bucket.sql` | Storage bucket（写真添付） |
| `0040_patrol_corrective_actions.sql` | 是正アクション |
| `0041_patrol_template_versioning.sql` | テンプレートバージョニング |
| `0042_patrol_three_tier_roles.sql`  | permissions を viewer/patroller/admin の 3 段階化 |
| `0043_patrol_workflow_step_types.sql` | step_type (review/comment/approve) |

**これらは絶対に削除しない**。本番 Supabase の migration 履歴
(`supabase_migrations.schema_migrations`) には適用済みとして記録されており、
ファイルを削除すると Supabase CLI が drift を検出して push 不能になる。

## 今後の変更フロー

PatrolNavi のスキーマを変えるときは:

1. `db/schema.sql` を編集（必ず冪等な書き方）
2. `manifest.json` の `version` を bump（例 `2.0.0` → `2.1.0`）
3. `npx tsx -e "import {generateCartridgeMigration} from './lib/cartridge/migration.ts'; console.log(generateCartridgeMigration('patrol-navi','2.1.0'))"`
   で `supabase/migrations/{ts}_cart_patrol_navi_v2_1_0.sql` を生成
4. `npm run db:migrate` でローカル適用 → 動作確認
5. push → 本番 `supabase db push`
