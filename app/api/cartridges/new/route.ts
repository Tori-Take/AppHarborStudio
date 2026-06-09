import { NextResponse } from 'next/server'
import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import { join, resolve, isAbsolute } from 'path'
import { resolveCartridgesPath } from '@/lib/config'

function renderCartridgeClaudeMd(ctx: { id: string; name: string; tablePrefix: string; permissionsList: string }): string | null {
  const tpl = join(process.cwd(), 'templates', 'CLAUDE.cartridge.md')
  if (!existsSync(tpl)) return null
  return readFileSync(tpl, 'utf-8')
    .replace(/\{\{CARTRIDGE_ID\}\}/g,     ctx.id)
    .replace(/\{\{CARTRIDGE_NAME\}\}/g,   ctx.name)
    .replace(/\{\{TABLE_PREFIX\}\}/g,     ctx.tablePrefix)
    .replace(/\{\{PERMISSIONS_LIST\}\}/g, ctx.permissionsList)
}

/**
 * `cartridges/<id>/.appharbor/` を作成し、SDK スナップショット + 規約を配置する。
 * Claude Code がカートリッジを開いた時に、AppHarbor の前提知識を
 * CLAUDE.md からの参照で自動的に読めるようにするのが目的。
 *
 * 失敗しても本体の作成は止めない (SDK 未インストール等の暫定対応)。
 */
function writeAppHarborContext(cartridgeDir: string, sdkVersion: string): void {
  const ctxDir = join(cartridgeDir, '.appharbor')
  mkdirSync(ctxDir, { recursive: true })

  const sdkRoot = join(process.cwd(), 'node_modules', '@appharbor', 'sdk')
  const safeRead = (p: string): string => {
    try { return readFileSync(p, 'utf-8') } catch { return '' }
  }

  const types  = safeRead(join(sdkRoot, 'src', 'types.ts'))
  const index  = safeRead(join(sdkRoot, 'src', 'index.ts'))
  const client = safeRead(join(sdkRoot, 'src', 'client.ts'))
  const readme = safeRead(join(sdkRoot, 'README.md'))

  if (types) {
    writeFileSync(join(ctxDir, 'SDK-TYPES.ts'),
`/**
 * @appharbor/sdk@${sdkVersion} の型定義スナップショット
 *
 * このファイルは Studio がカートリッジ作成時に node_modules から
 * コピーしたものです。実際の build には使用されません (参照専用)。
 * SDK の更新を反映するには .appharbor/ を再生成してください。
 */

${types}`, 'utf-8')
  }

  if (index || client) {
    writeFileSync(join(ctxDir, 'SDK-API.ts'),
`/**
 * @appharbor/sdk@${sdkVersion} の関数シグネチャスナップショット
 *
 * このファイルは Studio がカートリッジ作成時に node_modules から
 * コピーしたものです。実際の build には使用されません (参照専用)。
 */

// ========== サーバーサイド ('@appharbor/sdk') ==========

${index.trim()}

// ========== ブラウザサイド ('@appharbor/sdk/client') ==========

${client.trim()}
`, 'utf-8')
  }

  if (readme) {
    writeFileSync(join(ctxDir, 'PLATFORM.md'),
`<!--
  @appharbor/sdk@${sdkVersion} の README スナップショット
  Studio がカートリッジ作成時にコピーしたもの。
-->

${readme}`, 'utf-8')
  }

  writeFileSync(join(ctxDir, 'RULES.md'),
`# AppHarbor マルチテナント設計の鉄則

AppHarbor は B2B マルチテナント SaaS プラットフォームです。
**カートリッジを書く前に必ず読んでください**。

## 必須ルール

### 1. 全テーブルに \`organization_id\` カラム

\`\`\`sql
create table if not exists <prefix>_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- ... その他のカラム
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
\`\`\`

### 2. RLS (Row Level Security) ポリシーを必ず有効化

\`\`\`sql
alter table <prefix>_items enable row level security;

create policy <prefix>_items_select on <prefix>_items
  for select using (
    organization_id in (select organization_id from profiles where id = auth.uid())
  );
\`\`\`

⚠ **\`current_setting('app.*')\` 系の独自セッション変数 RLS は使わない**。
AppHarbor 本番では permission denied になる (Studio では気づかない)。

### 3. 全クエリで \`organization_id\` を絞り込む

\`\`\`ts
const ctx = await requireApp(slug, '<cartridge-id>')
const supabase = getAdminSupabase()

// ✅ 正しい
await supabase.from('<prefix>_items')
  .select('*')
  .eq('organization_id', ctx.actor.organizationId)

// ❌ ダメ — テナント越境
await supabase.from('<prefix>_items').select('*')
\`\`\`

### 4. \`manifest.json\` の \`tables\` 配列に作成したテーブル名を全部書く

これを忘れると AppHarbor 本番の「DB セットアップ」が機能しない。

### 5. \`updated_at\` の自動更新トリガを付ける

\`\`\`sql
create trigger <prefix>_items_updated_at
  before update on <prefix>_items
  for each row execute function update_updated_at();
\`\`\`

## 共通テーブル (定義しない)

以下のテーブルは AppHarbor が提供する。カートリッジで再定義してはいけない:

- \`organizations\` — 組織
- \`profiles\` — ユーザープロフィール (auth.users への外部キー)
- \`departments\` — 部署ツリー
- \`apps\` — インストール済みアプリ
- \`auth.users\` — Supabase 認証ユーザー
- \`storage.objects\` — ファイル保存

## アクター情報

\`requireApp\` の戻り値で取れる:

\`\`\`ts
const ctx = await requireApp(slug, '<cartridge-id>')
ctx.actor.id              // profiles.id
ctx.actor.organizationId  // 所属組織 ID
ctx.actor.departmentId    // 所属部署 ID (任意)
ctx.actor.actorName       // 表示名
ctx.actor.email           // メール
ctx.role                  // アプリ内ロール ('viewer' / 'admin' 等)
\`\`\`
`, 'utf-8')
}

