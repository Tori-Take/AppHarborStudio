import { NextResponse } from 'next/server'
import { getRlsModeFor, setRlsModeFor, type RlsMode } from '@/lib/sdk-mock/rls-mode'

/**
 * カートリッジ単位の RLS 厳格モード設定。
 *
 * - off（既定）: 従来どおり。全クエリを superuser 相当で実行（RLS は素通り）
 * - strict     : クエリを authenticated ロールで実行し、schema.sql の RLS ポリシーを
 *                実際に評価する（詳細: lib/sdk-mock/rls-mode.ts）
 *
 * 設定は `.studio-db/rls-mode.json` に保存。db-source API と同じパターン。
 */

function isValidMode(v: unknown): v is RlsMode {
  return v === 'off' || v === 'strict'
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const id = decodeURIComponent(appId)
  return NextResponse.json({ mode: getRlsModeFor(id) })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const id = decodeURIComponent(appId)

  let body: { mode?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidMode(body.mode)) {
    return NextResponse.json({ error: 'mode は off / strict のいずれか' }, { status: 400 })
  }

  setRlsModeFor(id, body.mode)
  return NextResponse.json({ ok: true, mode: body.mode })
}
