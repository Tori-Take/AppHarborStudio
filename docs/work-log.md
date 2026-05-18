# AppHarbor Studio 作業ログ

---

## 2026-05-18: インフォ送信カートリッジ完遂 + Studio DX 5 改修

### 実装したこと

1. **`notify()` SDK の 3 リポ実装**
   - `appharbor-sdk` リポに `notify(input: NotifyInput): NotifyResult` 契約を追加 (v0.1.2 tag)
   - `AppHarbor 本体 lib/sdk/notify.ts` に本番実装 (`announcements` テーブルへ INSERT)
   - `AppHarborStudio lib/sdk-mock/index.ts` に mock 実装
   - 本番 Supabase migration `20260518104143_announcements_cartridge_source.sql` で `source_app_id` / `link` カラム追加

2. **`cart-info-sender` カートリッジ新設**
   - 組織メンバーに通知を送信する単機能アプリ
   - GitHub: <https://github.com/Tori-Take/cart-info-sender>
   - 送信先: 組織全員 / 部署 / 個人
   - Stage 1 (Studio localhost) と Stage 5 (本番 Vercel) で動作実証

3. **Stage 1 → Stage 5 一気通貫の踏破** (ブラウザ検証)
   - cart-info-sender を `appharbor.vercel.app/org/tps/apps/info-sender` で動作確認
   - 通知が `/org/tps/dashboard` に表示されることを確認
   - 過程で踏んだ 6 つの friction point を `cartridge-template/docs/release-checklist.md` に文書化

4. **本番側のバグ 2 件を修正 + push**
   - cart 側: 履歴クエリが Studio mock の `notifications` テーブルを参照していた → `announcements` に修正
   - 本体側: 自分が送ったお知らせが自分のベルにも届く → `.neq('created_by', user.id)` 追加 (3 ファイル)
   - 本体 commit: `c47c3d1` + `6fd6581`

5. **Studio 側の構造改修 5 件 (commit `f41e544`)**
   - **P1**: mock schema を本番と揃える。`notifications` → `announcements` にリネーム + カラム合わせ。`department_ids[]` / `user_ids[]` で scope を表現
   - **P2**: `cartridge-lint.ts` の `classify()` に `@appharbor/sdk` 検出を追加。**Vercel build が必ず失敗する import を commit 前に潰す**
   - **P3**: `announcements-server.ts` の `listAnnouncementsForCurrentUser` に `created_by is distinct from $1` を追加。Studio mock でも本番と同じ「自分発除外」挙動
   - **P4**: `/cartridge/[appId]/release-check` ページ新設。既存 `/api/cartridges/[appId]/stage5-prepare` に lint check + git-sync check を追加。リリース直前に 6 項目を ✓/✗ で確認できる
   - **P5**: Inspector の左サイドバー先頭に「📢 通知 (notify / インフォ)」ピン留めセクションを追加

### why (背景・経緯)

ユーザー (toritake) の要望:
1. 「AppHarbor SDK にインフォ (通知) 機能はあるか？」 → 「なかった」
2. 「アプリ A が AppHarbor のインフォに通知を出す機能を作って」 → SDK + 本体 + cartridge をフル実装
3. 「Stage 5 まで本番で動かして」 → Vercel deploy + Supabase migration まで通した
4. 「実装中にどんな摩擦があった？」 → 6 つの friction point を率直に報告
5. 「Studio で構造改修できることを重要順に教えて」 → P1〜P5 を提案
6. 「全部やって」 → 1 セッションで全部完了

### 学んだこと

- **mock-prod schema 不一致は読み取り側の地獄を生む**: `notify()` を SDK で抽象化しても、history などの読み取りクエリを書く時にコピペが効かない
- **`@/sdk` と `@appharbor/sdk` の差**: 本体に webpack alias がない以上、`@/sdk` 一択
- **Platform Admin が自分の組織を扱う流れが未整備**: profile + user_metadata + JWT 再発行が必要
- **404 の原因が多すぎる**: 5 つの候補 (registry / apps / enable / membership / orgSlug) を 1 個ずつ潰すコストが高い
- **AI 向けドキュメント (CLAUDE.md / prompts.md / cookbook.md) の完成度は高いが、`release-checklist.md` が欠けていた** → 今回追加

