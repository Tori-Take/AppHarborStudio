import { NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { resolve, join } from 'path'

/**
 * カートリッジを git で本番リポジトリに push する。
 *
 * Studio が AppHarbor 本体の studio/ サブフォルダで動作している前提。
 * 親フォルダが git リポジトリの場合のみ動作する。
 *
 * 動作:
 *   1. cartridges/{id}/ を git add
 *   2. 指定メッセージで commit（パス限定で他の staged 変更は触らない）
 *   3. origin に push
 *
 * セキュリティ:
 *   Studio は localhost 限定なので Tori さんのマシンからのみ操作可能。
 *   Git 認証は OS 側のクレデンシャル（GitHub credential helper 等）に依存。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  let body: { message?: string }
  try { body = await req.json() } catch { body = {} }

  // Studio が AppHarbor 内にあることを前提に親フォルダを repo dir とみなす
  const studioDir = process.cwd()
  const repoDir   = resolve(studioDir, '..')

  // git リポジトリか確認
  if (!existsSync(join(repoDir, '.git'))) {
    return NextResponse.json(
      { error: '親フォルダが Git リポジトリではありません。Studio は単独配布モードのため git push できません。' },
      { status: 400 },
    )
  }

  // カートリッジフォルダ存在確認
  const cartridgePath = `cartridges/${safeAppId}`
  if (!existsSync(join(repoDir, cartridgePath))) {
    return NextResponse.json(
      { error: `カートリッジフォルダが見つかりません: ${cartridgePath}` },
      { status: 404 },
    )
  }

  const runGit = (...args: string[]) =>
    spawnSync('git', ['-C', repoDir, ...args], { encoding: 'utf-8' })

  // 1. add
  const addRes = runGit('add', cartridgePath)
  if (addRes.status !== 0) {
    return NextResponse.json(
      { error: `git add 失敗: ${addRes.stderr || addRes.stdout}` },
      { status: 500 },
    )
  }

  // 2. 変更があるかチェック（未コミットファイル）
  const statusRes = runGit('status', '--porcelain', cartridgePath)
  const hasDirty = !!statusRes.stdout.trim()
  const changedFiles = hasDirty
    ? statusRes.stdout.trim().split('\n').map((l) => l.trim())
    : []

  // 未 push commit があるかチェック
  const unpushedRes = runGit('log', 'origin/HEAD..HEAD', '--oneline', '--', cartridgePath)
  const hasUnpushed = !!unpushedRes.stdout.trim()

  if (!hasDirty && !hasUnpushed) {
    return NextResponse.json(
      { error: '送るものがありません（既に同期済み）' },
      { status: 400 },
    )
  }

  // 3. commit が必要なら commit (パス指定で他の staged 変更を巻き込まない)
  const message = (body.message ?? '').trim() || `feat: ${safeAppId} 更新`
  if (hasDirty) {
    const commitRes = runGit('commit', '-m', message, '--', cartridgePath)
    if (commitRes.status !== 0) {
      return NextResponse.json(
        { error: `git commit 失敗: ${commitRes.stderr || commitRes.stdout}` },
        { status: 500 },
      )
    }
  }

  // 4. push
  const pushRes = runGit('push', 'origin', 'HEAD')
  if (pushRes.status !== 0) {
    return NextResponse.json(
      { error: `git push 失敗: ${pushRes.stderr || pushRes.stdout}\n\n認証エラーの場合: 一度ターミナルで git push してクレデンシャルを保存してください。` },
      { status: 500 },
    )
  }

  // 直近のコミットハッシュを取得
  const hashRes = runGit('rev-parse', '--short', 'HEAD')
  const commitHash = hashRes.stdout.trim()

  return NextResponse.json({
    ok: true,
    commitHash,
    message,
    changedFiles,
    pushOutput: pushRes.stderr.trim() || pushRes.stdout.trim(),
  })
}
