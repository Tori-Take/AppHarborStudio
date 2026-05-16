/**
 * 実 Supabase クライアント
 *
 * 3 つの接続先を切替可能 (env 経由):
 *   1. Studio Vercel デプロイ版         → STUDIO_SUPABASE_URL / STUDIO_SUPABASE_SERVICE_ROLE_KEY
 *   2. ローカル Docker (`supabase start`) → DOCKER_SUPABASE_URL / DOCKER_SUPABASE_SERVICE_ROLE_KEY
 *      (デフォルト: http://127.0.0.1:54321 + ローカル開発用既定キー)
 *   3. Studio 専用クラウド              → STUDIO_CLOUD_SUPABASE_URL / STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY
 *
 * 全てのテーブルアクセスは `studio` スキーマに向ける。
 * Storage はバケット名に 'studio-' prefix を自動付与して本番と分離。
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getCurrentMockUserServer } from './server-context'

const STUDIO_STORAGE_BUCKET_PREFIX = 'studio-'

// supabase start のローカル既定キー (Supabase CLI の固定値、開発用)
const DOCKER_DEFAULT_URL = 'http://127.0.0.1:54321'
const DOCKER_DEFAULT_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q'

export type SupabaseTarget = 'docker' | 'studio-cloud' | 'vercel-studio'

type Config = { url: string; serviceKey: string }

function configFor(target: SupabaseTarget): Config | null {
  switch (target) {
    case 'docker':
      return {
        url:        process.env.DOCKER_SUPABASE_URL        ?? DOCKER_DEFAULT_URL,
        serviceKey: process.env.DOCKER_SUPABASE_SERVICE_ROLE_KEY ?? DOCKER_DEFAULT_SERVICE_KEY,
      }
    case 'studio-cloud':
      if (!process.env.STUDIO_CLOUD_SUPABASE_URL || !process.env.STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY) return null
      return {
        url:        process.env.STUDIO_CLOUD_SUPABASE_URL,
        serviceKey: process.env.STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY,
      }
    case 'vercel-studio':
      if (!process.env.STUDIO_SUPABASE_URL || !process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY) return null
      return {
        url:        process.env.STUDIO_SUPABASE_URL,
        serviceKey: process.env.STUDIO_SUPABASE_SERVICE_ROLE_KEY,
      }
  }
}

const _clientCache = new Map<SupabaseTarget, SupabaseClient>()

function rawClientFor(target: SupabaseTarget): SupabaseClient | null {
  const cached = _clientCache.get(target)
  if (cached) return cached
  const cfg = configFor(target)
  if (!cfg) return null
  const client = createClient(cfg.url, cfg.serviceKey, {
    db:   { schema: 'studio' as never },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  _clientCache.set(target, client)
  return client
}

/**
 * 指定 target の admin クライアントを返す。設定が無ければ null。
 *
 * - .from('xxx') → studio.xxx
 * - .storage.from('bucket') → 'studio-bucket' (自動 prefix)
 * - .auth.getUser() → クッキーのモックユーザー
 */
export function getRealSupabaseAdminFor(target: SupabaseTarget): unknown | null {
  const real = rawClientFor(target)
  if (!real) return null
  return wrapClient(real)
}

/**
 * 後方互換: 環境変数 STUDIO_SUPABASE_URL がある場合に vercel-studio クライアントを返す。
 */
export function getRealSupabaseAdmin(): unknown {
  const real = rawClientFor('vercel-studio')
  if (!real) throw new Error('STUDIO_SUPABASE_URL が設定されていません')
  return wrapClient(real)
}

function wrapClient(real: SupabaseClient): unknown {

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

export function isDockerSupabaseConfigured(): boolean {
  // デフォルト URL があるので環境変数なくても OK
  return true
}

export function isStudioCloudSupabaseConfigured(): boolean {
  return !!(process.env.STUDIO_CLOUD_SUPABASE_URL && process.env.STUDIO_CLOUD_SUPABASE_SERVICE_ROLE_KEY)
}