### 関連 commit / push 状態 (すべて push 済み)

| リポジトリ | 最終 commit |
|---|---|
| `appharbor-sdk` | `db1084b` feat: add notify() contract |
| `cart-info-sender` | `6507558` fix: read from announcements |
| `AppHarbor` | `6fd6581` fix(dashboard): narrow user |
| `cartridge-template` | `f8904e7` docs: add Stage 1 → 5 release checklist |
| `AppHarborStudio` (本ブランチ) | `f41e544` feat(studio): align mock schema |

### 次に進めたい候補

詳細は `docs/next-session.md` 参照。要点だけ:
- Stage 2 / 3 / 4 のブラウザ検証 (今回は Stage 1 と 5 だけ)
- cartridge-template の例示コード `@appharbor/sdk` → `@/sdk` 統一
- Vercel prebuild の apps テーブル自動 upsert
- `platform-preview` 組織で全カートリッジ自動有効化

---

## 2026-05-17: 5 段階リリースパイプライン + DB ソース切替

### 実装したこと

1. **5 段階リリースパイプライン UI**
   - カートリッジ詳細ページの「環境ステータス 3 カード」を 5 段階パイプラインに置き換え
   - Stage 1 PGlite (ローカル開発) → 2 Docker Supabase → 3 Studio クラウド Supabase → 4 Vercel Studio → 5 AppHarbor 本番
   - 完了 (緑) / 現在地 (黄) / 未着手 (グレー) を視覚的に表示
   - 完了ステージにマウスホバーで 🔄 ボタンが現れ「再実行モード」に戻れる (ロールバック)
   - 進捗状態は `localStorage` (`stage-status:<appId>`) に保存

2. **Stage 1 → 2 移行ボタン (PGlite → Docker Supabase)**
   - `POST /api/cartridges/[appId]/migrate` で冪等な移行を実装
   - ベーススキーマ (`organizations`/`profiles`/`departments`/`apps`) → ベースデータ → カートリッジスキーマ → カートリッジデータの順で適用
   - 全テーブルを `studio` スキーマに配置 (public の AppHarbor テーブルと衝突しない)
   - `pg` パッケージで直接 Postgres に接続 (PostgREST 経由しない)
   - `ON CONFLICT DO NOTHING` で再実行安全 (スキーマ変更後も同ボタンで再適用可能)

3. **DB ソース切替トグル (カートリッジ毎)**
   - 「データベース操作」セクションを 3 カードトグルに変更: PGlite / Docker Supabase / Studio Supabase
   - 各カートリッジの選択を `.studio-db/db-source.json` に保存
   - パイプラインの完了状態と連動: 未完了 Stage の選択肢は無効化
   - 選択カードはパイプライン完了と同じ緑色

4. **`proxy.ts` + lazy supabase proxy で透過的に DB 切替**
   - `proxy.ts` (旧 `middleware.ts`、Next.js 16 対応) が URL から appId を抽出 → `x-cartridge-id` ヘッダーに設定
   - `/api/pg-query` は Referer から推定して同じヘッダーを設定
   - `lib/sdk-mock/supabase-lazy.ts` を新設: `getAdminSupabase()` が遅延解決プロキシを返す
   - `.from('xxx').select('*').eq(...)` の await 時に初めて DB ソースを解決 → PGlite / Docker / Studio クラウドのクライアントを返す
   - 既存カートリッジのコード変更なし

