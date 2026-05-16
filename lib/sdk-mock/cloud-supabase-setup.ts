/**
 * Studio Cloud Supabase の自動セットアップ。
 *
 * Stage 3 移行ボタン押下時に実行される:
 *   1. 環境変数の有無チェック (3 つすべて揃っているか)
 *   2. 接続テスト (PostgreSQL に SELECT 1)
 *   3. studio スキーマが存在するか確認
 *   4. PostgREST 権限の確認 (GRANT)
 *
 * Docker と異なり config.toml 操作は不要 (クラウドはダッシュボードで設定)。
 */

import { Client } from 'pg'

export type SetupResult = {
  ok: boolean
  steps: SetupStep[]
  followUps: string[]
}

export type SetupStep = {
  name: string
  status: 'ok' | 'warn' | 'error' | 'skipped'
  detail: string
}

const REQUIRED_ENVS = [
  'STUDIO_CLOUD_SUPABASE_URL',
  'STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY',
  'STUDIO_CLOUD_SUPABASE_DB_URL',
] as const

export async function setupCloudSupabase(): Promise<SetupResult> {
  const steps: SetupStep[] = []
  const followUps: string[] = []

  // 1. 環境変数チェック
  const missing = REQUIRED_ENVS.filter(k => !process.env[k])
  if (missing.length > 0) {
    steps.push({
      name: 'env-check',
      status: 'error',
      detail: `未設定: ${missing.join(', ')}`,
    })
    followUps.push(
      '.env.local に以下を追加:',
      '  STUDIO_CLOUD_SUPABASE_URL=https://xxxxx.supabase.co',
      '  STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY=eyJ... または sb_secret_...',
      '  STUDIO_CLOUD_SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres',
    )
    return { ok: false, steps, followUps }
  }
  steps.push({
    name: 'env-check',
    status: 'ok',
    detail: '環境変数 3 つすべて設定済み',
  })

  // 2. 接続テスト
  const dbUrl = process.env.STUDIO_CLOUD_SUPABASE_DB_URL!
  const client = new Client({ connectionString: dbUrl })
  try {
    await client.connect()
    await client.query('SELECT 1')
    steps.push({
      name: 'connection',
      status: 'ok',
      detail: '接続成功',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({
      name: 'connection',
      status: 'error',
      detail: `接続失敗: ${msg}`,
    })
    followUps.push('STUDIO_CLOUD_SUPABASE_DB_URL が正しいか確認してください')
    followUps.push('Supabase ダッシュボード > Settings > Database > Connection string (URI)')
    try { await client.end() } catch { /* ignore */ }
    return { ok: false, steps, followUps }
  }

  // 3. studio スキーマの存在確認
  try {
    const res = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'studio'`
    )
    if (res.rows.length > 0) {
      steps.push({
        name: 'studio-schema',
        status: 'ok',
        detail: 'studio スキーマが存在します',
      })
    } else {
      // 自動作成を試みる
      try {
        await client.query('CREATE SCHEMA IF NOT EXISTS studio')
        steps.push({
          name: 'studio-schema',
          status: 'warn',
          detail: 'studio スキーマを作成しました',
        })
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr)
        steps.push({
          name: 'studio-schema',
          status: 'error',
          detail: `スキーマ作成失敗: ${msg}`,
        })
        followUps.push('Supabase ダッシュボード > SQL Editor で CREATE SCHEMA studio; を実行してください')
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({
      name: 'studio-schema',
      status: 'error',
      detail: `確認失敗: ${msg}`,
    })
  }

  // 4. PostgREST の Exposed Schemas に studio を追加しているか確認
  //    (API から直接確認する方法が無いため、GRANT の存在で間接確認)
  try {
    const res = await client.query(`
      SELECT has_schema_privilege('anon', 'studio', 'USAGE') AS anon_usage,
             has_schema_privilege('authenticated', 'studio', 'USAGE') AS auth_usage
    `)
    const row = res.rows[0] as { anon_usage: boolean; auth_usage: boolean }
    if (row.anon_usage && row.auth_usage) {
      steps.push({
        name: 'grants',
        status: 'ok',
        detail: 'anon / authenticated ロールに USAGE 権限あり',
      })
    } else {
      // 自動 GRANT を試みる
      try {
        await client.query(`
          GRANT USAGE ON SCHEMA studio TO anon, authenticated, service_role;
          GRANT ALL ON ALL TABLES IN SCHEMA studio TO anon, authenticated, service_role;
          GRANT ALL ON ALL SEQUENCES IN SCHEMA studio TO anon, authenticated, service_role;
          ALTER DEFAULT PRIVILEGES IN SCHEMA studio
            GRANT ALL ON TABLES TO anon, authenticated, service_role;
          ALTER DEFAULT PRIVILEGES IN SCHEMA studio
            GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
        `)
        steps.push({
          name: 'grants',
          status: 'warn',
          detail: 'GRANT を適用しました (anon / authenticated / service_role)',
        })
      } catch (grantErr) {
        const msg = grantErr instanceof Error ? grantErr.message : String(grantErr)
        steps.push({
          name: 'grants',
          status: 'error',
          detail: `GRANT 失敗: ${msg}`,
        })
        followUps.push('Supabase ダッシュボード > SQL Editor で以下を実行:')
        followUps.push('  GRANT USAGE ON SCHEMA studio TO anon, authenticated, service_role;')
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({
      name: 'grants',
      status: 'error',
      detail: `権限確認失敗: ${msg}`,
    })
  }

  // 5. Exposed Schemas の案内
  //    (API で設定変更できないため、followUp で案内)
  followUps.push(
    'Supabase ダッシュボード > Settings > API > Exposed schemas に "studio" を追加してください (PostgREST が studio スキーマを公開するために必要)'
  )

  try { await client.end() } catch { /* ignore */ }

  const ok = !steps.some(s => s.status === 'error')
  return { ok, steps, followUps }
}