const NAME_PATTERN = /^[a-z][a-z0-9-]{1,40}$/

/**
 * Studio の親ディレクトリ (cart-* リポを兄弟として並べる位置の既定値)。
 * 例: Studio が C:/.../Projects/AppHarbor-Studio なら C:/.../Projects/
 */
function defaultCartridgeParent(): string {
  return resolve(process.cwd(), '..')
}

/**
 * Windows の junction を作成する (mklink /J)。
 * cmd を経由しないと mklink は呼べないので spawnSync('cmd', ...) を使う。
 * link 先が既存なら何もしない (idempotent)。
 */
function createJunction(link: string, target: string): { ok: boolean; error?: string } {
  if (existsSync(link)) return { ok: true } // already exists
  if (process.platform !== 'win32') {
    // Linux/macOS は symbolic link でフォールバック
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { symlinkSync } = require('fs') as typeof import('fs')
      symlinkSync(target, link, 'dir')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  const r = spawnSync('cmd', ['/c', 'mklink', '/J', link, target], { encoding: 'utf-8' })
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || '').trim() || `exit ${r.status}` }
  }
  return { ok: true }
}

export async function POST(req: Request) {
  let body: { id?: string; name?: string; description?: string; parentPath?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const id = (body.id ?? '').trim()
  if (!NAME_PATTERN.test(id)) {
    return NextResponse.json({ error: 'id は小文字英数とハイフン (2〜40文字、先頭は英字)' }, { status: 400 })
  }

  // 作成先の決定:
  //   parentPath が指定されたら: <parentPath>/cart-<id>/ (sibling パターン、junction で参照)
  //   未指定の場合:                 <default parent>/cart-<id>/ (Studio の親)
  // 相対パスを黙って既定にすり替えると「別の場所に成功する」事故になるので明示的に弾く。
  const rawParent = (body.parentPath ?? '').trim()
  if (rawParent && !isAbsolute(rawParent)) {
    return NextResponse.json({ error: '作成先フォルダは絶対パスで指定してください' }, { status: 400 })
  }
  const parent = rawParent ? resolve(rawParent) : defaultCartridgeParent()

  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    return NextResponse.json({ error: `作成先フォルダが存在しません: ${parent}` }, { status: 400 })
  }

  const folderName = `cart-${id}`
  const dir        = join(parent, folderName)
  if (existsSync(dir)) {
    return NextResponse.json({ error: `すでに存在します: ${dir}` }, { status: 409 })
  }

  // junction の配置先 (Studio がカートリッジを scan する _local/<id>)
  const cartridgesRoot = resolveCartridgesPath()
  const junctionPath   = join(cartridgesRoot, '_local', id)
  if (existsSync(junctionPath)) {
    return NextResponse.json({
      error: `junction の名前衝突: ${junctionPath} が既に存在します。`
    }, { status: 409 })
  }

  try {
    mkdirSync(join(dir, 'routes', 'components'), { recursive: true })
    mkdirSync(join(dir, 'routes', 'server'),     { recursive: true })
    mkdirSync(join(dir, 'db'),                   { recursive: true })

    const tablePrefix = id.replace(/-/g, '_')
    const manifest = {
      $schema: 'https://appharbor.app/cartridge-schema-v1.json',
      spec_version: '1',
      id,
      version: '0.1.0',
      name: body.name?.trim() || id,
      description: body.description?.trim() || '新規カートリッジ',
      icon: '📦',
      category: 'その他',
      studioCompatible: true,
      appharbor: { sdkVersion: '^1.0', minPlatformVersion: '0.5.0' },
      permissions: [
        { id: 'viewer', label: '閲覧者', default: true, description: '閲覧のみ' },
        { id: 'admin',  label: '管理者', description: '全操作' },
      ],
      navigation: [
        { label: 'ホーム', path: '/', icon: 'Home', minRole: 'viewer' },
      ],
      tablePrefix,
      tables: [],
      depends: [], emits: [], subscribes: [],
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

    writeFileSync(join(dir, 'routes', 'page.tsx'),
`import { requireApp } from '@/sdk'

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await requireApp(slug, '${id}')
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 28 }}>${manifest.name}</h1>
      <p style={{ color: '#94a3b8' }}>こんにちは、{ctx.actor.actorName} さん（role: {ctx.role}）</p>
    </main>
  )
}
`, 'utf-8')

    writeFileSync(join(dir, 'db', 'schema.sql'),
`-- ${id} スキーマ
-- Studio 起動時に自動適用される
-- 規約: 全テーブルに organization_id を含めること / RLS を必ず有効化

-- create table if not exists ${tablePrefix}_items (
--   id              uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references organizations(id) on delete cascade,
--   created_at      timestamptz not null default now()
-- );
`, 'utf-8')

    // CLAUDE.md（Claude Code 向け指示）
    const claudeMd = renderCartridgeClaudeMd({
      id,
      name: manifest.name,
      tablePrefix,
      permissionsList: manifest.permissions.map((p) => `- ${p.id}${p.default ? ' (default)' : ''} — ${p.label ?? ''}`).join('\n'),
    })
    if (claudeMd) {
      writeFileSync(join(dir, 'CLAUDE.md'), claudeMd, 'utf-8')
    }

    // .appharbor/ — SDK スナップショット + 規約 (AI 向け前提知識)
    try {
      const sdkPkg = (() => {
        try {
          return JSON.parse(readFileSync(join(process.cwd(), 'node_modules', '@appharbor', 'sdk', 'package.json'), 'utf-8'))
        } catch { return null }
      })()
      writeAppHarborContext(dir, sdkPkg?.version ?? 'unknown')
    } catch { /* SDK 未インストール時等は .appharbor/ をスキップ */ }

    // git init + 初期コミット (sibling リポとして独立)
    const gitInitErrors: string[] = []
    try {
      // .gitignore (node_modules / .next 等を除外)
      writeFileSync(join(dir, '.gitignore'),
`# Node modules / build artifacts
node_modules/
.next/
dist/

# Logs
*.log
npm-debug.log*

# OS / Editor
.DS_Store
Thumbs.db
.vscode/
.idea/

# 環境ファイル
.env
.env.local
`, 'utf-8')

      const gitOpts = { cwd: dir, encoding: 'utf-8' as const }
      const initR = spawnSync('git', ['init', '-b', 'main'], gitOpts)
      if (initR.status !== 0) gitInitErrors.push(`init: ${initR.stderr.trim()}`)

      const addR = spawnSync('git', ['add', '.'], gitOpts)
      if (addR.status !== 0) gitInitErrors.push(`add: ${addR.stderr.trim()}`)

      const commitR = spawnSync('git', [
        '-c', 'user.email=studio@appharbor.local',
        '-c', 'user.name=AppHarbor Studio',
        'commit', '-m', `feat: initial scaffold for ${id}`,
      ], gitOpts)
      if (commitR.status !== 0) gitInitErrors.push(`commit: ${commitR.stderr.trim()}`)
    } catch (e) {
      gitInitErrors.push(`unexpected: ${(e as Error).message}`)
    }

    // junction `cartridges/_local/<id>` → 実体フォルダ
    mkdirSync(join(cartridgesRoot, '_local'), { recursive: true })
    const junctionResult = createJunction(junctionPath, dir)

    // Studio 内のルーティングに即反映するため mount を実行
    try {
      spawnSync(process.execPath, [join(process.cwd(), 'scripts', 'mount-cartridges.js')], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      })
    } catch { /* マウント失敗してもカートリッジ自体は作成済み */ }

    return NextResponse.json({
      ok:           true,
      id,
      path:         dir,
      junctionPath: junctionResult.ok ? junctionPath : null,
      junctionError: junctionResult.ok ? null : junctionResult.error,
      gitInitErrors: gitInitErrors.length > 0 ? gitInitErrors : undefined,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