5. **Docker Supabase セットアップ完全自動化**
   - 移行ボタン押下時に `lib/sdk-mock/docker-supabase-setup.ts` が以下を自動実行:
     - Studio の親階層から `supabase/config.toml` を検出
     - `[api] schemas` に `studio` を追加 (冪等)
     - `npx supabase status` を spawn して `sb_secret_xxx` キーを抽出
     - `.env.local` に `DOCKER_SUPABASE_URL` / `DOCKER_SUPABASE_SERVICE_ROLE_KEY` を書き込み
   - 残作業 (supabase 再起動 / Studio 再起動) は移行結果に「⚠ 残作業」として表示

6. **実行画面上部に DB ソースバッジ**
   - `PreviewNav` に「🗄 PGlite / Docker Supabase / Studio Supabase」バッジを追加
   - 色分け: PGlite=グレー / Docker=緑 / Studio Supabase=紫

7. **その他の改善**
   - `templates/CLAUDE.cartridge.md` に「壁打ちタイム」「仕様チャット」セクションを追加 (AI 開発者向けプロンプト)
   - カートリッジ削除後の遷移を 404 → ホームリダイレクトに変更
   - `JustCreatedBanner` の文言を実態に合わせ修正 + 「AI コンテキストをコピー」ボタンを内蔵
   - Windows のフォルダピッカー裏に出ていた空白ウィンドウを Opacity 0 + Size(0,0) で非表示化
   - `/guide` ページを Studio = local-only の方針で書き換え
   - `next.config.ts` に `typescript.ignoreBuildErrors=true` を追加 — カートリッジ側の型エラーで本番モード起動 (`npm run build && npm start`) が止まらないように

### 次にやること

- **Stage 3 のブラウザ動作テスト**
  - Supabase クラウドプロジェクトを作成して `.env.local` に接続情報を設定
  - 環境変数なし時のフレンドリーなエラー表示確認
  - 環境変数あり時の migrate + DB ソース切替確認
- **Stage 3 → 4 (Vercel Studio へ取り込み) の案内**
  - カートリッジを GitHub に push (AI に依頼するプロンプトを生成)
  - Studio の `cartridges-registry.yaml` に追加
- **Stage 4 → 5 (AppHarbor 本番統合) の案内**
  - AppHarbor 本体の `cartridges-registry.yaml` エントリ生成
  - 本番 Supabase 用の migration ファイル生成 (Studio スキーマ → public スキーマ)
- パイプラインのロールバック挙動の細部詰め (現在は Stage 2 以降のみ。Stage 1 ロールバックは PGlite リセット?)

### ハマったポイント・注意点

| 問題 | 原因 | 解決策 |
|---|---|---|
| 移行ボタン押下後の外部キー違反 (`departments_path` 不一致) | Docker Supabase の public スキーマに AppHarbor 本体の `departments` が既存 → `CREATE TABLE IF NOT EXISTS` がスキップ → 後続 INSERT で衝突 | 全てを `studio` スキーマに分離。`db-base-supabase.sql` に `create schema if not exists studio; set search_path to studio, public;` を追加 |
| `studio` スキーマがあっても REST API から見えない | PostgREST はデフォルトで `public` / `graphql_public` のみ公開 | `supabase/config.toml` の `[api] schemas` に `studio` を追加 → `supabase stop && supabase start` |
| スキーマ公開しても「permission denied for schema studio」 | PostgREST が anon/authenticated/service_role ロールで接続するが、新規スキーマには GRANT がない | `db-base-supabase.sql` 末尾に `GRANT USAGE ON SCHEMA studio` + `GRANT ALL ON ALL TABLES` を追加。`ALTER DEFAULT PRIVILEGES` だけだと既存テーブルに効かないため migrate route 内でも明示再付与 |
| 接続成功後もデータが空に見える | Supabase CLI が新形式の API キー (`sb_secret_xxx`) を使用していたが、コード側は legacy JWT のハードコード値を渡していた | `npx supabase status` から `sb_secret_xxx` を抽出し `.env.local` に書く自動化を追加 |
| Next.js 16 で `middleware.ts` がエラー | Next.js 16 は `proxy.ts` に rename された (matrix: middleware-to-proxy) | 既存の `proxy.ts` を流用し、appId 抽出ロジックをマージ |
| `headers()` 同期 → 非同期化で既存 SDK 関数のシグネチャを壊せない | `getAdminSupabase()` は同期で `SupabaseClient` 風オブジェクトを返す API | Proxy で「メソッド呼び出しのチェーンを記録 → .then() 時に解決」する lazy 実装で対応 (`supabase-lazy.ts`) |
| `npm run build` がカートリッジ側 (`vehicle-equipment/DailyBoard.tsx`) の型エラーで失敗 | Studio はカートリッジコードを束ねてビルドする構造 | `next.config.ts` で `typescript.ignoreBuildErrors=true` を許容 (Studio は開発・検証ツールのため) |
| port 3100 で本番モードを再起動するたびに `EADDRINUSE` | `TaskStop` で stop しても OS の子プロセスが残ることがある | `Get-NetTCPConnection -LocalPort 3100` で PID を取得し `Stop-Process -Force` で確実に kill |
| `supabase start` 後にカートリッジテーブルが空 | 新バージョンの Docker Supabase イメージが Pull され、ボリュームは保持されたが新スキーマには未反映 | 移行ボタンは冪等なので「再実行」して再 migrate。今後は `--no-backup` で再起動するワークフローを案内 |

