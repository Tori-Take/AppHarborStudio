/**
 * 実 Supabase クライアント (Vercel デプロイ時のみ使用)
 *
 * AppHarbor 本番と同じ Supabase プロジェクトを使うが、
 * 全てのテーブルアクセスは `studio` スキーマに向ける。
 *
 * 設計方針:
 *   - DB: `schema: 'studio'` 指定で .from('xxx') が studio.xxx に解決される
 *   - Storage: バケット名は 'studio-' prefix で本番と分離
 *   - Auth: Studio はクッキーベースのモックユーザーなので、
 *           getUser() は cookie から組み立てた擬似ユーザーを返す
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCurrentMockUserServer } from './server-context'

const STUDIO_STORAGE_BUCKET_PREFIX = 'studio-'

let _adminClient: SupabaseClient | null = null

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`)
  return v
}

function rawAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient
  _adminClient = createClient(
    getEnv('STUDIO_SUPABASE_URL'),
    getEnv('STUDIO_SUPABASE_SERVICE_ROLE_KEY'),
    {
      db:   { schema: 'studio' as never },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
  return _adminClient
}

/**
 * Studio から見た admin クライアント。
 *
 * - .from('xxx') → studio.xxx
 * - .storage.from('bucket') → 'studio-bucket'（自動 prefix）
 * - .auth.getUser() → クッキーのモックユーザー
 */
export function getRealSupabaseAdmin(): unknown {
  const real = rawAdminClient()

  // storage バケット名に prefix を自動付与する Proxy
  const storageProxy = new Proxy(real.storage, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver)
      if (prop === 'from' && typeof v === 'function') {
        return function (bucketId: string) {
          const prefixed = bucketId.startsWith(STUDIO_STORAGE_BUCKET_PREFIX)
            ? bucketId
            : `${STUDIO_STORAGE_BUCKET_PREFIX}${bucketId}`
          return (v as (id: string) => unknown).call(target, prefixed)
        }
      }
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
    },
  })

  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'storage') return storageProxy
      if (prop === 'auth') {
        return {
          async getUser() {
            const u = await getCurrentMockUserServer()
            return {
              data: { user: { id: u.id, email: (u as { email?: string }).email ?? '' } },
              error: null,
            }
          },
        }
      }
      const v = Reflect.get(target, prop, receiver)
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
    },
  })
}

export function isRealSupabaseConfigured(): boolean {
  return !!(process.env.STUDIO_SUPABASE_URL && process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY)
}
