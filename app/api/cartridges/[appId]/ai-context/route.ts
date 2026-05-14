import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getCartridge } from '@/lib/cartridge-scanner'

/**
 * AI 開発者 (Claude Code 等) に渡すコンテキストを組み立てて返す。
 *
 * 含む情報:
 *   - @appharbor/sdk の型定義 / 関数シグネチャ
 *   - @appharbor/sdk の README (使い方の説明)
 *   - このカートリッジの CLAUDE.md (カートリッジ固有指示)
 *   - manifest.json (現状のメタデータ)
 *
 * 戻り値はクライアント側でクリップボードに 1 つの巨大プロンプトとして
 * 組み立てる前提で、各セクションを分けて返す。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const cartridge = getCartridge(decodeURIComponent(appId))
  if (!cartridge) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const sdkRoot = join(process.cwd(), 'node_modules', '@appharbor', 'sdk')
  if (!existsSync(sdkRoot)) {
    return NextResponse.json({
      error: '@appharbor/sdk が node_modules に見つかりません。npm install を実行してください。',
    }, { status: 500 })
  }

  const safeRead = async (p: string): Promise<string | null> => {
    try { return await readFile(p, 'utf-8') } catch { return null }
  }

  const [types, index, client, readme, pkgJson] = await Promise.all([
    safeRead(join(sdkRoot, 'src', 'types.ts')),
    safeRead(join(sdkRoot, 'src', 'index.ts')),
    safeRead(join(sdkRoot, 'src', 'client.ts')),
    safeRead(join(sdkRoot, 'README.md')),
    safeRead(join(sdkRoot, 'package.json')),
  ])

  const sdkVersion = pkgJson ? (JSON.parse(pkgJson).version as string) : 'unknown'

  // カートリッジ自身の CLAUDE.md
  const cartridgeClaudeMd = await safeRead(join(cartridge.path, 'CLAUDE.md'))

  return NextResponse.json({
    sdk: {
      version: sdkVersion,
      types,
      index,
      client,
      readme,
    },
    cartridge: {
      id:        cartridge.id,
      claudeMd:  cartridgeClaudeMd,
      manifest:  cartridge.manifest,
    },
  })
}