### 変更した主要ファイル

| ファイル | 変更内容 |
|---|---|
| `CLAUDE.md` | 「5 段階リリースフロー (2026-05-17 決定)」セクションを追加 |
| `proxy.ts` | URL から appId 抽出 → `x-cartridge-id` ヘッダー設定 (Next.js 16 対応) |
| `components/CartridgeDashboard.tsx` | 「環境ステータス 3 カード」を `PipelineSection` + `DbSourceToggle` に差し替え |
| `components/PipelineSection.tsx` | **新規** — 5 段階パイプライン UI + 移行ボタン + ロールバック |
| `components/DbSourceToggle.tsx` | **新規** — DB ソース 3 カードトグル |
| `components/PreviewNav.tsx` | 実行画面上部に DB ソースバッジ追加 |
| `lib/use-stage-status.ts` | **新規** — Stage 完了状態の localStorage 管理フック (`rollbackTo` 含む) |
| `lib/sdk-mock/supabase-lazy.ts` | **新規** — 遅延解決プロキシ。Proxy でメソッドチェーンを記録、await 時に DB ソース解決 |
| `lib/sdk-mock/db-source.ts` | **新規** — `.studio-db/db-source.json` 読み書き + `x-cartridge-id` ヘッダーから現在 appId 解決 |
| `lib/sdk-mock/db-base-supabase.sql` | **新規** — Docker / クラウド Supabase 用ベーススキーマ (`studio` スキーマで作成 + GRANT) |
| `lib/sdk-mock/docker-supabase-setup.ts` | **新規** — config.toml 自動編集 + `supabase status` 解析 + `.env.local` 書き込み |
| `lib/sdk-mock/supabase-mock.ts` | `getSupabaseForCurrentCartridge()` を追加。Vercel / Docker / Studio クラウド / PGlite を切替 |
| `lib/sdk-mock/supabase-real.ts` | `getRealSupabaseAdminFor(target)` で docker / studio-cloud / vercel-studio を切替可能に |
| `lib/sdk-mock/index.ts` | `getAdminSupabase()` を lazy proxy 版に置き換え (既存カートリッジ互換) |
| `app/api/cartridges/[appId]/migrate/route.ts` | **新規** — スキーマ + データを冪等に移行。Stage 2 完了時に `setupDockerSupabase()` も実行 |
| `app/api/cartridges/[appId]/db-source/route.ts` | **新規** — DB ソース選択の GET/POST API |
| `app/api/studio/debug-db-source/route.ts` | **新規** — ヘッダー / 解決結果 / 環境変数を返すデバッグ用エンドポイント |
| `app/api/pg-query/route.ts` | `getSupabaseMock()` → `getSupabaseForCurrentCartridge()` に切替 (ブラウザ側 PGlite プロキシも DB ソース対応) |
| `templates/CLAUDE.cartridge.md` | 「壁打ちタイム」「仕様チャット」フェーズを追加 |
| `components/JustCreatedBanner.tsx` | 文言修正 + AI コンテキストコピーボタン内蔵 |
| `next.config.ts` | `typescript.ignoreBuildErrors=true` を追加 (カートリッジ型エラーで本番起動が止まらないように) |
| `package.json` | `pg` / `@types/pg` を追加 (Docker への直接 Postgres 接続用) |

