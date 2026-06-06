# Stage 4 が進まない — ローカル junction と GitHub リポの split-brain

- **日付**: 2026-06-01
- **影響範囲**: Studio UX / Stage 4 リリースパイプライン / `_local` junction 同期
- **検出**: ユーザーが Studio ダッシュボードで `daigamen-test` を Stage 4 に進めようとしたが 3 チェックが全て赤。「リポジトリはあるよね？」の一言から調査して発覚。

---

## 何が起きたか

時系列（JST, 2026-05-31）:

1. **17:01** — Studio の scaffold で `daigamen-test` を作成。ローカルに兄弟リポ `cart-daigamen-test`（空 scaffold・`tables: []`・挨拶画面のみ・commit 1 個・**remote 無し**）が生成され、`cartridges/_local/daigamen-test` に junction 登録。
2. **17:42 / 19:55** — 本実装が別の作業コピー/環境で行われ、GitHub `Tori-Take/daigamen-test` に push される（`Initial daigamen battle sync cartridge` → `Fix AppHarbor RLS check for items table` の 2 commit。`fullscreen: true`・6 テーブル・HostArena/MobileController/join 等のフル実装）。**だがローカルの junction フォルダには降りてこなかった**。
3. ユーザーが Stage 4（Vercel Studio）へ進もうとすると、3 チェック（GitHub リポ／push 済み／registry 登録）が**全て赤のまま**。Studio は「git remote origin が未設定」「まだ一度も push されていない」「registry にエントリがありません」と表示。
4. ユーザー「リポジトリはあるよね？」→ 調査。`gh repo list` で `Tori-Take/daigamen-test`（本物・private）が存在。ローカル junction（空 scaffold・remote 無し）と GitHub（本実装・**無関係な git 履歴**）が**分断**していた（split-brain）と判明。
5. 手動で解消: ローカルに `origin` 設定 → `git fetch` → `git reset --hard origin/main`（空 scaffold commit を破棄し本物を採用）→ `cartridges-registry.yaml` に `mode: installed` 追加 → `POST /api/mount` で再マウント → `stage4-check` が `allOk: true` に。

---

## 根本原因

**Studio は「`_local` の junction フォルダ ＝ あなたのカートリッジ」という前提で、ローカルの git 状態しか見ない。GitHub 側を一切参照しないため、本物が別リポにある split-brain を検知も解消もできない。**

Studio の判定自体は正確だった（あの空 scaffold は確かに remote 無し・未 push・未登録）。問題は前提（ローカル＝本物）が崩れていたこと。構造的な穴:

1. **GitHub を見ない**: `stage4-check` / `deploy-info` は junction 先ローカルリポの `origin.url`・未 push・dirty と registry しか読まない。「同名 `daigamen-test` が GitHub に既に在る」を知る手段が無い。＝症状（ローカル未 push）は出せても根本原因（別リポとの分断）は構造的に見えない。
2. **接続を作る導線が無い（鶏と卵）**: 「Registry に追加」は `origin.url` から repo 名を取るため remote 必須。`push`（`app/api/cartridges/[appId]/push/route.ts`）は `push origin HEAD` のみで `git init`／`gh repo create`／`remote add` をしない。＝**origin を張る／既存リポを検出して紐付ける Studio アクションが存在しない**。全ボタンが「ローカル↔リモートは既に繋がっている」前提。
3. **`push` 口が現アーキテクチャ非対応**: `push/route.ts` は `process.cwd()` の親を git リポ、`cartridges/<id>` をサブフォルダとして扱う**旧モノレポ設計**。`cart-*` 兄弟リポ junction には対応せず「単独配布モードのため push できません」で弾く。読み取り側 `deploy-info` は兄弟リポ対応済みなのに、書き込み側が取り残されている。
4. **`_local` 同期機構が無い**: `scripts/fetch-cartridges.js` は `mode: local` をスキップし `_installed/` しか同期しない。＝オフマシンで開発・push された変更を取り込む経路が無い。
5. **命名不一致**: ローカル `cart-daigamen-test` ／ GitHub `daigamen-test`。名前ベースの自動リンクも接頭辞違いで外れる。

**契機**: scaffold とは別経路で本物が GitHub に作られ、ローカル junction が空のまま放置された。なお 5 段階フロー（CLAUDE.md）では Stage 3→4 の push は「AI に依頼」と明記＝**Studio 単独完結は元々の想定外**だが、今回は split-brain ＋ push 口非対応が重なり「AI に一言」で済むはずが調査の要る事故になった。

---

## 改善したこと

### 応急処置（個別カートリッジの復旧）

| 手順 | 内容 |
|---|---|
| ローカルを GitHub に接続 | `cart-daigamen-test` に origin 設定 → `git reset --hard origin/main`（`aa988a2`）。空 scaffold commit を破棄 |
| registry 登録 | 本体チェックアウトの `cartridges-registry.yaml` に `daigamen-test`（`mode: installed`）追加 |
| 再マウント | `POST /api/mount` で本物のルート（admin/join/components/server）を反映 |
| 検証 | `stage4-check` → `allOk: true`（3 チェック緑）／ `stage-status` → `auto.4: true` |

### Studio 本体の改善

| 対象 | 改善内容 |
|---|---|
| Studio プロンプト | （今回変更なし）|
| Studio UX | **未対応** → 「今後の示唆」参照（split-brain 検知・接続導線・兄弟リポ push）|
| PGlite モック | 該当なし |
| CLAUDE.md | （提案）「よくある罠」に split-brain と手動復旧手順を追記 |

> Studio コード自体の改善は本ポストモーテム時点で未着手。応急処置は手動 CLI で実施。恒久対策は下記。

---

## 今後の示唆

Studio 側に「外（GitHub）を見て自分で繋ぐ」能力を足すのが本筋:

- **(A) split-brain 検知**: `stage4-check` で「remote 無し ＆ 同名 GitHub リポ（`<id>` または `cart-<id>`）が存在」を検出したら**警告＋ワンクリック接続**を提示（`gh` で照会）。
- **(B) 接続/同期の導線**: ローカル junction に origin を張り `_local` を GitHub に同期する Studio アクション（≒今回手動でやった `remote add` + `reset --hard`）。破壊的操作なので確認 UI 付き。
- **(C) `push` 口の兄弟リポ対応**: `push/route.ts` を `cart-*` sibling repo（junction 解決済み実体パスの git ルート）で動くよう改修。`deploy-info` と同じ junction 解決を流用。
- **(D) `cartridge:new` の一気通貫**: scaffold 時に GitHub リポ作成＋origin 設定まで行い、**最初から split させない**。
- **(E) 命名規約**: `cart-<id>` に統一、または registry/検出を両形式対応に。
- **(F) ドキュメント/AI**: CLAUDE.md「よくある罠」に追記。AI が即診断できるよう memory にも記録済み（`studio-cartridge-split-brain-stage4`）。
