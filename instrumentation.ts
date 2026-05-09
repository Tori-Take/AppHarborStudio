/**
 * Studio 用の空 instrumentation.ts
 *
 * 存在意義: Next.js は instrumentation.ts を探索する際にプロジェクトルートを
 * 上位ディレクトリまで遡って解決することがある。AppHarbor 本体の
 * <repo-root>/instrumentation.ts は @sentry/nextjs に依存するが、Studio は
 * 独立サブプロジェクトで Sentry を使わないため依存に含めていない。
 * ここで空の register() を export することで Next.js のフックを満たし、
 * 親側の instrumentation.ts を巻き込まないようにする。
 *
 * Studio は本来カートリッジ開発用のローカルツールなので、エラー監視は
 * 本体側 (Vercel デプロイ) でのみ有効。
 */
export async function register() {
  // no-op
}
