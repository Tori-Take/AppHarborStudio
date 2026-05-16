export type AiContext = {
  sdk: { version: string; types: string | null; index: string | null; client: string | null; readme: string | null }
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
  if (ctx.cartridge.claudeMd) { p.push(`---\n## 4. カートリッジ固有の指示\n`); p.push(ctx.cartridge.claudeMd, '') }
  p.push('---\n## 5. マルチテナント設計の鉄則\n')
  p.push('- **全テーブルに `organization_id uuid REFERENCES organizations(id)` を持たせる**')
  p.push('- **RLS ポリシーで `organization_id` を必ず設定**')
  p.push('- **全クエリで `.eq(\'organization_id\', ctx.actor.organizationId)` を必ず付ける**')
  p.push('- **db/schema.sql を単一ソースとする**\n')
  return p.join('\n')
}
