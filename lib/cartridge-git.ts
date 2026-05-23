/**
 * カートリッジリポの git 情報取得ユーティリティ。
 *
 * stage5-prepare / check-updates / Stage マーク時の HEAD キャプチャなどで
 * 共通で使う。失敗しても落ちないように try/catch でガード。
 */
import { spawnSync } from 'child_process'

export type GitCommit = {
  /** 短い SHA (7 桁) */
  shortHash: string
  /** フル SHA */
  hash: string
  /** コミットメッセージ 1 行目 */
  message: string
  /** 著者名 */
  author: string
  /** ISO 形式の日時 */
  date: string
}

export type CartridgeGitInfo = {
  /** git リポ root の絶対パス */
  repoRoot: string | null
  /** "owner/repo" 形式 (例: "Tori-Take/cart-versus-space-invaders") */
  repoSlug: string | null
  /** 現在のブランチ名 */
  branch: string | null
  /** 現在の HEAD コミット (フル SHA) */
  head: string | null
  /** 短い HEAD */
  headShort: string | null
  /** working tree に未コミット変更があるか */
  isDirty: boolean
  /** 未コミット変更があるファイル一覧 (path のみ) */
  dirtyFiles: string[]
}

/**
 * 指定ディレクトリの git 情報を取得する。
 * git リポでない場合は repoRoot=null を返す。
 */
export function getCartridgeGitInfo(cartDir: string): CartridgeGitInfo {
  const empty: CartridgeGitInfo = {
    repoRoot: null,
    repoSlug: null,
    branch: null,
    head: null,
    headShort: null,
    isDirty: false,
    dirtyFiles: [],
  }

  // repo root
  const rootRes = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: cartDir, encoding: 'utf-8' })
  if (rootRes.status !== 0) return empty
  const repoRoot = (rootRes.stdout || '').trim()
  if (!repoRoot) return empty

  // origin url → slug
  const originRes = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: repoRoot, encoding: 'utf-8' })
  const url = (originRes.stdout || '').trim()
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/)
  const repoSlug = m ? `${m[1]}/${m[2]}` : null

  // branch
  const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' })
  const branch = branchRes.status === 0 ? (branchRes.stdout || '').trim() : null

  // HEAD
  const headRes = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' })
  const head = headRes.status === 0 ? (headRes.stdout || '').trim() : null
  const headShort = head ? head.slice(0, 7) : null

  // dirty files (working tree)
  // porcelain v1 format:
  //   "XY filename"  ← X = staged status, Y = unstaged status (each 1 char), then space, then path
  //   先頭 3 文字 (XY + space) を slice で削るのが安全。trim() するとレイアウトが崩れる
  const statusRes = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf-8' })
  const dirtyFiles: string[] = []
  if (statusRes.status === 0) {
    for (const rawLine of (statusRes.stdout || '').split(/\r?\n/)) {
      if (!rawLine || rawLine.length < 3) continue
      // 3 文字目以降を取得し、quoted path ("...") なら剥がす
      let path = rawLine.slice(3)
      // rename 形式 "from -> to" の場合は to だけ取る
      const arrow = path.indexOf(' -> ')
      if (arrow >= 0) path = path.slice(arrow + 4)
      path = path.replace(/^"(.*)"$/, '$1')
      if (path) dirtyFiles.push(path)
    }
  }

  return {
    repoRoot,
    repoSlug,
    branch,
    head,
    headShort,
    isDirty: dirtyFiles.length > 0,
    dirtyFiles,
  }
}

/**
 * 指定範囲のコミット履歴を取得する。
 * `since` から HEAD までのコミットをリストする (since 自体は含まれない)。
 *
 * @param cartDir カートリッジパス
 * @param since 基準コミット (省略時は最大 limit 件遡る)
 * @param limit 取得上限 (デフォルト 50)
 */
export function getCommitsBetween(cartDir: string, since: string | null, limit = 50): GitCommit[] {
  const range = since ? `${since}..HEAD` : `HEAD~${limit}..HEAD`
  const args = [
    'log',
    range,
    `--max-count=${limit}`,
    '--pretty=format:%H%x09%h%x09%an%x09%aI%x09%s',
  ]
  const res = spawnSync('git', args, { cwd: cartDir, encoding: 'utf-8' })
  if (res.status !== 0) return []
  const commits: GitCommit[] = []
  for (const line of (res.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const [hash, shortHash, author, date, ...messageParts] = line.split('\t')
    if (!hash) continue
    commits.push({
      hash,
      shortHash,
      author,
      date,
      message: messageParts.join('\t'),
    })
  }
  return commits
}

/**
 * 指定範囲で変更されたファイル一覧を取得する (`since..HEAD` の diff)。
 * since が null なら HEAD コミットで変更されたファイル一覧を返す。
 */
export function getChangedFilesBetween(cartDir: string, since: string | null): string[] {
  const args = since
    ? ['diff', '--name-only', `${since}..HEAD`]
    : ['show', '--name-only', '--pretty=format:', 'HEAD']
  const res = spawnSync('git', args, { cwd: cartDir, encoding: 'utf-8' })
  if (res.status !== 0) return []
  return (res.stdout || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * since コミットが現リポから到達可能か (存在するか) を確認する。
 * branch を切り替えた等で since がローカルに存在しなくなった場合に false。
 */
export function isCommitReachable(cartDir: string, commit: string): boolean {
  const res = spawnSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: cartDir, encoding: 'utf-8' })
  return res.status === 0
}
