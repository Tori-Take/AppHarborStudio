/**
 * Plan B (Stage 5 後の改修フロー) のスキーマ差分エンジン。
 *
 * 使い方:
 *   import { parseSchema, diffSchemas, generateAlterSql, findDestructiveWarnings } from '@/lib/schema-diff'
 *
 *   const released = parseSchema(readFileSync('db/schema.released.sql', 'utf-8'))
 *   const current  = parseSchema(readFileSync('db/schema.sql', 'utf-8'))
 *   const diff     = diffSchemas(released, current)
 *   const warnings = findDestructiveWarnings(diff)
 *   const result   = generateAlterSql(diff, { cartridgeId, nextVersion: 'v2', warnings })
 */
export * from './types'
export { parseSchema } from './parser'
export { diffSchemas, findDestructiveWarnings } from './diff'
export { generateAlterSql, determineNextVersion } from './alter-generator'
