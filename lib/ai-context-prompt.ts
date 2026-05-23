export type AiContext = {
  sdk: {
    version:      string
    types:        string | null
    index:        string | null
    client:       string | null
    readme:       string | null
    /** SDK リポの prompts/cartridge-author.md (規約・鉄則の散文部分) */
    authorPrompt: string | null
  }
  cartridge: { id: string; claudeMd: string | null; manifest: unknown }
}

export function buildQuickAiPrompt(ctx: AiContext): string {
  const p: string[] = []
  p.push('# AppHarbor カートリッジ開発 — AI 向けコンテキスト\n')
  p.push(`このプロンプトは Studio が組み立てた背景情報です。`)
  p.push(`使用 SDK: \`@appharbor/sdk@${ctx.sdk.version}\`\n`)
  if (ctx.sdk.readme) { p.push('---\n## 1. プラットフォーム概要 + 使い方\n'); p.push(ctx.sdk.readme, '') }
  if (ctx.sdk.types) { p.push('---\n## 2. SDK 型定義\n```typescript'); p.push(ctx.sdk.types.trim(), '```\n') }
  if (ctx.sdk.index || ctx.sdk.client) {
    p.push('---\n## 3. SDK 関数シグネチャ\n')
    if (ctx.sdk.index) { p.push('### サーバーサイド\n```typescript'); p.push(ctx.sdk.index.trim(), '```\n') }
    if (ctx.sdk.client) { p.push('### ブラウザサイド\n```typescript'); p.push(ctx.sdk.client.trim(), '```\n') }
  }
  if (ctx.sdk.authorPrompt) { p.push('---\n## 4. カートリッジ作者の規約 (SDK 同梱)\n'); p.push(ctx.sdk.authorPrompt, '') }
  if (ctx.cartridge.claudeMd) { p.push('---\n## 5. このカートリッジ固有の指示\n'); p.push(ctx.cartridge.claudeMd, '') }
  return p.join('\n')
}
