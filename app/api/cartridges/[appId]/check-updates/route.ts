import { NextResponse } from 'next/server'
import { getCartridge } from '@/lib/cartridge-scanner'
import {
  getCartridgeGitInfo,
  getCommitsBetween,
  getChangedFilesBetween,
  isCommitReachable,
} from '@/lib/cartridge-git'
import { classifyFiles, type StageNum } from '@/lib/file-classifier'

/**
 * Stage 5 完了後にカートリッジに変更がないか確認する。
 *
 * 入力: クエリ or body で各ステージの verifiedCommit を受け取る
 *       (POST だけ受ける形にして body 渡し)
 *
 * 出力:
 *   - hasChanges: true / false
 *   - newCommits: verifiedCommit (最も新しいやつ) から HEAD までのコミット一覧
 *   - changedFiles: 変更されたファイル一覧 + 分類
 *   - dirtyFiles: 未コミットの変更
 *   - rollbackTo: 推奨ロールバックステージ
 *   - affectedStages: 影響を受けるステージ一覧
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const safe = appId.replace(/[^a-zA-Z0-9_-]/g, '')

  const entry = getCartridge(safe)
  if (!entry) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  // body から各ステージの verifiedCommit を取得
  let verifiedByStage: Partial<Record<StageNum, string | null>> = {}
  try {
    const body = await req.json()
    verifiedByStage = body?.verifiedByStage ?? {}
  } catch {
    // body 無し → 全 null として扱う (= 全ステージ未検証相当)
  }

  const git = getCartridgeGitInfo(entry.path)

  // git リポじゃないか HEAD が取れない場合
  if (!git.head || !git.repoRoot) {
    return NextResponse.json({
      gitAvailable: false,
      hasChanges: false,
      head: null,
      headShort: null,
      newCommits: [],
      changedFiles: [],
      dirtyFiles: [],
      rollbackTo: null,
      affectedStages: [],
    })
  }

  // 「最新の verifiedCommit」を基準にする。Stage 5 > 4 > 3 ... の優先順位で
  // 「最も後ろ (= 進んだステージ) で検証されたコミット」を基準に diff を取る。
  // ※ 同一コミットを各ステージで検証していたら全部同じ値になっているはず。
  let baseCommit: string | null = null
  for (const s of [5, 4, 3, 2, 1] as StageNum[]) {
    const v = verifiedByStage[s]
    if (v && isCommitReachable(entry.path, v)) {
      baseCommit = v
      break
    }
  }

  // diff 計算 (baseCommit から HEAD まで)
  const newCommits = baseCommit ? getCommitsBetween(entry.path, baseCommit) : []
  const changedFiles = baseCommit ? getChangedFilesBetween(entry.path, baseCommit) : []

  // 未コミット変更も同じファイル分類器に通す
  const allChangedFiles = Array.from(new Set([...changedFiles, ...git.dirtyFiles]))
  const classification = classifyFiles(allChangedFiles)

  return NextResponse.json({
    gitAvailable: true,
    hasChanges: allChangedFiles.length > 0,
    head: git.head,
    headShort: git.headShort,
    branch: git.branch,
    baseCommit,
    baseCommitShort: baseCommit ? baseCommit.slice(0, 7) : null,
    newCommits,
    changedFiles: classification.byFile,
    dirtyFiles: git.dirtyFiles,
    rollbackTo: classification.rollbackTo,
    affectedStages: classification.affectedStages,
    needsReVerification: classification.needsReVerification,
  })
}
