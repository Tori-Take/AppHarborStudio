# {{CARTRIDGE_ID}} 開発メモ (Claude Code 向け)

このフォルダは AppHarbor カートリッジ **{{CARTRIDGE_NAME}}** のソースコードです。
このフォルダ内のファイルだけを編集してください。

## カートリッジ ID

`{{CARTRIDGE_ID}}`

---

## 📚 着手前に必読 (AppHarbor の前提知識)

実装に入る前に、以下のファイルを必ず読んでください。
Studio がカートリッジ作成時に SDK スナップショットと規約を配置しています:

| ファイル | 内容 |
|---|---|
| `.appharbor/PLATFORM.md` | AppHarbor の概要 + SDK の使い方 (README) |
| `.appharbor/SDK-TYPES.ts` | 使える型 (`Actor`, `AppContext`, `CartridgeManifest` 等) |
| `.appharbor/SDK-API.ts` | 使える関数 (`requireApp`, `getAdminSupabase` 等) |
| `.appharbor/RULES.md` | マルチテナント設計の鉄則 (`organization_id` / RLS) |

これらは **参照専用** (build には node_modules の @appharbor/sdk が使われる)。
SDK バージョン更新で内容が古くなった場合は Studio で再生成できます。

---

## 🎭 ⚠ 着手前に必ず確認: ユーザーロール設計

**実装作業に入る前に、開発者に必ず以下を質問してください:**

### 質問の出し方

1. **まずアプリの性質を把握する**
   - ユーザーから依頼内容や `manifest.name` / `description` を確認
   - 「ゲーム」「業務管理」「個人ツール」「社内コミュニケーション」などのカテゴリを推定
2. **そのアプリに自然なロール名を提案する**
   - 単に `viewer / admin` ではなく、**アプリの文脈に合った名前**を考える
   - 例: ゲームなら `player`、パトロールなら `patroller`、ナレッジ共有なら `contributor`
3. **質問形式で投げる**

例:

> 「このアプリは {アプリの種類} なので、ロール構成はこんな感じはどうでしょう?
>
> - `player` (default): プレイヤー・スコア記録
> - `admin`: 管理者・ハイスコアリセットなど
>
> もしくは別のロール構成（例: もっと細かく分けたい・名前を変えたい）にしますか?」

開発者が「これでいい」と答えたら確定、別案を出されたらそれに合わせる。
**最初から自分で `viewer/admin` 固定にしない**こと。

### アプリ種別ごとの推奨ロール名

| アプリ種別 | 推奨ロール構成 | 例 |
|---|---|---|
| ゲーム・タイピング系 | `player` (default) / `admin` | TypingDash, Space Invaders |
| パトロール・点検 | `viewer` (default) / `patroller` / `admin` | PatrolNavi |
| 申請・承認ワークフロー | `applicant` (default) / `approver` / `admin` | 経費申請 |
| ナレッジ・Wiki | `viewer` (default) / `contributor` / `admin` | 社内 Wiki |
| 掲示板・フォーラム | `reader` (default) / `writer` / `moderator` / `admin` | 質問板 |
| 個人タスク・メモ | `owner` (default) / `admin` | TODO、ノート |
| 在庫・予約管理 | `viewer` (default) / `operator` / `admin` | 予約システム |
| ダッシュボード・閲覧専用 | `viewer` (default) / `admin` | レポート |
| アンケート・投票 | `respondent` (default) / `admin` | 社内調査 |
| 教育・テスト | `learner` (default) / `instructor` / `admin` | 研修 |

**この表に無いタイプ**でも、アプリの目的に応じた**英語の動詞または役職名**を提案してください。
ロール名は manifest だけでなく **コード全箇所に登場する重要な命名**なので、後から変更しにくい。
最初に良い名前を選びましょう。

### 提案の階層パターン

#### パターン A: 2階層（一般操作＋管理者）
- 一般ユーザー (default): 主たる利用者
- `admin`: 管理操作

#### パターン B: 3階層（閲覧／作業／管理）
- 閲覧者 (default): 見るだけ
- 作業者: データ作成・編集
- `admin`: 全管理

#### パターン C: 個人データ特化
- `owner` (default): 自分の分だけ操作
- `admin`: 全データ運用

#### パターン D: ワークフロー型 (4階層以上)
- 申請者 / 承認者 / 確認者 / 管理者
- 業務フローに沿った段階的な役割

### 確認の流れ

1. **質問する**: 上記の候補を提示しつつ、開発者の意図を聞く
2. **合意する**: 開発者がロール構成を指定（例:「viewer / patroller / admin で」）
3. **manifest.json を確定**: `permissions` 配列を合意した内容で更新
4. **その後で初めて実装に入る**: routes/ コード・db/schema.sql の RLS をロールに合わせて実装

