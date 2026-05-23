import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getCartridge } from '@/lib/cartridge-scanner'

const exec = promisify(execFile)

/**
 * 「今回のカートリッジ開発で得た知見を SDK にフィードバックする」ための
 * 振り返りプロンプトを動的に組み立てて text/markdown で返す。
 *
 * ユーザーはボタン 1 つでこの内容をクリップボードにコピーし、Claude Code 等の
 * AI に貼り付けるだけで、AI がインタビュー形式で知見を抽出 → 該当する
 * prompts/ ファイルへの PR ドラフトを提案してくれる流れを実現する。
 *
 * 含む情報:
 *   1. 振り返りの進め方 (AI への指示)
 *   2. 既存の prompts/cartridge-author.md  (重複提案を避けるため)
 *   3. 既存の prompts/lessons-learned.md   (同上)
 *   4. このセッションの作業要約 (git log/diff があれば)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ appId: string }> },
) {
  const { appId } = await params
  const cartridge = getCartridge(decodeURIComponent(appId))
  if (!cartridge) {
    return NextResponse.json({ error: 'cartridge not found' }, { status: 404 })
  }

  const sdkRoot = join(process.cwd(), 'node_modules', '@appharbor', 'sdk')
  const safeRead = async (p: string): Promise<string | null> => {
    try { return await readFile(p, 'utf-8') } catch { return null }
  }

  const [authorPrompt, lessonsLearned] = await Promise.all([
    safeRead(join(sdkRoot, 'prompts', 'cartridge-author.md')),
    safeRead(join(sdkRoot, 'prompts', 'lessons-learned.md')),
  ])

  const git = existsSync(join(cartridge.path, '.git'))
    ? await gitInfo(cartridge.path)
    : null

  const prompt = buildPrompt({
    cartridgeId: cartridge.id,
    cartridgePath: cartridge.path,
    authorPrompt,
    lessonsLearned,
    git,
  })

  return new NextResponse(prompt, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}

async function gitInfo(cwd: string): Promise<{
  lastCommit: string
  recentFiles: string[]
} | null> {
  try {
    const { stdout: last } = await exec('git', ['log', '-1', '--format=%h %s'], { cwd })
    const { stdout: files } = await exec(
      'git',
      ['log', '-5', '--name-only', '--format='],
      { cwd },
    )
    return {
      lastCommit:  last.trim(),
      recentFiles: [...new Set(files.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, 30),
    }
  } catch {
    return null
  }
}

function buildPrompt(args: {
  cartridgeId:    string
  cartridgePath:  string
  authorPrompt:   string | null
  lessonsLearned: string | null
  git:            { lastCommit: string; recentFiles: string[] } | null
}): string {
  const { cartridgeId, authorPrompt, lessonsLearned, git } = args
  const p: string[] = []

  p.push('# AppHarbor カートリッジ開発の振り返り')
  p.push('')
  p.push('あなたは私 (カートリッジ作者) のメンターです。')
  p.push(`今回 \`${cartridgeId}\` カートリッジを開発しました。以下の流れで知見を抽出してください。`)
  p.push('')
  p.push('## 振り返りの進め方')
  p.push('')
  p.push('1. **今回ハマったバグや迷ったポイントは何でしたか?** — 1 つずつ聞いてください')
  p.push('2. **その原因と最終的な解決策は?**')
  p.push('3. **これは「他カートリッジでも起きうる罠」ですか? それとも「このカートリッジ固有」ですか?**')
  p.push('   - 固有なら SDK には反映しない (該当カートリッジの `CLAUDE.md` 行き)')
  p.push('   - 汎用なら次のステップへ')
  p.push('4. **AppHarbor SDK (`Tori-Take/appharbor-sdk`) のどこに反映するか提案してください:**')
  p.push('   - `prompts/lessons-learned.md` — 罠・アンチパターン (短く再現条件 + 解決策)')
  p.push('   - `prompts/recipes/<新規 or 既存>.md` — 再利用可能なパターン (コード例つき)')
  p.push('   - `prompts/cartridge-author.md` — 規約レベル (全作者が必ず守るルール)')
  p.push('5. **提案が固まったら、PR ドラフトを生成してください:**')
  p.push('   - 該当ファイルの完全な diff (新規ファイルなら全文)')
  p.push('   - commit message (例: `docs(prompts): add lesson - 外部キー先の organization_id 不一致`)')
  p.push('')
  p.push('## ⚠️ 重要な制約')
  p.push('')
  p.push('- **既存の prompts/ に書かれている内容と重複する提案はしないでください** (下の参考セクションを必ず確認)')
  p.push('- **「単なる感想」「特定環境固有のバグ」は SDK に反映しない**')
  p.push('- **ローカル PC を勝手に書き換えない。** PR ドラフトを生成するだけで、git push は私が手動で行います')
  p.push('- 既に同種の知見があるなら、新規追加ではなく **既存エントリへの追記** を提案してください')
  p.push('')
  p.push('---')
  p.push('')

  if (git) {
    p.push('## このセッションの作業要約 (Studio 自動収集)')
    p.push('')
    p.push(`- カートリッジパス: \`${args.cartridgePath}\``)
    p.push(`- 最終コミット: \`${git.lastCommit}\``)
    p.push(`- 最近触ったファイル (直近 5 コミット):`)
    for (const f of git.recentFiles) p.push(`  - \`${f}\``)
    p.push('')
    p.push('質問するときはこれらのファイルを具体的に指して「`X.tsx` の Y 行目はなぜ Z にしたのですか?」のように聞いてください。')
    p.push('')
    p.push('---')
    p.push('')
  } else {
    p.push('## このセッションの作業要約')
    p.push('')
    p.push('_(このカートリッジは git 管理下にないので、自動収集できる情報はありません。直接「何を作りましたか?」から始めてください。)_')
    p.push('')
    p.push('---')
    p.push('')
  }

  p.push('## 参考 1: 現在の prompts/cartridge-author.md (SDK 同梱)')
  p.push('')
  p.push('提案がここに既に書かれているなら新規追加ではなく追記を検討してください。')
  p.push('')
  p.push('```markdown')
  p.push(authorPrompt ?? '_(取得できませんでした)_')
  p.push('```')
  p.push('')
  p.push('---')
  p.push('')
  p.push('## 参考 2: 現在の prompts/lessons-learned.md (SDK 同梱)')
  p.push('')
  p.push('既に同じ罠が記載されていないか必ず確認してください。')
  p.push('')
  p.push('```markdown')
  p.push(lessonsLearned ?? '_(まだ存在しません。最初のエントリを提案してもらえます。)_')
  p.push('```')

  return p.join('\n')
}
