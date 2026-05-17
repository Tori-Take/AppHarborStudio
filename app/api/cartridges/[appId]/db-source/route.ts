import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

/**
 * カートリッジ単位の DB ソース設定。
 *
 * - PGlite (デフォルト): ローカル WASM Postgres
 * - Docker Supabase: ローカル `supabase start` の Postgres
 * - Studio Supabase: クラウド (Studio 専用プロジェクト)
 *
 * 設定は `.studio-db/db-source.json` に保存:
 *   { "patrol-navi": "docker", "versus-space-invaders": "pglite" }
 *
 * supabase-mock.ts が次のクエリ時にこの設定を読み、適切なクライアントを返す。
 */

export type DbSource = 'pglite' | 'docker' | 'studio-cloud'

const STORE_PATH = join(process.cwd(), '.studio-db', 'db-source.json')

type Store = Record<string, DbSource>

function readStore(): Store {
  try {
    if (!existsSync(STORE_PATH)) return {}
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as Store
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  const dir = join(process.cwd(), '.studio-db')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

function isValidSource(v: unknown): v is DbSource {
  return v === 'pglite' || v === 'docker' || v === 'studio-cloud'
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const id = decodeURIComponent(appId)
  const store = readStore()

  // 環境別デフォルト:
  //   Vercel: PGlite / Docker は N/A なので studio-cloud がデフォルト
  //   ローカル: 従来通り pglite がデフォルト
  const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV
  const defaultSource: DbSource = isVercel ? 'studio-cloud' : 'pglite'

  return NextResponse.json({ source: store[id] ?? defaultSource })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const id = decodeURIComponent(appId)

  let body: { source?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidSource(body.source)) {
    return NextResponse.json({ error: 'source は pglite / docker / studio-cloud のいずれか' }, { status: 400 })
  }

  const store = readStore()
  if (body.source === 'pglite') {
    delete store[id]
  } else {
    store[id] = body.source
  }
  writeStore(store)

  return NextResponse.json({ ok: true, source: body.source })
}
