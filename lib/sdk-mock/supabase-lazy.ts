/**
 * 遅延解決される Supabase クライアントのプロキシ。
 *
 * `getAdminSupabase()` から返される。プロパティアクセス・メソッド呼出を全て記録し、
 * `.then()` (= await) が呼ばれた時に初めて DB ソース (pglite / docker / studio-cloud) を
 * 解決して実クライアントで実行する。
 *
 * 既存のカートリッジコードを変更せずに DB ソース切替を効かせる:
 *   const supabase = getAdminSupabase()
 *   const { data } = await supabase.from('xxx').select('*').eq('a', 1)
 *   const { data } = await supabase.storage.from('bucket').upload(file, ...)
 */

import { getSupabaseForCurrentCartridge } from './supabase-mock'

type Step =
  | { kind: 'prop'; name: string }
  | { kind: 'call'; args: unknown[] }

const TERMINATORS = new Set(['then', 'catch', 'finally'])

function makeLazy(chain: Step[]): unknown {
  // function を target にすることで Proxy が apply もハンドルできる (呼び出し対応)
  const target = function placeholder() { /* never called directly */ }
  return new Proxy(target, {
    get(_t, prop) {
      if (typeof prop === 'symbol') return undefined
      const name = String(prop)
      if (TERMINATORS.has(name)) {
        if (name === 'then') {
          return (
            onFulfilled?: (v: unknown) => unknown,
            onRejected?:  (e: unknown) => unknown,
          ) => execute(chain).then(onFulfilled, onRejected)
        }
        if (name === 'catch') {
          return (onRejected: (e: unknown) => unknown) => execute(chain).then(undefined, onRejected)
        }
        // finally
        return (onFinally: () => void) => execute(chain).then(
          (v: unknown) => { onFinally?.(); return v },
          (e: unknown) => { onFinally?.(); throw e },
        )
      }
      return makeLazy([...chain, { kind: 'prop', name }])
    },
    apply(_t, _thisArg, args) {
      return makeLazy([...chain, { kind: 'call', args: args as unknown[] }])
    },
  })
}

async function execute(chain: Step[]): Promise<unknown> {
  const client = await getSupabaseForCurrentCartridge() as unknown
  let receiver: unknown = client
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = client
  for (const step of chain) {
    if (step.kind === 'prop') {
      receiver = current
      current = current[step.name]
    } else {
      if (typeof current !== 'function') {
        throw new Error(`Lazy supabase: attempted to call non-function (chain: ${describe(chain)})`)
      }
      current = current.apply(receiver, step.args)
      receiver = current
    }
  }
  // 最終結果が PromiseLike なら await
  if (current && typeof current === 'object' && typeof (current as { then?: unknown }).then === 'function') {
    return await current
  }
  return current
}

function describe(chain: Step[]): string {
  return chain.map(s => s.kind === 'prop' ? `.${s.name}` : `(${s.args.length} args)`).join('')
}

export function getLazySupabaseClient(): unknown {
  return makeLazy([])
}
