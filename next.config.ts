import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // PGlite は WASM + worker を使うため、Next.js webpack でバンドルさせず
  // Node.js のネイティブ require として扱う。
  serverExternalPackages: ['@electric-sql/pglite'],
  // Next.js dev モードの浮遊インジケーター（左下の N マーク）を非表示
  // Studio のサイドバーロゴと重なるため
  devIndicators: false,
  // 親リポジトリと並んだ multi-lockfile 構成での誤検知を防ぐ。
  // Studio は studio/ ディレクトリだけを workspace ルートとして扱う。
  // これがないと proxy.ts や instrumentation.ts を親側から拾ってしまう。
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
}

export default nextConfig
