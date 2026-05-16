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

## 🧭 ⚠ 最初に必ず実施: アプリの目的を一緒に考える（壁打ちタイム）

**コードはもちろん、ロール設計や DB 設計にも入る前に、まず「何を作りたいか」を開発者と一緒に整理してください。**

開発者はまだアイデアが漠然としている場合が多い。
AI が一方的に仕様を決めるのではなく、**対話を通じて開発者自身が「これを作りたい」と言語化できる状態**にするのがこのフェーズの目的。

### 壁打ちの進め方

#### Step 1: アプリの目的を聞く

まず自由に話してもらう。一言でもいい:

> 「このアプリで何を実現したいですか？ 解決したい課題や、
> "こうなったらいいな" を教えてください。
> 漠然としていても大丈夫です。一緒に整理しましょう。」

#### Step 2: 対象ユーザーと利用シーンを深掘り

目的が分かったら、「誰が」「いつ」「どこで」使うかを具体化する:

> - 「このアプリを使うのは主にどんな人ですか？（営業、管理部門、現場作業者...）」
> - 「今はこの業務をどうやっていますか？（Excel、紙、口頭...）」
> - 「一番困っていること、面倒なことは何ですか？」

#### Step 3: AI がアプリの全体像を提案

ここまでの情報をもとに、AI が**アプリの全体像を 1 つ提案**する:

> 「お話を聞いて、こんなアプリはどうでしょう:
>
> **○○管理アプリ**
> - 目的: △△の業務を効率化する
> - 主な機能: □□の一覧管理、☆☆の申請・承認フロー
> - 使う人: 一般社員が日常的に使い、管理者が月次で確認
>
> この方向性で合っていますか？ 違和感がある部分があれば教えてください。」

#### Step 4: 方向性の合意

開発者が「いいね」「大体そんな感じ」と言ったら壁打ち完了。
「全然違う」と言われたら Step 1 に戻る。

### ⚠ 壁打ちなしでやってはいけないこと

- manifest.json の `name` / `description` だけ見てアプリの性質を決めつける
- 開発者が「車両管理」と言っただけで車両予約システムだと断定する
- 質問なしに「こういうアプリを作りますね」と宣言してコードを書き始める

**1〜2 分の壁打ちで方向性を合わせるだけで、後の手戻りが激減する。**

---

## 🎭 ⚠ 着手前に必ず確認: ユーザーロール設計

**壁打ちでアプリの方向性が合意できたら、次にロール設計に入ります。**

### 質問の出し方

1. **壁打ちで把握したアプリの性質をもとにロールを考える**
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
4. **次の「仕様チャット」フェーズに進む**（すぐに実装に入らない）

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

---

## 💬 ⚠ 着手前に必ず実施: 仕様チャット

**ロールと DB 要否が決まっても、すぐにコードを書き始めてはいけません。**

以下の項目について開発者と対話し、仕様を合意してから実装に入ってください。
開発者が「それでいい」と明確に承認するまで、コード生成は開始しないこと。

### 仕様チャットで確認する項目

#### 1. 画面構成（どんなページが必要か）

開発者に画面一覧を提案し、過不足を確認する:

> 「このアプリの画面構成を以下のように考えました:
>
> | ページ | URL | 内容 |
> |---|---|---|
> | ホーム | `/` | サマリー + クイックアクション |
> | 一覧 | `/items` | データ一覧 + 検索・フィルタ |
> | 管理 | `/admin` | admin 専用の設定画面 |
>
> 追加・変更したいページはありますか？」

#### 2. 主要機能（各ページで何ができるか）

各ページの機能を箇条書きで提案する:

> 「ホームページの機能:
> - ステータス別のサマリーカード（件数表示）
> - 直近のデータ 5 件を表示
> - 新規作成ボタン
>
> これで十分ですか？追加したい機能や不要な機能はありますか？」

#### 3. データ項目（テーブルにどんなカラムが必要か）

DB が必要な場合、主要テーブルのカラム構成を提案する:

> 「メインテーブルの項目:
>
> | カラム | 型 | 説明 |
> |---|---|---|
> | name | text | 名称 |
> | status | text | ステータス (active/inactive) |
> | assigned_to | uuid | 担当者 |
> | due_date | timestamptz | 期限 |
>
> 追加したい項目や不要な項目はありますか？」

#### 4. ステータス遷移（ワークフローがある場合）

承認フローや状態遷移がある場合、フロー図を提示して合意する:

> 「ステータスの流れ:
> `下書き → 申請中 → 承認済み → 完了`
>
> 各ステータスの遷移条件:
> - 下書き → 申請中: 作成者が申請ボタン
> - 申請中 → 承認済み: approver が承認
> - 承認済み → 完了: 作成者が完了報告
>
> この流れで合っていますか？」

#### 5. ロール別の操作権限（誰が何をできるか）

ロール × 機能のマトリクスを提示する:

> 「ロール別の操作:
>
> | 操作 | user | operator | admin |
> |---|---|---|---|
> | データ閲覧 | 自分のみ | 全件 | 全件 |
> | 新規作成 | ○ | ○ | ○ |
> | 編集 | 自分のみ | 全件 | 全件 |
> | 削除 | × | × | ○ |
> | 承認 | × | ○ | ○ |
>
> これで良いですか？」

### 仕様チャットの進め方

1. **上記 5 項目を順番に提案する**（一度に全部ではなく、2〜3 項目ずつ）
2. **開発者のフィードバックを反映して修正する**
3. **最終確認**: 「以上の仕様で実装に入ります。よろしいですか？」
4. **開発者が承認したら、初めてコード生成を開始する**

### ⚠ 仕様チャットなしでやってはいけないこと

- 画面構成を AI が勝手に決めてコードを書き始める
- テーブルのカラムを AI の推測だけで確定する
- 開発者が「OK」と言う前に 10 ファイル以上のコードを生成する

**理由**: 仕様が合意されないまま大量のコードを書くと、
「これじゃない」となった時の手戻りが大きい。
先に 5 分のチャットで仕様を詰めれば、後の実装が一発で通る。

---

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
