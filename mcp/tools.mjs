/**
 * MCP ツールの実装本体。すべて Studio の既存 HTTP API を叩く薄いラッパー
 * （Next.js の内部モジュールを直接 import しない — MCP サーバーは別プロセス）。
 *
 * render / logs が自己修正ループの心臓部（AI が自分で失敗に気づく口）。
 * db_query / rls_mode は Step 1-A で作った厳格モードを AI から使うための口。
 */

import { studioFetch } from './http.mjs'

/** Studio の仮組織 slug（lib/sdk-mock/store.ts の DEFAULT_ORG.slug と一致） */
const ORG_SLUG = 'studio-sandbox'

export async function listCartridges() {
  return studioFetch('/api/cartridges')
}

export async function getRules({ id }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/ai-context`)
}

export async function lint({ id }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/lint`)
}

export async function typeCheck({ id }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/type-check`, { method: 'POST' })
}

export async function dbReset({ id }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/reset`, { method: 'POST' })
}

export async function dbSeed({ id, scenario }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/seed`, {
    method: 'POST',
    body: JSON.stringify({ scenario }),
  })
}

export async function dbQuery({ sql, params, asUserId }) {
  return studioFetch('/api/db/query', {
    method: 'POST',
    body: JSON.stringify({ sql, params, asUserId }),
  })
}

export async function rlsMode({ id, mode }) {
  if (mode) {
    return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/rls-mode`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    })
  }
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/rls-mode`)
}

/**
 * ページを実際に開いて HTML・ステータス・エラーらしさを返す。
 *
 * 制約: これはサーバー起点の fetch（本物のブラウザではない）。
 * Server Component / Server Action 内で投げた例外や requireApp の権限エラーは
 * Next.js がサーバー側でレンダリングするため、ここで正しく検出できる。
 * クライアント側 JS の実行時エラー（addEventListener 内の例外など）はここでは
 * 見えない — その場合は logs ツールでクエリログを確認するか、人に画面を見てもらうこと。
 */
export async function render({ id, path = '', userId }) {
  const cleanPath = String(path || '').replace(/^\/+/, '')
  const target = `/org/${ORG_SLUG}/apps/${encodeURIComponent(id)}${cleanPath ? '/' + cleanPath : ''}`
  const headers = {}
  if (userId) headers['cookie'] = `studio_user_id=${encodeURIComponent(userId)}`

  const res = await studioFetch(target, { headers })
  const html = typeof res.body?.raw === 'string' ? res.body.raw : JSON.stringify(res.body)
  const looksLikeError =
    res.status >= 400 ||
    /Application error|Internal Server Error|__next_error__|unhandled runtime error/i.test(html)

  return {
    url: target,
    status: res.status,
    looksLikeError,
    // 巨大な HTML を丸ごと返すとコンテキストを圧迫するため先頭のみ
    htmlSnippet: html.slice(0, 4000),
  }
}

/** 直近のクエリログ（DB クエリの失敗・SQL・所要時間）を返す */
export async function logs({ since } = {}) {
  return studioFetch(`/api/db/log${since ? `?since=${encodeURIComponent(since)}` : ''}`)
}

/**
 * SDK 改善のための振り返りプロンプトを取得する。
 * 注意: 「人が Studio 画面に書いた自由記述の指摘」を拾うものではない
 * （そのような入力欄は現状 Studio に無い）。今回のカートリッジ開発で得た知見を
 * AppHarbor SDK の prompts/ に反映すべきかを AI が振り返るためのガイド文を返す。
 */
export async function feedbackPull({ id }) {
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/feedback-prompt`)
}

/**
 * confirm:false（既定）→ 提出前チェックのプレビューのみ（stage5-prepare）。何も変更しない。
 * confirm:true         → 実際に AppHarbor へ PR を作成する（install-to-appharbor）。
 *                         人の明示的な指示があるときだけ true にすること。
 * どちらのモードでも PR 作成までで、マージは行わない（マージは常に人が行う）。
 */
export async function publish({ id, confirm }) {
  if (!confirm) {
    return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/stage5-prepare`)
  }
  return studioFetch(`/api/cartridges/${encodeURIComponent(id)}/install-to-appharbor`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
