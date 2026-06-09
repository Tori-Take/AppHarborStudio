# Stage 5 再設計 — 本番反映を「1つの真実・1つのアクション」に

- 作成日: 2026-06-09
- 対象: **AppHarbor-Studio**（`components/PipelineSection.tsx`, `app/api/cartridges/[appId]/appharbor-status/route.ts`）
- きっかけ: Stage 5 に「変更検知 → PR 作成」系が **3つ**同居し、画面上で**矛盾**していた（「更新 PR を作成」ボタンが2つあり、片方は『スキーマ変更の更新あり』、もう片方は『差分なし』）。原因は `appharbor-status`（本番比較）を既存の `stage5-prepare`（ローカル diff）フローの上に増設したまま統合しなかったこと。

---

## 1. 目的とゴール

Stage 5 を「**本番(AppHarbor)と比べて今どうなのか**」という**唯一の真実**に一本化し、ユーザーが押すべき**主アクションを常に1つ**にする。

成功条件:

- Stage 5 を開くと、状態が **未登録 / 更新あり / PRマージ待ち / 本番反映済み** の**1つ**に確定して表示される
- 「本番に反映する（PR を作成）」**ボタンは常に1個**。中身（初回 install / bump / schema 同梱）は状態で自動分岐
- 画面内に**矛盾するメッセージ・重複する PR ボタンが無い**
- 手動「Stage 5 完了」ボタンを廃止し、**ステッパーの Stage 5 は本番反映状態で点灯**する（「完了したのに本番未反映」の嘘を消す）

非ゴール（YAGNI）:

- モード切替（開発/本番）・DB操作カードの配置は触らない（範囲外）
- デプロイ反映（`/api/git-sha`）までの追跡はしない（pinned 一致＝反映とみなす）
- 完全自動 bump（CI ゲート自動化）はしない

---

## 2. 真実の源（状態モデル）

判定の源は **`appharbor-status`（本番の pinned ⇔ cart 最新）だけ**。`stage5-prepare`（ローカル `schema.released.sql` ⇔ `schema.sql`）と `check-updates`（ローカル verifiedCommit）は **Stage 5 の "更新検知" から外す**（後者の役割は §7 参照）。

| 状態 | 判定条件（appharbor-status） | 表示 |
|---|---|---|
| **未登録** `notRegistered` | registry に当該 id が無い | 「本番にまだありません」＋初回反映 |
| **ref:main（固定タグ未運用）** | `isPinnedTag === false` | 案内のみ（固定タグ運用への切替を促す） |
| **更新あり** | `isNewer && !openPr` | 新旧比較＋反映ボタン |
| **PRマージ待ち** | `isNewer && openPr` | 「PR #N マージ待ち」リンク |
| **本番反映済み** | 登録済み・`isPinnedTag`・`!isNewer` | ✅「本番は最新です（vX.Y.Z）」 |

---

## 3. 新パネル（状態別の見せ方）

### 更新あり
```
┌─ 🚢 AppHarbor 本番反映 ───────────────── [ ● 更新あり ] ─┐
│             本番に出ている版    このカートリッジの最新     │
│  バージョン   0.1.7              0.1.10                   │
│  コミット     0f1d374            6f7fffb                  │
│  更新日時     06/08 19:12        06/08 21:37              │
│  変更         スキーマ変更を含む 9 ファイル               │
│                                                          │
│        [ ⬆ 本番に反映する（PR を作成） ]   [ 再確認 ]      │
│        スキーマ変更を含むため migration も自動生成されます │
│  ▸ 詳細・手動操作（型チェック / 差分SQL / 生成物コピー）   │
└──────────────────────────────────────────────────────────┘
```

### 本番反映済み
```
✅ 本番は最新です（v0.1.7）        [ 再確認 ]
```

### PRマージ待ち
```
⏳ PR #114 マージ待ち（開く）  — マージすると本番に反映されます   [ 再確認 ]
```

### 未登録
```
本番にまだありません          [ 本番に反映する（初回 PR を作成） ]
```

### ref:main（固定タグ未運用）
```
このカートリッジは ref: main（自動反映）。固定タグ運用に切り替えると本番反映を管理できます。
```

---

## 4. 主アクションは1つ（状態で自動分岐）

ボタンは常に **「本番に反映する（PR を作成）」** の1個。`POST install-to-appharbor` を状態に応じて呼ぶ:

| 状態 / changeKind | 呼び出し | 生成物 |
|---|---|---|
| 未登録 | `install-to-appharbor`（bumpRef なし・initial） | registry 追加 ＋ CREATE migration |
| 更新あり・code | `install-to-appharbor { bumpRef:true, changeKind:'code' }` | タグ作成 ＋ registry の ref bump |
| 更新あり・schema | `install-to-appharbor { bumpRef:true, changeKind:'schema' }` | 上記 ＋ ALTER migration 同梱 |

- schema 変更で `db/schema.released.sql` 未整備のときは**ボタンを無効化し誘導**（既存挙動を踏襲）。
- 破壊的変更があれば確認ダイアログ（既存 `warnings`）。

→ **矛盾する2つの「更新 PR を作成」ボタンは廃止**。

---

## 5. 撤去 / 折りたたみ（重複の解消）

