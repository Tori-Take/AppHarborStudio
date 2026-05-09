# PatrolNavi v2 仕様書

> 旧 PatrolNavi (mern-basics) の **「自由度の低い 7 段階固定フロー」** を全面的に作り直し、
> AppHarbor のカートリッジ規約に乗せた **完全自由設定型の安全パトロール業務システム** にする。
>
> このドキュメントは GW 中の壁打ちで合意した v2 全体像を漏れなく記録したもの。
> 実装は v2.1 〜 v2.6 のフェーズで段階的に行う。

---

## 0. メタ情報

| 項目 | 値 |
|---|---|
| カートリッジ ID | `patrol-navi` |
| 対象 version | v2.0.0 → v2.6.0 |
| 設計合意日 | 2026-05-04 |
| 旧版参考 | `C:\Users\torit\Desktop\Projects\mern-basics`（MERN 実装） |
| Studio 対応 | YES（v2.0.0 で `studioCompatible: true` 達成済み） |
| クロステナント | NO（同一組織内運用のみ） |

---

## 1. 目的

### コアバリュー（優先順）

1. **現場の負担軽減** — 巡回中・巡回後の入力作業を最小化（モバイル前提）
2. **周知 = 滞留ゼロ** — NG / 承認待ち / 是正期限超過を関係者に確実に届け、「気付かれず止まる」状態をなくす
3. **管理側の見える化** — 部署 / 現場 / 月次の傾向を 1 画面で把握
4. **証跡** — 法令対応や事故説明のレベルまでは作り込まない（NICE TO HAVE）

### 設計原則

- **すべてが組織管理者の設定で変わる**（ステップ数 / 役割 / 通知タイミング etc.）
- 旧版の「7 段階固定」のような硬直は持たない
- 協力会社のログインなどクロス組織は対象外（同一テナント内で完結）

### 初版（v2.1）で達成する成果指標

- **指標 1: 巡回 1 回あたりの所要時間** 紙運用比で半減（例: 30 分 → 15 分）
- **指標 2: NG → 是正完了の平均日数** 紙運用比で 1/3（例: 14 日 → 5 日）

---

## 2. ロールモデル（2 層）

### A. ユーザーロール（システム上の立ち位置）

AppHarbor 既存の `OrgRole` をそのまま流用。新たに作らない。

| 表示名 | DB 値 | できること |
|---|---|---|
| アプリ利用者 | `member` | パトロール作成・自分の担当ステップ操作 |
| 部署管理者 | `dept-admin` | + 自部署 + 配下部署のパトロール横断閲覧（組織管理者が個別追加した部署も含む） |
| 組織管理者 | `org-admin` | + テンプレ / 役割 / 設定の管理 |

#### 部署管理者のスコープ

- デフォルト: 自部署 (`profiles.department_id`) + その配下（`departments.path` ltree 配下）
- 組織管理者が **追加部署を個別指定可能**（クロステナントは不可、組織内の他部署のみ）
- スコープは新規テーブル `patrol_dept_admin_scopes` で管理

### B. アプリ内ロール（業務上の役職）

`patrol_workflow_roles` テーブルで管理。**組織管理者が自由に追加・編集・削除可能**。

#### 初期 seed（組織作成時に投入）

| key | label | 削除可否 |
|---|---|---|
| `patroller` | パトロール者 | **不可**（業務基盤のため）|
| `site_manager` | 現場責任者 | 可 |
| `supervisor` | 作業監督者 | 可 |
| `worker` | 作業員 | 可 |
| `construction_mgr` | 工事管理者 | 可 |
| `safety_keyman` | 安全品質キーマン | 可 |
| `result_verifier` | パトロール結果確認者 | 可 |
| `result_approver` | パトロール結果承認者 | 可 |

「パトロール者」は label 変更可（cartridge author はコード経由で変更可）。

#### ロールとユーザーの紐付け（解決順）