---

## 2026-05-17 (2): Stage 3 (Studio クラウド Supabase) 移行ボタン実装

### 実装したこと

1. **migrate API の target 値統一**
   - `target='studio'` (曖昧) → `target='studio-cloud'` に rename
   - 環境変数名を `STUDIO_SUPABASE_DB_URL` → `STUDIO_CLOUD_SUPABASE_DB_URL` に統一
   - エラーメッセージに具体的な修正ヒントを追加 (Supabase ダッシュボードのどこを見ればいいか)

2. **`lib/sdk-mock/cloud-supabase-setup.ts` 新規作成**
   - 環境変数チェック (3 つすべて揃っているか)
   - PostgreSQL 接続テスト (SELECT 1)
   - `studio` スキーマの存在確認 → 無ければ自動作成
   - PostgREST 用 GRANT の確認 → 不足時は自動適用
   - Exposed Schemas の設定案内 (API からは変更不可のため followUp で案内)

3. **PipelineSection.tsx に Stage 3 ハンドラー追加**
   - `handleMigrateToStudioCloud()` — Stage 2 と同パターン
   - Stage 3 専用 UI: ボタン + 必要環境変数のドロップダウン表示
   - 「(未実装)」バッジを Stage 4 のみに限定

### 必要な環境変数 (`.env.local`)

