import type { NextConfig } from 'next'
import path from 'node:path'
import { networkInterfaces } from 'node:os'

// スマホ実機テスト用: 起動時に全 LAN IPv4 を自動検出して許可する。
// Next.js 16 は未許可オリジンからのアクセスでクライアント JS が起動しない。
// IP が変わっても Studio 再起動で自動追従するため手動編集は不要。
const VIRTUAL_IF = /vethernet|virtual|wsl|hyper.v|vmware|virtualbox|docker|loopback|tunnel|teredo|isatap/i

function getLanIps(): string[] {
  const result: string[] = []
  const nets = networkInterfaces()
  // 仮想アダプター (WSL2, Hyper-V 等) を除外して実 LAN IP のみ収集
  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs || VIRTUAL_IF.test(name)) continue
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) result.push(a.address)
    }
  }
  return result
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  allowedDevOrigins: getLanIps(),
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
    resolveAlias: {
      '@appharbor/sdk':        './lib/sdk-mock',
      '@appharbor/sdk/client': './lib/sdk-mock/client',
    },
  },
  outputFileTracingRoot: path.resolve(__dirname),
  // @appharbor/sdk を Studio の sdk-mock 実装に向ける（webpack エイリアス）
  // tsconfig.paths だけでは Next.js の webpack/turbopack が解決しない場合があるため
  //
  // ⚠ 末尾の $ が必須: 無いと webpack は前方一致でエイリアスするため、
  // @appharbor/sdk/kit のような別サブパスの import まで巻き込んで
  // lib/sdk-mock/kit（存在しない）に誤って書き換えてしまう
  // （カートリッジ作成工程の再設計 Step 3 で @appharbor/sdk/kit を追加した際に発覚）。
  webpack(config) {
    config.resolve.alias['@appharbor/sdk$']        = path.resolve(__dirname, 'lib/sdk-mock')
    config.resolve.alias['@appharbor/sdk/client$'] = path.resolve(__dirname, 'lib/sdk-mock/client')
    return config
  },
}

export default nextConfig