シート提出時に各ステップの assignee を解決する優先順位:

```
HIGH (上が勝つ)
  1. シート作成時に明示指定          ← パトロール者が「今回はこの人」と指定
  2. テンプレートに埋め込まれた既定値 ← テンプレが「営業所 A の場合は田中所属長」と記憶
  3. 部署別バインディング (将来)
  4. ユーザー個別の既定 (将来)
  5. 組織既定                        ← 「組織のパトロール結果承認者は山田所属長」
LOW
```

MVP は **1 + 2 + 5** の 3 層で動く。3, 4 は v2.x で追加可能。

#### 兼任

1 ユーザーは複数ロールを持てる（例: 田中さん = 現場責任者 + パトロール者）。

---

## 3. チェック表

### 3.1 構造

#### 3 階層カテゴリ

```
category1 大分類（例: "土木"）
  └─ category2 中分類（例: "掘削工"）
       └─ category3 小分類（例: "支保工"）  ← v2 NEW
```

#### 項目（patrol_items）の属性

| カラム | 型 | 意味 |
|---|---|---|
| `is_important` | boolean | 重要項目フラグ（既存） |
| `display_style` | text enum | `'normal' \| 'important_red' \| 'important_bold' \| 'critical'` |
| `weight` | numeric | 重み（任意、未設定は 1.0）|
| `regulation_ref` | text | 法令・規程参照（例: "労安規則 第518条"）|
| `input_type` | text | `'result_only'` のみ実装（カラムは将来拡張用に確保） |

#### display_style の表示マッピング

| 値 | 表示 |
|---|---|
| `normal` | 通常 |
| `important_red` | 赤字 |
| `important_bold` | 太字 |
| `critical` | 赤背景 + 太字 |

#### 結果値（既存仕様維持）

`patrol_sheet_items.result`: `'ok' | 'ng' | 'none'` — ○ / × / —

### 3.2 入力型（input_type）

MVP は `result_only` のみ動作。**列だけ確保**して将来追加可能に。

将来候補:
- `result_with_number` — ○×— + 数値入力（足場高さ等）
- `result_with_text` — ○×— + 自由記述
- `result_with_choices` — ○×— + 複数選択

### 3.3 テンプレート

```
patrol_checklist_templates
  + version             int        既存
  + parent_template_id  uuid       複製元（NULL = オリジナル）
  + version_note        text       バージョン変更メモ
```

#### 機能
- **複製**: ボタン 1 個でテンプレ + 全 items を複製、parent_template_id を保持
- **バージョンアップ**: 編集時「軽微修正（version 据え置き）」「メジャー更新（version +1 + version_note）」を選択
- **過去 version 閲覧**: シートは `template_version` を保持済（既存）。詳細画面で「v3 で作成」表示
- **rollback は不要**: 「複製して旧版を再利用」で代替

### 3.4 コメント + 添付（3 階層）

| レベル | テーブル | コメント | 添付 |
|---|---|---|---|
| 項目 | patrol_sheet_items | comment（既存） | photo_urls（既存）+ 統一 attachments も書き込み |
| シート | patrol_check_sheets | feedback（既存：「所感」） | **新**: 統一 attachments |
| ワークフローコメント | patrol_sheet_comments（新） | body | **新**: 統一 attachments |

#### 統一 attachments テーブル

```sql
patrol_attachments (
  id              uuid pk,
  organization_id uuid,
  owner_kind      text  CHECK (owner_kind IN ('sheet_item','sheet','comment')),
  owner_id        uuid,
  file_url        text,
  file_kind       text  CHECK (file_kind IN ('photo','document')),
  file_name       text,
  uploaded_by     uuid,
  created_at      timestamptz
)
```

- 既存 `patrol_sheet_items.photo_urls` は残しつつ、新規分は patrol_attachments へ二重書き
- 「全添付ファイル一覧」「容量集計」が 1 クエリで可能になる

### 3.5 Storage bucket 拡張

