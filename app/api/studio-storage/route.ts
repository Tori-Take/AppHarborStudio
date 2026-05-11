import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const STORAGE_ROOT = join(process.cwd(), '.studio-db', 'storage')

const MIME_MAP: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif:  'image/gif',
  svg:  'image/svg+xml',
  pdf:  'application/pdf',
}

export async function GET(req: NextRequest) {
  const bucket = req.nextUrl.searchParams.get('bucket')
  const path   = req.nextUrl.searchParams.get('path')

  if (!bucket || !path) {
    return NextResponse.json({ error: 'bucket and path required' }, { status: 400 })
  }

  if (path.includes('..') || bucket.includes('..')) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  const filePath = join(STORAGE_ROOT, bucket, path)

  if (!filePath.startsWith(STORAGE_ROOT)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const buf = readFileSync(filePath)
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream'

  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
