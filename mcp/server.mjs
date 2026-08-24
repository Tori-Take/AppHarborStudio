#!/usr/bin/env node
/**
 * AppHarbor Studio MCP サーバー（AI の口）
 *
 * カートリッジ作成工程の再設計 Step 1-C（docs/plan-cartridge-pipeline-redesign.md 3節）。
 * AI（Claude Code 等）が Studio を自分で操作して、シード投入・テスト・自己修正の
 * ループを回せるようにする。stdio で起動し、Studio の HTTP API（既定 localhost:3200 —
 * npm run dev の実ポート。3100 は npm run start 専用）を薄く呼ぶだけ。
 * Next.js の内部には一切触れない。
 *
 * 起動: npm run mcp
 * 前提: 別ターミナルで Studio の dev サーバーが起動していること（npm run dev）。
 *
 * 安全弁:
 *   - localhost / 127.0.0.1 以外には接続しない（http.mjs で強制）
 *   - db_query / db_seed が触れるのは仮DB（PGlite）のみ。本番 Supabase の鍵はここから触れない
 *   - publish は confirm:true でも PR 作成まで。マージは行わない（常に人が承認する）
 *   - Vercel にデプロイされた Studio にはこのサーバーは存在しない（stdio なので届かない）
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as tools from './tools.mjs'

const server = new McpServer({ name: 'appharbor-studio', version: '0.1.0' })

/** ツールの戻り値（JS オブジェクト）を MCP の text content に変換する */
function toResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

