/**
 * Studio の HTTP API を叩く薄いクライアント。
 *
 * 安全弁: localhost / 127.0.0.1 以外には絶対に接続しない。
 * MCP サーバーは Vercel 版 Studio には存在しない（stdio なのでそもそも届かない）が、
 * 念のため接続先自体もローカル限定にしておく。
 */

// npm run dev（dev-supervisor.js）は 3200 で next dev を起動する。
// 3100 は npm run start（ビルド後の本番相当起動）専用のポートで、
// 開発中に実際に叩くべきなのは 3200 の方（実測で確認済み）。
const BASE_URL = process.env.STUDIO_BASE_URL || 'http://localhost:3200'

function assertLocalhost(urlString) {
  const u = new URL(urlString)
  if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
    throw new Error(
      `MCP は localhost 以外への接続を許可していません: ${u.hostname}` +
      '（STUDIO_BASE_URL の設定を確認してください）',
    )
  }
}

/**
 * @param {string} path - "/api/..." または "/org/..." のようなパス
 * @param {RequestInit} [opts]
 * @returns {Promise<{status: number, ok: boolean, body: any}>}
 */
export async function studioFetch(path, opts = {}) {
  const url = `${BASE_URL}${path}`
  assertLocalhost(url)

  let res
  try {
    res = await fetch(url, {
      ...opts,
      headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    })
  } catch (e) {
    throw new Error(
      `Studio (${BASE_URL}) に接続できません: ${e instanceof Error ? e.message : String(e)}\n` +
      'Studio の dev サーバーが起動しているか確認してください（npm run dev）。',
    )
  }

  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    // HTML / Markdown 等 JSON でない応答もそのまま返す
    body = { raw: text }
  }
  return { status: res.status, ok: res.ok, body }
}
