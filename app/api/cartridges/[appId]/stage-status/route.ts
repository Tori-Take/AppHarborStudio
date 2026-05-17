import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { Client } from 'pg'
import { getCartridge } from '@/lib/cartridge-scanner'

const REGISTRY_PATH = resolve(process.cwd(), 'cartridges-registry.yaml')
const DOCKER_DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

type StageAutoStatus = {
  1: boolean
  2: boolean
  3: boolean
  4: boolean
  5: boolean
}

/**
 * カートリッジの「実態」に基づいた各 Stage の完了判定を返す。
 *
 * クライアント (useStageStatus) が localStorage 未初期化時に呼び、
 * Web Studio から見ると「既に Stage 4 まで完了済み」のように
 * 実態を反映した初期値を localStorage に書き込む。
 *
 * Stage 1: 常に true (カートリッジが scan できてる時点で OK)
 * Stage 2: Docker Supabase に接続できる
 * Stage 3: Studio Cloud Supabase に接続できる
 * Stage 4: VERCEL 環境変数あり OR registry に installed エントリ
 * Stage 5: (検出不可、常に false)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const auto: StageAutoStatus = { 1: true, 2: false, 3: false, 4: false, 5: false }

  // Stage 2: Docker Supabase 接続テスト
  const dockerUrl = process.env.DOCKER_SUPABASE_DB_URL ?? DOCKER_DEFAULT_URL
  auto[2] = await canConnect(dockerUrl)

  // Stage 3: Studio Cloud Supabase 接続テスト
  if (process.env.STUDIO_CLOUD_SUPABASE_DB_URL) {
    auto[3] = await canConnect(process.env.STUDIO_CLOUD_SUPABASE_DB_URL)
  }

  // Stage 4: Vercel 環境 OR registry に installed エントリあり
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) {
    auto[4] = true
  } else {
    auto[4] = isInstalledInRegistry(safe)
  }

  // Stage 5: 検出不可 (将来 AppHarbor 本体 registry 確認で対応)

  return NextResponse.json({ auto })
}

async function canConnect(connectionString: string): Promise<boolean> {
  const client = new Client({ connectionString, connectionTimeoutMillis: 2000 })
  try {
    await client.connect()
    await client.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

function isInstalledInRegistry(appId: string): boolean {
  if (!existsSync(REGISTRY_PATH)) return false
  try {
    const text = readFileSync(REGISTRY_PATH, 'utf-8')
    // 軽量パース: id と mode のペアを探す
    let currentId: string | null = null
    let currentMode: string | null = null
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, '').trimEnd()
      if (!line.trim()) continue
      const idMatch = line.match(/^\s+- id:\s*(.+)$/)
      if (idMatch) {
        if (currentId === appId && currentMode === 'installed') return true
        currentId = idMatch[1].trim()
        currentMode = null
        continue
      }
      const modeMatch = line.match(/^\s+mode:\s*(.+)$/)
      if (modeMatch) currentMode = modeMatch[1].trim()
    }
    return currentId === appId && currentMode === 'installed'
  } catch {
    return false
  }
}