### ⚠ ロール確定前にやってはいけないこと

- `routes/` 内で具体的なロール判定（`if (ctx.role === '...')` 等）を書く
- `db/schema.sql` の RLS ポリシーを書く
- `permissions` を仮で確定させたまま大規模実装を進める

ロールを後から変更すると、コード・スキーマ・UI 全箇所の修正が必要になり手戻りが大きいため、
**最初に必ず合意してから着手**してください。

---

## 🗄 着手前に必ず確認: DB（データ保存）の要否

ロールと並んで、**「このアプリはデータを保存する必要があるか」** を最初に判断してください。

### DB が必要な例
- スコア・記録を蓄積する（ゲームのハイスコア、タイピング履歴）
- ユーザー入力を保存する（チェックリスト、申請、コメント）
- 組織内で共有する一覧データ（タスク、案件、メンバー名簿）

### DB が不要な例
- 計算機・変換ツールなど画面内で完結する機能
- 外部 API を叩いて結果を表示するだけ
- 静的なドキュメント・ダッシュボード（読み取り専用で外部ソースから取得）

### 判断後にやること

#### A. DB が必要なら

1. **ユーザーに伝える**:
   > 「このアプリはデータを保存するため DB 接続が必要です。
   > 本番デプロイ後、AppHarbor の管理画面で『DB セットアップ』ダイアログから
   > Supabase に SQL を適用する手順が発生します。」
2. **`db/schema.sql` を実装**: テーブル定義 + RLS ポリシー（後述の規約厳守）
3. **`manifest.json` の `tables` 配列に作成するテーブル名を全部書く**
4. **`routes/` から `getAdminSupabase()` で DB アクセス**

Studio のカートリッジ詳細画面に「🗄 このアプリは DB 接続が必要です」というバナーが
自動表示されるので、開発者にも明示されます。

#### B. DB が不要なら

1. **`db/schema.sql` を空（コメントのみ）にする**: `create table` 文を書かない
2. **`manifest.json` の `tables` を `[]` のままにする**
3. これで「DB なし」カートリッジとして本番でもインストール可能

### 実装時のロール反映先

ロール確定後は、以下すべてを一貫させて実装します:

| 場所 | 反映内容 |
|---|---|
| `manifest.json` の `permissions` | ロール一覧と default フラグ |
| `routes/page.tsx` 等 | `requireApp(slug, '{{CARTRIDGE_ID}}')` 後の `ctx.role` で UI 分岐 |
| `routes/server/*.ts` | Server Action 内で role チェック（重要操作） |
| `db/schema.sql` の RLS ポリシー | role に応じた select / insert / update / delete を制御 |

---

## ファイル構造

```
.
├── manifest.json            ← カートリッジのメタデータ・権限定義
├── routes/                  ← Next.js 配信されるページ
│   ├── page.tsx             ← トップページ
│   ├── components/          ← コンポーネント
│   └── server/              ← Server Actions ('use server')
└── db/
    └── schema.sql           ← DB テーブル定義（PGlite/Supabase 両対応）
```

## ⛔ 触ってはいけないファイル（カートリッジ外）

- 親フォルダの Studio 一式（`app/`, `lib/`, `components/`, `scripts/`）
- ルートの `package.json`, `next.config.ts`, `tsconfig.json`
- 他のカートリッジ（`workspace/` 内の他フォルダ）

問題があっても **このカートリッジ内で解決する**こと。Studio 自体を直してはいけない。

## 規約サマリ

import で使えるのは:
- `@/sdk` / `@/sdk/client` — SDK
- `react`, `next/*` — 標準
- 相対 import（`./components/Foo`）
- Node 標準

使えないのは:
- `@/lib/*`, `@/components/*`, `@/types/*` — 本体内部
- 外部 UI ライブラリ（`lucide-react`, `tailwind-merge` 等）

## このカートリッジの権限ロール（初期値）

manifest.json の `permissions` に定義されているロール（生成時の既定値）:

```
{{PERMISSIONS_LIST}}
```

**※ これは雛形です。** 上記「🎭 着手前に必ず確認: ユーザーロール設計」の手順で
開発者と合意した最終ロール構成に書き換えてから実装に入ってください。

### ロール判定の使い方

`requireApp()` は `ctx.role` でロール文字列を返す:

```tsx
const ctx = await requireApp(slug, '{{CARTRIDGE_ID}}')
// ctx.role = "viewer" | "admin" | ... (manifest で定義したいずれか)

// UI 分岐
{ctx.role === 'admin' && <button>管理者専用ボタン</button>}

// アクセス制御
if (ctx.role !== 'admin') notFound()
```

### Server Action でのロール検証

UI 分岐だけだと「ボタンは隠したけど API は叩ける」状態になるので、
**重要操作は Server Action 内でも必ず再確認** すること:

```ts
'use server'
import { requireApp } from '@/sdk'

export async function deleteAllAction(slug: string) {
  const ctx = await requireApp(slug, '{{CARTRIDGE_ID}}')
  if (ctx.role !== 'admin') {
    return { ok: false, error: 'forbidden' }
  }
  // ...
}
```

## DB スキーマ

`db/schema.sql` は Studio 起動時に PGlite に自動適用される。
本番では AppHarbor 管理画面の「DB セットアップ」ダイアログから Supabase に手動適用する。

**必須事項**:
- すべてのテーブルに `organization_id uuid not null references organizations(id) on delete cascade`
- すべてのテーブルで `enable row level security`
- 同一組織のメンバーのみ閲覧・操作できる RLS ポリシーを書く
- テーブル名は **必ず `{{TABLE_PREFIX}}_` プレフィックス**で始める（衝突回避）

### ⚠ schema.sql に新しいテーブルを追加したら必ず

`manifest.json` の `tables` 配列にも追加すること:

```json
{
  "tablePrefix": "{{TABLE_PREFIX}}",
  "tables": ["{{TABLE_PREFIX}}_scores", "{{TABLE_PREFIX}}_items"]
}
```

**なぜ必要か**: AppHarbor 本番の「DB セットアップ」ダイアログがこの配列を見て
本番 Supabase にテーブルが存在するかを確認する。空のままだと「DB なし」と判定され、
schema.sql は適用されたかどうかも分からなくなる（schema.sql 自動検出フォールバックは
あるが、明示宣言が望ましい）。

**RLS の定型パターン**（コピペ可）:

```sql
alter table {{TABLE_PREFIX}}_items enable row level security;

drop policy if exists {{TABLE_PREFIX}}_items_select on {{TABLE_PREFIX}}_items;
create policy {{TABLE_PREFIX}}_items_select on {{TABLE_PREFIX}}_items
  for select using (
    organization_id in (select organization_id from profiles where id = auth.uid())
  );

-- INSERT / UPDATE / DELETE も同様に書く（最低 select は必須）
```

⚠ **やってはいけない**: `current_setting('app.current_organization_id')::uuid`
のような独自セッション変数を使う RLS。AppHarbor は使っていないため Supabase 本番で
permission denied になる（Studio では `set row_security = off` で気づかない）。

## よくあるパターン

### サーバーで一覧表示

```tsx
import { requireApp, getAdminSupabase } from '@/sdk'

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireApp(slug, '{{CARTRIDGE_ID}}')

  const supabase = getAdminSupabase()
  const { data: items } = await supabase
    .from('{{TABLE_PREFIX}}_items')
    .select('id, name, created_at')
    .eq('organization_id', ctx.actor.organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  return <div>{items?.map((it) => <div key={String(it.id)}>{String(it.name)}</div>)}</div>
}
```

### Server Action で書き込み

```ts
'use server'
import { getAdminSupabase, requireApp } from '@/sdk'
import { revalidatePath } from 'next/cache'

export async function addItem(slug: string, name: string) {
  const ctx = await requireApp(slug, '{{CARTRIDGE_ID}}')
  const supabase = getAdminSupabase()
  await supabase.from('{{TABLE_PREFIX}}_items').insert({
    organization_id: ctx.actor.organizationId,
    name,
  })
  revalidatePath(`/org/${slug}/apps/{{CARTRIDGE_ID}}`)
}
```

### ロール別 UI 表示

```tsx
const ctx = await requireApp(slug, '{{CARTRIDGE_ID}}')
{ctx.role === 'admin' && <button>管理者専用機能</button>}
```

## チェックリスト（提出前に）

- [ ] Studio の「規約チェック」が緑になっている
- [ ] 仮ユーザー3人すべてで動作確認した（admin / dept-admin / member）
- [ ] organization_id を全クエリに含めた
- [ ] schema.sql に RLS ポリシーを書いた（`current_setting('app.*')` を使っていない）
- [ ] **schema.sql で作ったテーブル名を `manifest.json` の `tables` 配列にも全部書いた**
- [ ] manifest.json の `permissions` がコードと一致している
- [ ] manifest.json の `tablePrefix` でテーブル名が始まっている
- [ ] `studioCompatible: true` を明示