`PipelineSection.tsx` の Stage 5 描画から、以下を整理する。

| 現状の要素 | 処置 |
|---|---|
| 青/緑「🔄/🚀 …PR を作成」パネル（`handleInstallToAppHarbor` 経由・System A） | **撤去**（主アクションに一本化） |
| 「📊 schema 差分サマリ」 | **撤去**（"変更" 行に集約） |
| 4つの緑チェック（manifest/schema/routes/GitHub） | **撤去**（Stage 5 では既済。必要なら「詳細」内に1行） |
| registry エントリ表示（`stage5.registryEntry`） | **撤去**（内部都合） |
| 型チェック（PR 作成前ローカル型チェック） | **「詳細・手動操作」に折りたたみ**（残す） |
| 生成物コピー（migration/registry/snapshot） | **「詳細・手動操作」に折りたたみ**（残す） |
| ALTER migration SQL プレビュー | **「詳細・手動操作」に折りたたみ** |
| 「📋 PR マージ後の作業」（長い手順） | **最小化**（自動化済みが大半。残すのは「本番 Supabase に migration 適用」の1点を簡潔に） |

> 注: System A の**バックエンド（`stage5-prepare` / `schema-diff` / `install-to-appharbor` の initial・update ロジック）は残す**。撤去するのは **重複した UI** のみ。schema 生成は bump の schema 分岐から引き続き使う。

---

## 6. 「完了」の扱い（ステッパー整合）

- 手動「Stage 5 完了」ボタン（`markCompleted(5)` 起点）を **Stage 5 からは廃止**。
- ステッパーの **Stage 5 ノードの色を本番反映状態で点灯**:
  - 本番反映済み → 緑（完了相当）
  - 更新あり / 未登録 → 琥珀（要対応）
  - PRマージ待ち → 進行中（スピナー/中間色）
- 実装: `appharbor-status` の結果から Stage 5 の見た目を導出する（`stages[5].completed` の手動フラグに依存しない）。Stage 1–4 の挙動は変えない。

---

## 7. check-updates の役割を明確化

`check-updates`（ローカル verifiedCommit ⇔ HEAD）は **"本番更新検知" の文脈から外し、ロールバック専用**とする。Stage 5 完了後にローカル cart が変わった場合の「再検証が必要」バナー（既存）はそのまま残すが、本番反映の判断には使わない（混同を避ける）。

---

## 8. バックエンド変更（最小）

### `appharbor-status` に未マージ PR 検知を追加
- AppHarbor リポの **open PR** から、その cart の bump/install ブランチ（`cart-bump/` `cart-install/` `cart-update/` ＋ `<id>-`）を探す。
- 見つかれば `openPr: { url, number } | null` を返す。
- GitHub API: `GET /repos/{targetRepo}/pulls?state=open&per_page=100` をフィルタ（best-effort・失敗時 null）。

### 既存の再利用（新規ロジックほぼ無し）
- `install-to-appharbor`（initial ＋ bumpRef 両対応）— そのまま。
- `schema-diff`（ALTER 生成）— bump の schema 分岐で既に利用。

---

## 9. 用語の置き換え（顧客語へ）

| 内部語 | 画面表示 |
|---|---|
| pinned tag / ref | 本番に出ているバージョン |
| bump / install PR | 本番反映 PR |
| schema 変更 | データ構造の変更（スキーマ） |
| registry | （隠す・出さない） |
| isNewer | 更新あり |
| Plan B / migration-only 等 | （出さない） |

---

## 10. コンポーネント整理（責務）

| 単位 | 役割 | 場所 |
|---|---|---|
| `appharbor-status` API | 状態判定の唯一の源（4状態 ＋ openPr） | `app/api/cartridges/[appId]/appharbor-status/route.ts` |
| `<ReleaseStatusPanel>`（新規 or 既存バナーを昇格） | 状態に応じた表示＋単一主アクション | `components/PipelineSection.tsx`（肥大なら分割を検討） |
| Stepper Stage 5 ノード | 本番反映状態で点灯 | `components/PipelineSection.tsx` |

> `PipelineSection.tsx` は ~1500 行と肥大。Stage 5 まわりを `components/stage5/ReleasePanel.tsx` 等に**切り出す**ことを実装プランで検討（テスト容易性・可読性のため）。

---

## 11. テスト方針

- **単体**: 状態判定ロジック（notRegistered / isNewer / openPr の組合せ → 4状態のどれになるか）を純粋関数に切り出してテスト。
- **結合（モック GitHub API）**: `appharbor-status` の openPr 検知（open PR あり/なし）。
- 既存の `registry-yaml` / `github-ref` テストはそのまま。

---

## 12. 関連ファイル

- `app/api/cartridges/[appId]/appharbor-status/route.ts` — openPr 検知を追加
- `components/PipelineSection.tsx` — Stage 5 UI 一本化（撤去/折りたたみ/状態表示/ステッパー点灯）
- `app/api/cartridges/[appId]/install-to-appharbor/route.ts` — 再利用（変更なし想定）
- `lib/schema-diff/*` — 再利用（変更なし）
- 参考: `app/api/cartridges/[appId]/stage5-prepare/route.ts`（UI から外すが backend は残置）
