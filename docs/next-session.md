# 次セッション (2026-05-18 以降) 向けメモ

## 前セッションの到達点 (2026-05-17)

**Web Studio → AppHarbor 本番**を 2 クリック自動化に成功。
vehicle-equipment が `appharbor.vercel.app` の「インストール可能アプリ」
に登場 → install → 組織で有効化 → 起動まで実証。

詳細は `docs/work-log.md` の「2026-05-17 (5)」を参照。

---

## 次セッションで優先したいタスク

### 🚀 最優先: Plan B (registry mode) の本番検証

前セッションで実装したが**実際の registry mode PR は未作成**。

**やること:**
1. **新規テスト用カートリッジ**を 1 つ作る (シンプルな TODO アプリ等で OK)
   - Studio の「新規カートリッジ」UI から
   - 必ず `routes/_types.ts` を最初に作るルール (テンプレ準拠)
2. Stage 1-3 をローカルで通す
3. **GitHub に push** (`gh repo create test-cart --private`)
4. Studio の Stage 4 で「Registry に追加」
5. Stage 5 で「**🔍 型チェックを実行**」→ クリーン確認
6. Stage 5 で「**AppHarbor に PR を作成**」をクリック
7. **期待**: PR が **2 ファイル (cartridges-registry.yaml 1 行追加 + migration SQL)** で来る
   - もし 30+ ファイルなら Plan B が動いてない → デバッグ

**ローカル AppHarbor で確認するポイント:**
- `git pull` 後 `npm run cartridge:fetch` (新スクリプト) で clone される
- `cartridges/_installed/test-cart/` に出現
- `npm run cartridge:sync` で `app/org/[slug]/apps/test-cart/` にマウント
- 起動

### 🤖 次優先: GitHub Action で `supabase db push --linked` 自動化

現状 PR マージ後に手動で `npx supabase db push --linked` が必要。

**設計:**
- AppHarbor リポに `.github/workflows/db-push.yml` 追加
- トリガー: `push: branches: [main]` + `paths: ['supabase/migrations/**']`
- ステップ:
  1. `supabase/setup-cli@v1`
  2. `supabase login --token ${{ secrets.SUPABASE_ACCESS_TOKEN }}`
  3. `supabase link --project-ref vomriakqlonnqrsbmkfk`
  4. `supabase db push --linked`
- 必要シークレット: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`
  (Tori-Take の Supabase ダッシュボードから取得)

### 🎁 サブ: その他改善案

- **Studio Stage 5 の進捗ログ表示**
  - 「AppHarbor に PR を作成」が現状ボタン押して数秒待つだけ。途中経過 (clone 中 / blob 作成中 / PR 作成中) を見せると分かりやすい
- **Studio の型チェックの厳密化**
  - 現状は `tsc --noEmit` だけ。AppHarbor 本体の `tsconfig` と完全一致してない可能性
  - 「ローカル check 通ったのに本番落ちる」が再発する余地
  - 案: ローカルチェックで AppHarbor 本体の `tsconfig.json` を取得してそれで検証
- **AppHarbor リポでの自動 install 検証 CI**
  - PR がマージされる前に、AppHarbor の CI でカートリッジを実際に install + build してみる workflow
  - 失敗したら PR にコメント → 修正後に再 push
- **新規カートリッジ作成テンプレに `_types.ts` の雛形を含める**
  - `templates/CLAUDE.cartridge.md` でルール明文化済みだが、実テンプレファイル (`templates/*` の他に scaffold する側) には `_types.ts` の雛形まで作っておくと AI が忘れにくい

---

## 次セッション開始用プロンプト

以下を新セッション開始時に貼り付ければスムーズに継続できる:

```
前セッション (2026-05-17) で AppHarbor Studio の Stage 5 (本番統合) が完成しました。
Web Studio → AppHarbor 本番への install を 2 クリック自動化済み。
vehicle-equipment が `appharbor.vercel.app` で実稼働しています。

詳細は `docs/work-log.md` の「2026-05-17 (5)」と `docs/next-session.md` を読んでください。

今日やりたいこと: **Plan B (registry mode) の本番検証** です。

手順案:
1. 新規テスト用カートリッジ (シンプルな TODO アプリ程度) を Studio で作る
   - `templates/CLAUDE.cartridge.md` の最新ルールに従って `routes/_types.ts` から始める
2. Stage 1-4 を順に通す (GitHub Private リポ作成 → Studio registry 登録)
3. Stage 5 で「🔍 型チェックを実行」が緑になることを確認
4. Stage 5 で「AppHarbor に PR を作成」→ **PR が 2 ファイル (registry 1 行 + migration 1) で来るか確認**
5. registry mode で来ていれば、ローカル AppHarbor で:
   - `git pull` → `npm run cartridge:fetch` → `cartridges/_installed/<id>/` 確認
   - `npm run dev` で起動確認
6. 問題なければ PR マージ → 本番 Vercel ビルド → AppHarbor の「インストール可能アプリ」に出現確認

カートリッジ名・用途は何にしますか?
```

---

## 把握しておく主要パス

- **AppHarborStudio**: `C:\Users\torit\Desktop\Projects\AppHarborStudio` (Tori-Take/AppHarborStudio)
- **AppHarbor 本体**: `C:\Users\torit\Desktop\Projects\AppHarbor` (Tori-Take/appharbor)
- **テスト用カートリッジを作る場所**: `C:\Users\torit\Desktop\Projects\cart-<id>` (sibling フォルダ)
- **本番 Vercel**: `https://appharbor.vercel.app` / `https://app-harbor-studio.vercel.app`
- **本番 Supabase**: GridTask (Studio Cloud, studio schema) / AppHarbor (本番, public schema)

---

## 既知のリスク・注意点

- **本番 Supabase は `db push --linked` で直接更新される**。実ユーザーデータがあるので壊さないこと。
- **GITHUB_TOKEN** は `repo` フルアクセス権限のため、漏れたら全 private リポにアクセスされる。`.env.local` から外に出さない。
- **vehicle-equipment 本番投入済み**: もう新規 install フローで vehicle-equipment は使えない (試したいなら別 cartridge を作る)。
- **AppHarbor の `cartridges-registry.yaml`**: 既存 7 カートリッジは `mode: local` で登録済み。新規追加は末尾に `mode: installed` で。