```sql
update storage.buckets set
  file_size_limit    = 52428800,  -- 50MB（後で SQL 1 行で変更可）
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         -- xlsx
    'text/plain'
  ]
where id = 'patrol-attachments';
```

---

## 4. ワークフロー

### 4.1 ステップ種別（4 種類）

| 種別 | 必須応答 | フロー進行 | 用途 |
|---|---|---|---|
| `review` | YES | 承認後に進む | 確認系（現場責任者・工事管理者・安全品質キーマン）|
| `comment` | YES（コメント必須）| コメント後に進む | 応答ステップ |
| `notify` ★ | NO | **進行を止めない** | 結果確認者の閲覧記録のみ |
| `final_approve` | YES | **承認 = 完了** | 結果承認者（所属長）|

★ v2 NEW（旧 cartridge は review/comment/approve の 3 種）

### 4.2 ステップアクション（2 つだけ）

| アクション | 効果 |
|---|---|
| **承認 (Advance)** | 次のステップへ進める |
| **意見を求める** | コメントスレッドに @mention 付きコメント投稿。フローは現ステップで停止 |

> **「ハード差戻し」は廃止**。「上司に確認が足らん！」を防ぐためには、現ステップ担当者が
> 納得するまで意見を求め続け、納得したら次へ進める柔らかいモデル。

### 4.3 並列ステップ

`patrol_workflow_steps.step_order` を **重複可** にして、同じ番号 = 並列グループ:

```
step_order=1  パトロール者                       single
step_order=2  現場責任者                         single
step_order=3  工事管理者         ┐
              安全品質キーマン   ┘ parallel    両方 review
step_order=4  結果確認者         ┐
              結果承認者         ┘ parallel    notify + final_approve
```

#### 進行ルール
- 同 step_order 内の **必須応答 step（review / comment / final_approve）すべて完了** → 次の step_order へ
- `notify` step は無視（並列内に notify だけがあれば、その stage は即進行）
- 並列内で **1 つでも `final_approve` が承認されたらシート全体完了**（並列内の他 step は完了扱い）

#### 並列内の遅延応答（Q1: a 差戻し優先）

> **注**: ハード差戻しは廃止したので「(a) 差戻し優先」のシナリオは消滅。
> 並列内のいずれかが「意見を求める」を押せば、そのステップは保留。
> 他のステップが「承認」しても **必須応答 step がすべて完了するまでフロー進行しない**。

### 4.4 コメント / @mention

```sql
patrol_sheet_comments (
  id                   uuid pk,
  sheet_id             uuid,
  author_user_id       uuid,
  author_name_snapshot text,
  body                 text,
  mentioned_user_ids   uuid[],     -- 解決済 user_id（リンク用）
  mentioned_user_names text[],     -- 表示用スナップショット
  requires_response    boolean DEFAULT false,  -- ★返答必須フラグ
  resolved_at          timestamptz,            -- 返答が来た時刻（requires_response=true 時）
  created_at           timestamptz
)
```

#### 動作
- 任意のユーザーがコメント投稿可（フロー外の閲覧者でも、結果確認者でも、誰でも）
- `@username` で mention → 該当ユーザーに通知（実装は通知 phase）
- `@`なしのコメントも投稿可（一般スレッド）
- ファイル / 写真添付可（patrol_attachments テーブル経由）

#### 返答必須フラグ (`requires_response`)

コメント投稿時に **「返答必須にする」チェックボックス** を表示。

| フラグ | 用途 | 動作 |
|---|---|---|
| `false` (既定) | 情報共有 / FYI / 一般スレッド | 通知のみ。閲覧で完了 |
| `true` | 意見を求める / 確認依頼 | 受信側ダッシュボードに「返答待ち」として強調表示。@mentioned ユーザーの誰か 1 人が返信 (= 同じスレッドにコメント) すると `resolved_at` が立って「返答済み」化 |