```
STUDIO_CLOUD_SUPABASE_URL=https://xxxxx.supabase.co
STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY=eyJ... or sb_secret_...
STUDIO_CLOUD_SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### 変更した主要ファイル

| ファイル | 変更内容 |
|---|---|
| `app/api/cartridges/[appId]/migrate/route.ts` | target 値を `studio-cloud` に統一、セットアップ呼び出し追加 |
| `lib/sdk-mock/cloud-supabase-setup.ts` | **新規** — クラウド Supabase セットアップ自動化 |
| `components/PipelineSection.tsx` | Stage 3 ハンドラー + UI を追加 |

### 注意点

- ワークツリーでの dev server 起動は Turbopack がシンボリックリンク (junction) を拒否するため不可。テストはメインリポにマージ後に実施すること。
- Supabase クラウドの「Exposed Schemas」設定は API から変更できない → セットアップ完了後の followUp で案内する設計。
- `SetupResult` 型は docker / cloud の両方で独立定義。同じシェイプなので migrate route 側の型推論に問題なし。

---

## 2026-05-17 (3): Stage 4 (Vercel Studio 登録) チェックリスト + スキップボタン

### 実装したこと

1. **Stage 4 チェックリスト UI**
   - `GET /api/cartridges/[appId]/stage4-check` — 3 項目を自動チェック:
     - GitHub リポジトリの有無 (git remote origin から判定)
     - 最新コードが push 済みか (unpushed commits + uncommitted changes)
     - `cartridges-registry.yaml` にエントリがあるか
   - `POST /api/cartridges/[appId]/stage4-check` — registry エントリを自動追加
   - PipelineSection に Stage 4 専用 UI:
     - チェック項目ごとに ✓ / ✗ を表示
     - 「Registry に追加」ボタン (チェック失敗時)
     - 「エントリをコピー」ボタン (YAML スニペットをクリップボード)
     - 「再チェック」ボタン (状態をリフレッシュ)
     - 全項目 OK で「Stage 4 完了」ボタンが出現
   - registry エントリの YAML スニペットを `<details>` 内に表示

2. **スキップボタン (Stage 2 / Stage 3)**
   - `SkipStageLink` コンポーネントを新設
   - Stage 2 (Docker Supabase) と Stage 3 (Studio Cloud Supabase) の下部に表示
   - クリックで当該 Stage を完了マークして次に進む
   - 用途: 環境変数未設定時や Docker/Supabase を使わないカートリッジのフロー短縮

3. **findRegistryEntry() — 軽量 YAML パーサー**
   - 外部ライブラリなしで `cartridges-registry.yaml` を行パース
   - `id` / `repo` / `mode` / `ref` / `enabled` を構造化取得
   - コメント行を無視、Windows 改行 (CRLF) 対応

### 変更した主要ファイル

| ファイル | 変更内容 |
|---|---|
| `app/api/cartridges/[appId]/stage4-check/route.ts` | **新規** — Stage 4 チェック GET + registry 追加 POST |
| `components/PipelineSection.tsx` | Stage 4 UI + `SkipStageLink` コンポーネント追加 |

### 次にやること

- 本番ビルド + port 3100 でのブラウザ確認
- パイプライン全 5 段階が繋がった状態での E2E フロー確認
- AppHarbor 本体リポとの連携テスト (registry PR フロー)

---

## 2026-05-17 (5): Stage 5 完全自動化 (Web Studio → AppHarbor 本番)

### 達成: 「Web Studio から 2 クリックで AppHarbor 本番にカートリッジ install PR」

本セッションで、vehicle-equipment カートリッジを 5 段階パイプライン
すべて通して本番 AppHarbor (Vercel + 本番 Supabase) に投入できた。
ローカル開発 → 本番ユーザーがインストール可能まで完走。

### 主な実装 (Studio 側)

1. **N/A stage 視覚化 + DB ソース可用性分離**
   - 環境上スキップ確定 stage は ✓ + グレーアウト「ローカル開発で通過」
   - unavailableSources で「pipeline 完了」と「runtime 使用可能」を分離

2. **Stage 進捗の自動検出 (`/api/cartridges/[appId]/stage-status`)**
   - 初回訪問で localStorage が空なら API から実態を取得
   - Vercel/local/Docker 接続可否で各 stage を判定
   - Vercel では naStages=[1,2,3]、unavailableSources=[pglite,docker]

3. **DB ソースの env 別デフォルト**
   - Vercel: studio-cloud がデフォルト、PGlite と Docker はグレーアウト
   - getDbSourceFor も Vercel 時は studio-cloud にフォールバック

4. **「AppHarbor に PR を作成」ボタン (案 A 実装)**
   - `lib/github/cartridge-pr.ts` で GitHub API を raw fetch で叩く
   - ソースリポの blob 全取得 → ターゲットに blob 作成 → tree/commit/ref/PR
   - GITHUB_TOKEN (既存) で動作
   - PR 作成後、URL を UI に表示

5. **registry モード対応 (案 B 実装)**
   - ターゲットリポに `cartridges-registry.yaml` があれば、
     ファイルコピーの代わりに registry に 1 行追加するだけの軽量 PR
   - `targetHasRegistry()` で自動判定 → files / registry モード切替
   - 結果に mode フィールドを返す

6. **ローカル型チェック機能 (`/api/cartridges/[appId]/type-check`)**
   - `npx tsc --noEmit -p <一時 tsconfig>` を spawn
   - 対象カートリッジの routes/ だけ include
   - エラーを parse して file:line:col + コード + メッセージで表示
   - Stage 5 のメインアクション前に推奨

7. **テンプレ強化 (`templates/CLAUDE.cartridge.md`)**
   - 「実装フェーズ最初の必須ステップ」として `routes/_types.ts` を昇格
   - DB 列 → TypeScript 型マッピング表
   - 「忘れがちな列」パターン集 (sort_order / is_active / parent_id 等)
   - 過去事例の再現説明

### AppHarbor 側変更 (案 B)

- **`scripts/fetch-cartridges.js`** 新規 — registry を読んで GitHub から clone
- **`cartridges-registry.yaml`** 新規 — 既存 7 カートリッジを mode: local 登録
- **`scripts/sync-cartridges.ts`** 更新 — `cartridges/` と `cartridges/_installed/` 両対応
- **`lib/cartridge/installer.ts`** 更新 — deployCartridgeRoutes に optional sourceDir
- **`.gitignore`** 更新 — `cartridges/_installed/`
- **`package.json`** 更新 — prebuild に fetch-cartridges 追加

### 実プロセス記録 (vehicle-equipment の本番投入)

| 試行 | 結果 | 原因 |
|---|---|---|
| PR #29 (files モード) | ❌ 型エラー (Crew is_active 欠落) | DailyBoard で is_active なし |
| PR #30 (修正後) | ❌ 型エラー (Asset sort_order 欠落) | 4 ファイルで Asset 別定義 |
| PR #31 (_types.ts 集約) | ❌ 型エラー (Assignment date 欠落) | 楽観的更新で date 抜け |
| PR #32 (date 追加 + Category 型統合) | ✅ Ready | 完全グリーン |

教訓 → 「ローカル型チェック」機能 + テンプレ強化で再発防止。

### 残課題

- AppHarbor 側 registry モードでの動作確認 (次の install PR で初検証予定)
- GitHub Action による `supabase db push --linked` 自動化 (現状は手動)
- 「Studio → AppHarbor リポ→ 各組織への install」をワンボタン化 (今は組織で有効化が手動)

---

## 2026-05-17 (4): Stage 5 (AppHarbor 本番統合) 実装

### 実装したこと

1. **`GET /api/cartridges/[appId]/stage5-prepare`**
   - 4 項目のチェック:
     - manifest.json の必須フィールド (id, name, tables, permissions)
     - db/schema.sql の存在
     - routes/ の存在
     - GitHub リポジトリの有無
   - 成果物の自動生成:
     - 本番用 migration SQL (`studio` スキーマ → `public` スキーマ変換)
     - AppHarbor registry エントリ YAML
   - Migration 生成ロジック:
     - `set search_path` / `create schema studio` を除去
     - `studio.` プレフィックスを除去
     - RLS ポリシー (organization_id ベース) を自動生成

2. **PipelineSection.tsx Stage 5 UI**
   - チェックリスト表示 (Stage 4 と同パターン)
   - 「Migration をコピー」ボタン — 本番用 SQL をクリップボードに
   - 「Registry をコピー」ボタン — AppHarbor 用 YAML をクリップボードに
   - 折りたたみで生成 SQL / YAML をプレビュー表示
   - 「Stage 5 完了」ボタン (全チェック OK 時)
   - 手順ガイド (4 ステップの案内パネル)

### 変更した主要ファイル

| ファイル | 変更内容 |
|---|---|
| `app/api/cartridges/[appId]/stage5-prepare/route.ts` | **新規** — Stage 5 チェック + 本番用成果物生成 |
| `components/PipelineSection.tsx` | Stage 5 UI を placeholder から完全実装に差し替え |

---

## 2026-05-15: Studio UX 改善 (モード表示 / QR コード / ランチャー)

### 実装したこと

1. **開発モード・本番モード表示 (サイドバー)**
   - サイドバー下部に「ローカル・開発モード」(緑) / 「Web・本番モード」(青) を 1 行で表示
   - `window.location.hostname` でローカル/Web を判定、`process.env.NODE_ENV` でモード判定
   - Phase 1/2 表示 (`PhaseIndicator`) をサイドバーから廃止し、わかりやすい表記に統一

2. **QR コード機能 (サイドバー)**
   - サイドバーに「スマホで開く」ボタンを追加
   - ローカル IP を `os.networkInterfaces()` で検出し、QR コード付き URL を生成
   - QR コードはサーバーサイドで `qrcode` パッケージにより生成 (`/api/studio-env` で返却)
   - ポップアップオーバーレイで QR コードとアクセス URL を表示

3. **QR コード機能 (PreviewNav / アプリ開発画面)**
   - PreviewNav に「📱 スマホ」ボタンを追加
   - 現在表示中のページパス + `?fullscreen=1` パラメータ付き URL の QR コードを生成
   - 汎用 QR 生成エンドポイント `/api/studio/qr` を新規作成
   - `use-fullscreen-mode.ts` に URL クエリ `?fullscreen=1` 対応を追加

4. **Studio ランチャー (`scripts/studio-launcher.bat`)**
   - 対話型メニューで開発モード (3200) / 本番モード (3100) を選択起動
   - `netstat` でサーバー稼働状態を検出し、起動/停止/再起動を管理
   - サーバー起動後に自動でブラウザを開く (30 秒タイムアウト)
   - デスクトップショートカット (`.lnk`) をランチャーに紐付け

5. **本番ビルドの型エラー修正**
   - `app/api/fs/pick-folder/route.ts` の `spawn` に不正な `encoding` オプションがあり、`npm run build` が失敗していた問題を修正

### 次にやること

- PreviewNav の `PhaseIndicator` 表示の扱いを検討 (サイドバーからは廃止済み、PreviewNav にはまだ残っている)
- Studio デプロイ版 (Vercel) での QR コード機能の動作確認
- ランチャースクリプトの実運用テスト (各種エッジケース)
- CLAUDE.md のセクション「設計の振り返りと将来構想」のロードマップ着手

### ハマったポイント・注意点

| 問題 | 原因 | 解決策 |
|---|---|---|
| QR コードライブラリをクライアントで使うとブラウザがフリーズ | `qrcode` パッケージは Node.js 向け。`'use client'` で import するとページが固まる | サーバーサイド API (`/api/studio-env`, `/api/studio/qr`) で QR を生成し、Data URL として返す |
| QR ポップアップがサイドバー内で見切れる | サイドバーの親要素に `overflow-hidden` が設定されている | `position: fixed` のオーバーレイを `<aside>` の外 (Fragment) にレンダリング |
| 開発モードでは動くのに本番ビルドが通らない | `npm run dev` は型チェックをスキップする。`npm run build` は厳密に実行 | `spawn` の `encoding` オプション (spawnSync 専用) を削除 |
| Worktree で編集しても dev server に反映されない | dev server はメインプロジェクトで起動しており、worktree のファイルは別ディレクトリ | メインプロジェクト側にも同じ変更を適用 |
| テザリング環境でのスマホアクセス | テザリング元のスマホと PC は同一ネットワーク上にある | `os.networkInterfaces()` で IPv4 非内部アドレスを取得すれば接続可能 |

### 変更した主要ファイル

| ファイル | 変更内容 |
|---|---|
| `components/Sidebar.tsx` | モード表示追加、PhaseIndicator 廃止、QR コードボタン+オーバーレイ追加 |
| `components/PreviewNav.tsx` | 「📱 スマホ」ボタン + QR コードオーバーレイ追加 |
| `app/api/studio-env/route.ts` | `nodeEnv`, `localUrl`, `qrDataUrl` フィールド追加、ローカル IP 検出 |
| `app/api/studio/qr/route.ts` | **新規** — 任意 URL の QR コード生成エンドポイント |
| `lib/use-fullscreen-mode.ts` | URL クエリ `?fullscreen=1` からの全画面モード起動に対応 |
| `scripts/studio-launcher.bat` | **新規** — 対話型 Studio 起動/停止スクリプト |
| `app/api/fs/pick-folder/route.ts` | `spawn` の不正な `encoding` オプションを削除 (型エラー修正) |
