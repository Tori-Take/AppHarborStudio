/**
 * 規約違反内容を AI 用の修正プロンプトに変換する。
 * Studio の Lint パネルから「コピー」して Claude Code に貼り付ける想定。
 */

export type LintIssue = {
  file:     string
  line:     number
  spec:     string
  severity: 'error' | 'warn'
  message:  string
}

export function buildAiFixPrompt(cartridgeId: string, issues: LintIssue[]): string {
  const errors = issues.filter((i) => i.severity === 'error')
  const warns  = issues.filter((i) => i.severity === 'warn')

  const fmtIssue = (i: LintIssue) =>
    `- ${i.file}:${i.line}\n  spec: ${i.spec}\n  ${i.severity === 'error' ? '【エラー】' : '【警告】'} ${i.message}`

  const errorsSection = errors.length > 0
    ? `### ❌ エラー (${errors.length} 件) — 必ず修正\n${errors.map(fmtIssue).join('\n\n')}`
    : ''

  const warnsSection = warns.length > 0
    ? `### ⚠ 警告 (${warns.length} 件) — できれば修正\n${warns.map(fmtIssue).join('\n\n')}`
    : ''

  return `# AppHarbor カートリッジ規約違反の修正依頼

カートリッジ \`${cartridgeId}\` で規約違反が検出されました。
以下の違反を修正してください。**このフォルダ内のファイルだけを編集**してください。

## 検出された違反

${[errorsSection, warnsSection].filter(Boolean).join('\n\n')}

## AppHarbor カートリッジ規約

### ✅ 使ってよい import
- \`@/sdk\` / \`@/sdk/client\` — SDK（actor 取得・Supabase 接続・権限チェック）
- \`react\`, \`react-dom\`, \`next/*\` — 標準
- 相対 import（\`./components/...\`, \`../server/...\`）
- Node 標準 module（\`fs\`, \`path\` 等は server 側のみ）

### ❌ 使ってはいけない import
- \`@/lib/*\` — 本体実装に密結合 → \`@/sdk\` 経由に置き換え
- \`@/components/*\` — 本体 UI（shadcn/ui 等） → カートリッジ内で UI を完結
- \`@/types/*\` — 本体型定義 → カートリッジ内に型を持つ
- \`@/core/*\`, \`@/app/*\` — 本体内部
- 外部 npm パッケージで Studio 標準にないもの（\`lucide-react\`, \`tailwind-merge\`, \`clsx\` 等）

### 推奨スタイリング
- インライン style / styled-jsx / CSS Modules
- ❌ Tailwind CSS は不可（Studio に含まれていない）

## 修正方針

1. **\`@/lib/utils\` (cn 関数)**: 不要。条件付き className は文字列連結 or テンプレートリテラルで対応
2. **\`@/components/ui/*\` (shadcn/ui)**: 自前のシンプルな <button>, <input> 等で書き直し（インライン style）
3. **\`@/types/*\`**: そのカートリッジ内で必要な型を直接定義
4. **\`lucide-react\` 等のアイコン**: 絵文字（📋 ✓ ⚠ など）or 自前 SVG で代替
5. **DB アクセス**: 必ず \`@/sdk\` の \`getAdminSupabase()\` / \`createServerSupabase()\` 経由

## 完了条件

- 上記すべての違反が解消されていること
- \`requireApp(slug, '${cartridgeId}')\` の戻り値 \`ctx.role\` を使ったロール判定が動くこと
- 全クエリに \`organization_id\` フィルタが含まれていること

修正したファイルと、各箇所でどう置き換えたかを簡潔に報告してください。`
}