##### 例
- ステップ担当者が「掘削深さの判断について意見ください」と投稿 → `requires_response: true`
- 第三者が「参考までに過去事例貼っときます」と投稿 → `requires_response: false`

##### ダッシュボード反映
- 「自分のワークフロー」上部の `@mention されています` に **要返答 (n) / 既読のみ (m)** を分けて表示
- 要返答が滞留している = 24h 経過すると黄色警告（フロー進行と同じ閾値）

##### 解決判定
- @mentioned ユーザーの **誰か 1 人** が同じシートのスレッドにコメント投稿（`@`の有無は問わない）
- 投稿時刻を `resolved_at` に記録
- 「返答待ち」表示は消える

### 4.5 テンプレ構造

```
patrol_workflow_templates
  + visibility           text  CHECK ('org','dept','private')
  + dept_id              uuid  (visibility='dept' 時)
  + owner_id             uuid

patrol_workflow_steps
  + step_type            text  ('review','comment','notify','final_approve')
  + assignee_role_label  text  -- アプリ内ロール名（テキスト保存）
  + assignee_user_name   text  -- 既定担当者名（テキスト、任意）
```

#### visibility
- `org`: 組織全員が選べる（org-admin が作成）
- `dept`: 該当部署のメンバーだけ選べる（dept-admin が作成）
- `private`: 作成者本人だけ使える（誰でも作成可）

#### テキスト保存の理由
- 異動・退職・名前変更があっても **テンプレ自体は壊れない**
- 人間が読んで意味が分かる（DB エクスポート時にも有用）
- ID 解決はシート提出時に display_name 一致で行う（曖昧マッチ）

### 4.6 シートのスナップショット（ID + テキスト両方）

```
patrol_sheet_steps
  + step_type                     text
  + assignee_role_label_snapshot  text   -- テキスト（表示用）
  + assignee_user_name_snapshot   text   -- テキスト（表示用）
  + resolved_assignee_id          uuid   -- 実際に解決された user_id（リンク用、解決失敗時 NULL）
```

- 表示は **テキスト** を使う（半年後でも崩れない）
- `resolved_assignee_id` があれば user 詳細にリンク可能（退職時 NULL）

### 4.7 ワークフローエディタ UI（D&D）

```
┌ Stage 1 ┐  ┌ Stage 2 ┐  ┌ Stage 3 (並列) ┐  ┌ Stage 4 (並列) ┐
│パトロール│→│現場責任者│→│工事管理者       │→│結果確認者       │
│  者      │  │          │  │安全品質キーマン│  │結果承認者       │
└─────────┘  └─────────┘  └────────────────┘  └────────────────┘
   review        review        review (×2)        notify + final
```

- ステップを **横にドラッグ** = 並列追加
- ステップを **縦にドラッグ** = 順序入れ替え
- ステップカード内で種別・ロール・既定担当者を選択

> **MVP**: 「step_order 同値で並列」を実装（番号入力フォームでも動く）。D&D は後フェーズ。

---

## 5. UI / ダッシュボード

### 5.1 画面遷移

```
ログイン
  └─→ ダッシュボード（= ホーム、初期画面）
       │
       ├─ ワークフローテンプレ 0 件 → 「テンプレ未設定」状態を表示
       │   - 組織管理者: 「テンプレを作成しましょう」CTA → /admin/workflows/new
       │   - 一般ユーザー: 「管理者がテンプレを準備中です」表示
       │
       └─ テンプレあり → ロール別ダッシュボード描画
```

### 5.2 ダッシュボード共通：「自分のワークフロー」（全ロール必須）

画面上部に **常に** 表示:

```
┌─ 🔔 自分のワークフロー (3 件) ──────────────────────┐
│ ● 第二工事現場の安全パトロール                        │
│   step 2 / 5 (現場責任者確認 — あなたの判断待ち)     │
│   提出 2 日前 / 滞留 6h                              │
│                                            [開く] →  │
│                                                      │
│ 🔴 返答待ち (1 件)                                    │
│   「掘削深さの判断について意見ください」              │
│   from 田中所属長 / 2h 前                            │
│                                            [返答] →  │
│                                                      │
│ ◯ @mention 既読のみ (2 件)                            │
│   ‥                                                  │
└──────────────────────────────────────────────────────┘
```

要返答セクション (🔴) と通常 mention (◯) を視覚的に分離。要返答は 24h 超過で黄色、72h 超過で赤色背景。

### 5.3 ロール別レイアウト

#### パトロール者 (member)
- 自分のワークフロー（上記）
- 自分が直近 30 日に提出したパトロール一覧（最大 5 件）
- 自分が assignee の是正アクション
- 「+ 新規パトロール」CTA

#### 部署管理者 (dept-admin)
- 自分のワークフロー
- 自部署のパトロール月次実施数
- ★ **現場別パトロール実施頻度ヒートマップ**（自部署スコープ）
- 滞留中タスク（自部署内）

#### 組織管理者 (org-admin)
- 自分のワークフロー
- ★ **現場別パトロール実施頻度ヒートマップ**（組織全体）
- 部署別実施数
- ワークフロー滞留サマリ
- 「テンプレ管理」「役割管理」へのショートカット

### 5.4 KPI: 現場別パトロール実施頻度（最優先）

```
        2026/01  02  03  04  05
第二工事    ●     ●●  ●●●  ●           ←  ●数 = 実施回数
第五工事    ●●    ●   ●●   ●●●   
第八工事    -     -   ●    ●●          ← 一度も来てない月は要警戒
```

- セルクリック → その現場・その月のパトロール一覧へ遷移
- 「3 ヶ月以上未実施」現場を強調表示

### 5.5 滞留警告の閾値

| 経過時間 | 表示 |
|---|---|
| ～ 24h | 通常 |
| 24h ～ 72h | 黄色 |
| 72h ～ | 赤 |

固定閾値（MVP）。将来テンプレに「想定処理時間」を持たせて倍率判定する拡張も可能。

### 5.6 モバイル / PC 切り分け

| 機能 | モバイル | PC |
|---|---|---|
| ダッシュボード閲覧 | ✓（縦 1 列に折り畳み） | ✓ |
| パトロール記入・写真 | ✓ **メイン** | ✓ |
| 承認・コメント・@mention | ✓ | ✓ |
| **ワークフローテンプレ編集** | × 閲覧のみ | ✓ メイン |
| **チェック項目テンプレ編集** | × 閲覧のみ | ✓ メイン |
| **役割管理** | × | ✓ |
| 現場別ヒートマップ | ✓（横スクロール） | ✓ |

Tailwind の `sm:` `md:` ブレークポイントで responsive。編集系画面は `min-width` 警告を出して PC 推奨。

---

## 6. 集計出力

旧 PatrolNavi の出力機能を **強化版** にした実装。

### 6.1 出力一覧

| 出力 | 旧 | v2 改善 |
|---|---|---|
| **A. 個別シート PDF** | あり（固定）| レイアウト選択 / 社印・ロゴ / A4・A3 切替 |
| **B. 月次レポート PDF** | 弱 | 強化: KPI グラフ集約（経営層向け）|
| **C. Excel エクスポート** | CSV 程度 | 部署別 / 現場別 / 期間別の自由切り口 + 多シート構成 |
| **D. 監査用 ZIP** | なし | 期間指定で全シート + 写真をまとめて ZIP |

### 6.2 各出力の詳細

#### A. 個別シート PDF
- ヘッダ: 組織ロゴ + 「○○株式会社 安全パトロール記録」
- 本文: 3 階層カテゴリ + 結果 ○×— + 写真サムネ + コメント
- フッタ: ワークフロー履歴タイムライン（誰がいつ承認したか）
- A4 縦 / A3 横 を選択可
- 組織設定で社印画像をアップロードして自動配置