/** 例外を投げず、エラーも同じ形式で AI に返す（ツール呼び出し自体は失敗させない） */
function wrap(fn) {
  return async (args) => {
    try {
      return toResult(await fn(args))
    } catch (e) {
      return toResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
}

server.registerTool('list_cartridges', {
  description:
    'Studio が認識している全カートリッジの一覧を返す（id・manifest・routes/db フォルダの有無）。' +
    '何か作業を始める前に、まずどのカートリッジがあるか確認するのに使う。',
  inputSchema: {},
}, wrap(tools.listCartridges))

server.registerTool('get_rules', {
  description:
    '指定カートリッジの SDK 契約（型・関数シグネチャ）、AppHarbor の規約、このカートリッジ固有の ' +
    'CLAUDE.md をまとめて返す。コードを書く前に必ず読むこと（マスターキー禁止・organization_id必須 等の規約が含まれる）。',
  inputSchema: { id: z.string().describe('カートリッジ id（例: "daigamen-test"）') },
}, wrap(tools.getRules))

server.registerTool('lint', {
  description:
    '規約チェック（禁止 import・dataAccess:scoped なのに getAdminSupabase を使っていないか・' +
    'RLS ポリシーの有無等）を実行し、違反一覧を返す。コード変更後は必ずこれを緑にすること。',
  inputSchema: { id: z.string() },
}, wrap(tools.lint))

server.registerTool('type_check', {
  description: 'TypeScript の型チェック（tsc --noEmit）を実行し、エラー一覧を返す。初回は 10〜30 秒かかる。',
  inputSchema: { id: z.string() },
}, wrap(tools.typeCheck))

server.registerTool('db_reset', {
  description:
    '仮DB（PGlite）上のこのカートリッジのテーブルを全て削除し、db/schema.sql を再適用する。' +
    'マウント済みページのキャッシュも消す。schema.sql を編集した直後や、データを空の状態からやり直したい時に使う。',
  inputSchema: { id: z.string() },
}, wrap(tools.dbReset))

server.registerTool('db_seed', {
  description:
    'db/seed/<scenario>.sql を仮DBに投入する（例: scenario="typical" → db/seed/typical.sql）。' +
    'カートリッジ作成工程の再設計 Step 2 の標準構成（typical/empty/edge）を前提とするが、' +
    'ファイルが無ければ 404 とどのファイル名なら存在するかを返すので、それを見て判断すること。',
  inputSchema: { id: z.string(), scenario: z.string().describe('例: "typical" / "empty" / "edge"') },
}, wrap(tools.dbSeed))

server.registerTool('db_query', {
  description:
    '仮DB（PGlite）に任意の SQL を実行する。asUserId を指定すると、そのユーザーとして ' +
    'authenticated ロールで実行され、RLS ポリシーが実際に評価される' +
    '（rls_mode を strict にしていなくても、この呼び出し単体では常に評価される）。' +
    '「別組織のユーザーから見えないこと」を確認するのに最短の手段。',
  inputSchema: {
    sql: z.string(),
    params: z.array(z.unknown()).optional(),
    asUserId: z.string().optional().describe('Studio の仮ユーザー UUID。省略時は superuser 相当（RLS 素通り）'),
  },
}, wrap(tools.dbQuery))

server.registerTool('rls_mode', {
  description:
    'カートリッジの厳格モード（画面操作を通じた RLS 評価）を取得・切り替える。mode を省略すると現在値を返す。' +
    '"strict" にすると、そのカートリッジの createServerSupabase() 経由クエリだけ RLS が評価されるようになる ' +
    '（getAdminSupabase 経由は dataAccess:"privileged" 用なので厳格モードでも常に素通り）。',
  inputSchema: { id: z.string(), mode: z.enum(['off', 'strict']).optional() },
}, wrap(tools.rlsMode))

server.registerTool('render', {
  description:
    'カートリッジの画面を実際に開き、HTTP ステータス・エラーらしさ・HTML の先頭部分を返す。' +
    '自己修正ループの中心: コードを直したら db_reset → render で確認し、looksLikeError:true なら ' +
    'htmlSnippet からエラー内容を読み取って直す、を繰り返す。' +
    '制約: サーバー起点の fetch であり本物のブラウザではない。Server Component / Server Action の ' +
    '例外や requireApp の権限エラーはここで検出できるが、クライアント側 JS の実行時エラーは見えない。',
  inputSchema: {
    id: z.string(),
    path: z.string().optional().describe('カートリッジ内の相対パス。例: "" (トップ) / "admin"'),
    userId: z.string().optional().describe('この仮ユーザーとして開く（studio_user_id Cookie）。省略時は既定ユーザー'),
  },
}, wrap(tools.render))

server.registerTool('logs', {
  description:
    '直近の DB クエリログ（失敗した SQL・エラーメッセージ・所要時間）を返す。' +
    'render が looksLikeError を返したときに、実際に DB 側で何が失敗したかを確認するのに使う。',
  inputSchema: { since: z.string().optional().describe('このログ id より新しい分だけ返す') },
}, wrap(tools.logs))

server.registerTool('feedback_pull', {
  description:
    '今回のカートリッジ開発で得た知見を AppHarbor SDK に反映すべきか振り返るためのガイド文を返す ' +
    '（既存の prompts/cartridge-author.md・prompts/lessons-learned.md も併せて返るので重複提案を避けられる）。' +
    '注意: 人が Studio 画面に書いた自由記述の指摘を拾うものではない（そのような入力欄は現状 Studio に無い）。',
  inputSchema: { id: z.string() },
}, wrap(tools.feedbackPull))

server.registerTool('publish', {
  description:
    '本番（AppHarbor 本体）への取り込み PR を用意する。confirm を省略 or false だと、提出前チェック' +
    '（manifest・schema.sql・routes/・GitHub push 済みか）と生成される migration のプレビューだけを返し、' +
    '何も変更しない。confirm:true で実際に PR を作成する — これは「人からの明示的な指示があったとき」だけ ' +
    '呼ぶこと。どちらの場合も PR 作成までで、マージは行わない（マージは常に人が GitHub 上で行う）。',
  inputSchema: { id: z.string(), confirm: z.boolean().optional() },
}, wrap(tools.publish))

const transport = new StdioServerTransport()
await server.connect(transport)