#### B. 月次レポート PDF
- 表紙: 期間 + 組織名 + 集計サマリ（提出件数 / NG 件数 / 是正完了率）
- 現場別ヒートマップ
- 部署別 NG 率 棒グラフ
- 滞留タスク Top 10
- 是正アクション完了率の推移線グラフ
- 巻末: 是正アクション未完了一覧

→ ダッシュボード KPI を **そのまま PDF 化** する設計（実装が楽）

#### C. Excel エクスポート
1 つの xlsx に複数シート:

| シート名 | 内容 |
|---|---|
| `Sheets` | パトロール一覧（期間内、フィルタ反映）|
| `Items` | 全項目の結果（行 = シート × 項目）|
| `NG` | NG 項目だけ抽出 |
| `Correctives` | 是正アクション一覧 + 完了状況 |
| `Workflow` | ワークフロー履歴（誰がいつ何のアクション）|

→ 経営や監査が **自分でピボットテーブル** で切れる素材を提供。

#### D. 監査用 ZIP
期間指定 → 該当シートの:
- PDF 全部
- 添付写真 / ファイル全部
- 一覧 Excel
- メタデータ JSON

を 1 つの ZIP にまとめて DL。事故対応や ISO 監査時の **「3 年分くれ」** に即応。

### 6.3 出力権限

| ロール | A 個別 | B 月次 | C Excel | D 監査 |
|---|---|---|---|---|
| パトロール者 | 自分のシートのみ | × | × | × |
| 部署管理者 | 自部署 | 自部署 | 自部署 | × |
| 組織管理者 | ✓ | ✓ | ✓ | ✓ |

### 6.4 出力タイミング

- **A**: シート詳細画面の「PDF」ボタン → 同期生成
- **B/C**: 集計画面 `/reports` で期間 + 部署 + 現場をフィルタ → 同期生成
- **D**: `/reports` の「監査用 ZIP」ボタン → 非同期処理（生成後に通知センターに DL リンク表示）

### 6.5 実装優先度

| 出力 | v2.1 | v2.2 | v2.3 |
|---|---|---|---|
| A. 個別 PDF | ✓（既存 print/page.tsx 進化）| | |
| C. Excel（簡易: Sheets + Items のみ）| ✓ | フル | |
| B. 月次 PDF | | ✓ | |
| D. 監査 ZIP | | | ✓ |

---

## 7. データモデル全体

### 7.1 新規テーブル

```sql
-- アプリ内ロール定義（組織管理者が自由に追加）
patrol_workflow_roles (
  id              uuid pk,
  organization_id uuid,
  key             text,    -- slug 例: 'site_manager'
  label           text,    -- 表示名 例: '現場責任者'
  description     text,
  sort_order      int,
  is_system       boolean, -- パトロール者 = true（削除不可）
  deleted_at      timestamptz
)

-- ロール → ユーザー紐付け（組織既定）
patrol_workflow_role_bindings (
  id              uuid pk,
  organization_id uuid,
  role_id         uuid fk → patrol_workflow_roles,
  user_id         uuid fk → profiles
)

-- 部署管理者の追加スコープ部署
patrol_dept_admin_scopes (
  id              uuid pk,
  organization_id uuid,
  dept_admin_user_id uuid fk → profiles,
  dept_id         uuid fk → departments
)

-- ワークフローコメントスレッド
patrol_sheet_comments (
  id                   uuid pk,
  sheet_id             uuid fk → patrol_check_sheets,
  author_user_id       uuid fk → profiles,
  author_name_snapshot text,
  body                 text,
  mentioned_user_ids   uuid[],
  mentioned_user_names text[],
  requires_response    boolean DEFAULT false,  -- 返答必須フラグ
  resolved_at          timestamptz,            -- 返答到着時刻（requires_response=true 用）
  created_at           timestamptz
)

-- 統一添付テーブル
patrol_attachments (
  id              uuid pk,
  organization_id uuid,
  owner_kind      text CHECK (owner_kind IN ('sheet_item','sheet','comment')),
  owner_id        uuid,
  file_url        text,
  file_kind       text CHECK (file_kind IN ('photo','document')),
  file_name       text,
  uploaded_by     uuid fk → profiles,
  created_at      timestamptz
)
```

### 7.2 既存テーブルへの列追加

```sql
patrol_workflow_templates +
  visibility    text CHECK ('org','dept','private')
  dept_id       uuid fk → departments  (visibility='dept' 時)
  owner_id      uuid fk → profiles

patrol_workflow_steps +
  step_type             text CHECK ('review','comment','notify','final_approve')
  assignee_role_label   text   -- テキスト
  assignee_user_name    text   -- テキスト（既定担当者）
  -- 既存 step_order の UNIQUE 制約を解除（重複可で並列）

patrol_sheet_steps +
  step_type                       text
  assignee_role_label_snapshot    text
  assignee_user_name_snapshot     text
  resolved_assignee_id            uuid fk → profiles  -- 解決失敗時 NULL
  -- 既存 step_order の UNIQUE 制約を解除

patrol_checklist_templates +
  parent_template_id  uuid fk self
  version_note        text

patrol_items +
  category3        text                         -- 3 階層目
  display_style    text DEFAULT 'normal'
  weight           numeric DEFAULT 1.0
  regulation_ref   text
  input_type       text DEFAULT 'result_only'

patrol_check_sheets +
  -- 添付は patrol_attachments(owner_kind='sheet') で管理
  -- (既存 feedback はシート所感として継続使用)
```

### 7.3 制約変更

```sql
-- 並列ステップ対応で UNIQUE 解除
ALTER TABLE patrol_workflow_steps DROP CONSTRAINT patrol_workflow_steps_template_id_step_order_key;
ALTER TABLE patrol_sheet_steps    DROP CONSTRAINT patrol_sheet_steps_sheet_id_step_order_key;

-- 代わりに「同じ position は禁止」制約を追加（必要なら step_position 列追加）
```

### 7.4 RLS

すべての新規テーブルで:
```sql
alter table xxx enable row level security;
create policy "org_isolation" on xxx
  for all to authenticated
  using (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

サブテーブル (patrol_attachments の owner 経由解決等) は親テーブル経由で組織判定。

---

## 8. 実装ロードマップ

| Phase | 内容 | 推定 |
|---|---|---|
| **v2.1.0** | DB スキーマ追加（roles / role_bindings / 3 階層 / step_order 重複可 / attachments）+ 役割管理画面 `/admin/roles` | 半日 |
| **v2.2.0** | WorkflowEditor 拡張（並列対応 + step_type 4 種 + テンプレ役割設定 + visibility）| 半日 |
| **v2.3.0** | コメントスレッド + @mention（フロー切替 = 承認 only、ハード差戻し廃止）| 半日 |
| **v2.4.0** | チェック表編集の 3 階層 + display_style + weight + regulation_ref + 添付統一 | 半日 |
| **v2.5.0** | ダッシュボード（ロール別 + 現場別ヒートマップ + 「自分のワークフロー」）| 半日 |
| **v2.6.0** | PDF + Excel 出力（A + C 簡易版）| 半日 |

合計 **3 日** 規模。GW 中に v2.1 + v2.2 達成すれば大成功。

### Phase 着手順の理由

1. **v2.1 (DB + 役割管理)**: 後続全てが新テーブル / 新列を前提とするので最初。
2. **v2.2 (WorkflowEditor)**: ワークフローが組めないと提出フロー全体が動かない。
3. **v2.3 (コメント + @mention)**: ワークフローと同時期にあると流れる議論できる。
4. **v2.4 (チェック表編集)**: 3 階層を導入。既存シートとの後方互換に注意。
5. **v2.5 (ダッシュボード)**: データが溜まり始めてから KPI 描画。
6. **v2.6 (出力)**: 全機能の上に乗る最終層。

---

## 9. Studio 互換性

- v2.0.0 で `studioCompatible: true` 達成済み
- 各 phase で **Studio で動くこと** を確認しながら進める
- 新規テーブル / 列追加は schema.sql の冪等パターン (`IF NOT EXISTS`) で実装
- マイグレーションは `lib/cartridge/migration.ts` 経由で `supabase/migrations/{ts}_cart_patrol_navi_v{version}.sql` を生成

---

## 10. 既存環境との互換性（重要）

### 10.1 旧データの扱い

- 既存環境（本番）には v1.0 で作られた `patrol_check_sheets` / `patrol_workflow_steps` 等が残っている
- v2 の新規列はすべて `DEFAULT` 付きで追加 → 既存行は壊れない
- v2 の新ステップ種別 `notify` は既存に無い → デフォルトは `review`

### 10.2 旧テンプレの自動移行

- 既存の patrol_workflow_steps（step_type なし or 'review'）はそのまま使える
- assignee_id (旧) → resolved_assignee_id (新) に rename or 並存
- 移行 SQL は migration ファイルに記載

### 10.3 cartridge:sync との関係

- sync は routes/ をコピーするだけなので、DB スキーマと無関係
- schema.sql 変更時は manifest.version bump → cart_patrol_navi_v{version}.sql 生成
- 詳細は db/CHANGELOG.md 参照

---

## 11. 用語集

| 用語 | 意味 |
|---|---|
| **ユーザーロール** | AppHarbor の OrgRole (`member` / `dept-admin` / `org-admin`) |
| **アプリ内ロール** | PatrolNavi の workflow role（パトロール者・現場責任者など、組織管理者が定義）|
| **ワークフロー** | パトロールシートが提出されてから完了するまでの承認フロー全体 |
| **ステップ** | ワークフローの 1 段階。担当者・種別・順序を持つ |
| **並列ステップ** | 同じ step_order を持つ複数ステップ（同時並行で進む）|
| **承認 (Advance)** | ステップを完了して次へ進める操作 |
| **意見を求める** | ステップは現状維持のまま、関係者に @mention でコメント依頼する操作 |
| **テンプレ visibility** | ワークフロー / チェック表テンプレの公開範囲（org/dept/private）|
| **解決 (resolve)** | ステップの assignee_role + assignee_user_name を実際の user_id に変換すること |
| **スナップショット** | シート確定時にテンプレ内容をコピーして保持すること（後の変更の影響を受けないため）|

---

## 12. 設計上の TODO（将来検討）

- [ ] 部署別バインディング（解決階層 3）
- [ ] ユーザー個別の既定ロール（解決階層 4）
- [ ] 条件分岐（NG が n 件以上なら別ステップへ）— `patrol_workflow_steps.condition_expr` 追加で対応可
- [ ] エスカレーション（期限超過で上長に自動 forward）— `patrol_workflow_steps.escalate_after_hours + escalate_role_id`
- [ ] 代理承認 / 委任（休暇期間中の自動 forward）— `patrol_workflow_role_bindings` に delegated_to + valid_until
- [ ] テンプレ rollback（過去 version の状態に巻き戻し）
- [ ] 部署マッピング（現場 → 管轄部署）で部署管理者の閲覧範囲を「現場経由」で判定
- [ ] 通知カートリッジとの連携（Announcements 経由でメール / アプリ内通知）
- [ ] PWA + オフライン対応（電波弱い現場対応）
- [ ] input_type 拡張（数値 / 自由記述 / 複数選択）
- [ ] テンプレ rollback / 比較
- [ ] 月次 PDF + 監査 ZIP（v2.7 以降）

---

**設計合意者**: Tori-Take + Claude Opus 4.7
**最終更新**: 2026-05-04 GW
